import { HttpService, Players, RunService, Workspace } from "@rbxts/services"
import { AddRPC, GetRPCRemoteEvent } from "shared/sh_rpc"
import { ArrayRandomize, GraphCapped, Resume, Thread, UserIDToPlayer, Wait, GetHealth, SetHealth, FilterHasCharactersAndPrimaryPart } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, NETVAR_JSON_GAMESTATE, SetPlayerWalkspeedForGameState, USERID, PlayerVote, NS_SharedMatchState, PlayerInfo, AddRoleChangeCallback, PICKUPS, IsSpectatorRole, ExecRoleChangeCallbacks, NETVAR_MEETINGS_CALLED, NETVAR_PURCHASED_IMPOSTOR, REMOTESOUNDS, GetTaskValueForRound, COOLDOWN_NAME_KILL, } from "shared/sh_gamestate"
import { MIN_TASKLIST_SIZE, MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_STARTSERVER, SPAWN_ROOM, DEV_1_TASK, DEV_FAST_TIMERS, } from "shared/sh_settings"
import { GetNetVar_Number, ResetNetVar, SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PlayerHasCurrentRoom, PutPlayersInRoom } from "./sv_rooms"
import { DoCooldown, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { PlayerDropsCoinsWithTrajectory, SpawnRandomCoins } from "server/sv_coins"
import { CoinFloatsAway, DeleteCoin, DestroyCoinFolder, GetCoinDataFromType, GetCoinType } from "shared/sh_coins"
import { GetCoinFolder, GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore } from "shared/sh_score"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"
import { IsReservedServer } from "shared/sh_reservedServer"
import { GetPosition } from "shared/sh_utils_geometry"
import { GetPlayerSpawnLocation } from "./sv_playerSpawnLocation"
import { PlayerPickupsDisabled, PlayerPickupsEnabled, AddFilterPlayerPickupsCallback, CreatePickupType, DeleteFilterPickupsForPlayer, DeleteFilterPlayerPickupsCallback } from "shared/sh_pickups"
import { Room } from "shared/sh_rooms"
import { GetGameModeConsts, GetMinPlayersToStartGame } from "shared/sh_gameModeConsts"
import { GetPlayerPersistence_Boolean, SetPlayerPersistence } from "./sv_persistence"

export const PPRS_BUYIMPOSTOR = "_BUYIMP"
const LOCAL = RunService.IsStudio()
const POLL_RATE = 1

class File
{
   matches: Array<Match> = []
   playerToMatch = new Map<Player, Match>()
   matchDestroyedCallbacks: Array<( ( match: Match ) => void )> = []
   lastPlayerCount = new Map<Match, number>()
}

let file = new File()

export function CreateMatch(): Match
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
   /*
   if ( LOCAL && true )
   {
      Thread(
         function ()
         {
            Wait( 5 )
            let match = GetMatches()[0]
            SpawnRandomCoins( match, 300 )
         } )
   }
      */

   print( "Game name: " + game.Name )
   print( "Placeid: " + game.PlaceId )
   print( "Jobid: " + game.JobId )

   let gmc = GetGameModeConsts()
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      gmc.svFindMatchForPlayer( player )
   } )

   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddRPC( "RPC_FromClient_RequestLobby", function ( player: Player )
   {
      if ( !GetGameModeConsts().canReturnToLobby )
         return

      if ( !PlayerHasMatch( player ) )
         return

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
         if ( !PlayerHasMatch( player ) )
            return

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

      if ( match.GetGameState() >= GAME_STATE.GAME_STATE_INTRO )
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

         let players = GetAllConnectedPlayersInMatch( match )
         for ( let otherPlayer of players )
         {
            SV_SendRPC( "RPC_FromServer_PickupCoin", match, otherPlayer, player.UserId, pickup.Name, coinType )
         }
         let coinData = GetCoinDataFromType( coinType )
         IncrementMatchScore( player, coinData.value )
         DeleteCoin( pickup )
         Thread(
            function ()
            {
               CoinFloatsAway( player, pickup )
            } )
         return true
      }

}

