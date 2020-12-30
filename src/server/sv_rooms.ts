import { Room, AddRoomsFromWorkspace, RoomAndTask, AddCallback_OnRoomSetup } from "shared/sh_rooms"
import { ArrayRandomize, GetPlayerFromDescendant, RandomFloatRange, SetPlayerYaw, Thread } from "shared/sh_utils"
import { QUICK_START_ROOM } from "shared/sh_settings"
import { SendRPC } from "./sv_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { Assert } from "shared/sh_assert"

class File
{
   dev_startRoomName: string = QUICK_START_ROOM
   rooms = new Map<string, Room>()
   touchingDoorTriggers = new Map<Player, Array<BasePart>>()
   triggerToRoom = new Map<BasePart, Room>()
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

   //print( "GetAllRoomsAndTasks " + roomsAndTasks.size() )
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

   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         file.touchingDoorTriggers.set( player, [] )
      } )
}

function OnTriggerDoorSetup( doorTrigger: BasePart, room: Room )
{
   file.triggerToRoom.set( doorTrigger, room )

   doorTrigger.Touched.Connect( function ( toucher: Instance )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      let triggers = file.touchingDoorTriggers.get( player ) as Array<BasePart>
      for ( let trigger of triggers )
      {
         if ( trigger === doorTrigger )
            return
      }
      triggers.push( doorTrigger )
      file.touchingDoorTriggers.set( player, triggers )
   } )

   doorTrigger.TouchEnded.Connect( function ( toucher: Instance )
   {
      let player = GetPlayerFromDescendant( toucher )
      if ( player === undefined )
         return

      let triggers = file.touchingDoorTriggers.get( player ) as Array<BasePart>
      for ( let i = 0; i < triggers.size(); i++ )
      {
         if ( triggers[i] === doorTrigger )
         {
            triggers.remove( i )
            break
         }
      }
      file.touchingDoorTriggers.set( player, triggers )
      if ( triggers.size() > 1 )
         return

      if ( GetCurrentRoom( player ) !== room )
      {
         let setRoom

         if ( triggers.size() === 1 )
         {
            setRoom = file.triggerToRoom.get( triggers[0] ) as Room
         }
         else 
         {
            setRoom = room
         }

         file.currentRoom.set( player, setRoom )
         //print( "Set player room to " + setRoom.name )
      }
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

   let offset = 35

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

      SetPlayerYaw( player, RandomFloatRange( 90 - offset, 90 + offset ) )
      //part.CFrame = part.CFrame.mul( CFrame.Angles( math.rad( 0 ), math.rad( yaw ), math.rad( 0 ) ) )

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
