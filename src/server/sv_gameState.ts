import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, Assert, GetHumanoid, GetPosition, IsAlive, Thread } from "shared/sh_utils"
import { Assignment, GAME_STATE, AddGameStateNetVars, NETVAR_JSON_TASKLIST, ROLE, IsPracticing, Game, Corpse } from "shared/sh_gamestate"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, GetRoomSpawnLocations, PutPlayerCameraInRoom, SetPlayerCurrentRoom } from "./sv_rooms"
import { HttpService, Players } from "@rbxts/services"
import { MAX_TASKLIST_SIZE, MAX_PLAYERS, MIN_PLAYERS, SPAWN_ROOM, USETYPE_KILL, USETYPE_TASK, USETYPE_REPORT } from "shared/sh_settings"
import { SendRPC } from "./sv_utils"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { RoomAndTask, Task } from "shared/sh_rooms"
import { AddOnUse, Usable, Vector3Instance_Boolean, PlayerBasePart_Boolean } from "shared/sh_use"

class File
{
   games: Array<Game> = []
   playerToGame = new Map<Player, Game>()

   playerToSpawnLocation = new Map<Player, Vector3>()
}
let file = new File()

export function SV_GameStateSetup()
{
   AddGameStateNetVars()
   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.playerToGame.has( player ) && file.playerToSpawnLocation.has( player ) )
      {
         let spawnPos = file.playerToSpawnLocation.get( player ) as Vector3
         let character = player.Character as Model
         let part = character.PrimaryPart as BasePart
         Thread( function ()
         {
            for ( let i = 0; i < 5; i++ ) 
            {
               part.CFrame = new CFrame( spawnPos )
               let room = GetCurrentRoom( player )
               PutPlayerCameraInRoom( player, room )
               wait()
            }
         } )
      }
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         if ( IsPracticing( player ) )
            return

         let game = PlayerToGame( player )
         UpdateGame( game )
      } )




   AddOnUse( USETYPE_REPORT,
      function ( player: Player, usable: Usable ): boolean | undefined
      {
         // are we near a corpse?
         return undefined
      },

      function ( player: Player, boolean: Boolean )
      {
         Assert( !IsPracticing( player ), "Praticing player tried to kill?" )
         let game = PlayerToGame( player )
      }
   )

   AddOnUse( USETYPE_KILL,
      function ( player: Player, usable: Usable ): Player | undefined
      {
         let testPlayerPosToInstance = usable.testPlayerPosToInstance as Vector3Instance_Boolean

         Assert( !IsPracticing( player ), "Praticing player tried to kill?" )
         let game = PlayerToGame( player )
         Assert( game.GetPlayerRole( player ) === ROLE.ROLE_POSSESSED, "Camper tried to kill?" )

         let pos = GetPosition( player )
         let campers = game.GetCampers()
         for ( let camper of campers )
         {
            if ( !IsAlive( camper ) )
               continue

            if ( !( testPlayerPosToInstance( pos, camper ) as boolean ) )
               continue

            let human = GetHumanoid( camper )
            if ( human !== undefined )
               return camper
         }
         return undefined
      },

      function ( player: Player, camper: Player )
      {
         let human = GetHumanoid( camper )
         if ( human === undefined )
            return

         let game = PlayerToGame( player )
         game.corpses.push( new Corpse( camper, GetPosition( camper ) ) )
         file.playerToSpawnLocation.set( camper, GetPosition( camper ) )
         human.TakeDamage( human.Health )
         game.SetPlayerRole( camper, ROLE.ROLE_CAMPER )
         SendRPC( "RPC_FromServer_CancelTask", camper )
         game.BroadcastGamestate()
      }
   )

   AddOnUse( USETYPE_TASK,
      function ( player: Player, usable: Usable ): RoomAndTask | undefined
      {
         let testPlayerToBasePart = usable.testPlayerToBasePart as PlayerBasePart_Boolean

         let room = GetCurrentRoom( player )
         let usedTask: Function | undefined

         if ( IsPracticing( player ) )
         {
            usedTask = function ( task: Task ): boolean
            {
               return testPlayerToBasePart( player, task.volume )
            }
         }
         else
         {
            let game = PlayerToGame( player )
            usedTask = function ( task: Task ): boolean
            {
               if ( !PlayerHasUnfinishedAssignment( player, game, room.name, task.name ) )
                  return false

               return testPlayerToBasePart( player, task.volume )
            }
         }

         Assert( usedTask !== undefined, "No usedtask func" )
         if ( usedTask === undefined )
            return undefined

         for ( let taskPair of room.tasks )
         {
            let task = taskPair[1]
            if ( !( usedTask( task ) as boolean ) )
               continue

            return new RoomAndTask( room, task )
         }

         return undefined
      },

      function ( player: Player, roomAndTask: RoomAndTask )
      {
         SetPlayerWalkSpeed( player, 0 )
         SendRPC( "RPC_FromServer_OnPlayerUseTask", player, roomAndTask.room.name, roomAndTask.task.name )
      }
   )



}


