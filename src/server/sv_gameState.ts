import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, Assert, GetHumanoid, GetPosition, IsAlive, Thread } from "shared/sh_utils"
import { Assignment, GAME_STATE, AddGameStateNetVars, NETVAR_JSON_TASKLIST, ROLE, IsPracticing, Game, Corpse, USETYPES } from "shared/sh_gamestate"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, GetRoomSpawnLocations, PutPlayerCameraInRoom, SetPlayerCurrentRoom } from "./sv_rooms"
import { HttpService, Players } from "@rbxts/services"
import { MAX_TASKLIST_SIZE, MAX_PLAYERS, MIN_PLAYERS, SPAWN_ROOM } from "shared/sh_settings"
import { SendRPC } from "./sv_utils"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { GetUsableByType, USABLETYPES } from "shared/sh_use"

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



   let usableReport = GetUsableByType( USETYPES.USETYPE_REPORT )
   usableReport.DefineGetter(
      function ( player: Player ): Array<USABLETYPES>
      {
         // are we near a corpse?
         return []
      } )

   usableReport.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         //Assert( !IsPracticing( player ), "Praticing player tried to kill?" )
         //let game = PlayerToGame( player )
      }


   let usableKill = GetUsableByType( USETYPES.USETYPE_KILL )
   usableKill.DefineGetter(
      function ( player: Player ): Array<Player>
      {
         if ( IsPracticing( player ) )
            return []

         let game = PlayerToGame( player )
         switch ( game.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_SPECTATOR:
               return []
         }

         let campers = game.GetCampers()
         let results: Array<Player> = []
         for ( let camper of campers )
         {
            if ( !IsAlive( camper ) )
               continue

            let human = GetHumanoid( camper )
            if ( human !== undefined )
               results.push( camper )
         }
         return results
      } )

   usableKill.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let camper = usedThing as Player

         let human = GetHumanoid( camper )
         if ( human === undefined )
            return

         let game = PlayerToGame( player )
         game.corpses.push( new Corpse( camper, GetPosition( camper ) ) )
         file.playerToSpawnLocation.set( camper, GetPosition( camper ) )
         human.TakeDamage( human.Health )
         game.SetPlayerRole( camper, ROLE.ROLE_SPECTATOR )
         SendRPC( "RPC_FromServer_CancelTask", camper )
         game.BroadcastGamestate()
      }


   let usableTask = GetUsableByType( USETYPES.USETYPE_TASK )
   usableTask.DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let room = GetCurrentRoom( player )
         let results: Array<BasePart> = []

         if ( IsPracticing( player ) )
         {
            for ( let taskPair of room.tasks )
            {
               let task = taskPair[1]
               results.push( task.volume )
            }
         }
         else
         {
            let game = PlayerToGame( player )
            for ( let taskPair of room.tasks )
            {
               let task = taskPair[1]
               if ( PlayerHasUnfinishedAssignment( player, game, room.name, task.name ) )
                  results.push( task.volume )
            }
         }

         return results
      } )

   usableTask.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let volume = usedThing as BasePart
         let room = GetCurrentRoom( player )
         for ( let pair of room.tasks )
         {
            if ( pair[1].volume !== volume )
               continue

            SetPlayerWalkSpeed( player, 0 )
            SendRPC( "RPC_FromServer_OnPlayerUseTask", player, room.name, pair[0] )
            break
         }
      }

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

