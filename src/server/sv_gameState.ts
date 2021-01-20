import { Chat, HttpService, Players, RunService, TeleportService, Workspace } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayFind, ArrayRandomize, IsAlive, Resume, Thread, UserIDToPlayer, Wait } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { Assignment, GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GAMERESULTS, GetVoteResults, TASK_EXIT, AssignmentIsSame, TASK_RESTORE_LIGHTS, NETVAR_JSON_GAMESTATE, NETVAR_MEETINGS_CALLED } from "shared/sh_gamestate"
import { MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT_STARTSERVER, SPAWN_ROOM, PLAYER_WALKSPEED, TASK_VALUE, MATCHMAKE_PLAYERCOUNT_FALLBACK, DEV_1_TASK, ADMINS } from "shared/sh_settings"
import { ResetNetVar, SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { SV_SendRPC } from "shared/sh_rpc"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PlayerHasCurrentRoom, PutPlayerInStartRoom, PutPlayersInRoom, TellClientsAboutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes, ResetCooldownTime } from "shared/sh_cooldown"
import { COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content"
import { PlayerDropsCoinsWithTrajectory, SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { GetMatchScore, NETVAR_SCORE, PPRS_PREMATCH_COINS } from "shared/sh_score"
import { ClearMatchScore, IncrementMatchScore, ScoreToStash } from "./sv_score"
import { GetPlayerPersistence_Number, SetPlayerPersistence } from "./sv_persistence"
import { ServerAttemptToFindReadyPlayersOfPlayerCount } from "./sv_matchmaking"
import { IsReservedServer } from "shared/sh_reservedServer"
import { GetPosition } from "shared/sh_utils_geometry"

const LOCAL = RunService.IsStudio()

class File
{
   matches: Array<Match> = []
   userIdToPlayer = new Map<number, Player>()
}

let file = new File()

function CreateMatch(): Match
{
   let match = new Match()
   file.matches.push( match )
   match.gameThread = coroutine.create(
      function ()
      {
         ServerGameThread( match )
      } )
   Resume( match.gameThread )
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

   Assert( false, "Couldn't find match for player" )
   throw undefined
}

export function SV_GameStateSetup()
{
   print( "IsReservedServer(): " + IsReservedServer() )

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

         let match = PlayerToMatch( player )
         switch ( match.GetGameState() )
         {
            case GAME_STATE.GAME_STATE_PLAYING:
            case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
               a.ShouldDeliver = match.IsSpectator( player )
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

      Thread(
         function ()
         {
            wait() // Wait for player DS to be setup
            let coins = GetPlayerPersistence_Number( player, PPRS_PREMATCH_COINS, 0 )
            SetNetVar( player, NETVAR_SCORE, coins )
         } )
   } )

   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddRPC( "RPC_FromClient_RequestLobby", function ( player: Player )
   {
      TeleportPlayersToLobby( [player], "Finding a new match" )
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( !PlayerHasCurrentRoom( player ) )
         PutPlayerInStartRoom( player )

      let match = PlayerToMatch( player )
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
         let match = PlayerToMatch( player )
         if ( !match.IsSpectator( player ) )
            PlayerBecomesSpectatorAndDistributesCoins( player, match )

         // don't remove quitters from real games because their info is still valid and needed
         if ( !match.GetRealMatch() )
            match.RemovePlayer( player )

         match.UpdateGame()
      } )

   AddRPC( "RPC_FromClient_Skipvote", function ( player: Player )
   {
      let match = PlayerToMatch( player )
      if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      match.SetVote( player, undefined )
   } )

   AddRPC( "RPC_FromClient_Vote", function ( player: Player, voteUserID: number )
   {
      let match = PlayerToMatch( player )
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
               if ( GetTotalValueOfWorldCoins() < 120 )
               {
                  SpawnRandomCoins( 60 )
               }

               Wait( 60 )
            }
         } )
   }

}

