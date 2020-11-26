import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, CreateClientBlockers, Room, AddRoomsFromWorkspace } from "shared/sh_rooms"
import { UserInputService } from "@rbxts/services"
import { SendRPC } from "./cl_utils"
import { AddOnUseCallback } from "./cl_input"
import { Assert, GetPlayerFromDescendant, GetPosition } from "shared/sh_utils"
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
   AddOnUseCallback( PlayerTriesToUseCurrenRoom )

   AddRPC( "RPC_FromServer_SetPlayerRoom", RPC_FromServer_SetPlayerRoom )

   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()

   let delay = coroutine.create( Delay )
   coroutine.resume( delay )
}


function Delay()
{
   wait( 0.75 )
   SetCurrentRoom( file.currentRoom )

   for ( ; ; )
   {
      wait( 0.5 )
      UserInputService.MouseIconEnabled = true
   }
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

function PlayerTriesToUseCurrenRoom()
{
   SendRPC( "RPC_FromClient_OnPlayerUseFromRoom", GetCurrentRoom().name )
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

function OnTriggerDoorSetup( childPart: BasePart, room: Room )
{
   childPart.Touched.Connect( function ( toucher )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      if ( file.clientCurrentDoorTrigger === childPart )
         return

      if ( file.clientCurrentDoorTrigger !== undefined )
      {
         let playerOrg = GetPosition( player )
         let dist1 = math.abs( ( playerOrg.sub( childPart.Position ).Magnitude ) )
         let dist2 = math.abs( ( playerOrg.sub( file.clientCurrentDoorTrigger.Position ).Magnitude ) )
         if ( dist2 <= dist1 )
            return
      }

      file.clientCurrentDoorTrigger = childPart
      SetCurrentRoom( room )
   } )

}

export function GetRoom( name: string ): Room
{
   Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
