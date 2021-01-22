import { Players, RunService } from "@rbxts/services";
import { AssignDefaultNVs } from "shared/sh_player_netvars"
import { GetExistingFirstChildWithNameAndClassName, ExecOnChildWhenItExists, GetPlayerFromCharacter, IsServer, Thread, GetLocalPlayer, GetFirstChildWithNameAndClassName, ArrayRandomize } from "./sh_utils";
import { Assert } from "shared/sh_assert"
import { PLAYER_WALKSPEED } from "./sh_settings";

const LOCAL = RunService.IsStudio()
const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   onPlayerConnected: Array<Function> = []
   onPlayerCharacterAdded: Array<( player: Player ) => void> = []
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
   Assert( !IsServer(), "Client only" )
   //   if ( !IsServer() && file.onPlayerCharacterAdded.size() >= 2 && file.onPlayerCharacterAdded.size() <= 4 )
   //      print( "1 file.onPlayerCharacterAdded " + file.onPlayerCharacterAdded.size() + " " + debug.traceback() )
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

export function AddCallback_OnPlayerCharacterAdded( func: ( player: Player ) => void )
{
   Assert( !file.aPlayerConnected, "Tried to add a player character added callback after a player connected" )
   //   if ( !IsServer() && file.onPlayerCharacterAdded.size() >= 2 && file.onPlayerCharacterAdded.size() <= 4 )
   //      print( "2 file.onPlayerCharacterAdded " + file.onPlayerCharacterAdded.size() + " " + debug.traceback() )
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
      //SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )

      for ( let i = 0; i < file.onPlayerCharacterAdded.size(); i++ )
      {
         let func = file.onPlayerCharacterAdded[i]
         // /         if ( !IsServer() )
         // /            print( "file.onPlayerCharacterAdded " + i )
         Thread( function ()
         {
            func( player )
         } )
      }
   } )
}

export function PlayerHasClone( player: Player ): boolean
{
   return file.playerToModel.has( player )
}

export function ClonePlayerModel( player: Player ): Model | undefined
{
   if ( !file.playerToModel.has( player ) )
      return undefined

   let model = file.playerToModel.get( player ) as Model
   return _CloneCharacter( model )
}

export function ClonePlayerModels( players: Array<Player> ): Array<Model>
{
   let models: Array<Model> = []
   for ( let player of players )
   {
      if ( file.playerToModel.has( player ) )
      {
         let model = file.playerToModel.get( player ) as Model
         models.push( _CloneCharacter( model ) )
      }
   }
   return models
}

export function TryFillWithFakeModels( models: Array<Model>, count: number )
{
   let otherPlayers: Array<Player> = []
   for ( let pair of file.playerToModel )
   {
      let player = pair[0]
      if ( player === LOCAL_PLAYER )
         continue
      if ( !file.playerToModel.has( player ) )
         continue
      otherPlayers.push( player )
   }

   if ( !otherPlayers.size() )
      return

   for ( ; ; )
   {
      ArrayRandomize( otherPlayers )
      for ( let player of otherPlayers )
      {
         if ( models.size() >= count )
            return

         let model = ClonePlayerModel( player )
         if ( model === undefined )
         {
            Assert( false, "Expected a model" )
            throw undefined
         }

         models.push( model )
      }
   }
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

   /*
   Thread( function ()
   {
      wait()
      Assert( finished, "OnPlayerConnected Never finished init" )

      if ( IsServer() )
      {
         wait( 5 )
         //match.playerToSpawnLocation.set( player, spawnLocations[i] )
         //KillPlayer( player )
      }
   } )
   */

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