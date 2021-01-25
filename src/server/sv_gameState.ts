import { Chat, HttpService, MessagingService, Players, RunService, TeleportService, Workspace } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayFind, ArrayRandomize, GraphCapped, IsAlive, Resume, Thread, UserIDToPlayer, Wait, WaitThread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GAMERESULTS, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, NETVAR_JSON_GAMESTATE, NETVAR_MEETINGS_CALLED, SetPlayerWalkspeedForGameState, SHARED_COUNTDOWN_TIMER, USERID, PlayerVote, NS_SharedMatchState, PlayerInfo } from "shared/sh_gamestate"
import { MIN_TASKLIST_SIZE, MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_STARTSERVER, SPAWN_ROOM, TASK_VALUE, MATCHMAKE_PLAYERCOUNT_FALLBACK, DEV_1_TASK, ADMINS, FLAG_RESERVED_SERVER, START_COUNTDOWN, COUNTDOWN_TIME_POSTMATCH } from "shared/sh_settings"
import { ResetNetVar, SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { SV_SendRPC } from "shared/sh_rpc"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PlayerHasCurrentRoom, PutPlayerInStartRoom, PutPlayersInRoom, TellClientsAboutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { PlayerDropsCoinsWithTrajectory, SpawnRandomCoins } from "server/sv_coins"
import { DestroyCoinFolder } from "shared/sh_coins"
import { GetCoinFolder, GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore, NETVAR_SCORE, PPRS_PREMATCH_COINS } from "shared/sh_score"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"
import { GetPlayerPersistence_Number, SetPlayerPersistence } from "./sv_persistence"
import { ServerAttemptToFindReadyPlayersOfPlayerCount } from "./sv_matchmaking"
import { IsReservedServer } from "shared/sh_reservedServer"
import { GetPosition } from "shared/sh_utils_geometry"
import { ReportEvent } from "./sv_analytics"
import { GetSharedVarInt, SetSharedVarInt } from "shared/sh_sharedVar"
import { GetPlayerSpawnLocation } from "./sv_playerSpawnLocation"
import { AddFilterPlayerPickupsCallback, DeleteFilterPlayerPickupsCallback } from "shared/sh_pickups"

const LOCAL = RunService.IsStudio()
const MSLBL = "MATCHMAKE_CALL"
const POLL_RATE = 1

class File
{
   matches: Array<Match> = []
   //playerToMatch = new Map<Player, Match>()
   nextCrossCallTime = Workspace.DistributedGameTime + 120

   matchDestroyedCallbacks: Array<( ( match: Match ) => void )> = []

   lastPlayerCount = -1
}

let file = new File()

function CreateMatch(): Match
{
   let match = new Match()
   file.matches.push( match )

   Thread(
      function ()
      {
         wait() // let other places modify match state before doing thinks. Ideally this would be a waittillframeend

         if ( match.GetGameState() === GAME_STATE.GAME_STATE_COMPLETE )
            return

         match.gameThread = coroutine.create(
            function ()
            {
               ServerGameThread( match )
            } )
         Resume( match.gameThread )
      } )


   return match
}

export function PlayerHasMatch( player: Player ): boolean
{
   for ( let match of file.matches )
   {
      for ( let otherPlayer of match.GetAllPlayers() )
      {
         if ( otherPlayer === player )
            return true
      }
   }

   return false
}

export function PlayerToMatch( player: Player ): Match
{
   for ( let match of file.matches )
   {
      for ( let otherPlayer of match.GetAllPlayers() )
      {
         if ( otherPlayer === player )
            return match
      }
   }

   Assert( false, "Couldn't find match for player " + player.Name )
   throw undefined
}

export function SV_GameStateSetup()
{
   if ( FLAG_RESERVED_SERVER )
      print( "IsReservedServer(): " + IsReservedServer() )
   print( "Game name: " + game.Name )
   print( "Placeid: " + game.PlaceId )
   print( "Jobid: " + game.JobId )

   class ChatResults
   {
      FromSpeaker: string = ""
      SpeakerUserId: number = 0
      IsFiltered: boolean = false
      ShouldDeliver: boolean = true
   }

   Chat.RegisterChatCallback( Enum.ChatCallbackType.OnServerReceivingMessage,
      function ( a: ChatResults )
      {
         let userIdToPlayer = UserIDToPlayer()
         let player = userIdToPlayer.get( a.SpeakerUserId ) as Player
         a.ShouldDeliver = true

         if ( PlayerHasMatch( player ) )
         {
            let match = PlayerToMatch( player )
            if ( match.IsRealMatch() )
            {
               switch ( match.GetGameState() )
               {
                  case GAME_STATE.GAME_STATE_PLAYING:
                  case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
                     a.ShouldDeliver = match.IsSpectator( player )
                     break

                  //               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
                  //               case GAME_STATE.GAME_STATE_MEETING_VOTE:
                  //               case GAME_STATE.GAME_STATE_MEETING_RESULTS:
                  //                  a.ShouldDeliver = !match.IsSpectator( player )
                  //                  break
               }
            }
         }

         return a
      } )



   AddRPC( "RPC_FromClient_AdminClick", function ( player: Player )
   {
      if ( ArrayFind( ADMINS, player.Name ) === undefined )
         return

      //IncrementServerVersion()
      for ( let player of Players.GetPlayers() )
      {
         player.Kick( "Restarting server - reconnect please" )
      }
   } )

   Thread( function ()
   {
      Wait( 6 )
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         //KillPlayer( player )
         //let match = PlayerToGame( player )
         //ClearAssignments( match, player )
      }
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      FindMatchForPlayer( player )

      if ( FLAG_RESERVED_SERVER )
      {
         Thread(
            function ()
            {
               wait() // Wait for player DS to be setup
               let coins = GetPlayerPersistence_Number( player, PPRS_PREMATCH_COINS, 0 )
               SetNetVar( player, NETVAR_SCORE, coins )
            } )
      }
   } )

   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddRPC( "RPC_FromClient_RequestLobby", function ( player: Player )
   {
      if ( FLAG_RESERVED_SERVER )
      {
         TeleportPlayersToLobby( [player], "Finding a new match" )
      }
      else
      {
         if ( !PlayerHasMatch( player ) )
         {
            FindMatchForPlayer( player )
            return
         }

         let match = PlayerToMatch( player )
         if ( !match.IsSpectator( player ) )
            return

         RemovePlayer( match, player )
         FindMatchForPlayer( player )
      }
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( !PlayerHasCurrentRoom( player ) )
         PutPlayerInStartRoom( player )

      let match = PlayerToMatch( player )
      match.Shared_OnGameStateChanged_PerPlayer( player, match )

      let _spawnPos = GetPlayerSpawnLocation( player )
      if ( _spawnPos === undefined )
         return
      let spawnPos = _spawnPos as Vector3

      let character = player.Character as Model
      let part = character.PrimaryPart as BasePart
      Thread( function ()
      {
         for ( let i = 0; i < 5; i++ ) 
         {
            part.CFrame = new CFrame( spawnPos )
            wait()
         }

         let room = GetCurrentRoom( player )
         TellClientsAboutPlayersInRoom( [player], room )
      } )
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         let match = PlayerToMatch( player )
         if ( match.IsRealMatch() )
         {
            // don't remove quitters from real games because their info is still valid and needed
            if ( !match.IsSpectator( player ) )
            {
               switch ( match.GetGameState() )
               {
                  case GAME_STATE.GAME_STATE_PLAYING:
                  case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
                     // other gamestates handle give out of coins for players themselves
                     PlayerBecomesSpectatorAndDistributesCoins( player, match )
                     break
               }
            }
         }
         else
         {
            RemovePlayer( match, player )
         }

         UpdateGame( match )
      } )

   AddRPC( "RPC_FromClient_Skipvote", function ( player: Player )
   {
      let match = PlayerToMatch( player )
      if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      SetVote( match, player, undefined )
   } )

   AddRPC( "RPC_FromClient_Vote", function ( player: Player, voteUserID: number )
   {
      let match = PlayerToMatch( player )
      if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      SetVote( match, player, voteUserID )
   } )


   if ( FLAG_RESERVED_SERVER )
   {
      if ( !IsReservedServer() )
      {
         Thread(
            function ()
            {
               for ( ; ; )
               {
                  wait( 10 )
                  let players = Players.GetPlayers()
                  for ( let player of players )
                  {
                     if ( !PlayerHasMatch( player ) )
                     {
                        print( "FAILSAFE: " + player.Name + " had no match!" )
                        FindMatchForPlayer( player )
                     }
                  }
               }
            } )

         Thread(
            function ()
            {
               for ( ; ; )
               {
                  //if ( GetTotalValueOfWorldCoins(match) < 120 )
                  {
                     //SpawnRandomCoins( match, 60 )
                  }

                  Wait( 60 )
               }
            } )

         /*
         Thread( function ()
         {
            for ( ; ; )
            {
               wait( 3 )
               let msg = "Players ALL:" + Players.GetPlayers().size()
               for ( let i = 0; i < file.matches.size(); i++ )
               {
   
   
               }
            }
         } )
         */
      }

      CrossServerMatchmakingSetup()
   }
}