export function PlayerToGame( player: Player ): Game
{
   Assert( file.playerToGame.has( player ), "Player not in a game" )
   return file.playerToGame.get( player ) as Game
}

export function CreateGame( players: Array<Player> ): Game
{
   Assert( players.size() >= MIN_PLAYERS, "Not enough players" )
   Assert( players.size() <= MAX_PLAYERS, "Too many players" )
   let game = new Game()
   /*
   Thread( function ()
   {
      for ( ; ; )
      {
         let msg = ""
         let players = game.GetAllPlayers()
         for ( let player of players )
         {
            msg += "\t" + player.Name + ":" + game.GetPlayerRole( player )
         }
         
         print( msg )
         wait()
      }
   } )
   */

   file.games.push( game )
   for ( let player of players )
   {
      game.AddPlayer( player, ROLE.ROLE_CAMPER )
      file.playerToGame.set( player, game )
   }

   UpdateGame( game )
   return game
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, 16 )
   if ( IsPracticing( player ) )
      return

   let game = PlayerToGame( player )

   let assignments = game.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      return
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
      {
         assignment.status = 1
      }
   }
   UpdateTasklistNetvar( player, assignments )
}



export function UpdateGame( game: Game )
{
   // runs whenever there is an event that might change the game state

   //game.RemoveQuitPlayers()

   switch ( game.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PREMATCH:

         let players = game.GetAllPlayers().concat( [] ) // "clone"
         let possessedCount = 1
         let size = players.size()
         if ( size > 11 )
            possessedCount = 3
         else if ( size > 6 )
            possessedCount = 2

         ArrayRandomize( players )
         let possessedPlayers = players.slice( 0, possessedCount )
         let setCampers = players.slice( possessedCount, size )

         for ( let player of possessedPlayers )
         {
            print( "Setting possessed player" )
            game.SetPlayerRole( player, ROLE.ROLE_POSSESSED )
            Assert( game.GetPlayerRole( player ) === ROLE.ROLE_POSSESSED, "Role didnt change" )
         }

         for ( let player of setCampers )
         {
            game.SetPlayerRole( player, ROLE.ROLE_CAMPER )
            AssignTasks( player, game )
         }

         let room = GetRoomByName( SPAWN_ROOM )
         let spawnLocations = GetRoomSpawnLocations( room, players.size() )

         for ( let i = 0; i < players.size(); i++ )
         {
            let player = players[i]
            SetPlayerCurrentRoom( player, room )

            let human = GetHumanoid( player )
            if ( human )
            {
               file.playerToSpawnLocation.set( player, spawnLocations[i] )
               human.TakeDamage( human.Health )
               SendRPC( "RPC_FromServer_CancelTask", player )
            }
         }

         game.IncrementGameState()

         break
   }

   game.BroadcastGamestate()
}

export function PlayerHasUnfinishedAssignment( player: Player, game: Game, roomName: string, taskName: string ): boolean
{
   let assignments = game.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      throw undefined
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
         return assignment.status === 0
   }

   return false
}


function AssignTasks( player: Player, game: Game )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )
   roomsAndTasks = roomsAndTasks.slice( 0, MAX_TASKLIST_SIZE )
   for ( let roomAndTask of roomsAndTasks )
   {
      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name, 0 )
      assignments.push( assignment )
   }

   game.assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
}

function UpdateTasklistNetvar( player: Player, assignments: Array<Assignment> )
{
   Assert( assignments !== undefined, "Player does not have tasklist" )
   if ( assignments === undefined )
      return

   let encode = HttpService.JSONEncode( assignments )
   SetNetVar( player, NETVAR_JSON_TASKLIST, encode )
}

