import { AddRPC } from "shared/sh_rpc"
import { AddCallback_OnRoomSetup, Room, AddRoomsFromWorkspace, FAST_ROOM_ITERATION } from "shared/sh_rooms"
import { GetLocalPlayer, GetPlayerFromDescendant, Resume, UserIDToPlayer, GetWorkspaceChildByName, GetChildren_NoFutureOffspring } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { IsOverheadCamera, SetPlayerCameraToRoom } from "./cl_camera"
import { ClearCoinPopUps } from "./cl_coins"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { SPAWN_ROOM } from "shared/sh_settings"
import { HttpService } from "@rbxts/services"
import { EDITOR_GameplayFolder } from "shared/sh_gamestate"
import { DynamicArtInfo, ConvertToDynamicArtInfos, CreateDynamicArt } from "./cl_dynamicArt"
import { GetClosest } from "shared/sh_utils_geometry"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   currentDynamicArt: Array<BasePart> = []
   currentRoom = new Map<Player, Room>()
   currentDoorTrigger: BasePart | undefined
   playerToDoorTrigger = new Map<Player, BasePart>()
   rooms = new Map<string, Room>()
   roomChangedCallbacks: Array<Function> = []

   roomToDynamicArtInfos = new Map<Room, Array<DynamicArtInfo>>()
}
let file = new File()

export function CL_RoomSetup()
{
   AddCallback_OnRoomSetup( "trigger_door", OnTriggerDoorSetup )
   file.rooms = AddRoomsFromWorkspace()

   {
      const gameplayFolder = GetWorkspaceChildByName( "Gameplay" ) as EDITOR_GameplayFolder
      let roomFolders = gameplayFolder.Rooms.GetChildren() as Array<Folder>
      for ( let roomFolder of roomFolders )
      {
         let room = file.rooms.get( roomFolder.Name )
         if ( room === undefined )
         {
            Assert( false, "room === undefined" )
            throw undefined
         }

         let children = roomFolder.GetChildren()
         for ( let child of children )
         {
            switch ( child.Name )
            {
               case "scr_client_dynamic_art":
                  let children = GetChildren_NoFutureOffspring( child as BasePart ) as Array<BasePart>
                  let models = ConvertToDynamicArtInfos( children )
                  file.roomToDynamicArtInfos.set( room, models )
                  break
            }
         }
      }
   }

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

   AddRPC( "RPC_FromServer_PutPlayersInRoom",
      function ( jsonPlayers: string, name: string )
      {
         let userIDToPlayer = UserIDToPlayer()
         let playerUserIDs = HttpService.JSONDecode( jsonPlayers ) as Array<number>

         let room = GetRoom( name )
         for ( let userId of playerUserIDs )
         {
            let player = userIDToPlayer.get( userId ) as Player
            Assert( player !== undefined, "player !== undefined" )
            SetCurrentRoom( player, room )
         }
      } )

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

function CreateDynamicArtForRoom( room: Room )
{
   for ( let part of file.currentDynamicArt )
   {
      part.Destroy()
   }

   file.currentDynamicArt = []
   let dynamicArtInfos = file.roomToDynamicArtInfos.get( room )
   if ( dynamicArtInfos === undefined )
      return

   file.currentDynamicArt = CreateDynamicArt( dynamicArtInfos )
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

   if ( IsOverheadCamera() )
      CreateDynamicArtForRoom( room )
   ClearCoinPopUps()

   for ( let roomChangedCallback of file.roomChangedCallbacks )
   {
      roomChangedCallback()
   }
}

export function SetLocalViewToRoom( room: Room )
{
   //print( "SetLocalViewToRoom to " + room.name )
   SetPlayerCameraToRoom( room )

   if ( IsOverheadCamera() )
   {
      CreateDynamicArtForRoom( room )
   }
   else
   {
      for ( let part of file.currentDynamicArt )
      {
         part.Destroy()
      }
      file.currentDynamicArt = []
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
