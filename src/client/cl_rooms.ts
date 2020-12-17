import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, CreateClientBlockers, Room, AddRoomsFromWorkspace, FAST_ROOM_ITERATION } from "shared/sh_rooms"
import { Assert, GetLocalPlayer, GetPlayerFromDescendant, GetClosest, Resume } from "shared/sh_utils"
import { SetPlayerCameraToRoom } from "./cl_camera"

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
      Resume( delay )
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
   let localPlayer = GetLocalPlayer()

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
         let closestDoor = GetClosest( player, [door, file.clientCurrentDoorTrigger] )
         if ( closestDoor === file.clientCurrentDoorTrigger )
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
