import { Chat, HttpService, Players, ServerStorage } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, Assert, IsAlive, Resume, Thread, UserIDToPlayer } from "shared/sh_utils"
import { Assignment, GAME_STATE, SharedGameStateInit, NETVAR_JSON_TASKLIST, ROLE, IsPracticing, Game, GAMERESULTS, GetVoteResults, TASK_EXIT } from "shared/sh_gamestate"
import { MAX_TASKLIST_SIZE, MATCHMAKE_PLAYERCOUNT, MATCHMAKE_PLAYERCOUNT_FALLBACK, SPAWN_ROOM, PLAYER_WALKSPEED } from "shared/sh_settings"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { SendRPC } from "./sv_utils"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, PutPlayerCameraInRoom, PutPlayersInRoom } from "./sv_rooms"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"

class File
{
   playerToGame = new Map<Player, Game>()
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
         let game = PlayerToGame( player )
         if ( game.IsSpectator( player ) )
            a.ShouldDeliver = false

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
         //let game = PlayerToGame( player )
         //ClearAssignments( game, player )
      }
   } )

   SharedGameStateInit()
   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.playerToGame.has( player ) )
      {
         let game = PlayerToGame( player )
         Assert( PlayerToGame( player ) === game, "1 PlayerToGame( player ) === game" )
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

function GameStateChanged( game: Game, oldGameState: GAME_STATE, gameEndFunc: Function )
{
   let players = game.GetAllPlayers()
   {
      for ( let player of players )
      {
         if ( player.Character !== undefined )
         {
            Assert( PlayerToGame( player ) === game, "2 PlayerToGame( player ) === game" )
            game.Shared_OnGameStateChanged_PerPlayer( player, game.GetGameState() )
         }
      }
   }

   // leaving this game state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_PREMATCH:
         Thread( function ()
         {
            wait( 10 ) // wait for the intro
            for ( let player of game.GetAllPlayers() )
            {
               ResetAllCooldownTimes( player )
            }
         } )

         break

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         game.ClearVotes()
         break

      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         {
            let voteResults = GetVoteResults( game.GetVotes() )

            game.corpses = [] // clear the corpses

            let room = GetRoomByName( 'Great Room' )
            PutPlayersInRoom( game.GetAllConnectedPlayers(), room )

            game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )

            if ( !voteResults.skipTie && voteResults.highestRecipients.size() === 1 )
            {
               Thread(
                  function ()
                  {
                     wait( 8 ) // delay for vote matchscreen
                     let highestTarget = voteResults.highestRecipients[0]
                     switch ( game.GetPlayerRole( highestTarget ) )
                     {
                        case ROLE.ROLE_CAMPER:
                           game.SetPlayerRole( highestTarget, ROLE.ROLE_SPECTATOR_CAMPER )
                           break

                        case ROLE.ROLE_POSSESSED:
                           game.SetPlayerRole( highestTarget, ROLE.ROLE_SPECTATOR_IMPOSTER )
                           break
                     }
                     game.UpdateGame()
                     print( "Player " + highestTarget.Name + " was voted off" )
                  } )

            }

         }
         break
   }

   // entering this game state
   switch ( game.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
         for ( let player of game.GetAllPlayers() )
         {
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_COMPLETE:
         print( "Game Complete. Game results: " + game.GetGameResults() )

         print( "Ending state: " + game.GetGameResults() )
         print( "Possessed: " + game.GetLivingPossessed().size() )
         print( "Campers: " + game.GetLivingCampers().size() )
         for ( let player of game.GetAllPlayers() )
         {
            ClearAssignments( game, player )
            if ( !IsAlive( player ) )
               continue

            //KillPlayer( player )
            SendRPC( "RPC_FromServer_CancelTask", player )
         }

         // draw end
         game.BroadcastGamestate()
         wait( 8 )
         game.SetGameState( GAME_STATE.GAME_STATE_DEAD )
         break

      case GAME_STATE.GAME_STATE_DEAD:
         gameEndFunc()
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
         GameStateChanged( game, lastGameState, gameEndFunc )
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
         case GAME_STATE.GAME_STATE_PREMATCH:

            print( "Prematch, creating game" )
            let players = game.GetAllPlayers().concat( [] ) // "clone"

            players = players.filter( function ( player )
            {
               return player.Character !== undefined
            } )

            if ( players.size() < MATCHMAKE_PLAYERCOUNT_FALLBACK )
            {
               game.SetGameState( GAME_STATE.GAME_STATE_DEAD )
               break
            }

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
               UpdateTasklistNetvar( player, [] )
            }

            for ( let player of setCampers )
            {
               game.SetPlayerRole( player, ROLE.ROLE_CAMPER )
               AssignTasks( player, game )
            }

            let room = GetRoomByName( SPAWN_ROOM )
            PutPlayersInRoom( players, room )

            for ( let i = 0; i < players.size(); i++ )
            {
               let player = players[i]
               SendRPC( "RPC_FromServer_CancelTask", player )
            }

            game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
            break


         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            {
               let remaining = game.GetTimeRemainingForState()
               if ( remaining <= 0 )
               {
                  game.SetGameState( GAME_STATE.GAME_STATE_MEETING_VOTE )
               }
               else
               {
                  Thread( function ()
                  {
                     wait( remaining )
                     game.UpdateGame()
                  } )
               }
            }
            break

         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            {
               let remaining = game.GetTimeRemainingForState()
               let count = game.GetLivingPossessed().size() + game.GetLivingCampers().size()
               let votes = game.GetVotes()
               if ( remaining <= 0 || votes.size() >= count )
               {
                  game.SetGameState( GAME_STATE.GAME_STATE_PLAYING )
                  break
               }
               else
               {
                  Thread( function ()
                  {
                     wait( remaining )
                     game.UpdateGame()
                  } )
               }
            }
            break
      }

      if ( gameState === game.GetGameState() )
      {
         // completed loop without gamestate changing, so done updating, so broadcast and yield
         game.BroadcastGamestate()

         coroutine.yield() // wait until something says update again
      }
   }
}

