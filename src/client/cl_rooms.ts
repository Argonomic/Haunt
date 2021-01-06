import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, CreateClientBlockers, Room, AddRoomsFromWorkspace, FAST_ROOM_ITERATION } from "shared/sh_rooms"
import { GetLocalPlayer, GetPlayerFromDescendant, GetClosest, Resume } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { SetPlayerCameraToRoom } from "./cl_camera"
import { ClearCoinPopUps } from "./cl_coins"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { SPAWN_ROOM } from "shared/sh_settings"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   currentClientBlockers: Array<BasePart> = []
   currentRoom = new Map<Player, Room>()
   currentDoorTrigger: BasePart | undefined
   playerToDoorTrigger = new Map<Player, BasePart>()
   rooms = new Map<string, Room>()
   roomChangedCallbacks: Array<Function> = []
}
let file = new File()

export function CL_RoomSetup()
{
   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()

   let startRoom = file.rooms.get( SPAWN_ROOM ) as Room
   Assert( startRoom !== undefined, "startRoom !== undefined" )

   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         let door = new Instance( 'Part' )
         file.playerToDoorTrigger.set( player, door )
         file.currentRoom.set( player, startRoom )

         door.Destroy()
      } )

   AddRPC( "RPC_FromServer_SetPlayerRoom", RPC_FromServer_SetPlayerRoom )

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
      let room = file.rooms.get( GetCurrentRoom( LOCAL_PLAYER ).name )
      SetCurrentRoom( LOCAL_PLAYER, room as Room )
   }
}

export function RPC_FromServer_SetPlayerRoom( name: string )
{
   let room = GetRoom( name )
   SetCurrentRoom( LOCAL_PLAYER, room )
}

function SetBlockersFromRoom( room: Room )
{
   for ( let part of file.currentClientBlockers )
   {
      part.Destroy()
   }

   file.currentClientBlockers = CreateClientBlockers( room )
}

export function GetCurrentRoom( player: Player ): Room
{
   Assert( file.currentRoom.get( player ) !== undefined, "file.currentRoom.get( player ) !== undefined" )
   return file.currentRoom.get( player ) as Room
}

export function GetRooms(): Map<string, Room>
{
   return file.rooms
}

export function AddRoomChangedCallback( func: Function )
{
   file.roomChangedCallbacks.push( func )
}

function SetCurrentRoom( player: Player, room: Room )
{
   file.currentRoom.set( player, room )
   if ( player !== LOCAL_PLAYER )
      return

   SetPlayerCameraToRoom( room )
   SetBlockersFromRoom( room )
   ClearCoinPopUps()

   for ( let roomChangedCallback of file.roomChangedCallbacks )
   {
      roomChangedCallback()
   }
}

function OnTriggerDoorSetup( door: BasePart, room: Room )
{
   door.Touched.Connect( function ( toucher )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      let currentDoorTrigger = file.playerToDoorTrigger.get( player ) as BasePart
      if ( currentDoorTrigger === door )
         return

      let closestDoor = GetClosest( player, [door, currentDoorTrigger] )
      if ( closestDoor === currentDoorTrigger )
         return

      file.playerToDoorTrigger.set( player, door )
      SetCurrentRoom( player, room )
   } )
}

export function GetRoom( name: string ): Room
{
   Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
