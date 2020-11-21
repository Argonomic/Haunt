import { AddRPC } from "shared/sh_rpc"
import * as sv from "server/sv_utils"
import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { Room, AddRoomsFromWorkspace, RoomAndTask } from "shared/sh_rooms"

//import { ReplicatedStorage } from "@rbxts/services";

class File
{
   dev_startRoom: string = "kitchen"
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

   print( "GetAllRoomsAndTasks " + roomsAndTasks.size() )
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
   AddCallback_OnPlayerCharacterAdded( PutPlayerInStartRoom )

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

export function GetRoom( name: string ): Room
{
   u.Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
