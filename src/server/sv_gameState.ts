import { Chat, HttpService, Players } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, IsAlive, Resume, Thread, UserIDToPlayer } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, IsMatchmaking, Match, GAMERESULTS, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, PlayerInfo } from "shared/sh_gamestate"
import { MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_MAX, SPAWN_ROOM, PLAYER_WALKSPEED, TASK_VALUE, DEV_SKIP } from "shared/sh_settings"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { SV_SendRPC } from "shared/sh_rpc"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PutPlayersInRoom, TellClientsAboutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore } from "shared/sh_score"
import { IsReservedServer } from "shared/sh_reservedServer"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"

export const PPRS_COMPLETED_NPE = "_NPE0"

class File
{
   playerToGame = new Map<Player, Match>()
   userIdToPlayer = new Map<number, Player>()
}
let file = new File()

export function SV_GameStateSetup()
{
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
         if ( !file.userIdToPlayer.has( a.SpeakerUserId ) )
            file.userIdToPlayer = UserIDToPlayer()

         let player = file.userIdToPlayer.get( a.SpeakerUserId ) as Player
         if ( IsMatchmaking( player ) )
         {
            a.ShouldDeliver = true
            return a
         }

         if ( PlayerInGame( player ) )
         {
            let match = PlayerToGame( player )
            switch ( match.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_PLAYING:
               case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
                  a.ShouldDeliver = false
                  break

               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
               case GAME_STATE.GAME_STATE_MEETING_VOTE:
               case GAME_STATE.GAME_STATE_MEETING_RESULTS:
                  a.ShouldDeliver = !match.IsSpectator( player )
                  break

               case GAME_STATE.GAME_STATE_INIT:
               case GAME_STATE.GAME_STATE_COMPLETE:
               case GAME_STATE.GAME_STATE_DEAD:
                  a.ShouldDeliver = true
                  break
            }

         }

         return a

         /*
         {
            ID = self.ChatService: InternalGetUniqueMessageId(),
               FromSpeaker = fromSpeaker,
               SpeakerDisplayName = speakerDisplayName,
               SpeakerUserId = speakerUserId,
               OriginalChannel = self.Name,
               MessageLength = string.len( message ),
               MessageType = messageType,
               IsFiltered = isFiltered,
               Message = isFiltered and message or nil,
                  --// These two get set by the new API. The comments are just here
      --// to remind readers that they will exist so it's not super
      --// confusing if they find them in the code but cannot find them
      --// here.
      --FilterResult = nil,
               --IsFilterResult = false,
                  Time = os.time(),
                  ExtraData = {},
   }
         */

      } )

   Thread( function ()
   {
      wait( 6 )
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         //KillPlayer( player )
         //let match = PlayerToGame( player )
         //ClearAssignments( match, player )
      }
   } )

   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.playerToGame.has( player ) )
      {
         let match = PlayerToGame( player )
         Assert( PlayerToGame( player ) === match, "1 PlayerToGame( player ) === match" )
         match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
      }
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( !file.playerToGame.has( player ) )
         return

      let match = PlayerToGame( player )
      if ( !match.playerToSpawnLocation.has( player ) )
         return

      let spawnPos = match.playerToSpawnLocation.get( player ) as Vector3
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
         if ( IsMatchmaking( player ) )
            return

         let match = PlayerToGame( player )
         match.UpdateGame()
      } )

   AddRPC( "RPC_FromClient_Skipvote", function ( player: Player )
   {
      let match = PlayerToGame( player )
      if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      match.SetVote( player, undefined )
   } )

   AddRPC( "RPC_FromClient_Vote", function ( player: Player, voteUserID: number )
   {
      let match = PlayerToGame( player )
      if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      match.SetVote( player, voteUserID )
   } )

   if ( !IsReservedServer() )
   {
      Thread(
         function ()
         {
            for ( ; ; )
            {
               if ( GetTotalValueOfWorldCoins() < 135 )
                  SpawnRandomCoins( 65 )

               wait( 30 )
            }
         } )
   }
}