function SV_GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   {
      let players = match.GetAllPlayers()
      for ( let player of players )
      {
         if ( player.Character !== undefined )
            match.Shared_OnGameStateChanged_PerPlayer( player, match )
      }
   }

   if ( FLAG_RESERVED_SERVER )
   {
      // leaving this match state
      switch ( oldGameState )
      {
         case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
            if ( !IsReservedServer() && !LOCAL )
            {
               WaitThread( function ()
               {
                  TryToSendPlayersToNewReservedServer( match )
               } )

               DestroyMatch( match )
               return
            }
            break
      }
   }
   else
   {
      // leaving this match state
      switch ( oldGameState )
      {
         case GAME_STATE.GAME_STATE_INTRO:
            if ( match.GetAllPlayersWithCharactersCloned().size() < MATCHMAKE_PLAYERCOUNT_FALLBACK || match.GetLivingImpostors().size() < match.shState.startingImpostorCount )
            {
               print( "Failed to leave intro:" )
               print( "match.GetAllPlayersWithCharactersCloned().size(): " + match.GetAllPlayersWithCharactersCloned().size() )
               print( "MATCHMAKE_PLAYERCOUNT_FALLBACK: " + MATCHMAKE_PLAYERCOUNT_FALLBACK )
               print( "match.GetLivingImpostors().size(): " + match.GetLivingImpostors().size() )
               print( "match.shState.startingImpostorCount: " + match.shState.startingImpostorCount )
               // players left during intro
               DestroyMatch( match )
               return
            }
            break
      }
   }

   let index = -1
   for ( let i = 0; i < file.matches.size(); i++ )
   {
      if ( file.matches[i] === match )
      {
         index = i
         break
      }
   }
   print( "Match " + index + " entering GameState " + match.GetGameState() )
   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
         let livingPlayers = match.GetLivingPlayers()
         let userIdToPlayer = UserIDToPlayer()
         for ( let player of livingPlayers )
         {
            if ( !userIdToPlayer.has( player.UserId ) || player.Character === undefined )
               PlayerBecomesSpectatorAndDistributesCoins( player, match )
         }

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "SV_GameStateChanged, GAMERESULTS: " + gameResults )
         if ( gameResults !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
   }

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         Assert( match.GetMeetingDetails() !== undefined, "No meeting details during a meeting" )
         break

      default:
         match.ClearMeetingDetails()
         break
   }


   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_COUNTDOWN:

         for ( let player of match.GetAllPlayers() )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", player )
         }

         break

      case GAME_STATE.GAME_STATE_INTRO:

         let players = match.GetAllPlayersWithCharactersCloned()
         if ( FLAG_RESERVED_SERVER )
         {
            if ( IsReservedServer() )
            {
               Assert( players.size() <= MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )
               if ( players.size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
               {
                  ReportEvent( "NotEnoughPlayers", "count: " + players.size() )
                  print( "Not enough players, return to lobby" )
                  TeleportPlayersToLobby( players, "Need more players" )
                  return
               }
            }
         }

         for ( let player of players )
         {
            Assert( match.GetPlayerRole( player ) !== ROLE.ROLE_SPECTATOR_LATE_JOINER, "Late joiner in intro?" )
         }

         print( "Starting intro" )
         match.shState.startingPlayerCount = players.size()

         for ( let player of players )
         {
            if ( FLAG_RESERVED_SERVER )
               SetPlayerPersistence( player, PPRS_PREMATCH_COINS, 0 )

            ResetNetVar( player, NETVAR_JSON_ASSIGNMENTS )
            ResetNetVar( player, NETVAR_JSON_GAMESTATE )
            ResetNetVar( player, NETVAR_MEETINGS_CALLED )
            //ResetNetVar( player, NETVAR_SCORE ) // keep prematch coins collected
         }

         let impostorCount = 1
         let size = players.size()
         if ( size > 11 )
            impostorCount = 3
         else if ( size > 6 )
            impostorCount = 2


         ArrayRandomize( players )
         let impostorPlayers = players.slice( 0, impostorCount )
         let setCampers = players.slice( impostorCount, size )

         match.shState.startingImpostorCount = impostorCount
         print( "match.shState.startingImpostorCount: " + match.shState.startingImpostorCount )

         for ( let player of impostorPlayers )
         {
            print( player.Name + " to Impostor" )
            match.SetPlayerRole( player, ROLE.ROLE_IMPOSTOR )
            ClearAssignments( match, player )
         }

         for ( let player of setCampers )
         {
            match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
            AssignTasks( player, match )
         }

         for ( let player of players )
         {
            Assert( player.Character !== undefined, "player.Character !== undefined" )
            Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
         }

         Assert( match.GetLivingImpostors().size() > 0, "match.GetLivingImpostors() > 0" )
         Assert( match.GetLivingCampers().size() > 1, "match.GetLivingCampers().size > 1" )

         for ( let i = 0; i < players.size(); i++ )
         {
            let playerInfo = match.GetPlayerInfo( players[i] )
            playerInfo.playernum = i
         }
         Thread( function ()
         {
            wait( 1.5 ) // wait for fade out
            let room = GetRoomByName( SPAWN_ROOM )
            PutPlayersInRoom( match.GetAllPlayersWithCharacters(), room )
         } )

         break


      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let livingCampers = match.GetLivingCampers().size()
         if ( match.GetSVState().previouslyLivingCampers === 0 || match.GetSVState().previouslyLivingCampers > livingCampers )
         {
            let toSpawn = 60 + match.GetSVState().roundsPassed * 60
            toSpawn -= GetTotalValueOfWorldCoins( match )
            if ( toSpawn > 0 )
               SpawnRandomCoins( match, toSpawn )

            match.GetSVState().previouslyLivingCampers = livingCampers
            match.GetSVState().roundsPassed++
         }

         for ( let player of match.GetAllPlayers() )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", player )
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         HandleVoteResults( match )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "Match Complete. Match results: " + gameResults )
         print( "Impostors: " + match.GetLivingImpostors().size() )
         print( "Campers: " + match.GetLivingCampers().size() )

         for ( let player of match.GetAllPlayers() )
         {
            ClearAssignments( match, player )
            if ( !IsAlive( player ) )
               continue

            //KillPlayer( player )
            SV_SendRPC( "RPC_FromServer_CancelTask", player )
         }

         {
            switch ( gameResults ) 
            {
               case GAMERESULTS.RESULTS_IMPOSTORS_WIN:
                  {
                     let players = match.GetLivingCampers()
                     for ( let player of players )
                     {
                        PlayerBecomesSpectatorAndDistributesCoins( player, match )
                     }
                  }
                  break

               case GAMERESULTS.RESULTS_CAMPERS_WIN:
                  {
                     let players = match.GetLivingImpostors()
                     for ( let player of players )
                     {
                        PlayerBecomesSpectatorAndDistributesCoins( player, match )
                     }
                  }
                  break
            }

            DistributePointsToPlayers( match.GetLivingPlayers(), GetTotalValueOfWorldCoins( match ) )

            for ( let player of match.GetLivingPlayers() )
            {
               ScoreToStash( player )
            }
         }

         Thread(
            function ()
            {
               Wait( 10 ) // watch ending
               if ( FLAG_RESERVED_SERVER )
               {
                  if ( IsReservedServer() )
                  {
                     TeleportPlayersToLobby( Players.GetPlayers(), "Teleport to new match failed, reconnect." )
                     return
                  }
               }
               else
               {
                  // game is over, so use longer countdown
                  SetSharedVarInt( SHARED_COUNTDOWN_TIMER, COUNTDOWN_TIME_POSTMATCH )
                  DestroyMatch( match )
               }
            } )
         break
   }
}

