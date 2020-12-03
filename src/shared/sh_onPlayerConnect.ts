import { Players } from "@rbxts/services";
import { AssignDefaultNVs } from "shared/sh_player_netvars"
import { Assert, ExecOnChildWhenItExists, GetPlayerFromCharacter, IsServer, Thread } from "./sh_utils";

class File
{
   onPlayerConnected: Array<Function> = []
   onPlayerCharacterAdded: Array<Function> = []
   aPlayerConnected = false
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
      let human = instance as Humanoid
      human.SetStateEnabled( Enum.HumanoidStateType.Jumping, false )
      human.SetStateEnabled( Enum.HumanoidStateType.Climbing, false )

      for ( let func of file.onPlayerCharacterAdded )
      {
         func( player )
      }
   } )
}

function OnPlayerConnected( player: Player )
{
   let finished = false

   Thread( function ()
   {
      wait()
      Assert( finished, "Never finished init" )
   } )


   file.aPlayerConnected = true

   if ( IsServer() )
      AssignDefaultNVs( player ) // done in sh_player_netvars on client

   for ( let func of file.onPlayerConnected )
   {
      func( player )
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