export function PlayerToGame( player: Player ): Match
{
   Assert( file.playerToGame.has( player ), "Player not in a match" )
   return file.playerToGame.get( player ) as Match
}

export function PlayerInGame( player: Player ): boolean
{
   return file.playerToGame.has( player )
}

function GameStateChanged( match: Match, oldGameState: GAME_STATE, gameEndFunc: Function )
{
   let players = match.GetAllPlayers()
   {
      for ( let player of players )
      {
         if ( player.Character !== undefined )
         {
            Assert( PlayerToGame( player ) === match, "2 PlayerToGame( player ) === match" )
            match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
         }
      }
   }

   // leaving this match state
   //switch ( oldGameState )
   //{
   //}

   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "GameStateChanged, GAMERESULTS: " + gameResults )
         if ( gameResults !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
   }

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let livingCampers = match.GetLivingCampers().size()
         if ( match.previouslyLivingCampers === 0 || match.previouslyLivingCampers > livingCampers )
         {
            if ( !match.winOnlybyEscaping )
               SpawnRandomCoins( 60 + match.roundsPassed * 60 )

            match.previouslyLivingCampers = livingCampers
            match.roundsPassed++
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
         print( "Possessed: " + match.GetLivingPossessed().size() )
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
               case GAMERESULTS.RESULTS_POSSESSED_WIN:
                  {
                     let players = match.GetLivingCampers()
                     for ( let player of players )
                     {
                        PlayerBecomesSpectatorAndDistributesTheirScoreToLivingPlayers( player, match )
                     }
                  }
                  break

               case GAMERESULTS.RESULTS_CAMPERS_WIN:
                  {
                     let players = match.GetLivingPossessed()
                     for ( let player of players )
                     {
                        PlayerBecomesSpectatorAndDistributesTheirScoreToLivingPlayers( player, match )
                     }
                  }
                  break
            }

            DistributePointsToPlayers( match.GetLivingPlayers(), GetTotalValueOfWorldCoins() )

            for ( let player of match.GetLivingPlayers() )
            {
               ScoreToStash( player )
            }
         }


         Thread(
            function ()
            {
               wait( 4 )
               match.SetGameState( GAME_STATE.GAME_STATE_DEAD )
            } )
         break

      case GAME_STATE.GAME_STATE_DEAD:

         Thread(
            function ()
            {
               wait( 4 )
               gameEndFunc()
            } )
         break
   }
}

function ServerGameThread( match: Match, gameEndFunc: Function )
{
   match.BroadcastGamestate() // so the intro will start
   if ( !DEV_SKIP )
   {
      print( "ServerGameThread waits for intro" )
      wait( 10 ) // wait for intro
   }

   //PutPlayersInRoom( match.GetAllPlayers(), GetRoomByName( SPAWN_ROOM ) )

   let lastGameState = match.GetGameState()
   for ( ; ; )
   {
      // do on-state-changed-from/to stuff
      let gameState = match.GetGameState()
      print( "\nGAME STATE THREAD RESUMED, lastGameState " + lastGameState + ", gameState " + gameState )

      if ( gameState !== lastGameState )
      {
         GameStateChanged( match, lastGameState, gameEndFunc )
         lastGameState = gameState
      }

      GameStateThink( match )

      if ( gameState === match.GetGameState() )
      {
         // completed loop without gamestate changing, so done updating, so broadcast and yield
         match.BroadcastGamestate()

         coroutine.yield() // wait until something says update again
      }
   }
}