function GetMatchIndex( match: Match ): string
{
   for ( let i = 0; i < file.matches.size(); i++ )
   {
      if ( file.matches[i] === match )
         return "m" + i + ":" + match.shState.gameIndex
   }
   return "D:" + match.shState.gameIndex
}

function ServerGameThread( match: Match )
{
   print( "INIT ServerGameThread " + GetMatchIndex( match ) )
   //PutPlayersInRoom( match.GetAllPlayers(), GetRoomByName( SPAWN_ROOM ) )

   let gameState = -1
   let lastGameState = match.GetGameState()
   let lastTracker = -1

   function PostStateWait()
   {
      let delay: number | undefined
      if ( match.GameStateHasTimeLimit() )
      {
         delay = match.GetTimeRemainingForState()
         if ( delay <= 0 )
         {
            let nextState = match.GetGameState() + 1
            switch ( match.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_MEETING_RESULTS:
                  nextState = GAME_STATE.GAME_STATE_PLAYING
                  break
            }

            switch ( nextState )
            {
               case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
                  nextState++
                  break
            }

            SetGameState( match, nextState )
            //SetGameState(match,GAME_STATE.GAME_STATE_PLAYING )
            //if ( match.GetGameResults_NoParityAllowed() === GAMERESULTS.RESULTS_STILL_PLAYING )
            //   SetGameState(match,GAME_STATE.GAME_STATE_PLAYING )
            //else
            //   SetGameState(match,GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
      }

      if ( match.PollingGameState() )
      {
         if ( delay === undefined )
            delay = POLL_RATE
         else
            delay = math.min( delay, POLL_RATE )
      }

      lastTracker = match.GetSVState().updateTracker
      if ( delay !== undefined )
      {
         let endTime = Workspace.DistributedGameTime + delay
         for ( ; ; )
         {
            if ( Workspace.DistributedGameTime >= endTime )
               break
            if ( match.GetSVState().updateTracker !== lastTracker )
               break
            wait()
         }
      }
      else
      {
         for ( ; ; )
         {
            if ( match.GetSVState().updateTracker !== lastTracker )
               break
            wait()
         }
      }
   }

   let lastBroadcastGameState = -1
   function ShouldBroadcastGameState(): boolean
   {
      if ( gameState !== GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         return true

      //print( "lastTracker: " + lastTracker )
      //print( "match.GetSVState().updateTracker: " + match.GetSVState().updateTracker )
      if ( lastTracker !== match.GetSVState().updateTracker )
         return true
      if ( FLAG_RESERVED_SERVER )
      {
         if ( IsReservedServer() )
            return true
      }
      if ( lastBroadcastGameState !== gameState )
         return true

      //print( "match.GetTimeInGameState(): " + match.GetTimeInGameState() )
      return match.GetTimeInGameState() < 1
   }


   for ( ; ; )
   {
      // do on-state-changed-from/to stuff
      gameState = match.GetGameState()
      if ( gameState !== lastGameState )
      {
         print( "\nSERVER " + GetMatchIndex( match ) + " GAME STATE CHANGED FROM " + lastGameState + " TO " + gameState )
         SV_GameStateChanged( match, lastGameState )
         lastGameState = gameState
      }

      GameStateThink( match )

      if ( gameState === match.GetGameState() )
      {
         if ( ShouldBroadcastGameState() )
         {
            BroadcastGamestate( match )
            lastBroadcastGameState = gameState
         }

         if ( gameState === GAME_STATE.GAME_STATE_COMPLETE )
            return

         PostStateWait()
      }
   }
}


function GameStateThink( match: Match )
{
   let debugState = match.GetGameState()
   //print( "GameStateThink match:" + GetMatchIndex( match ) + " gamestate:" + debugState )
   // quick check on whether or not match is even still going
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         if ( match.GetGameResults_NoParityAllowed() !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break

      case GAME_STATE.GAME_STATE_PLAYING:
         switch ( match.GetGameResults_ParityAllowed() )
         {
            case GAMERESULTS.RESULTS_STILL_PLAYING:
               break

            case GAMERESULTS.RESULTS_SUDDEN_DEATH:
               SetGameState( match, GAME_STATE.GAME_STATE_SUDDEN_DEATH )
               return

            default:
               SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
               return
         }
         break

      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( match.GetGameResults_ParityAllowed() !== GAMERESULTS.RESULTS_SUDDEN_DEATH )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break
   }

   Assert( debugState === match.GetGameState(), "1 Did not RETURN after SETGAMESTATE" )

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
         if ( FLAG_RESERVED_SERVER )
         {
            if ( IsReservedServer() )
               SetGameState( match, GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING )
            else
               SetGameState( match, GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         }
         else
         {
            SetGameState( match, GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         }
         return

      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:

         if ( match.GetAllPlayers().size() === 0 )
         {
            DestroyMatch( match )
            return
         }
         let searchCount = match.GetAllPlayersWithCharactersCloned().size()

         if ( match.GetAllPlayers().size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            // failsafe for multiple matches waiting for players
            for ( ; ; )
            {
               let movedPlayer = false
               for ( let otherMatch of file.matches )
               {
                  if ( match === otherMatch )
                     continue
                  if ( otherMatch.GetGameState() !== GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
                     continue

                  let players = otherMatch.GetAllPlayers()
                  if ( players.size() === 0 )
                     continue

                  TransferPlayer( players[0], otherMatch, match )
                  movedPlayer = true

                  if ( players.size() === 1 ) // we removed the last player
                     DestroyMatch( otherMatch )
               }
               if ( !movedPlayer )
                  break
            }
         }

         if ( file.lastPlayerCount !== searchCount )
         {
            print( "Found " + searchCount + " players, need " + MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            file.lastPlayerCount = searchCount
         }

         if ( FLAG_RESERVED_SERVER )
         {
            if ( searchCount < MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            {
               Thread( CrossServerRequestMorePlayers )
               return
            }

            if ( IsReservedServer() )
            {
               SetGameState( match, GAME_STATE.GAME_STATE_INTRO )
               return
            }

            let matchedPlayers = ServerAttemptToFindReadyPlayersOfPlayerCount( match.GetAllPlayersWithCharactersCloned(), MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            if ( matchedPlayers === undefined )
            {
               print( "not enough matchedplayers" )
               return
            }

            print( "Found enough players for match" )
            if ( LOCAL )
            {
               match.shState.realMatch = true
               SetGameState( match, GAME_STATE.GAME_STATE_COUNTDOWN )
            }
            else
            {
               // create a new match for the found players
               let newMatch = CreateMatch()
               print( "Creating new match" )
               for ( let player of matchedPlayers )
               {
                  //print( "adding player " + player.Name )
                  let playerMatch = PlayerToMatch( player )
                  Assert( playerMatch === match, "playerMatch === match" )
                  TransferPlayer( player, match, newMatch )
               }

               SetGameState( match, GAME_STATE.GAME_STATE_COUNTDOWN )
               UpdateGame( match )
            }
         }
         else
         {
            if ( searchCount >= MATCHMAKE_PLAYERCOUNT_FALLBACK )
            {
               SetGameState( match, GAME_STATE.GAME_STATE_COUNTDOWN )
               UpdateGame( match )
            }
            let countdownTime = GetSharedVarInt( SHARED_COUNTDOWN_TIMER )
            countdownTime -= POLL_RATE
            if ( countdownTime < START_COUNTDOWN )
               countdownTime = START_COUNTDOWN
            SetSharedVarInt( SHARED_COUNTDOWN_TIMER, countdownTime )

            if ( Workspace.DistributedGameTime > match.GetSVState().timeNextWaitingCoins )
            {
               match.GetSVState().timeNextWaitingCoins = Workspace.DistributedGameTime + 60
               if ( GetTotalValueOfWorldCoins( match ) < 120 )
               {
                  SpawnRandomCoins( match, 60 )
               }
            }
         }

         return

      case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         //print( "match.GetAllPlayersWithCharactersCloned().size(): " + match.GetAllPlayersWithCharactersCloned().size() )
         if ( match.GetAllPlayersWithCharactersCloned().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_INTRO )
            return
         }
         return

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         {
            if ( FLAG_RESERVED_SERVER )
            {
               if ( match.GetAllPlayersWithCharactersCloned().size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
               {
                  DestroyMatch( match )
                  return
               }
            }
            else
            {
               if ( match.GetAllPlayersWithCharactersCloned().size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
               {
                  SetGameState( match, GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
                  return
               }
            }
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         {
            function VotingFinished()
            {
               let votes = match.GetVotes()
               let playerVoted = new Map<USERID, boolean>()
               for ( let vote of votes )
               {
                  playerVoted.set( vote.voter, true )
               }

               let userIDToPlayer = UserIDToPlayer()
               for ( let player of match.GetAllPlayers() )
               {
                  if ( match.IsSpectator( player ) )
                     continue // can't vote
                  if ( playerVoted.has( player.UserId ) )
                     continue // player already voted

                  // player is still in the game but hasn't voted
                  if ( userIDToPlayer.has( player.UserId ) )
                     return false
               }
               return true
            }

            if ( VotingFinished() )
            {
               Assert( match.GetMeetingDetails() !== undefined, "No meeting details" )
               SetGameState( match, GAME_STATE.GAME_STATE_MEETING_RESULTS )
               return
            }
         }
         break
   }

   Assert( debugState === match.GetGameState(), "2 Did not RETURN after SETGAMESTATE" )
}

function HandleVoteResults( match: Match )
{
   Thread(
      function ()
      {
         let voteResults = GetVoteResults( match.GetVotes() )

         match.shState.corpses = [] // clear the corpses

         let room = GetRoomByName( 'Great Room' )
         PutPlayersInRoom( match.GetAllPlayersWithCharacters(), room )

         if ( voteResults.skipTie || voteResults.highestRecipients.size() !== 1 )
         {
            Wait( 5 )
         }
         else
         {
            BecomeSpectator( voteResults.highestRecipients[0], match )

            let highestTarget = voteResults.highestRecipients[0]
            Wait( 8 ) // delay for vote matchscreen
            match.SetPlayerKilled( highestTarget )
            PlayerBecomesSpectatorAndDistributesCoins( highestTarget, match )

            print( "Player " + highestTarget.Name + " was voted off" )
         }

         if ( match.GetGameState() === GAME_STATE.GAME_STATE_COMPLETE )
            return

         SetGameState( match, GAME_STATE.GAME_STATE_PLAYING )
      } )
}

function BecomeSpectator( player: Player, match: Match )
{
   switch ( match.GetPlayerRole( player ) )
   {
      case ROLE.ROLE_CAMPER:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_CAMPER )
         break

      case ROLE.ROLE_IMPOSTOR:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_IMPOSTOR )
         break
   }
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   let match = PlayerToMatch( player )
   SetPlayerWalkspeedForGameState( player, match )

   if ( !match.GetSVState().assignments.has( player ) )
      return

   let assignments = match.GetSVState().assignments.get( player ) as Array<Assignment>

   let thisAssignment: Assignment | undefined

   for ( let assignment of assignments )
   {
      if ( !AssignmentIsSame( assignment, roomName, taskName ) )
         continue

      thisAssignment = assignment
      assignment.status = 1
      switch ( taskName )
      {
         case TASK_RESTORE_LIGHTS:
            // group task, take the task from all others that have it
            for ( let allPlayer of match.GetAllPlayers() )
            {
               if ( ServerPlayeyHasAssignment( allPlayer, match, roomName, taskName ) )
                  RemoveAssignment( allPlayer, match, roomName, taskName )
            }

            for ( let impostor of match.GetImpostors() )
            {
               ResetCooldownTime( impostor, COOLDOWN_SABOTAGE_LIGHTS )
            }
            break
      }
   }

   // you leave now!
   switch ( taskName )
   {
      case TASK_EXIT:
         print( player.Name + " finishes Exit" )
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
         ScoreToStash( player )
         UpdateGame( match )
         break

      case TASK_RESTORE_LIGHTS:
         break

      default:
         if ( thisAssignment !== undefined )
         {
            let room = GetRoomByName( thisAssignment.roomName )
            let task = room.tasks.get( thisAssignment.taskName )
            if ( task === undefined )
            {
               Assert( false, "RPC_FromClient_OnPlayerFinishTask" )
               throw undefined
            }

            let reward = TASK_VALUE + math.floor( ( match.GetSVState().roundsPassed - 1 ) * TASK_VALUE * 0.5 )
            IncrementMatchScore( player, reward )
            SV_SendRPC( "RPC_FromServer_GavePoints", player, task.volume.Position, reward )
         }
         break
   }

   UpdateTasklistNetvar( player, assignments )

   function NoRegularTasksLeft(): boolean
   {
      for ( let assignment of assignments )
      {
         switch ( assignment.taskName )
         {
            case TASK_RESTORE_LIGHTS:
               break

            case TASK_EXIT:
               return false

            default:
               if ( assignment.status === 0 )
                  return false
         }
      }
      return true
   }

   if ( NoRegularTasksLeft() )
   {
      if ( FLAG_RESERVED_SERVER )
      {
         let assignment = new Assignment( SPAWN_ROOM, TASK_EXIT )
         assignments.push( assignment )
         UpdateTasklistNetvar( player, assignments )
      }
      else
      {
         if ( match.GetGameState() >= GAME_STATE.GAME_STATE_PLAYING )
         {
            let assignment = new Assignment( SPAWN_ROOM, TASK_EXIT )
            assignments.push( assignment )
            UpdateTasklistNetvar( player, assignments )
         }
         else
         {
            AssignTasks( player, match ) // 7-10 random tasks
         }
      }
   }
}

export function PlayerHasAssignments( player: Player, match: Match ): boolean
{
   let assignments = match.GetSVState().assignments.get( player )
   if ( assignments === undefined )
      return false

   return assignments.size() > 0
}

export function ServerPlayeyHasAssignment( player: Player, match: Match, roomName: string, taskName: string ): boolean
{
   if ( !PlayerHasAssignments( player, match ) )
      return false

   let assignments = match.GetSVState().assignments.get( player )
   if ( assignments === undefined )
      return false

   for ( let assignment of assignments )
   {
      if ( AssignmentIsSame( assignment, roomName, taskName ) )
         return true
   }
   return false
}

export function RemoveAssignment( player: Player, match: Match, roomName: string, taskName: string )
{
   let assignments = match.GetSVState().assignments.get( player )
   if ( assignments === undefined )
      return

   for ( let i = 0; i < assignments.size(); i++ )
   {
      let assignment = assignments[i]
      if ( !AssignmentIsSame( assignment, roomName, taskName ) )
         continue
      assignments.remove( i )
      i--
   }
   UpdateTasklistNetvar( player, assignments )
}

export function GiveAssignment( player: Player, match: Match, assignment: Assignment )
{
   let assignments = match.GetSVState().assignments.get( player )
   if ( assignments === undefined )
      assignments = []
   assignments.push( assignment )
   UpdateTasklistNetvar( player, assignments )
}

export function PlayerHasUnfinishedAssignment( player: Player, match: Match, roomName: string, taskName: string ): boolean
{
   let assignments = match.GetSVState().assignments.get( player )
   if ( assignments === undefined )
      return false

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
         return assignment.status === 0
   }

   return false
}

function AssignTasksCount( player: Player, match: Match, assignments: Array<Assignment>, count?: number )
{
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )

   for ( let roomAndTask of roomsAndTasks )
   {
      if ( DEV_1_TASK && roomAndTask.room.name !== "Great Room" )
         continue
      if ( roomAndTask.task.realMatchesOnly && ( !match.IsRealMatch() || match.GetGameState() < GAME_STATE.GAME_STATE_PLAYING ) )
         continue

      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name )
      switch ( assignment.taskName )
      {
         case TASK_EXIT:
         case TASK_RESTORE_LIGHTS:
            break

         default:
            assignments.push( assignment )
            break
      }

      if ( count !== undefined )
      {
         if ( assignments.size() >= count )
            break
      }

      if ( DEV_1_TASK )
      {
         if ( assignments.size() )
            break
      }
   }

   //print( "Assigned " + assignments.size() + " tasks" )
   match.GetSVState().assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
}


export function AssignTasks( player: Player, match: Match )
{
   let assignments: Array<Assignment> = []

   let playerCount = match.GetAllPlayers().size()
   let TASK_COUNT = math.floor(
      GraphCapped( playerCount,
         MATCHMAKE_PLAYERCOUNT_FALLBACK, MATCHMAKE_PLAYERCOUNT_STARTSERVER,
         MIN_TASKLIST_SIZE, MAX_TASKLIST_SIZE ) )

   //TASK_COUNT = 2

   AssignTasksCount( player, match, assignments, TASK_COUNT )
}

export function AssignAllTasks( player: Player, match: Match )
{
   let assignments: Array<Assignment> = []

   AssignTasksCount( player, match, assignments )
}

export function UpdateTasklistNetvar( player: Player, assignments: Array<Assignment> )
{
   Assert( assignments !== undefined, "Player does not have tasklist" )
   if ( assignments === undefined )
      return

   let encode = HttpService.JSONEncode( assignments )
   SetNetVar( player, NETVAR_JSON_ASSIGNMENTS, encode )
}

export function ClearAssignments( match: Match, player: Player )
{
   match.GetSVState().assignments.set( player, [] )
   UpdateTasklistNetvar( player, [] )
}

function DistributePointsToPlayers( players: Array<Player>, score: number )
{
   let scorePerPlayer = math.floor( score / players.size() )
   if ( scorePerPlayer < 1 )
      scorePerPlayer = 1

   for ( let player of players )
   {
      IncrementMatchScore( player, scorePerPlayer )
   }
}

function PlayerBecomesSpectatorAndDistributesCoins( player: Player, match: Match )
{
   BecomeSpectator( player, match )

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
      case GAME_STATE.GAME_STATE_COMPLETE:
         let score = GetMatchScore( player )
         if ( score > 0 )
         {
            ClearMatchScore( player )
            DistributePointsToPlayers( match.GetLivingPlayers(), score )
         }
         return

      default:
         PlayerDropsCoinsWithTrajectory( match, player, GetPosition( player ) )
         return
   }
}


function TeleportPlayersToLobby( players: Array<Player>, msg: string )
{
   if ( !FLAG_RESERVED_SERVER )
      return
   print( "Teleport " + players.size() + " players to lobby" )

   Thread( function ()
   {
      players = players.filter( function ( player )
      {
         return player.Name !== "Argonomic"
      } )
      TeleportService.TeleportPartyAsync( game.PlaceId, players )
      Wait( 10 )
      // failsafe
      for ( let player of players )
      {
         player.Kick( msg )
      }
   } )
}

function FindMatchForPlayer( player: Player )
{
   if ( FLAG_RESERVED_SERVER )
   {
      FindMatchForPlayer_FLAG_RESERVED_SERVER( player )
      return
   }

   FindMatchForPlayer_NO_FLAG_RESERVED_SERVER( player )
}

function FindMatchForPlayer_NO_FLAG_RESERVED_SERVER( player: Player )
{
   //print( "FindMatchForPlayer: " + player.Name )
   if ( PlayerHasMatch( player ) )
   {
      //print( "Player has match " + GetMatchIndex( PlayerToMatch( player ) ) )
      return
   }

   // any matches waiting for players?
   for ( let match of file.matches )
   {
      if ( match.GetAllPlayers().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         continue

      if ( match.GetGameState() > GAME_STATE.GAME_STATE_COUNTDOWN )
         continue

      AddPlayer( match, player )
      match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
      AssignAllTasks( player, match )
      UpdateGame( match )
      //print( "Added to match " + GetMatchIndex( PlayerToMatch( player ) ) )
      return
   }

   // any matches in progress?
   for ( let match of file.matches )
   {
      if ( match.GetAllPlayers().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         continue

      if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
         continue

      AddPlayer( match, player )
      match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_LATE_JOINER )
      UpdateGame( match )
      return
   }

   print( "Creating new match" )
   // make a new match
   let match = CreateMatch()
   AddPlayer( match, player )
   AssignAllTasks( player, match )
   match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
   UpdateGame( match )
}

function FindMatchForPlayer_FLAG_RESERVED_SERVER( player: Player )
{
   if ( PlayerHasMatch( player ) )
   {
      let match = PlayerToMatch( player )
      RemovePlayer( match, player )
      UpdateGame( match )
   }

   let addedPlayer = false
   if ( IsReservedServer() )
   {
      for ( let match of file.matches )
      {
         let matchState = match.GetGameState()
         AddPlayer( match, player )
         if ( matchState >= GAME_STATE.GAME_STATE_INTRO )
         {
            print( "LATE JOINER " + player.Name + " at " + Workspace.DistributedGameTime )
            match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
            AssignTasks( player, match )
            let playerInfo = match.GetPlayerInfo( player )
            playerInfo.playernum = match.GetAllPlayers().size() - 1
         }

         addedPlayer = true
         UpdateGame( match )
         break
      }
   }
   else
   {
      for ( let match of file.matches )
      {
         if ( match.GetGameState() <= GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         {
            AddPlayer( match, player )
            UpdateGame( match )
            addedPlayer = true
            break
         }
      }
   }

   if ( !addedPlayer )
   {
      // make a new match
      let match = CreateMatch()
      AddPlayer( match, player )
      UpdateGame( match )
   }

   if ( !IsReservedServer() )
   {
      let match = PlayerToMatch( player )
      AssignAllTasks( player, match )
      match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
      UpdateGame( match )
   }
}

function DestroyMatch( match: Match )
{
   print( "DestroyMatch " + GetMatchIndex( match ) )// + "\n" + debug.traceback() )
   for ( let i = 0; i < file.matches.size(); i++ )
   {
      if ( file.matches[i] === match )
      {
         //print( "REMOVED " + i )
         file.matches.remove( i )
         i--
      }
   }

   if ( FLAG_RESERVED_SERVER )
   {
      // reassign players to other matches
      let userIdToPlayer = UserIDToPlayer()
      for ( let player of match.GetAllPlayers() )
      {
         RemovePlayer( match, player )
         if ( userIdToPlayer.has( player.UserId ) ) // still in game?
            FindMatchForPlayer( player )
      }
   }
   else
   {
      //SetGameState(match,GAME_STATE.GAME_STATE_COMPLETE )
      //UpdateGame(match)
      for ( let player of match.GetAllPlayers() )
      {
         RemovePlayer( match, player )
      }

      // put all players into new search
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         FindMatchForPlayer( player )
      }
   }

   SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )

   DeleteFilterPlayerPickupsCallback( match )
   DestroyCoinFolder( match )

   for ( let func of file.matchDestroyedCallbacks )
   {
      Thread(
         function ()
         {
            func( match )
         } )
   }
}


class Message
{
   Data: string
   Sent: number
   constructor( Data: string, Sent: number )
   {
      this.Data = Data
      this.Sent = Sent
   }
}

function CrossServerMatchmakingSetup()
{
   if ( !FLAG_RESERVED_SERVER )
      return
   if ( LOCAL )
      return
   if ( IsReservedServer() )
      return

   Thread(
      function ()
      {
         let pair = pcall(
            function ()
            {
               MessagingService.SubscribeAsync( MSLBL,
                  function ( message: Message )
                  {
                     print( "MessagingService.SubscribeAsync: " + message.Sent )

                     let jobId = message.Data
                     print( "jobid is " + jobId )

                     let delta = os.time() - math.floor( message.Sent )
                     print( "Received matchmake request that was " + delta + " seconds old" )

                     if ( jobId === game.JobId ) // this was the sender
                     {
                        print( "We were sender" )
                        return
                     }

                     file.nextCrossCallTime = Workspace.DistributedGameTime + 120 // don't do our own broadcasts if we are not the leading broadcaster

                     if ( delta > 5 )
                     {
                        print( "Message too old" )
                        return
                     }

                     if ( jobId.size() <= 2 )
                     {
                        print( "jobid weird" )
                        return
                     }

                     let players: Array<Player> = []

                     for ( let match of file.matches )
                     {
                        if ( match.GetGameState() === GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
                           players = players.concat( match.GetAllPlayers() )
                     }

                     print( "Sending " + players.size() + " players to " + game.PlaceId + "/" + jobId )

                     Thread(
                        function ()
                        {
                           for ( let player of players )
                           {
                              pcall(
                                 function ()
                                 {
                                    TeleportService.TeleportToPlaceInstance( game.PlaceId, jobId, player )
                                 } )
                           }
                        } )
                  } )
            } )

         print( "Subscribe success: " + pair[0] )
      } )
}


export function CrossServerRequestMorePlayers()
{
   if ( LOCAL )
      return
   if ( IsReservedServer() )
      return

   if ( Workspace.DistributedGameTime < file.nextCrossCallTime )
      return

   print( "CrossServerRequestMorePlayers()" )
   file.nextCrossCallTime = Workspace.DistributedGameTime + 60

   let pair = pcall( function ()
   {
      MessagingService.PublishAsync( MSLBL, game.JobId )
   } )
   print( "Broadcasted success: " + pair[0] )
}


//players = players.filter( function ( player )
//{
//   return player.Name === "Argonomic"
//} )
function TryToSendPlayersToNewReservedServer( match: Match )
{
   print( "\n********************\n***************\nStarting reserved server" )
   let players = match.GetAllPlayersWithCharactersCloned()
   if ( players.size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER )
      return

   pcall(
      function ()
      {
         let code: LuaTuple<[string, string]> | undefined

         let pair2 = pcall(
            function ()
            {
               code = TeleportService.ReserveServer( game.PlaceId )
            } )
         if ( !pair2[0] || code === undefined )
            return

         let pair3 = pcall(
            function ()
            {
               if ( code === undefined )
                  return

               for ( let player of players )
               {
                  let score = GetMatchScore( player )
                  SetPlayerPersistence( player, PPRS_PREMATCH_COINS, score )
               }
               TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none" )
               Wait( 30 ) // presumably players have teleported
            } )
      } )
}
/*
let playr = players[1]
players = players.filter( function ( player )
{
   return player !== playr
} )
TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none" )
wait( 15 )
TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], [playr], "none" )
*/


function BroadcastGamestate( match: Match )
{
   //print( "\nBroadcastGamestate " + match.GetGameState() + " at " + Workspace.DistributedGameTime )
   //print( "ASD: player count " + match.GetAllPlayerInfo().size() )

   function RevealImpostors( match: Match, player: Player ): boolean
   {
      if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
         return true
      if ( match.IsImpostor( player ) )
         return true

      return false
   }

   let json = HttpService.JSONEncode( match.shState )

   let revealedImpostor = false
   for ( let player of match.GetAllPlayers() )
   {
      // tell the campers about everyone, but mask the impostors
      if ( RevealImpostors( match, player ) )
      {
         SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
         revealedImpostor = true
      }
      else
      {
         // use encode/decode to clone the gamestate
         let gameState = HttpService.JSONDecode( json ) as NS_SharedMatchState

         for ( let pair of gameState.playerToInfo )
         {
            switch ( pair[1].role )
            {
               case ROLE.ROLE_IMPOSTOR:
                  pair[1].role = ROLE.ROLE_CAMPER
                  break
            }
         }

         {
            let json = HttpService.JSONEncode( gameState )
            SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
         }
      }
   }

   //print( "revealedImpostor: " + revealedImpostor )
   //print( "match.winOnlybyEscaping: " + match.winOnlybyEscaping )
   //print( "Bool: " + ( revealedImpostor || match.winOnlybyEscaping ) )

   revealedImpostor = true
   Assert( !match.IsRealMatch() || match.GetGameState() < GAME_STATE.GAME_STATE_PLAYING || revealedImpostor, "Didn't reveal impostor" )
}

function TransferPlayer( player: Player, from: Match, to: Match )
{
   RemovePlayer( from, player )
   AddPlayer( to, player )
}


function SetVote( match: Match, player: Player, voteUserID: number | undefined )
{
   if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
      return

   Assert( voteUserID === undefined || typeOf( voteUserID ) === 'number', "Expected voteUserID to be number or undefined, but was " + typeOf( voteUserID ) + ", " + voteUserID )

   for ( let vote of match.shState.votes )
   {
      // already voted?
      if ( vote.voter === player.UserId )
         return
   }

   let voteTarget: USERID | undefined

   if ( voteUserID !== undefined )
   {
      let playerInfo = match.GetPlayerInfoFromUserID( voteUserID )
      if ( playerInfo !== undefined )
         voteTarget = playerInfo._userid
   }

   match.shState.votes.push( new PlayerVote( player.UserId, voteTarget ) )
   UpdateGame( match )
}


export function SetGameState( match: Match, state: GAME_STATE )
{
   print( "\nSet Match State " + state + ", Time since last change: " + math.floor( ( Workspace.DistributedGameTime - match.shState._gameStateChangedTime ) ) )
   //print( "Stack: " + debug.traceback() )

   Assert( state >= GAME_STATE.GAME_STATE_COMPLETE || match.GetGameState() < GAME_STATE.GAME_STATE_COMPLETE, "Illegal match state setting. Tried to set state " + state + ", but match state was " + match.GetGameState() )

   match.shState._gameStateChangedTime = Workspace.DistributedGameTime
   match.shState.gameState = state

   let thread = match.gameThread
   Assert( thread !== undefined, "No match thread!" )
   if ( thread === coroutine.running() )
      return

   UpdateGame( match )
}

export function UpdateGame( match: Match )
{
   match.GetSVState().updateTracker++
}

function AddPlayer( match: Match, player: Player ): PlayerInfo
{
   //Assert( IsServer(), "IsServer()" )
   Assert( match.GetAllPlayers().size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )
   //print( "AddPlayer " + player.Name )
   Assert( !match.shState.playerToInfo.has( player.UserId + "" ), "Match already has " + player.Name )
   let playerInfo = new PlayerInfo( player.UserId )
   match.shState.playerToInfo.set( player.UserId + "", playerInfo )

   let character = player.Character
   if ( character !== undefined )
      match.Shared_OnGameStateChanged_PerPlayer( player, match )

   let folder = GetCoinFolder( match )
   AddFilterPlayerPickupsCallback( match, player,
      function ( part: Part ): boolean
      {
         return part.Parent === folder
      } )

   return playerInfo
}

function RemovePlayer( match: Match, player: Player )
{
   //print( "RemovePlayer " + player.Name )
   Assert( match.shState.playerToInfo.has( player.UserId + "" ), "Player is not in match" )
   match.shState.playerToInfo.delete( player.UserId + "" )
}

export function AddMatchDestroyedCallback( func: ( match: Match ) => void )
{
   file.matchDestroyedCallbacks.push( func )
}