function SV_GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   {
      let players = match.GetAllPlayers()
      for ( let player of players )
      {
         if ( player.Character !== undefined )
            match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
      }
   }

   // leaving this match state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INIT:
         break
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

      case GAME_STATE.GAME_STATE_COUNTDOWN:

         for ( let player of match.GetAllPlayers() )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", player )
         }

         break

      case GAME_STATE.GAME_STATE_INTRO:
         print( "GAME_STATE.GAME_STATE_INTRO" )
         if ( !IsReservedServer() && !LOCAL )
         {
            let players = match.GetAllPlayersWithCharacters()
            if ( players.size() < MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            {
               DestroyMatch( match )
               return
            }

            for ( let player of players )
            {
               let score = GetMatchScore( player )
               SetPlayerPersistence( player, PPRS_PREMATCH_COINS, score )
            }
            Thread(
               function ()
               {
                  print( "Starting reserved server" )
                  //players = players.filter( function ( player )
                  //{
                  //   return player.Name === "Argonomic"
                  //} )
                  let code = TeleportService.ReserveServer( game.PlaceId )
                  TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none" )
               } )

            Wait( 30 )

            DestroyMatch( match )
            return
         }

         let players = match.GetAllPlayersWithCharacters()
         Assert( players.size() <= MATCHMAKE_PLAYERCOUNT_STARTSERVER, "Too many players" )
         if ( players.size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
         {
            print( "Not enough players, return to lobby" )
            TeleportPlayersToLobby( players, "Need more players" )
            return
         }

         print( "Starting intro" )

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

            DistributePointsToPlayers( match.GetLivingPlayers(), GetTotalValueOfWorldCoins() )

            for ( let player of match.GetLivingPlayers() )
            {
               ScoreToStash( player )
            }
         }

         Thread(
            function ()
            {
               Wait( 7 ) // watch ending
               if ( IsReservedServer() )
               {
                  TeleportPlayersToLobby( Players.GetPlayers(), "Teleport to new match failed, reconnect." )
                  return
               }
            } )
         break
   }
}

function GetMatchIndex( match: Match ): number
{
   for ( let i = 0; i < file.matches.size(); i++ )
   {
      if ( file.matches[i] === match )
         return i
   }
   return -1
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
            match.SetGameState( match.GetGameState() + 1 )
            return
         }
      }

      if ( match.PollingGameState() )
      {
         if ( delay === undefined )
            delay = 1
         else
            delay = math.min( delay, 1 )
      }

      lastTracker = match.updateTracker
      if ( delay !== undefined )
      {
         let endTime = Workspace.DistributedGameTime + delay
         for ( ; ; )
         {
            if ( Workspace.DistributedGameTime >= endTime )
               break
            if ( match.updateTracker !== lastTracker )
               break
            wait()
         }
      }
      else
      {
         for ( ; ; )
         {
            if ( match.updateTracker !== lastTracker )
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
      if ( lastTracker !== match.updateTracker )
         return true
      if ( IsReservedServer() )
         return true
      if ( lastBroadcastGameState !== gameState )
         return true
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
            match.BroadcastGamestate()
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

         //print( "Found " + match.GetAllPlayersWithCharacters().size() + " players, need " + MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         if ( match.GetAllPlayersWithCharacters().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            if ( IsReservedServer() )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_INTRO )
               return
            }

            let matchedPlayers = ServerAttemptToFindReadyPlayersOfPlayerCount( match.GetAllPlayersWithCharacters(), MATCHMAKE_PLAYERCOUNT_STARTSERVER )
            if ( matchedPlayers === undefined )
               return

            print( "Found enough players for match" )
            if ( LOCAL )
            {
               match.SetGameState( GAME_STATE.GAME_STATE_COUNTDOWN )
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
                  match.RemovePlayer( player )
                  newMatch.AddPlayer( player )
               }

               newMatch.SetGameState( GAME_STATE.GAME_STATE_COUNTDOWN )
               match.UpdateGame()
            }
            return
         }
         break

      case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         //print( "match.GetAllPlayersWithCharacters().size(): " + match.GetAllPlayersWithCharacters().size() )
         if ( match.GetAllPlayersWithCharacters().size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         {
            match.SetGameState( GAME_STATE.GAME_STATE_INTRO )
            return
         }
         return

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         {
            if ( match.GetAllPlayersWithCharacters().size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
            {
               DestroyMatch( match )
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
         PutPlayersInRoom( match.GetAllPlayersWithCharacters(), room )

         if ( voteResults.skipTie || voteResults.highestRecipients.size() !== 1 )
         {
            Wait( 5 )
         }
         else
         {
            let highestTarget = voteResults.highestRecipients[0]
            Wait( 8 ) // delay for vote matchscreen
            PlayerBecomesSpectatorAndDistributesCoins( highestTarget, match )

            print( "Player " + highestTarget.Name + " was voted off" )
         }

         match.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
      } )
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )

   let match = PlayerToMatch( player )

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
      if ( roomAndTask.task.realMatchesOnly && !match.GetRealMatch() )
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

function PlayerBecomesSpectatorAndDistributesCoins( player: Player, match: Match )
{
   print( "PlayerBecomesSpectatorAndDistributesCoins" )
   switch ( match.GetPlayerRole( player ) )
   {
      case ROLE.ROLE_CAMPER:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_CAMPER )
         break

      case ROLE.ROLE_IMPOSTOR:
         match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_IMPOSTOR )
         break
   }

   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         PlayerDropsCoinsWithTrajectory( player, GetPosition( player ) )
         return
   }

   let score = GetMatchScore( player )
   if ( score > 0 )
   {
      ClearMatchScore( player )
      DistributePointsToPlayers( match.GetLivingPlayers(), score )
   }
}


