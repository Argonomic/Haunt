import { Players } from "@rbxts/services";
import * as u from "shared/sh_utils"

class File
{
   onPlayerConnected: Array<Function> = []
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
   file.onPlayerConnected.push( func )
}

function OnPlayerCharacterAdded( character: Model )
{
   let human = character.WaitForChild( "Humanoid" ) as Humanoid

   human.SetStateEnabled( Enum.HumanoidStateType.Jumping, false )
   human.SetStateEnabled( Enum.HumanoidStateType.Climbing, false )

   let player = u.GetPlayerFromCharacter( character )

   for ( let func of file.onPlayerConnected )
   {
      func( player )
   }
}

function OnPlayerConnected( player: Player )
{
   if ( player.Character ) 
   {
      OnPlayerCharacterAdded( player.Character )
   }

   player.CharacterAdded.Connect( OnPlayerCharacterAdded )
}
