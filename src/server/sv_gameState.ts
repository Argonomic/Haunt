import { HttpService, MessagingService, Players, RunService, TeleportService, Workspace } from "@rbxts/services"
import { AddRPC, GetRPCRemoteEvent } from "shared/sh_rpc"
import { FilterHasCharacters, ArrayRandomize, GraphCapped, IsAlive, Resume, Thread, UserIDToPlayer, Wait, WaitThread, TeleportPlayersToLobby } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GAMERESULTS, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, NETVAR_JSON_GAMESTATE, NETVAR_MEETINGS_CALLED, SetPlayerWalkspeedForGameState, USERID, PlayerVote, NS_SharedMatchState, PlayerInfo, AddRoleChangeCallback, PICKUPS, IsSpectatorRole, ExecRoleChangeCallbacks, GetMinPlayersForGame } from "shared/sh_gamestate"
import { MIN_TASKLIST_SIZE, MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_STARTSERVER, SPAWN_ROOM, TASK_VALUE, DEV_1_TASK, FLAG_RESERVED_SERVER, MATCHMAKE_PLAYERCOUNT_FALLBACK } from "shared/sh_settings"
import { ResetNetVar, SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PlayerHasCurrentRoom, PutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { PlayerDropsCoinsWithTrajectory, SpawnRandomCoins } from "server/sv_coins"
import { DeleteCoin, DestroyCoinFolder, GetCoinDataFromType, GetCoinType } from "shared/sh_coins"
import { GetCoinFolder, GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore, NETVAR_SCORE, PPRS_PREMATCH_COINS } from "shared/sh_score"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"
import { GetPlayerPersistence_Number, SetPlayerPersistence } from "./sv_persistence"
import { IsReservedServer } from "shared/sh_reservedServer"
import { GetPosition } from "shared/sh_utils_geometry"
import { GetPlayerSpawnLocation } from "./sv_playerSpawnLocation"
import { PlayerPickupsDisabled, PlayerPickupsEnabled, AddFilterPlayerPickupsCallback, CreatePickupType, DeleteFilterPickupsForPlayer, DeleteFilterPlayerPickupsCallback } from "shared/sh_pickups"
import { Room } from "shared/sh_rooms"

const LOCAL = RunService.IsStudio()
const MSLBL = "MATCHMAKE_CALL"
const POLL_RATE = 1

class File
{
   matches: Array<Match> = []

   playerToMatch = new Map<Player, Match>()
   nextCrossCallTime = Workspace.DistributedGameTime + 120

   matchDestroyedCallbacks: Array<( ( match: Match ) => void )> = []

   lastPlayerCount = new Map<Match, number>()
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

export function SV_GameStateSetup()
{
   if ( FLAG_RESERVED_SERVER )
      print( "IsReservedServer(): " + IsReservedServer() )
   print( "Game name: " + game.Name )
   print( "Placeid: " + game.PlaceId )
   print( "Jobid: " + game.JobId )

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
         //if ( !PlayerHasMatch( player ) )
         //{
         //   FindMatchForPlayer( player )
         //   return
         //}

         let currentMatch = PlayerToMatch( player )
         if ( !currentMatch.IsSpectator( player ) )
            return

         // any matches waiting for players?
         for ( let match of file.matches )
         {
            if ( GetAllConnectedPlayersInMatch( match ).size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
               continue

            if ( match.GetGameState() > GAME_STATE.GAME_STATE_COUNTDOWN )
               continue

            if ( currentMatch === match )
               continue

            AddPlayer( match, player )
            SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
            UpdateGame( match )
            //print( "Added to match " + GetMatchIndex( PlayerToMatch( player ) ) )
            return
         }

         print( "%%%%%% 1 Creating new match" )
         // make a new match
         let match = CreateMatch()
         AddPlayer( match, player )
         SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
         UpdateGame( match )
      }
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( IsReservedServer() )
         return

      if ( !PlayerHasCurrentRoom( player ) )
         PutPlayerInStartRoom( player )

      let match = PlayerToMatch( player )
      match.Shared_OnGameStateChanged_PerPlayer( player, match )

      let _spawnPos = GetPlayerSpawnLocation( player )
      if ( _spawnPos === undefined )
      {
         //print( "No spawn location" )
         return
      }
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

         let match = PlayerToMatch( player )
         let room = GetCurrentRoom( player )
         TellOtherPlayersInMatchThatPlayersPutInRoom( match, [player], room )
      } )
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         let match = PlayerToMatch( player )

         // don't remove quitters from real games because their info is still valid and needed
         if ( !match.IsSpectator( player ) )
         {
            BecomeSpectator( player, match )
            PlayerDistributesCoins( player, match )
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

   AddRoleChangeCallback( function ( player: Player, match: Match )
   {
      if ( match.IsSpectator( player ) )
         ClearAssignments( match, player )

      if ( match.GetGameState() > GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         return

      switch ( match.GetPlayerRole( player ) )
      {
         case ROLE.ROLE_CAMPER:
            //print( "Player " + player.Name + " became a camper and gained all tasks" )
            // new campers get all tasks before matches start
            AssignAllTasks( player, match )
            break
      }
   } )

   let pickupType = CreatePickupType( PICKUPS.PICKUP_COIN )
   pickupType.didPickupFunc =
      function ( player: Player, pickup: Part ): boolean
      {
         let match = PlayerToMatch( player )
         let coinType = GetCoinType( pickup )

         SV_SendRPC( "RPC_FromServer_PickupCoin", match, player, pickup.Position, coinType )
         let coinData = GetCoinDataFromType( coinType )
         IncrementMatchScore( player, coinData.value )
         DeleteCoin( pickup )
         return true
      }


   if ( FLAG_RESERVED_SERVER )
   {
      if ( !IsReservedServer() )
      {
         Thread(
            function ()
            {
               for ( ; ; )
               {
                  Wait( 10 )
                  let players = Players.GetPlayers()
                  for ( let player of players )
                  {
                     //if ( !PlayerHasMatch( player ) )
                     {
                        print( "FAILSAFE: " + player.Name + " had no match!" )
                        FindMatchForPlayer( player )
                     }
                  }
               }
            } )
      }

      CrossServerMatchmakingSetup()
   }
}

function SV_GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   {
      let players = GetAllConnectedPlayersInMatch( match )
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
            if ( GetAllPlayersInMatchWithCharacters( match ).size() < MATCHMAKE_PLAYERCOUNT_FALLBACK || match.GetLivingImpostorsCount() <= 0 )
            {
               print( "Failed to leave intro:" )
               print( "GetAllPlayersInMatchWithCharacters(match).size(): " + GetAllPlayersInMatchWithCharacters( match ).size() )
               print( "MATCHMAKE_PLAYERCOUNT_FALLBACK: " + MATCHMAKE_PLAYERCOUNT_FALLBACK )
               print( "match.GetLivingImpostorsCount(): " + match.GetLivingImpostorsCount() )
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
      case GAME_STATE.GAME_STATE_INTRO:

         let players = GetAllPlayersInMatchWithCharacters( match )
         match.RemovePlayersNotInList( players ) // remove matchmaking hangeroners

         for ( let player of players )
         {
            Assert( match.GetPlayerRole( player ) !== ROLE.ROLE_SPECTATOR_LATE_JOINER, "Late joiner in intro?" )
         }

         print( "Starting intro" )
         match.shState.dbg_spc = players.size()

         for ( let player of players )
         {
            if ( FLAG_RESERVED_SERVER )
               SetPlayerPersistence( player, PPRS_PREMATCH_COINS, 0 )

            ResetNetVar( player, NETVAR_JSON_ASSIGNMENTS )
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
            SetPlayerRole( match, player, ROLE.ROLE_IMPOSTOR )
            ClearAssignments( match, player )
         }

         for ( let player of setCampers )
         {
            SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
            AssignTasks( player, match )
         }

         for ( let player of players )
         {
            Assert( player.Character !== undefined, "player.Character !== undefined" )
            Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
         }

         Assert( match.GetLivingImpostorsCount() > 0, "match.GetLivingImpostorsCount > 0" )
         Assert( match.GetLivingCampersCount() > 1, "match.GetLivingCampers().size > 1" )

         for ( let i = 0; i < players.size(); i++ )
         {
            let playerInfo = match.GetPlayerInfo( players[i] )
            playerInfo.playernum = i
         }
         Thread( function ()
         {
            Wait( 1.5 ) // wait for fade out
            let room = GetRoomByName( SPAWN_ROOM )
            let players = GetAllPlayersInMatchWithCharacters( match )
            MatchPutPlayersInRoom( match, players, room )
         } )

         break


      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let livingCampers = match.GetLivingCampersCount()
         if ( match.GetSVState().previouslyLivingCampers === 0 || match.GetSVState().previouslyLivingCampers > livingCampers )
         {
            let toSpawn = 60 + match.GetSVState().roundsPassed * 60
            toSpawn -= GetTotalValueOfWorldCoins( match )
            if ( toSpawn > 0 )
               SpawnRandomCoins( match, toSpawn )

            match.GetSVState().previouslyLivingCampers = livingCampers
            match.GetSVState().roundsPassed++
         }

         for ( let player of GetAllConnectedPlayersInMatch( match ) )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         HandleVoteResults( match )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "Match Complete. Match results: " + gameResults )
         print( "Impostors: " + match.GetLivingImpostorsCount() )
         print( "Campers: " + match.GetLivingCampersCount() )

         for ( let player of GetAllConnectedPlayersInMatch( match ) )
         {
            ClearAssignments( match, player )
            if ( !IsAlive( player ) )
               continue

            //KillPlayer( player )
            SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
         }

         {
            let players: Array<Player> = []
            switch ( gameResults ) 
            {
               case GAMERESULTS.RESULTS_IMPOSTORS_WIN:
                  players = match.GetLivingCampers()
                  break

               case GAMERESULTS.RESULTS_CAMPERS_WIN:
                  players = match.GetLivingImpostors()
                  break
            }
            for ( let player of players )
            {
               BecomeSpectator( player, match )
               if ( PlayerToMatch( player ) === match )
                  PlayerDistributesCoins( player, match )
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
            //print( "wait" )
            wait()
         }
      }
      else
      {
         for ( ; ; )
         {
            if ( match.GetSVState().updateTracker !== lastTracker )
               break
            //print( "wait" )
            wait()
         }
      }
   }

   let lastBroadcastGameState = -1
   let lastPlayerCount = -1
   function ShouldBroadcastGameState(): boolean
   {
      return true


      print( "\nmatch.GetAllPlayers().size() " + match.GetAllPlayers().size() )
      print( "lastPlayerCount " + lastPlayerCount )

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
      if ( match.GetAllPlayers().size() !== lastPlayerCount )
         return true

      //print( "match.GetTimeInGameState(): " + match.GetTimeInGameState() )
      return match.GetTimeInGameState() < 3
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
            //print( "\n -----> BroadcastGamestate <-----" )
            BroadcastGamestate( match )
            lastBroadcastGameState = gameState
            lastPlayerCount = match.GetAllPlayers().size()
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

         if ( Workspace.DistributedGameTime > match.GetSVState().timeNextWaitingCoins )
         {
            match.GetSVState().timeNextWaitingCoins = Workspace.DistributedGameTime + 60
            if ( GetTotalValueOfWorldCoins( match ) < 120 )
               SpawnRandomCoins( match, 60 )
         }

         // failsafe for multiple matches waiting for players
         if ( match.GetTimeInGameState() > 10 )
         {
            for ( ; ; )
            {
               let searchCount = GetAllConnectedPlayersInMatch( match ).size()
               if ( searchCount >= GetMinPlayersForGame() )
                  break

               if ( searchCount === 0 )
               {
                  print( "Match has no players! destroy" )
                  // no active players left
                  DestroyMatch( match )
                  return
               }

               MatchStealsFromOtherWaitingMatches( match )
               if ( GetAllConnectedPlayersInMatch( match ).size() === searchCount )
                  break
            }
         }

         let searchCount = GetAllPlayersInMatchWithCharacters( match ).size()

         if ( !file.lastPlayerCount.has( match ) )
            file.lastPlayerCount.set( match, -1 )

         let lastPlayerCount = file.lastPlayerCount.get( match ) as number
         if ( lastPlayerCount !== searchCount )
         {
            print( "Match " + GetMatchIndex( match ) + " found " + searchCount + " players, need " + GetMinPlayersForGame() )
            file.lastPlayerCount.set( match, searchCount )
         }

         if ( searchCount >= GetMinPlayersForGame() )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COUNTDOWN )
            UpdateGame( match )
            return
         }

         return

      case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         //print( "GetAllPlayersInMatchWithCharacters(match).size(): " + GetAllPlayersInMatchWithCharacters(match).size() )
         if ( GetAllPlayersInMatchWithCharacters( match ).size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_INTRO )
            return
         }
         return

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         {
            if ( GetAllConnectedPlayersInMatch( match ).size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
            {
               SetGameState( match, GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
               return
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

               for ( let player of GetAllConnectedPlayersInMatch( match ) )
               {
                  if ( match.IsSpectator( player ) )
                     continue // can't vote
                  if ( !playerVoted.has( player.UserId ) )
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
         let players = GetAllPlayersInMatchWithCharacters( match )
         MatchPutPlayersInRoom( match, players, room )

         if ( voteResults.skipTie || voteResults.highestRecipients.size() !== 1 )
         {
            Wait( 5 )
         }
         else
         {
            BecomeSpectator( voteResults.highestRecipients[0], match )

            let highestTarget = voteResults.highestRecipients[0]
            Wait( 8 ) // delay for vote matchscreen
            SetPlayerKilled( match, highestTarget )

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
         SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_CAMPER )
         break

      case ROLE.ROLE_IMPOSTOR:
         SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_IMPOSTOR )
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
            for ( let allPlayer of GetAllConnectedPlayersInMatch( match ) )
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
         SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
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
            SV_SendRPC( "RPC_FromServer_GavePoints", match, player, task.volume.Position, reward )
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
      if ( roomAndTask.task.duringPlayingOnly && match.GetGameState() < GAME_STATE.GAME_STATE_PLAYING )
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

   let playerCount = GetAllConnectedPlayersInMatch( match ).size()
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

function PlayerDistributesCoins( player: Player, match: Match, killer?: Player )
{
   Assert( PlayerToMatch( player ) === match, "Player is not in this match" )

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
         if ( killer === undefined )
            killer = player
         PlayerDropsCoinsWithTrajectory( match, player, GetPosition( killer ) )
         return
   }
}

function FindMatchForPlayer( player: Player )
{
   print( "FindMatchForPlayer for " + player.Name ) // + " " + debug.traceback() )
   if ( FLAG_RESERVED_SERVER )
   {
      FindMatchForPlayer_FLAG_RESERVED_SERVER( player )
      return
   }

   // any matches waiting for players?
   for ( let match of file.matches )
   {
      if ( match.GetGameState() > GAME_STATE.GAME_STATE_COUNTDOWN )
         continue
      if ( GetAllConnectedPlayersInMatch( match ).size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         continue

      AddPlayer( match, player )
      SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
      UpdateGame( match )
      return
   }

   print( "%%%%%% 2 Creating new match" )
   // make a new match
   let match = CreateMatch()
   AddPlayer( match, player )
   SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
   UpdateGame( match )
}

function FindMatchForPlayerPro( player: Player )
{
   print( "FindMatchForPlayer for " + player.Name ) // + " " + debug.traceback() )

   let activeMatchesThatDontHavePlayer: Array<Match> = []

   {
      let activeMatchesThatHavePlayer = file.matches.filter( function ( match )
      {
         if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
            return false
         let players = match.GetAllPlayers()
         for ( let otherPlayer of players )
         {
            if ( otherPlayer === player )
               return true
         }
         activeMatchesThatDontHavePlayer.push( match )
         return false
      } )

      /*
      for ( let match of activeMatchesThatHavePlayer )
      {
         if ( match.IsSpectator( player ) )
            continue

         file.playerToMatch.set( player, match )
         UpdateGame( match )
         return
      }

      for ( let match of activeMatchesThatHavePlayer )
      {
         file.playerToMatch.set( player, match )
         UpdateGame( match )
         return
      }
      */
   }

   {
      class ActiveMatch
      {
         activePlayerCount: number
         match: Match
         constructor( activePlayerCount: number, match: Match )
         {
            this.activePlayerCount = activePlayerCount
            this.match = match
         }
      }

      let activeMatchesWithOpenSlots: Array<ActiveMatch> = []
      for ( let match of activeMatchesThatDontHavePlayer )
      {
         let players = GetAllConnectedPlayersInMatch( match )
         if ( players.size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            continue
         activeMatchesWithOpenSlots.push( new ActiveMatch( players.size(), match ) )
      }

      function ActiveMatchSort( a: ActiveMatch, b: ActiveMatch )
      {
         return a.activePlayerCount > b.activePlayerCount
      }

      activeMatchesWithOpenSlots.sort( ActiveMatchSort )

      // any matches waiting for players?
      for ( let activeMatch of activeMatchesWithOpenSlots )
      {
         let match = activeMatch.match

         if ( match.GetGameState() > GAME_STATE.GAME_STATE_COUNTDOWN )
            continue

         print( "1Player joined " + GetMatchIndex( match ) )
         AddPlayer( match, player )
         SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
         UpdateGame( match )
         return
      }

      /*
      // any matches in progress?
      for ( let activeMatch of activeMatchesWithOpenSlots )
      {
         let match = activeMatch.match
         AddPlayer( match, player )
         SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_LATE_JOINER )
         UpdateGame( match )
         return
      }
      */
   }

   print( "%%%%%% 2 Creating new match" )
   // make a new match
   let match = CreateMatch()
   AddPlayer( match, player )
   SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
   UpdateGame( match )
}

function FindMatchForPlayer_FLAG_RESERVED_SERVER( player: Player )
{
   //if ( PlayerHasMatch( player ) )
   {
      let match = PlayerToMatch( player )
      //RemovePlayer( match, player )
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
            SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
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
      SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
      UpdateGame( match )
   }
}

function DestroyMatch( match: Match )
{
   print( "%%%%%% DestroyMatch " + GetMatchIndex( match ) + " " + debug.traceback() )
   file.matches = file.matches.filter( function ( otherMatch )
   {
      return otherMatch !== match
   } )

   if ( FLAG_RESERVED_SERVER )
   {
      // reassign players to other matches
      let userIdToPlayer = UserIDToPlayer()
      for ( let player of GetAllConnectedPlayersInMatch( match ) )
      {
         //RemovePlayer( match, player )
         if ( userIdToPlayer.has( player.UserId ) ) // still in game?
            FindMatchForPlayer( player )
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
   else
   {
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

      // put all players into new search
      let userIdToPlayer = UserIDToPlayer()
      let players = GetAllConnectedPlayersInMatch( match )
      for ( let player of players )
      {
         if ( userIdToPlayer.has( player.UserId ) )
            FindMatchForPlayer( player )
      }
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
                           players = players.concat( GetAllConnectedPlayersInMatch( match ) )
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
   let players = GetAllPlayersInMatchWithCharacters( match )
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


   let revealedImpostor = false
   for ( let player of match.GetAllPlayers() )
   {
      // tell the campers about everyone, but mask the impostors
      if ( RevealImpostors( match, player ) )
      {
         revealedImpostor = true
         break
      }
   }

   let json = HttpService.JSONEncode( match.shState )
   for ( let player of GetAllConnectedPlayersInMatch( match ) )
   {
      // tell the campers about everyone, but mask the impostors
      if ( RevealImpostors( match, player ) )
      {
         SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
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

   Assert( match.GetGameState() < GAME_STATE.GAME_STATE_PLAYING || revealedImpostor, "Didn't reveal impostor" )
}


function SetVote( match: Match, player: Player, voteUserID: number | undefined )
{
   if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
      return

   Assert( voteUserID === undefined || typeOf( voteUserID ) === 'number', "Expected voteUserID to be number or undefined, but was " + typeOf( voteUserID ) + ", " + voteUserID )
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
   if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
      print( "Complete: Stack: " + debug.traceback() )

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

export function AddMatchDestroyedCallback( func: ( match: Match ) => void )
{
   file.matchDestroyedCallbacks.push( func )
}


function PutPlayerInStartRoom( player: Player )
{
   Thread( function ()
   {
      wait() // because hey, otherwise the match tries to set the player position somewhere
      if ( player.Character === undefined )
         return
      let match = PlayerToMatch( player )
      let room = GetRoomByName( SPAWN_ROOM )
      MatchPutPlayersInRoom( match, [player], room )
   } )
}

function MatchPutPlayersInRoom( match: Match, players: Array<Player>, room: Room )
{
   PutPlayersInRoom( players, room )
   TellOtherPlayersInMatchThatPlayersPutInRoom( match, players, room )
}

function TellOtherPlayersInMatchThatPlayersPutInRoom( match: Match, players: Array<Player>, room: Room )
{
   let jsonPlayers: Array<number> = []
   for ( let player of players )
   {
      jsonPlayers.push( player.UserId )
   }
   let json = HttpService.JSONEncode( jsonPlayers )

   let tellPlayers = GetAllConnectedPlayersInMatch( match )
   for ( let tellPlayer of tellPlayers )
   {
      SV_SendRPC( "RPC_FromServer_PutPlayersInRoom", match, tellPlayer, json, room.name )
   }
}

export function SV_SendRPC( name: string, match: Match, player: Player, ...args: Array<unknown> ): void
{
   if ( PlayerToMatch( player ) !== match )
      return

   let remoteEvent = GetRPCRemoteEvent( name )
   if ( args.size() === 0 )
      remoteEvent.FireClient( player, args )
   else if ( args.size() === 1 )
      remoteEvent.FireClient( player, args[0] )
   else if ( args.size() === 2 )
      remoteEvent.FireClient( player, args[0], args[1] )
   else if ( args.size() === 3 )
      remoteEvent.FireClient( player, args[0], args[1], args[2] )
   else
      Assert( false, "Need more parameters" )
}


function AddPlayer( match: Match, player: Player ): PlayerInfo
{
   print( "AddPlayer " + player.Name + " to " + GetMatchIndex( match ) )
   //+ " " + debug.traceback() )

   {
      // on left match
      // delete your last known pickup filter
      if ( file.playerToMatch.has( player ) )
         DeleteFilterPickupsForPlayer( PlayerToMatch( player ), player )

      /*
      for ( let otherMatch of file.matches )
      {
         for ( let otherPlayer of otherMatch.GetAllPlayers() )
         {
            if ( otherPlayer === player )
               Assert( otherMatch.IsSpectator( otherPlayer ), "Tried to add player but he is a non spectator in another match " )
         }
      }
      */
   }
   //Assert( IsServer(), "IsServer()" )
   //print( "AddPlayer " + player.Name )
   //Assert( !match.shState.playerToInfo.has( player.UserId + "" ), "Match already has " + player.Name )
   let playerInfo = new PlayerInfo( player.UserId )
   match.shState.playerToInfo.set( player.UserId + "", playerInfo )

   file.playerToMatch.set( player, match )
   Assert( GetAllConnectedPlayersInMatch( match ).size() <= MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )

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

export function PlayerHasMatch( player: Player ): boolean
{
   return file.playerToMatch.has( player )
}

export function PlayerToMatch( player: Player ): Match
{
   let match = file.playerToMatch.get( player )
   if ( match !== undefined )
      return match

   for ( let match of file.matches )
   {
      for ( let matchPlayer of match.GetAllPlayers() )
      {
         if ( player !== matchPlayer )
            continue

         file.playerToMatch.set( player, match )
         return match
      }
   }

   Assert( false, "Couldn't find match for player " + player.Name )
   throw undefined
}

export function GetAllConnectedPlayersInMatch( match: Match ): Array<Player>
{
   let userIdToPlayer = UserIDToPlayer()

   return match.GetAllPlayers().filter( function ( player )
   {
      if ( !userIdToPlayer.has( player.UserId ) )
         return false
      return PlayerToMatch( player ) === match
   } )
}

function GetAllPlayersInMatchWithCharacters( match: Match ): Array<Player>
{
   let players = GetAllConnectedPlayersInMatch( match )
   return FilterHasCharacters( players )
}

export function SetPlayerKilled( match: Match, player: Player, killer?: Player )
{
   let playerInfo = match.GetPlayerInfo( player )
   playerInfo.killed = true
   BecomeSpectator( player, match )

   if ( PlayerToMatch( player ) === match )
   {
      PlayerDistributesCoins( player, match, killer )
      SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
   }
}


function SetPlayerRole( match: Match, player: Player, role: ROLE ): PlayerInfo
{
   //print( "SetPlayerRole " + player.Name + " " + role + " " + IsSpectatorRole( role ) )
   let lastRole = match.GetPlayerRole( player )

   if ( role === ROLE.ROLE_SPECTATOR_CAMPER )
      Assert( lastRole === ROLE.ROLE_CAMPER, "Bad role assignment" )
   else if ( role === ROLE.ROLE_SPECTATOR_IMPOSTOR )
      Assert( lastRole === ROLE.ROLE_IMPOSTOR, "Bad role assignment" )

   if ( IsSpectatorRole( lastRole ) )
      Assert( IsSpectatorRole( role ), "Tried to go from spectator role " + lastRole + " to role " + role )

   Assert( match.shState.playerToInfo.has( player.UserId + "" ), "SetPlayerRole: Match does not have " + player.Name )
   let playerInfo = match.shState.playerToInfo.get( player.UserId + "" ) as PlayerInfo
   playerInfo.role = role
   match.shState.playerToInfo.set( player.UserId + "", playerInfo )

   if ( PlayerToMatch( player ) === match )
   {
      ExecRoleChangeCallbacks( player, match )

      if ( match.IsSpectator( player ) )
         PlayerPickupsDisabled( player )
      else
         PlayerPickupsEnabled( player )
   }

   return playerInfo
}

function MatchStealsFromOtherWaitingMatches( match: Match )
{
   Assert( GetAllConnectedPlayersInMatch( match ).size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players to steal" )

   for ( let otherMatch of file.matches )
   {
      if ( match === otherMatch )
         continue
      if ( otherMatch.GetGameState() > GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         continue
      if ( otherMatch.GetTimeInGameState() < 10 )
         continue

      let players = GetAllConnectedPlayersInMatch( otherMatch )
      for ( let player of players )
      {
         if ( PlayerToMatch( player ) !== otherMatch )
            continue

         print( "\n\n^^^^^^^^^^^^^^^^^^^ STOLE A PLAYER ^^^^^^^^^^^^^^^^^^^" )
         AddPlayer( match, player )
         return
      }
   }
}