import { AddRPC } from "shared/sh_rpc"
import * as sv from "server/sv_utils"
import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_player"
import { Room, Task, AddRoomsFromWorkspace, RoomAndTask } from "shared/sh_rooms"

//import { ReplicatedStorage } from "@rbxts/services";

class File
{
   dev_startRoom: string = "library"
   rooms = new Map<string, Room>()
}

let file = new File()

export function GetAllRoomsAndTasks(): Array<RoomAndTask>
{
   let rooms = GetAllRooms()
   let roomsAndTasks: Array<RoomAndTask> = []
   for ( let room of rooms )
   {
      for ( let task of room.tasks )
      {
         roomsAndTasks.push( new RoomAndTask( room, task ) )
      }
   }

   return roomsAndTasks
}

export function GetAllRooms(): Array<Room>
{
   let rooms: Array<Room> = []
   for ( let room of file.rooms )
   {
      rooms.push( room[1] )
   }

   return rooms
}

export function GetStartRoom(): string
{
   return file.dev_startRoom
}

export function SV_RoomsSetup()
{
   AddCallback_OnPlayerConnected( PutPlayerInStartRoom )
   AddRPC( "RPC_FromClient_OnPlayerUseFromRoom", RPC_FromClient_OnPlayerUseFromRoom )

   file.rooms = AddRoomsFromWorkspace()
}

function PutPlayerInRoom( player: Player, room: Room )
{
   u.Assert( player.Character !== undefined, "Player has no character" )

   wait() // because hey, otherwise the game tries to set the player position somewhere
   let character = player.Character as Model
   let part = character.PrimaryPart as BasePart
   let center = room.center as BasePart
   let org = center.Position.add( new Vector3( 0, 5, 0 ) )
   part.CFrame = new CFrame( org )

   sv.SendRPC( "RPC_FromServer_SetPlayerRoom", player, room.name )
}

export function PutPlayerInStartRoom( player: Player )
{
   let room = GetRoom( file.dev_startRoom )
   PutPlayerInRoom( player, room )
}

function RPC_FromClient_OnPlayerUseFromRoom( player: Player, roomName: string )
{
   print( "RPC_FromClient_OnPlayerUseFromRoom " + roomName )
   let room = GetRoom( roomName )
   u.Assert( room !== undefined, "Unknown room " + roomName )

   let playerOrg = u.GetPosition( player )

   let usedTask = function ( task: Task ): boolean
   {
      let dist = math.abs( ( playerOrg.sub( task.position ) ).Magnitude )

      if ( dist > 6 )
         return false

      let parts = u.GetTouchingParts( task.volume as BasePart )

      for ( let part of parts )
      {
         let partPlayer = u.GetPlayerFromDescendant( part )
         if ( partPlayer === player )
         {
            sv.SendRPC( "RPC_FromServer_OnPlayerUseTask", player, task.name )
            return true
         }
      }
      return false
   }

   for ( let task of room.tasks )
   {
      if ( usedTask( task ) )
         return
   }
}


export function GetRoom( name: string ): Room
{
   u.Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
