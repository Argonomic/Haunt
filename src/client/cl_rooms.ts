import * as cl_camera from "client/cl_camera"
import * as u from "shared/sh_utils"
import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, CreateClientBlockers, Room, AddRoomsFromWorkspace } from "shared/sh_rooms"

class File
{
   currentClientBlockers: Array<BasePart> = []
   currentRoom: Room
   currentDoorTrigger: BasePart | undefined
   clientCurrentDoorTrigger: BasePart | undefined
   rooms = new Map<string, Room>()

   constructor( room: Room )
   {
      this.currentRoom = room
   }
}

const EMPTY_ROOM = new Room()
let file = new File( EMPTY_ROOM )

export function CL_RoomSetup()
{
   AddRPC( "RPC_FromServer_SetPlayerRoom", RPC_FromServer_SetPlayerRoom )

   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()

   let delay = coroutine.create( Delay )
   coroutine.resume( delay )

   /*
   while false do
      wait(0.5)
      UserInputService.MouseIconEnabled = true
   end
   */
}

function Delay()
{
   wait( 0.75 )
   SetCurrentRoom( file.currentRoom )
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
   u.Assert( file.currentRoom !== EMPTY_ROOM, "Player room has not been set!" )

   return file.currentRoom
}

function SetCurrentRoom( room: Room )
{
   file.currentRoom = room
   cl_camera.SetPlayerCameraToRoom( room )
   SetBlockersFromRoom( room )
}

function OnTriggerDoorSetup( childPart: BasePart, room: Room )
{
   childPart.Touched.Connect( function ( toucher )
   {
      let player = u.GetPlayerFromDescendant( toucher )
      u.Assert( player !== undefined, "Trigger found no player" )
      if ( player === undefined )
         return

      if ( file.clientCurrentDoorTrigger === childPart )
         return

      if ( file.clientCurrentDoorTrigger !== undefined )
      {
         let playerOrg = u.GetPosition( player )
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
   u.Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