function GameStateThink( match: Match )
{
   let debugState = match.GetGameState()
   // quick check on whether or not match is even still going
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         if ( match.GetGameResults_NoParityAllowed() !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break

      case GAME_STATE.GAME_STATE_PLAYING:
         switch ( match.GetGameResults_ParityAllowed() )
         {
            case GAMERESULTS.RESULTS_STILL_PLAYING:
               break

            case GAMERESULTS.RESULTS_SUDDEN_DEATH:
               match.SetGameState( GAME_STATE.GAME_STATE_SUDDEN_DEATH )
               return

            default:
               match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
               return
         }
         break

      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( match.GetGameResults_ParityAllowed() !== GAMERESULTS.RESULTS_SUDDEN_DEATH )
         {
            match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break
   }

   Assert( debugState === match.GetGameState(), "Did not RETURN after SETGAMESTATE" )

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
         match.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
         return

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         {
            let remaining = match.GetTimeRemainingForState()
            if ( remaining <= 0 )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_MEETING_VOTE )
               return
            }

            Thread( function ()
            {
               wait( remaining )
               match.UpdateGame()
            } )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         {
            let remaining = match.GetTimeRemainingForState()
            let count = match.GetLivingPossessed().size() + match.GetLivingCampers().size()
            let votes = match.GetVotes()
            if ( remaining <= 0 || votes.size() >= count )
            {
               print( "SET GAME STATE GAME_STATE_MEETING_RESULTS" )
               match.SetGameState( GAME_STATE.GAME_STATE_MEETING_RESULTS )
               return
            }

            Thread( function ()
            {
               wait( remaining )
               match.UpdateGame()
            } )
         }
         break

      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         {
            let remaining = match.GetTimeRemainingForState()
            if ( remaining <= 0 )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
               return
            }

            Thread( function ()
            {
               wait( remaining )
               match.UpdateGame()
            } )
         }
         break
   }

   Assert( debugState === match.GetGameState(), "2 debugState === match.GetGameState()" )
}

function HandleVoteResults( match: Match )
{
   Thread(
      function ()
      {
         let voteResults = GetVoteResults( match.GetVotes() )

         match.corpses = [] // clear the corpses

         let room = GetRoomByName( 'Great Room' )
         PutPlayersInRoom( match.GetAllConnectedPlayers(), room )

         if ( voteResults.skipTie || voteResults.highestRecipients.size() !== 1 )
         {
            wait( 5 )
         }
         else
         {
            let highestTarget = voteResults.highestRecipients[0]
            wait( 8 ) // delay for vote matchscreen
            PlayerBecomesSpectatorAndDistributesTheirScoreToLivingPlayers( highestTarget, match )

            print( "Player " + highestTarget.Name + " was voted off" )
         }

         match.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
      } )
}

export function _CreateGame( match: Match, gameEndFunc: Function )
{
   let players = match.GetAllPlayers()
   for ( let player of players )
   {
      Assert( player.Character !== undefined, "player.Character !== undefined" )
      Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
   }

   Assert( players.size() <= MATCHMAKE_PLAYERCOUNT_MAX, "Too many players" )

   let playerNums = 0
   for ( let playerInfo of match.GetAllPlayerInfo() )
   {
      playerInfo.playernum = playerNums
      playerNums++
      file.playerToGame.set( playerInfo.player, match )
   }

   match.gameThread = coroutine.create(
      function ()
      {
         ServerGameThread( match, gameEndFunc )
      } )
   Resume( match.gameThread )
}

export function CreateGame( players: Array<Player>, gameEndFunc: Function )
{
   let possessedCount = 1
   let size = players.size()
   if ( size > 11 )
      possessedCount = 3
   else if ( size > 6 )
      possessedCount = 2

   ArrayRandomize( players )
   let possessedPlayers = players.slice( 0, possessedCount )
   let setCampers = players.slice( possessedCount, size )

   let match = new Match()
   match.startingPossessedCount = possessedCount

   for ( let player of possessedPlayers )
   {
      AddPlayer( match, player, ROLE.ROLE_POSSESSED )
   }

   for ( let player of setCampers )
   {
      AddPlayer( match, player, ROLE.ROLE_CAMPER )
      AssignTasks( player, match )
   }

   _CreateGame( match, gameEndFunc )
}

