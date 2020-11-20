import { Players } from "@rbxts/services";
import { AssignDefaultNVs } from "shared/sh_player_netvars"
import * as u from "shared/sh_utils"

class File
{
   onPlayerConnected: Array<Function> = []
   playerConnected = false
}

let file = new File()

export function SH_PlayerSetup()
{
   Players.PlayerAdded.Connect( OnPlayerConnected )
   for ( let player of Players.GetPlayers() )
   {
      OnPlayerConnected( player )
   }
}

export function AddCallback_OnPlayerConnected( func: Function )
{
   u.Assert( !file.playerConnected, "Tried to add a player connection callback after a player connected" )
   file.onPlayerConnected.push( func )
}

function OnPlayerCharacterAdded( character: Model )
{
   let human = character.WaitForChild( "Humanoid" ) as Humanoid

   human.SetStateEnabled( Enum.HumanoidStateType.Jumping, false )
   human.SetStateEnabled( Enum.HumanoidStateType.Climbing, false )

   let player = u.GetPlayerFromCharacter( character ) as Player

   if ( u.IsServer() )
      AssignDefaultNVs( player )

   for ( let func of file.onPlayerConnected )
   {
      func( player )
   }
}

function OnPlayerConnected( player: Player )
{
   file.playerConnected = true
   if ( player.Character ) 
   {
      OnPlayerCharacterAdded( player.Character )
   }

   player.CharacterAdded.Connect( OnPlayerCharacterAdded )
}
