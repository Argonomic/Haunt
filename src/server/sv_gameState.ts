import { HttpService, Players } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, Assert, GetHumanoid, IsAlive, Thread } from "shared/sh_utils"
import { Assignment, GAME_STATE, SharedGameStateInit, NETVAR_JSON_TASKLIST, ROLE, IsPracticing, Game, GAMERESULTS, MEETING_TYPE_REPORT, GetVoteResults } from "shared/sh_gamestate"
import { MAX_TASKLIST_SIZE, MAX_PLAYERS, MIN_PLAYERS, SPAWN_ROOM, DEV_STARTMEETING } from "shared/sh_settings"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { SendRPC } from "./sv_utils"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, GetRoomSpawnLocations, PutPlayerCameraInRoom, PutPlayersInRoom, SetPlayerCurrentRoom } from "./sv_rooms"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"

class File
{
   playerToGame = new Map<Player, Game>()
}
let file = new File()

export function SV_GameStateSetup()
{
   /*
   Thread( function ()
   {
      wait( 6 )
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         let human = GetHumanoid( player )
         if ( human )
            human.TakeDamage( human.Health )
      }
   } )
   */

   SharedGameStateInit()
   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.playerToGame.has( player ) )
      {
         let game = PlayerToGame( player )
         game.Shared_OnGameStateChanged_PerPlayer( player, game.GetGameState() )
      }
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( !file.playerToGame.has( player ) )
         return

      let game = PlayerToGame( player )
      if ( !game.playerToSpawnLocation.has( player ) )
         return

      let spawnPos = game.playerToSpawnLocation.get( player ) as Vector3
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
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         if ( IsPracticing( player ) )
            return

         let game = PlayerToGame( player )
         game.UpdateGame()
      } )


   AddRPC( "RPC_FromClient_Skipvote", function ( player: Player )
   {
      let game = PlayerToGame( player )
      if ( game.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      game.SetVote( player, undefined )
   } )

   AddRPC( "RPC_FromClient_Vote", function ( player: Player, voteUserID: number )
   {
      let game = PlayerToGame( player )
      if ( game.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      game.SetVote( player, voteUserID )
   } )
}

export function PlayerToGame( player: Player ): Game
{
   Assert( file.playerToGame.has( player ), "Player not in a game" )
   return file.playerToGame.get( player ) as Game
}

function GameStateChanged( game: Game, oldGameState: GAME_STATE, gameState: GAME_STATE )
{
   let players = game.GetAllPlayers()
   {
      for ( let player of players )
      {
         if ( player.Character !== undefined )
            game.Shared_OnGameStateChanged_PerPlayer( player, game.GetGameState() )
      }
   }

   // game state changed
   switch ( gameState )
   {
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         {
            let remaining = game.GetTimeRemainingForState()
            if ( remaining > 0 )
            {
               Thread( function ()
               {
                  wait( remaining )
                  game.UpdateGame()
               } )
            }

            if ( remaining <= 0 )
            {
               let voteResults = GetVoteResults( game.GetVotes() )

               if ( !voteResults.skipTie && voteResults.highestRecipients.size() === 1 )
               {
                  let highestTarget = voteResults.highestRecipients[0]
                  game.SetPlayerRole( highestTarget, ROLE.ROLE_SPECTATOR )
                  if ( IsAlive( highestTarget ) )
                  {
                     let human = GetHumanoid( highestTarget )
                     if ( human )
                        human.TakeDamage( human.Health )
                  }

                  print( "Player " + highestTarget.Name + " was voted off" )
               }

               game.corpses = [] // clear the corpses

               let room = GetRoomByName( 'Great Room' )
               PutPlayersInRoom( game.GetAllPlayers(), room )

               game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
               break
            }
         }
         break
   }

   // current game state
   switch ( game.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
         for ( let player of game.GetAllPlayers() )
         {
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         game.ClearVotes()
         Assert( game.GetVotes().size() === 0, "Expected zero votes" )
         break
   }
}

function GameThread( game: Game, gameEndFunc: Function )
{
   let lastGameState = game.GetGameState()
   for ( ; ; )
   {
      // do on-state-changed-from/to stuff
      let gameState = game.GetGameState()
      print( "\nGAME STATE THREAD RESUMED, lastGameState " + lastGameState + ", gameState " + gameState )

      if ( gameState !== lastGameState )
      {
         GameStateChanged( game, lastGameState, gameState )
         lastGameState = gameState
      }

      // quick check on whether or not game is even still going
      switch ( gameState )
      {
         case GAME_STATE.GAME_STATE_PLAYING:
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            if ( game.GetGameResults() !== GAMERESULTS.RESULTS_STILL_PLAYING )
               game.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
            break
      }

      switch ( gameState )
      {
         case GAME_STATE.GAME_STATE_DEAD:
            return

         case GAME_STATE.GAME_STATE_PREMATCH:

            print( "Prematch, creating game" )
            let players = game.GetAllPlayers().concat( [] ) // "clone"
            let possessedCount = 1
            let size = players.size()
            if ( size > 11 )
               possessedCount = 3
            else if ( size > 6 )
               possessedCount = 2
            game.startingPossessedCount = possessedCount

            ArrayRandomize( players )
            let possessedPlayers = players.slice( 0, possessedCount )
            let setCampers = players.slice( possessedCount, size )

            print( "\nSetting game roles, possessedCount " + possessedCount )
            for ( let player of possessedPlayers )
            {
               game.SetPlayerRole( player, ROLE.ROLE_POSSESSED )
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
                  game.playerToSpawnLocation.set( player, spawnLocations[i] )
                  human.TakeDamage( human.Health )
                  SendRPC( "RPC_FromServer_CancelTask", player )
               }
            }

            game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
            break

         case GAME_STATE.GAME_STATE_PLAYING:

            if ( DEV_STARTMEETING )
            {
               Thread(
                  function ()
                  {
                     wait( 2 )
                     if ( game.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
                        return

                     print( "START A MEETING!!" )
                     let players = game.GetAllPlayers()
                     game.meetingCaller = players[0]
                     game.meetingType = MEETING_TYPE_REPORT
                     game.SetGameState( GAME_STATE.GAME_STATE_MEETING_DISCUSS )
                  } )
            }

            break

         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            {
               let remaining = game.GetTimeRemainingForState()
               if ( remaining > 0 )
               {
                  Thread( function ()
                  {
                     wait( remaining )
                     game.UpdateGame()
                  } )
               }

               if ( remaining <= 0 )
               {
                  game.SetGameState( GAME_STATE.GAME_STATE_MEETING_VOTE )
                  break
               }
            }
            break

         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            {
               let remaining = game.GetTimeRemainingForState()
               if ( remaining > 0 )
               {
                  Thread( function ()
                  {
                     wait( remaining )
                     game.UpdateGame()
                  } )
               }

               let count = game.GetPossessed().size() + game.GetCampers().size()

               let votes = game.GetVotes()
               if ( remaining <= 0 || votes.size() >= count )
               {
                  game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
                  break
               }
            }
            break

         case GAME_STATE.GAME_STATE_COMPLETE:
            print( "Game is over" )
            print( "Ending state: " + game.GetGameResults() )
            print( "Possessed: " + game.GetPossessed().size() )
            print( "Campers: " + game.GetCampers().size() )
            for ( let player of game.GetAllPlayers() )
            {
               ClearAssignments( game, player )
               if ( !IsAlive( player ) )
                  continue

               let human = GetHumanoid( player )
               if ( human )
               {
                  human.TakeDamage( human.Health )
                  SendRPC( "RPC_FromServer_CancelTask", player )
               }
            }

            game.BroadcastGamestate()
            game.SetGameState( GAME_STATE.GAME_STATE_DEAD )
            // draw end
            gameEndFunc()
            return
      }

      if ( gameState === game.GetGameState() )
      {
         // completed loop without gamestate changing, so done updating, so broadcast and yield
         game.BroadcastGamestate()

         coroutine.yield() // wait until something says update again
      }
   }
}

export function CreateGame( players: Array<Player>, gameEndFunc: Function ): Game
{
   Assert( players.size() >= MIN_PLAYERS, "Not enough players" )
   Assert( players.size() <= MAX_PLAYERS, "Too many players" )
   let game = new Game()

   let playerNums = 0
   //   file.games.push( game )
   for ( let player of players )
   {
      let playerInfo = game.AddPlayer( player, ROLE.ROLE_CAMPER )
      playerInfo.playernum = playerNums
      playerNums++
      file.playerToGame.set( player, game )
   }

   game.gameThread = coroutine.create(
      function ()
      {
         GameThread( game, gameEndFunc )
      } )
   coroutine.resume( game.gameThread )

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

export function ClearAssignments( game: Game, player: Player )
{
   game.assignments.set( player, [] )
   UpdateTasklistNetvar( player, [] )
}

export function AddPlayer( game: Game, player: Player, role: ROLE )
{
   file.playerToGame.set( player, game )
   game.AddPlayer( player, role )
}
