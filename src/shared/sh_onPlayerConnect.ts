import { Players } from "@rbxts/services";
import { AssignDefaultNVs } from "shared/sh_player_netvars"
import { Assert, ExecOnChildWhenItExists, GetPlayerFromCharacter, IsServer } from "./sh_utils";

class File
{
   onPlayerConnected: Array<Function> = []
   onPlayerCharacterAdded: Array<Function> = []
   playerConnected = false
}

let file = new File()

export function AnyPlayerHasConnected(): boolean
{
   return file.playerConnected
}

export function SH_OnPlayerConnectSetup()
{
   Players.PlayerAdded.Connect( OnPlayerConnected )
   for ( let player of Players.GetPlayers() )
   {
      OnPlayerConnected( player )
   }
}

export function AddCallback_OnPlayerConnected( func: Function )
{
   Assert( !file.playerConnected, "Tried to add a player connection callback after a player connected" )
   file.onPlayerConnected.push( func )
}

export function AddCallback_OnPlayerCharacterAdded( func: Function )
{
   Assert( !file.playerConnected, "Tried to add a player character added callback after a player connected" )
   file.onPlayerCharacterAdded.push( func )
}

function OnPlayerCharacterAdded( character: Model )
{
   ExecOnChildWhenItExists( character, "Humanoid", function ( instance: Instance )
   {
      let human = instance as Humanoid
      human.SetStateEnabled( Enum.HumanoidStateType.Jumping, false )
      human.SetStateEnabled( Enum.HumanoidStateType.Climbing, false )

      let player = GetPlayerFromCharacter( character ) as Player
      for ( let func of file.onPlayerCharacterAdded )
      {
         func( player )
      }
   } )
}

function OnPlayerConnected( player: Player )
{
   file.playerConnected = true

   if ( IsServer() )
      AssignDefaultNVs( player )

   for ( let func of file.onPlayerConnected )
   {
      func( player )
   }

   if ( player.Character ) 
   {
      OnPlayerCharacterAdded( player.Character )
   }

   player.CharacterAdded.Connect( OnPlayerCharacterAdded )
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