function TeleportPlayersToLobby( players: Array<Player>, msg: string )
{
   print( "Teleport " + players.size() + " players to lobby" )

   Thread( function ()
   {
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
   if ( PlayerHasMatch( player ) )
   {
      let match = PlayerToMatch( player )
      match.RemovePlayer( player )
      match.UpdateGame()
   }

   let addedPlayer = false
   if ( IsReservedServer() )
   {
      for ( let match of file.matches )
      {
         let matchState = match.GetGameState()
         match.AddPlayer( player )
         if ( matchState >= GAME_STATE.GAME_STATE_PLAYING )
         {
            print( "LATE JOINER " + player.Name + " at " + Workspace.DistributedGameTime )
            match.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_LATE_JOINER )
         }

         addedPlayer = true
         match.UpdateGame()
         break
      }
   }
   else
   {
      for ( let match of file.matches )
      {
         if ( match.GetGameState() <= GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         {
            match.AddPlayer( player )
            match.UpdateGame()
            addedPlayer = true
            break
         }
      }
   }

   if ( !addedPlayer )
   {
      // make a new match
      let match = CreateMatch()
      match.AddPlayer( player )
      match.UpdateGame()
   }

   if ( !IsReservedServer() )
   {
      let match = PlayerToMatch( player )
      AssignAllTasks( player, match )
      match.SetPlayerRole( player, ROLE.ROLE_CAMPER )
      match.UpdateGame()
   }
}

function DestroyMatch( match: Match )
{
   print( "DestroyMatch " + GetMatchIndex( match ) )
   for ( let i = 0; i < file.matches.size(); i++ )
   {
      if ( file.matches[i] === match )
      {
         //print( "REMOVED " + i )
         file.matches.remove( i )
         i--
      }
   }

   //print( "Remaining matches " + file.matches.size() )

   // reassign players to other matches
   let userIdToPlayer = UserIDToPlayer()
   for ( let player of match.GetAllPlayers() )
   {
      match.RemovePlayer( player )
      if ( userIdToPlayer.has( player.UserId ) ) // still in game?
         FindMatchForPlayer( player )
   }

   match.SetGameState( GAME_STATE.GAME_STATE_COMPLETE )
}