export function CreateNPE( player: Player, gameEndFunc: Function )
{
   let match = new Match()
   match.winOnlybyEscaping = true
   match.startingPossessedCount = 1 // lies
   AddPlayer( match, player, ROLE.ROLE_CAMPER )
   AssignTasks( player, match )

   _CreateGame( match, gameEndFunc )
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )

   let match = PlayerToGame( player )

   Assert( match.assignments.has( player ), "Player has no assignments" )
   let assignments = match.assignments.get( player ) as Array<Assignment>

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

            for ( let imposter of match.GetPossessed() )
            {
               ResetCooldownTime( imposter, COOLDOWN_SABOTAGE_LIGHTS )
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
         match.UpdateGame()
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

            let reward = TASK_VALUE + math.floor( ( match.roundsPassed - 1 ) * TASK_VALUE * 0.5 )
            IncrementMatchScore( player, reward )
            SV_SendRPC( "RPC_FromServer_GavePoints", player, task.volume.Position, reward )
         }
         break
   }

   function TryGainExitAssignment()
   {
      for ( let assignment of assignments )
      {
         switch ( assignment.taskName )
         {
            case TASK_RESTORE_LIGHTS:
               break

            case TASK_EXIT:
               return

            default:
               if ( assignment.status === 0 )
                  return
         }
      }

      let assignment = new Assignment( SPAWN_ROOM, TASK_EXIT )
      assignments.push( assignment )
   }
   TryGainExitAssignment()

   UpdateTasklistNetvar( player, assignments )
}

export function PlayerHasAssignments( player: Player, match: Match ): boolean
{
   let assignments = match.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "PlayerHasAssignments" )
      throw undefined
   }

   return assignments.size() > 0
}

export function ServerPlayeyHasAssignment( player: Player, match: Match, roomName: string, taskName: string ): boolean
{
   if ( !PlayerHasAssignments( player, match ) )
      return false

   let assignments = match.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      throw undefined
   }

   for ( let assignment of assignments )
   {
      if ( AssignmentIsSame( assignment, roomName, taskName ) )
         return true
   }
   return false
}

export function RemoveAssignment( player: Player, match: Match, roomName: string, taskName: string )
{
   let assignments = match.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      throw undefined
   }

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
   let assignments = match.assignments.get( player )
   if ( assignments === undefined )
      assignments = []
   assignments.push( assignment )
   UpdateTasklistNetvar( player, assignments )
}

export function PlayerHasUnfinishedAssignment( player: Player, match: Match, roomName: string, taskName: string ): boolean
{
   let assignments = match.assignments.get( player )
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


export function AssignTasks( player: Player, match: Match )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )

   //let DEV_SKIP = true // NFS!!
   for ( let roomAndTask of roomsAndTasks )
   {
      if ( match.winOnlybyEscaping && roomAndTask.task.realMatchesOnly )
         continue

      if ( DEV_SKIP && roomAndTask.room.name !== "Great Room" )
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

      if ( assignments.size() >= MAX_TASKLIST_SIZE )
         break

      if ( DEV_SKIP )
      {
         if ( assignments.size() )
            break
      }
   }

   match.assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
}

export function AssignAllTasks( player: Player, match: Match )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )

   for ( let roomAndTask of roomsAndTasks )
   {
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
   }

   match.assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
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
   match.assignments.set( player, [] )
   UpdateTasklistNetvar( player, [] )
}

function AddPlayer( match: Match, player: Player, role: ROLE ): PlayerInfo
{
   match.assignments.set( player, [] )
   UpdateTasklistNetvar( player, [] )
   file.playerToGame.set( player, match )
   return match.AddPlayer( player, role )
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

function PlayerBecomesSpectatorAndDistributesTheirScoreToLivingPlayers( player: Player, match: Match )
{
   switch ( match.GetPlayerRole( player ) )
   {
      case ROLE.ROLE_CAMPER:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_CAMPER )
         break

      case ROLE.ROLE_POSSESSED:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_IMPOSTOR )
         break
   }

   let score = GetMatchScore( player )
   if ( score > 0 )
   {
      ClearMatchScore( player )
      DistributePointsToPlayers( match.GetLivingPlayers(), score )
   }
}