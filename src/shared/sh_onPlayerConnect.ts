import { Players } from "@rbxts/services";
import { AssignDefaultNVs } from "shared/sh_player_netvars"
import { GetExistingFirstChildWithNameAndClassName, ExecOnChildWhenItExists, GetPlayerFromCharacter, IsServer, Thread, GetLocalPlayer, IsClient, GetFirstChildWithNameAndClassName } from "./sh_utils";
import { Assert } from "shared/sh_assert"

class File
{
   onPlayerConnected: Array<Function> = []
   onPlayerCharacterAdded: Array<Function> = []
   aPlayerConnected = false

   playerToModel = new Map<Player, Model>()
}

let file = new File()

export function SH_OnPlayerConnectSetup()
{
   Players.RespawnTime = 1.0

   Players.PlayerAdded.Connect( OnPlayerConnected )
   for ( let player of Players.GetPlayers() )
   {
      OnPlayerConnected( player )
   }

}

export function AddCallback_OnPlayerConnected( func: Function )
{
   Assert( !file.aPlayerConnected, "Tried to add a player connection callback after a player connected" )
   file.onPlayerConnected.push( func )
}

export function APlayerHasConnected(): boolean
{
   return file.aPlayerConnected
}

export function AddCallback_OnPlayerCharacterAncestryChanged( func: () => void )
{
   let localPlayer = GetLocalPlayer()
   Assert( IsClient(), "Client only" )
   file.onPlayerCharacterAdded.push(
      function ( player: Player )
      {
         if ( player !== localPlayer )
            return
         let character = localPlayer.Character as Model
         Assert( character !== undefined, "Undefined" )
         character.AncestryChanged.Connect(
            function ()
            {
               func()
            } )
      } )
}

export function AddCallback_OnPlayerCharacterAdded( func: Function )
{
   Assert( !file.aPlayerConnected, "Tried to add a player character added callback after a player connected" )
   file.onPlayerCharacterAdded.push( func )
}

function OnPlayerCharacterAdded( character: Model )
{
   let player = GetPlayerFromCharacter( character ) as Player

   ExecOnChildWhenItExists( character, "Humanoid", function ( instance: Instance )
   {
      if ( !file.playerToModel.has( player ) )
      {
         Thread(
            function ()
            {
               for ( ; ; )
               {
                  let children = character.GetChildren()
                  if ( children.size() > 20 )
                  {
                     let clone = _CloneCharacter( character )
                     clone.Name = player.Name + " clone model"
                     if ( file.playerToModel.has( player ) )
                        ( file.playerToModel.get( player ) as Model ).Destroy()
                     file.playerToModel.set( player, clone )
                     break
                  }

                  wait()
               }
            } )
      }

      let human = instance as Humanoid
      human.SetStateEnabled( Enum.HumanoidStateType.Jumping, false )
      human.SetStateEnabled( Enum.HumanoidStateType.Climbing, false )

      for ( let func of file.onPlayerCharacterAdded )
      {
         Thread( function ()
         {
            func( player )
         } )
      }
   } )
}

export function ClonePlayerModel( player: Player ): Model | undefined
{
   if ( !file.playerToModel.has( player ) )
      return undefined

   let model = file.playerToModel.get( player ) as Model
   let clone = _CloneCharacter( model )
   //clone.Name = player.Name + " clone model"
   return clone
}

function _CloneCharacter( character: Model ): Model 
{
   character.Archivable = true
   let bodyParts = character.GetChildren()
   //print( "bodyParts: " + bodyParts.size() )
   let clonedModel = new Instance( "Model" ) as Model

   for ( let bodyPart of bodyParts )
   {
      if ( bodyPart.IsA( "Humanoid" ) || bodyPart.IsA( "Accessory" ) || bodyPart.IsA( "MeshPart" ) || bodyPart.IsA( "BasePart" ) || bodyPart.IsA( "Pants" ) || bodyPart.IsA( "Shirt" ) || bodyPart.IsA( "ShirtGraphic" ) || bodyPart.IsA( "BodyColors" ) )
      {
         if ( bodyPart.Archivable === false ) 
         {
            bodyPart.Archivable = true
            let clone = bodyPart.Clone()
            clone.Parent = clonedModel
            bodyPart.Archivable = false
         }
         else
         {
            let clone = bodyPart.Clone()
            clone.Parent = clonedModel
         }

         if ( bodyPart.IsA( "Humanoid" ) )
         {
            //bodyPart.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
            bodyPart.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
         }
      }
   }

   clonedModel.PrimaryPart = GetExistingFirstChildWithNameAndClassName( clonedModel, "HumanoidRootPart", 'Part' ) as Part
   return clonedModel
}


function OnPlayerConnected( player: Player )
{
   let finished = false

   Thread( function ()
   {
      wait()
      Assert( finished, "OnPlayerConnected Never finished init" )

      /*
      if ( IsServer() )
      {
         wait( 5 )
         //game.playerToSpawnLocation.set( player, spawnLocations[i] )
         //KillPlayer( player )
      }
      */
   } )


   file.aPlayerConnected = true

   if ( IsServer() )
      AssignDefaultNVs( player ) // done in sh_player_netvars on client

   for ( let func of file.onPlayerConnected )
   {
      Thread( function ()
      {
         func( player )
      } )
   }

   player.CharacterAdded.Connect( OnPlayerCharacterAdded )
   if ( player.Character )
      OnPlayerCharacterAdded( player.Character )

   finished = true
}

export function SetPlayerWalkSpeed( player: Player, walkSpeed: number )
{
   Assert( player.Character !== undefined, "Player does not have character yet" )
   let character = player.Character as Model

   ExecOnChildWhenItExists( character, "Humanoid", function ( instance: Instance )
   {
      let human = instance as Humanoid
      human.WalkSpeed = walkSpeed
   } )
}

export function GetPlayerWalkSpeed( player: Player ): number
{
   Assert( player.Character !== undefined, "Player does not have character yet" )
   let character = player.Character as Model
   let humanoid = GetFirstChildWithNameAndClassName( character, "Humanoid", 'Humanoid' ) as Humanoid
   return humanoid.WalkSpeed

}