import { Room, AddRoomsFromWorkspace, RoomAndTask, AddCallback_OnRoomSetup } from "shared/sh_rooms"
import { ArrayRandomize, Assert, GetPlayerFromDescendant, GetPosition, Thread } from "shared/sh_utils"
import { QUICK_START_ROOM } from "shared/sh_settings"
import { SendRPC } from "./sv_utils"

//import { ReplicatedStorage } from "@rbxts/services";

class File
{
   dev_startRoomName: string = QUICK_START_ROOM
   rooms = new Map<string, Room>()
   lastDoorTrigger = new Map<Player, BasePart>()
   currentRoom = new Map<Player, Room>()
}

let file = new File()

export function GetAllRoomsAndTasks(): Array<RoomAndTask>
{
   let rooms = GetAllRooms()
   let roomsAndTasks: Array<RoomAndTask> = []
   for ( let room of rooms )
   {
      for ( let taskArr of room.tasks )
      {
         roomsAndTasks.push( new RoomAndTask( room, taskArr[1] ) )
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

export function SV_RoomsSetup()
{
   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()
}

function OnTriggerDoorSetup( doorTrigger: BasePart, room: Room )
{
   doorTrigger.Touched.Connect( function ( toucher: Instance )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      if ( player.ClassName !== "Player" )
         return

      let lastDoorTrigger = file.lastDoorTrigger.get( player )
      if ( lastDoorTrigger === doorTrigger )
         return

      if ( lastDoorTrigger !== undefined )
      {
         let playerOrg = GetPosition( player )
         let dist1 = math.abs( ( playerOrg.sub( doorTrigger.Position ).Magnitude ) )
         let dist2 = math.abs( ( playerOrg.sub( lastDoorTrigger.Position ).Magnitude ) )
         if ( dist2 <= dist1 )
            return
      }

      file.lastDoorTrigger.set( player, doorTrigger )
      file.currentRoom.set( player, room )
   } )
}

export function GetCurrentRoom( player: Player ): Room
{
   Assert( file.currentRoom.has( player ), "Player has no current room yet" )

   return file.currentRoom.get( player ) as Room
}

export function GetRoomSpawnLocations( room: Room, count: number ): Array<Vector3>
{
   let startpoints = room.startPoints.concat()
   ArrayRandomize( startpoints )

   let center = room.center as BasePart
   let org = center.Position.add( new Vector3( 0, 5, 0 ) )

   for ( let i = startpoints.size(); i < count; i++ )
   {
      startpoints.push( org )
   }

   return startpoints.slice( 0, count )
}

export function PutPlayersInRoom( players: Array<Player>, room: Room )
{
   let startpoints = room.startPoints.concat()
   ArrayRandomize( startpoints )

   for ( let i = 0; i < players.size(); i++ )
   {
      let player = players[i]
      Assert( player.Character !== undefined, "Player has no character" )
      let character = player.Character as Model
      let part = character.PrimaryPart as BasePart

      if ( i < startpoints.size() )
      {
         part.CFrame = new CFrame( startpoints[i] )
      }
      else
      {
         let center = room.center as BasePart
         let org = center.Position.add( new Vector3( 0, 5, 0 ) )
         part.CFrame = new CFrame( org )
      }
      print( "Put player " + player.Name + " in room " + room.name )

      file.currentRoom.set( player, room )
      PutPlayerCameraInRoom( player, room )
   }
}

export function SetPlayerCurrentRoom( player: Player, room: Room )
{
   file.currentRoom.set( player, room )
}

export function PutPlayerCameraInRoom( player: Player, room: Room )
{
   SendRPC( "RPC_FromServer_SetPlayerRoom", player, room.name )
}

export function PutPlayerInStartRoom( player: Player )
{
   let room = GetRoomByName( file.dev_startRoomName )
   Thread( function ()
   {
      wait() // because hey, otherwise the game tries to set the player position somewhere
      PutPlayersInRoom( [player], room )
   } )
}

export function GetRoomByName( name: string ): Room
{
   Assert( file.rooms.has( name ), "Unknown room " + name )
   return file.rooms.get( name ) as Room
}