export function GetMatchIndex( match: Match ): string
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

            SetGameState( match, nextState )
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

   let gmc = GetGameModeConsts()

   for ( ; ; )
   {
      // do on-state-changed-from/to stuff
      gameState = match.GetGameState()
      if ( gameState !== lastGameState )
      {
         print( "\nSERVER " + GetMatchIndex( match ) + " GAME STATE CHANGED FROM " + lastGameState + " TO " + gameState )
         {
            let players = GetAllConnectedPlayersInMatch( match )
            for ( let player of players )
            {
               if ( player.Character !== undefined )
                  match.Shared_OnGameStateChanged_PerPlayer( player, match )
            }
         }

         gmc.gameStateChanged( match, lastGameState )

         // leaving this match state
         if ( match.GetGameState() !== GAME_STATE.GAME_STATE_COMPLETE )
         {
            switch ( lastGameState )
            {
               case GAME_STATE.GAME_STATE_INTRO:
                  if ( gmc.canPurchaseImpostor )
                  {
                     let players = GetAllConnectedPlayersInMatch( match )
                     // clear the purchased impostor if we made it out of playing
                     for ( let player of players )
                     {
                        if ( GetPlayerPersistence_Boolean( player, PPRS_BUYIMPOSTOR, GetNetVar_Number( player, NETVAR_PURCHASED_IMPOSTOR ) === 1 ) )
                        {
                           SetPlayerPersistence( player, PPRS_BUYIMPOSTOR, false )
                           SetNetVar( player, NETVAR_PURCHASED_IMPOSTOR, 0 )
                        }
                     }
                  }
                  break
            }
         }


         // entering this match state
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
            case GAME_STATE.GAME_STATE_PLAYING:
               for ( let player of match.GetLivingPlayers() )
               {
                  if ( GetHealth( player ) > 0 )
                     SetHealth( player, 100 )
               }

               let cooldown = 20
               if ( match.shState.roundNum > 1 )
                  cooldown += 6
               if ( DEV_FAST_TIMERS )
                  cooldown = 3

               let players = match.GetLivingImpostors()
               for ( let player of players )
               {
                  DoCooldown( player, COOLDOWN_NAME_KILL, cooldown )
               }

               break
         }

      }
      lastGameState = gameState

      gmc.gameStateThink( match )
      GameStateThink( match )

      if ( gameState === match.GetGameState() )
      {
         BroadcastGamestate( match )

         if ( gameState === GAME_STATE.GAME_STATE_COMPLETE )
            return

         PostStateWait()
      }
   }
}


function GameStateThink( match: Match )
{
   let debugState = match.GetGameState()

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
         for ( let player of match.GetLivingPlayers() )
         {
            if ( player.Character !== undefined )
               SetHealth( player, 100 )
         }

         if ( Workspace.DistributedGameTime > match.GetSVState().timeNextWaitingCoins )
         {
            match.GetSVState().timeNextWaitingCoins = Workspace.DistributedGameTime + 60
            if ( GetTotalValueOfWorldCoins( match ) < 120 )
               SpawnRandomCoins( match, 60 )
         }

         //if ( SendPlayersToLiveMatch( match ) )
         //   return

         // failsafe for multiple matches waiting for players
         if ( match.GetTimeInGameState() > 10 )
         {
            for ( ; ; )
            {
               let searchCount = GetAllConnectedPlayersInMatch( match ).size()
               if ( searchCount >= GetMinPlayersToStartGame() )
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
            print( "Match " + GetMatchIndex( match ) + " found " + searchCount + " players, need " + GetMinPlayersToStartGame() )
            file.lastPlayerCount.set( match, searchCount )
         }

         //print( "searchCount:" + searchCount + ", GetMinPlayersToStartGame():" + GetMinPlayersToStartGame() )
         if ( searchCount >= GetMinPlayersToStartGame() )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COUNTDOWN )
            UpdateGame( match )
            return
         }

         return

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         {
            if ( GetAllConnectedPlayersInMatch( match ).size() < GetGameModeConsts().minPlayersToStartGame )
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

export function HandleVoteResults( match: Match )
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
            let votedOff = voteResults.highestRecipients[0]
            match.shState.highestVotedScore = GetMatchScore( votedOff )
            BecomeSpectator( votedOff, match )
            Wait( 5 )
            PlayerDistributesCoinsToOtherPlayers( match, votedOff )
            SetPlayerKilled( match, votedOff )
         }

         if ( match.GetGameState() !== GAME_STATE.GAME_STATE_COMPLETE )
            SetGameState( match, GAME_STATE.GAME_STATE_PLAYING )
      } )
}

export function BecomeSpectator( player: Player, match: Match )
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
         if ( GetGameModeConsts().spectatorDeathRun )
         {
            SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
            AssignTasks( match, player )
         }
         else
         {
            SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
         }

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

            let reward = GetTaskValueForRound( match.shState.roundNum )
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
      if ( match.GetGameState() >= GAME_STATE.GAME_STATE_PLAYING )
      {
         GiveExitTask( match, player )

         if ( GetGameModeConsts().completeTasksBecomeImpostor )
         {
            if ( !match.IsSpectator( player ) )
            {
               SetPlayerRole( match, player, ROLE.ROLE_IMPOSTOR )
               UpdateGame( match )
            }
         }
      }
      else
      {
         AssignTasks( match, player ) // 7-10 random tasks
      }
   }
}