export function CreateGame( players: Array<Player>, gameEndFunc: Function )
{
   for ( let player of players )
   {
      Assert( player.Character !== undefined, "player.Character !== undefined" )
      Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
   }
   Assert( players.size() >= MATCHMAKE_PLAYERCOUNT_FALLBACK, "Not enough players" )
   Assert( players.size() <= MATCHMAKE_PLAYERCOUNT, "Too many players" )
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
   Resume( game.gameThread )
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )

   let game = PlayerToGame( player )

   Assert( game.assignments.has( player ), "Player has no assignments" )
   let assignments = game.assignments.get( player ) as Array<Assignment>

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
         assignment.status = 1
   }

   if ( !IsPracticing( player ) )
   {
      // you leave now!
      if ( taskName === TASK_EXIT )
      {
         print( player.Name + " exits!" )
         game.SetPlayerRole( player, ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
         game.UpdateGame()
      }

      function ExitAssignment()
      {
         for ( let assignment of assignments )
         {
            if ( assignment.status === 0 )
               return
         }

         // already has exit?
         for ( let assignment of assignments )
         {
            if ( assignment.taskName === TASK_EXIT )
               return
         }

         let assignment = new Assignment( "Foyer", TASK_EXIT, 0 )
         assignments.push( assignment )
      }
      ExitAssignment()
   }

   UpdateTasklistNetvar( player, assignments )
}

export function PlayerHasAssignments( player: Player, game: Game ): boolean
{
   return game.assignments.has( player )
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


export function AssignTasks( player: Player, game: Game )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )

   for ( let roomAndTask of roomsAndTasks )
   {
      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name, 0 )
      if ( assignment.taskName !== TASK_EXIT )
         assignments.push( assignment )
      if ( assignments.size() >= MAX_TASKLIST_SIZE )
         break
   }

   game.assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
}

export function AssignAllTasks( player: Player, game: Game )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )

   for ( let roomAndTask of roomsAndTasks )
   {
      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name, 0 )
      if ( assignment.taskName !== TASK_EXIT )
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

export function IsReservedServer(): boolean
{
   return game.PrivateServerId !== "" && game.PrivateServerOwnerId === 0
}