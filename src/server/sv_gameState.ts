import { Chat, HttpService, Players, RunService, TeleportService } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayFind, ArrayRandomize, IsAlive, Resume, Thread, UserIDToPlayer } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GAMERESULTS, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, NETVAR_JSON_GAMESTATE, NETVAR_MEETINGS_CALLED } from "shared/sh_gamestate"
import { MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_STARTSERVER, SPAWN_ROOM, PLAYER_WALKSPEED, TASK_VALUE, MATCHMAKE_PLAYERCOUNT_FALLBACK, DEV_1_TASK, ADMINS } from "shared/sh_settings"
import { ResetNetVar, SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { SV_SendRPC } from "shared/sh_rpc"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PlayerHasCurrentRoom, PutPlayerInStartRoom, PutPlayersInRoom, TellClientsAboutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore, NETVAR_SCORE, PPRS_PREMATCH_COINS } from "shared/sh_score"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"
import { GetPlayerPersistence_Number, SetPlayerPersistence } from "./sv_persistence"
import { IsReservedServer } from "shared/sh_reservedServer"

const LOCAL = RunService.IsStudio()

class File
{
   match = new Match()
   userIdToPlayer = new Map<number, Player>()
}
let file = new File()

export function SV_GameStateSetup()
{
   print( "IsReservedServer(): " + IsReservedServer() )

   let match = file.match
   match.gameThread = coroutine.create(
      function ()
      {
         ServerGameThread( match )
      } )
   Resume( match.gameThread )

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
         a.ShouldDeliver = true

         let match = file.match
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
               a.ShouldDeliver = true
               break
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

   AddRPC( "RPC_FromClient_AdminClick", function ( player: Player )
   {
      if ( ArrayFind( ADMINS, player.Name ) === undefined )
         return

      //IncrementServerVersion()
      for ( let player of Players.GetPlayers() )
      {
         player.Kick( "Admin kick" )
      }
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

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      Thread(
         function ()
         {
            wait() // wait for player DS to be setup
            let coins = GetPlayerPersistence_Number( player, PPRS_PREMATCH_COINS, 0 )
            print( "PPRS_PREMATCH_COINS " + coins )
            SetNetVar( player, NETVAR_SCORE, coins )
         } )
   } )

   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddRPC( "RPC_FromClient_RequestLobby", function ( player: Player )
   {
      TeleportPlayersToLobby( [player], "Finding a new match" )
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      file.match.AddPlayer( player )
      if ( file.match.GetGameState() >= GAME_STATE.GAME_STATE_PLAYING )
      {
         file.match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_LATE_JOINER )
      }
      file.match.UpdateGame()
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( !PlayerHasCurrentRoom( player ) )
         PutPlayerInStartRoom( player )

      let match = file.match
      match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )

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
         file.match.RemovePlayer( player )
         file.match.UpdateGame()
      } )

   AddRPC( "RPC_FromClient_Skipvote", function ( player: Player )
   {
      if ( file.match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      file.match.SetVote( player, undefined )
   } )

   AddRPC( "RPC_FromClient_Vote", function ( player: Player, voteUserID: number )
   {
      if ( file.match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      file.match.SetVote( player, voteUserID )
   } )


   Thread(
      function ()
      {
         for ( ; ; )
         {
            if ( file.match.GetGameState() === GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
            {
               if ( GetTotalValueOfWorldCoins() < 135 )
                  SpawnRandomCoins( 65 )
            }

            wait( 30 )
         }
      } )

}

function GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   {
      let players = match.GetAllPlayers()
      for ( let player of players )
      {
         if ( player.Character !== undefined )
            match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
      }
   }

   print( "Entering GameState " + match.GetGameState() )
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

   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         if ( !IsReservedServer() )
            match.SetGameState( GAME_STATE.GAME_STATE_INTRO )
         return

      case GAME_STATE.GAME_STATE_INTRO:
         print( "GAME_STATE.GAME_STATE_INTRO" )
         if ( !IsReservedServer() && !LOCAL )
         {
            let players = match.GetAllConnectedPlayers()
            if ( players.size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
               return
            }

            for ( let player of players )
            {
               let score = GetMatchScore( player )
               print( "Setting PPRS_PREMATCH_COINS " + score )
               SetPlayerPersistence( player, PPRS_PREMATCH_COINS, score )
            }
            Thread(
               function ()
               {
                  print( "Starting reserved server" )
                  let code = TeleportService.ReserveServer( game.PlaceId )
                  TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none" )
               } )

            wait( 3 ) // give players a chance to clear out
            match.SetGameState( GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
            return
         }

         print( "Starting intro" )
         let players = match.GetAllConnectedPlayers()
         Assert( players.size() <= MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )
         if ( players.size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
         {
            TeleportPlayersToLobby( players, "Need more players" )
            return
         }

         for ( let player of players )
         {
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

         match.startingImpostorCount = impostorCount

         for ( let player of impostorPlayers )
         {
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

         break


      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let livingCampers = match.GetLivingCampers().size()
         if ( match.previouslyLivingCampers === 0 || match.previouslyLivingCampers > livingCampers )
         {
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
                        PlayerBecomesSpectatorAndDistributesTheirScoreToLivingPlayers( player, match )
                     }
                  }
                  break

               case GAMERESULTS.RESULTS_CAMPERS_WIN:
                  {
                     let players = match.GetLivingImpostors()
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
               if ( IsReservedServer() )
               {
                  TeleportPlayersToLobby( Players.GetPlayers(), "Find a new match" )
                  return
               }

               match.SetGameState( GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )

            } )
         break
   }
}

function ServerGameThread( match: Match )
{
   //PutPlayersInRoom( match.GetAllPlayers(), GetRoomByName( SPAWN_ROOM ) )

   let lastGameState = match.GetGameState()
   for ( ; ; )
   {
      // do on-state-changed-from/to stuff
      let gameState = match.GetGameState()
      if ( gameState !== lastGameState )
      {
         print( "\nSERVER GAME STATE CHANGED FROM " + lastGameState + " TO " + gameState )
         GameStateChanged( match, lastGameState )
         lastGameState = gameState
      }

      GameStateThink( match )
      ThreadUpdateForTimedGameStates( match )

      if ( gameState === match.GetGameState() )
      {
         // completed loop without gamestate changing, so done updating, so broadcast and yield
         match.BroadcastGamestate()

         coroutine.yield() // wait until something says update again
      }
   }
}

function ThreadUpdateForTimedGameStates( match: Match )
{
   let delay: number | undefined
   if ( match.GameStateHasTimeLimit() )
   {
      delay = match.GetTimeRemainingForState()
      if ( delay <= 0 )
      {
         match.SetGameState( match.GetGameState() + 1 )
         return
      }
   }

   if ( match.PollingGameState() )
   {
      if ( delay === undefined )
         delay = 1
      else
         delay = math.max( delay, 1 )
   }

   if ( delay === undefined )
      return

   Thread( function ()
   {
      wait( delay )
      match.UpdateGame()
   } )
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

   Assert( debugState === match.GetGameState(), "1 Did not RETURN after SETGAMESTATE" )

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
         if ( IsReservedServer() )
            match.SetGameState( GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING )
         else
            match.SetGameState( GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         return

      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:

         if ( match.GetAllConnectedPlayers().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            if ( IsReservedServer() )
               match.SetGameState( GAME_STATE.GAME_STATE_INTRO )
            else
               match.SetGameState( GAME_STATE.GAME_STATE_COUNTDOWN )
            return
         }
         break

      case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         if ( match.GetAllConnectedPlayers().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            match.SetGameState( GAME_STATE.GAME_STATE_INTRO )
            return
         }
         return

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         {
            if ( match.GetAllConnectedPlayers().size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
               return
            }
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         {
            let count = match.GetLivingImpostors().size() + match.GetLivingCampers().size()
            let votes = match.GetVotes()
            if ( votes.size() >= count )
            {
               print( "SET GAME STATE GAME_STATE_MEETING_RESULTS" )
               match.SetGameState( GAME_STATE.GAME_STATE_MEETING_RESULTS )
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

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )

   let match = file.match

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

            for ( let imposter of match.GetImpostors() )
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

   for ( let roomAndTask of roomsAndTasks )
   {
      if ( DEV_1_TASK && roomAndTask.room.name !== "Great Room" )
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

      if ( DEV_1_TASK )
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

      case ROLE.ROLE_IMPOSTOR:
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

export function GetMatch(): Match
{
   return file.match
}

function TeleportPlayersToLobby( players: Array<Player>, msg: string )
{
   print( "Teleport " + players.size() + " players to lobby" )

   Thread( function ()
   {
      TeleportService.TeleportPartyAsync( game.PlaceId, players )
      wait( 10 )
      // failsafe
      for ( let player of players )
      {
         player.Kick( msg )
      }
   } )
}