export function GiveExitTask( match: Match, player: Player )
{
   if ( !match.GetSVState().assignments.has( player ) )
      return

   // has assignment?
   let assignments = match.GetSVState().assignments.get( player ) as Array<Assignment>
   for ( let assignment of assignments )
   {
      if ( AssignmentIsSame( assignment, SPAWN_ROOM, TASK_EXIT ) )
         return
   }

   let assignment = new Assignment( SPAWN_ROOM, TASK_EXIT )
   assignments.push( assignment )
   UpdateTasklistNetvar( player, assignments )
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


export function AssignTasks( match: Match, player: Player )
{
   let assignments: Array<Assignment> = []

   let gameModeData = GetGameModeConsts()
   let playerCount = GetAllConnectedPlayersInMatch( match ).size()
   let TASK_COUNT = math.floor(
      GraphCapped( playerCount,
         gameModeData.minPlayersToStartGame, 10,
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

export function DistributePointsToPlayers( match: Match, players: Array<Player>, score: number )
{
   let scorePerPlayer = math.floor( score / players.size() )
   if ( scorePerPlayer < 1 )
      scorePerPlayer = 1

   for ( let player of players )
   {
      IncrementMatchScore( player, scorePerPlayer )
   }

   if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
   {
      for ( let player of players )
      {
         ScoreToStash( player )
      }
   }
}

export function PlayerDistributesCoins( player: Player, match: Match, killer?: Player )
{
   Assert( PlayerToMatch( player ) === match, "Player is not in this match" )

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
      case GAME_STATE.GAME_STATE_COMPLETE:
         PlayerDistributesCoinsToOtherPlayers( match, player )
         return

      default:
         if ( killer === undefined )
            killer = player
         PlayerDropsCoinsWithTrajectory( match, player, GetPosition( killer ) )
         return
   }
}

export function PlayerDistributesCoinsToOtherPlayers( match: Match, player: Player )
{
   let score = GetMatchScore( player )
   if ( score <= 0 )
      return

   ClearMatchScore( player )
   let players = match.GetLivingPlayers().filter( function ( otherPlayer )
   {
      return otherPlayer !== player
   } )

   DistributePointsToPlayers( match, players, score )
}


export function DestroyMatch( match: Match )
{
   print( "%%%%%% DestroyMatch " + GetMatchIndex( match ) + " " + debug.traceback() )
   file.matches = file.matches.filter( function ( otherMatch )
   {
      return otherMatch !== match
   } )

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

   let gmc = GetGameModeConsts()
   // put all players into new search
   let userIdToPlayer = UserIDToPlayer()
   let players = GetAllConnectedPlayersInMatch( match )
   for ( let player of players )
   {
      if ( userIdToPlayer.has( player.UserId ) )
         gmc.svFindMatchForPlayer( player )
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
   if ( state === GAME_STATE.GAME_STATE_MEETING_DISCUSS )
      state = GAME_STATE.GAME_STATE_MEETING_VOTE
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

export function MatchPutPlayersInRoom( match: Match, players: Array<Player>, room: Room )
{
   PutPlayersInRoom( players, room )
   TellOtherPlayersInMatchThatPlayersPutInRoom( match, players, room )
}

export function TellOtherPlayersInMatchThatPlayersPutInRoom( match: Match, players: Array<Player>, room: Room )
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


export function AddPlayer( match: Match, player: Player ): PlayerInfo
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
   //Assert( GetAllConnectedPlayersInMatch( match ).size() <= MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )

   let character = player.Character
   if ( character !== undefined )
      match.Shared_OnGameStateChanged_PerPlayer( player, match )

   let folder = GetCoinFolder( match )
   AddFilterPlayerPickupsCallback( match, player,
      function ( part: Part ): boolean
      {
         return part.Parent === folder
      } )

   //if ( PlayerHasCurrentRoom( player ) )
   //   TellOtherPlayersInMatchThatPlayersPutInRoom( match, [player], GetCurrentRoom( player ) )

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

export function GetAllPlayersInMatchWithCharacters( match: Match ): Array<Player>
{
   let players = GetAllConnectedPlayersInMatch( match )
   return FilterHasCharactersAndPrimaryPart( players )
}

export function SetPlayerKilled( match: Match, player: Player, killer?: Player )
{
   if ( PlayerToMatch( player ) !== match )
      return

   let playerInfo = match.GetPlayerInfo( player )
   playerInfo.killed = true
   BecomeSpectator( player, match )
   PlayerDistributesCoins( player, match, killer )
   SV_SendRPC( "RPC_FromServer_CancelTask", match, player )

   if ( GetGameModeConsts().spectatorDeathRun )
      GiveExitTask( match, player )
}


export function SetPlayerRole( match: Match, player: Player, role: ROLE ): PlayerInfo
{
   //print( "SetPlayerRole " + player.Name + " " + role + " " + IsSpectatorRole( role ) )
   let lastRole = match.GetPlayerRole( player )

   if ( role === ROLE.ROLE_SPECTATOR_CAMPER )
      Assert( lastRole === ROLE.ROLE_CAMPER, "Bad role assignment" )
   else if ( role === ROLE.ROLE_SPECTATOR_IMPOSTOR )
      Assert( lastRole === ROLE.ROLE_IMPOSTOR, "Bad role assignment" )

   if ( !GetGameModeConsts().spectatorDeathRun )
   {
      if ( IsSpectatorRole( lastRole ) )
         Assert( IsSpectatorRole( role ), "Tried to go from spectator role " + lastRole + " to role " + role )
   }

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
   //Assert( GetAllConnectedPlayersInMatch( match ).size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players to steal" )

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

export function GetMatches(): Array<Match>
{
   return file.matches
}


export function StartMatchWithNormalImpostorsAndCampers( match: Match )
{
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
      ResetNetVar( player, NETVAR_JSON_ASSIGNMENTS )
      ResetNetVar( player, NETVAR_MEETINGS_CALLED )
      //ResetNetVar( player, NETVAR_SCORE ) // keep prematch coins collected
   }

   let impostorCount = 1
   let size = players.size()
   if ( size > 12 )
      impostorCount = 3
   else if ( size > 6 )
      impostorCount = 2


   ArrayRandomize( players )

   let impostors = players.slice( 0, impostorCount )
   let campers = players.slice( impostorCount, size )

   if ( GetGameModeConsts().canPurchaseImpostor )
   {
      campers = campers.filter( function ( player )
      {
         let impostor = GetPlayerPersistence_Boolean( player, PPRS_BUYIMPOSTOR, GetNetVar_Number( player, NETVAR_PURCHASED_IMPOSTOR ) === 1 )

         if ( impostor )
         {
            impostors.push( player )
            return false
         }

         return true
      } )
   }

   match.shState.startingImpostorCount = impostors.size()

   for ( let player of impostors )
   {
      SetPlayerRole( match, player, ROLE.ROLE_IMPOSTOR )
      ClearAssignments( match, player )
   }

   for ( let player of campers )
   {
      SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
      AssignTasks( match, player )
   }

   /*
   for ( let player of players )
   {
      Assert( player.Character !== undefined, "player.Character !== undefined" )
      Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
   }
   */

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
}

export function BroadcastSound( match: Match, id: number, roomName1: string, roomName2?: string )
{
   Assert( id >= 0 && id < REMOTESOUNDS.REMOTESOUND_SIZE, "Unknown remote sound " + id )

   let players = GetAllConnectedPlayersInMatch( match )

   let roomNames = new Map<string, boolean>()
   roomNames.set( roomName1, true )
   if ( roomName2 !== undefined )
      roomNames.set( roomName2, true )

   for ( let player of players )
   {
      let currentRoomName = GetCurrentRoom( player ).name
      if ( roomNames.has( currentRoomName ) )
         SV_SendRPC( "RPC_FromServer_PlaySound", match, player, id )
   }
}

function SendPlayersToLiveMatch( match: Match ): boolean
{
   for ( let otherMatch of file.matches )
   {
      if ( match === otherMatch )
         continue
      if ( otherMatch.shState.roundNum > 1 )
         continue
      if ( otherMatch.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
         continue

      let players = GetAllConnectedPlayersInMatch( match )
      if ( players.size() + otherMatch.GetAllPlayers().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         continue

      let playersInMatch = new Map<number, Player>()
      for ( let player of otherMatch.GetAllPlayers() )
      {
         playersInMatch.set( player.UserId, player )
      }

      for ( let player of players )
      {
         let role = ROLE.ROLE_CAMPER
         if ( playersInMatch.has( player.UserId ) )
         {
            // killed off
            if ( otherMatch.GetPlayerInfo( player ).killed )
               continue

            if ( otherMatch.IsImpostor( player ) )
               role = ROLE.ROLE_IMPOSTOR
         }

         AddPlayer( otherMatch, player )

         if ( GetPlayerPersistence_Boolean( player, PPRS_BUYIMPOSTOR, GetNetVar_Number( player, NETVAR_PURCHASED_IMPOSTOR ) === 1 ) )     
         {
            role = ROLE.ROLE_IMPOSTOR
            SetPlayerPersistence( player, PPRS_BUYIMPOSTOR, false )
            SetNetVar( player, NETVAR_PURCHASED_IMPOSTOR, 0 )
         }

         SetPlayerRole( otherMatch, player, role )
         SetPlayerRole( match, player, ROLE.ROLE_SPECTATOR_CAMPER )

         if ( role === ROLE.ROLE_CAMPER )
            AssignTasks( otherMatch, player )
      }

      MatchPutPlayersInRoom( otherMatch, players, GetRoomByName( SPAWN_ROOM ) )

      UpdateGame( match )
      UpdateGame( otherMatch )

      return true
   }

   return false
}

