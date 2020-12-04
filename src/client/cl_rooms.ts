import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, CreateClientBlockers, Room, AddRoomsFromWorkspace, FAST_ROOM_ITERATION } from "shared/sh_rooms"
import { Assert, GetPlayerFromDescendant, GetPosition } from "shared/sh_utils"
import { SetPlayerCameraToRoom } from "./cl_camera"
import { Players } from "@rbxts/services"

class File
{
   currentClientBlockers: Array<BasePart> = []
   currentRoom: Room
   currentDoorTrigger: BasePart | undefined
   clientCurrentDoorTrigger: BasePart | undefined
   rooms = new Map<string, Room>()
   roomChangedCallbacks: Array<Function> = []

   constructor( room: Room )
   {
      this.currentRoom = room
   }
}

const EMPTY_ROOM = new Room()
let file = new File( EMPTY_ROOM )

export function CL_RoomSetup()
{
   //AddOnUseCallback( PlayerTriesToUseCurrentRoom )

   AddRPC( "RPC_FromServer_SetPlayerRoom", RPC_FromServer_SetPlayerRoom )

   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()

   if ( FAST_ROOM_ITERATION )
   {
      let delay = coroutine.create( FastRoomIteration )
      coroutine.resume( delay )
   }
}


function FastRoomIteration()
{
   for ( ; ; )
   {
      wait( 0.5 )
      file.rooms = AddRoomsFromWorkspace()
      if ( CurrentRoomExists() )
      {
         let room = file.rooms.get( GetCurrentRoom().name )
         SetCurrentRoom( room as Room )
      }
   }
   /*
   for ( ; ; )
   {
      if ( CurrentRoomExists
      SetCurrentRoom( file.currentRoom )
   }
   */
}

export function RPC_FromServer_SetPlayerRoom( name: string )
{
   let room = GetRoom( name )
   SetCurrentRoom( room )
}

function SetBlockersFromRoom( room: Room )
{
   for ( let part of file.currentClientBlockers )
   {
      part.Destroy()
   }

   file.currentClientBlockers = CreateClientBlockers( room )
}

export function GetCurrentRoom(): Room
{
   Assert( file.currentRoom !== EMPTY_ROOM, "Player room has not been set!" )

   return file.currentRoom
}

export function GetRooms(): Map<string, Room>
{
   return file.rooms
}

export function CurrentRoomExists(): boolean
{
   return file.currentRoom !== EMPTY_ROOM
}

/*
function PlayerTriesToUseCurrentRoom( useType: USETYPES )
{
   print( "PlayerTriesToUseCurrentRoom" )
   SendRPC( "RPC_FromClient_OnPlayerUseFromRoom", GetCurrentRoom().name, useType )
}
*/

export function AddRoomChangedCallback( func: Function )
{
   file.roomChangedCallbacks.push( func )
}

function SetCurrentRoom( room: Room )
{
   file.currentRoom = room
   SetPlayerCameraToRoom( room )
   SetBlockersFromRoom( room )
   //SetTaskCalloutsFromRoom( room )

   for ( let roomChangedCallback of file.roomChangedCallbacks )
   {
      roomChangedCallback()
   }
}

function OnTriggerDoorSetup( door: BasePart, room: Room )
{
   let localPlayer = Players.LocalPlayer

   door.Touched.Connect( function ( toucher )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      if ( player !== localPlayer )
         return

      if ( file.clientCurrentDoorTrigger === door )
         return

      if ( file.clientCurrentDoorTrigger !== undefined )
      {
         let playerOrg = GetPosition( player )
         let dist1 = math.abs( ( playerOrg.sub( door.Position ).Magnitude ) )
         let dist2 = math.abs( ( playerOrg.sub( file.clientCurrentDoorTrigger.Position ).Magnitude ) )
         if ( dist2 <= dist1 )
            return
      }

      file.clientCurrentDoorTrigger = door
      SetCurrentRoom( room )
   } )

}

export function GetRoom( name: string ): Room
{
   Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
