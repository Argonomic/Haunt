import { Players, RunService, Workspace } from "@rbxts/services"
import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, GetFallbackPlayerCount, NETVAR_RENDERONLY_MATCHMAKING_NUMINFO, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate"
import { ResetNetVar, GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { AddRPC } from "shared/sh_rpc"
import { ADMINS, DEV_SKIP_NPE, MATCHMAKE_PLAYERCOUNT_MAX, MATCHMAKING_COUNTDOWN_SERVERTIME } from "shared/sh_settings"
import { ArrayFind, GraphCapped, PlayerExists, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { CreateGame, CreateNPE, PPRS_COMPLETED_NPE } from "./sv_gameState"
import { PutPlayerInStartRoom } from "./sv_rooms"
import { GetPlayerPersistence_Boolean, GetPlayerPersistence_Number, IncrementServerVersion, LobbyUpToDate, SetPlayerPersistence } from "./sv_persistence"
import { SendPlayersToLobby, ServerAttemptToMatchPlayers, TeleportPlayers_ToLobbyUpdate, TeleportPlayers_ToNewReservedServer } from "shared/sh_matchmaking"
import { PlayerPickupsEnabled } from "shared/sh_pickups"
import { IsReservedServer } from "shared/sh_reservedServer"
import { NETVAR_SCORE, PPRS_PREMATCH_COINS } from "shared/sh_score"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"

export const DATASTORE_MATCHMAKING = "datastore_matchmaking"
const LOCAL = RunService.IsStudio()

class File
{
   lobbyUpToDate = true
}

let file = new File()

export function SV_MatchmakingSetup()
{
   AddRPC( "RPC_FromClient_AdminClick", function ( player: Player )
   {
      if ( ArrayFind( ADMINS, player.Name ) === undefined )
         return

      IncrementServerVersion()
   } )

   if ( IsReservedServer() )
   {
      AddCallback_OnPlayerConnected( function ( player: Player )
      {
         let coins = GetPlayerPersistence_Number( player, PPRS_PREMATCH_COINS, 0 )
         SetPlayerPersistence( player, PPRS_PREMATCH_COINS, 0 )
         SetNetVar( player, NETVAR_SCORE, coins )
      } )
   }

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_CONNECTING:
            if ( IsReservedServer() )
            {
               SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_WAITING_FOR_RESERVEDSERVER_TO_START )
            }
            else
            {
               let completedNPE = GetPlayerPersistence_Boolean( player, PPRS_COMPLETED_NPE, DEV_SKIP_NPE )
               print( player.Name + " completedNPE: " + completedNPE )
               if ( !completedNPE )
               {
                  Thread(
                     function ()
                     {
                        //Countdown( player )
                        //wait( MATCHMAKING_COUNTDOWN_SERVERTIME )
                        wait( 2 )
                        StartNPE( player )
                     } )
               }
               else
               {
                  SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
               }
            }
            break
      }

      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
            return

         default:
            PutPlayerInStartRoom( player )
            return
      }
   } )

   if ( IsReservedServer() )
   {
      AddRPC( "RPC_FromClient_RequestLobby", function ( player: Player )
      {
         SendPlayersToLobby( [player] )
      } )
   }

   AddRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", function ( player: Player, newStatus: MATCHMAKING_STATUS )
   {
      if ( IsReservedServer() )
         return

      let currentStatus = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      switch ( currentStatus )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
         case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER:
            // not allowed to make requests in these states
            return
      }

      if ( currentStatus !== newStatus )
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, newStatus )
   } )

   Thread(
      function ()
      {
         for ( ; ; )
         {
            //print( "TRY AGAIN" )
            if ( !ContinueMatchmaking() )
            {
               //print( "FINISHED MATCHMAKING" )
               return
            }
            wait( 0.5 )
         }
      } )
}

function TryToMatchmake( status: MATCHMAKING_STATUS, count: number ): Array<Player> | undefined
{
   count = math.floor( count )

   let players = GetPlayersWithMatchmakingStatus( status )
   players = players.filter( function ( player )
   {
      return player.Character !== undefined
   } )

   if ( players.size() < count )
      return undefined

   return ServerAttemptToMatchPlayers( players, count )
}

function ContinueMatchmaking(): boolean
{
   if ( IsReservedServer() )
      return ReservedServer_ContinueMatchmaking()

   if ( LOCAL )
   {
      const MIN_TIME = 15
      const MAX_TIME = 20

      {
         const playerCount = GraphCapped( Workspace.DistributedGameTime, MIN_TIME, MAX_TIME, MATCHMAKE_PLAYERCOUNT_MAX, GetFallbackPlayerCount() )

         //print( "i: " + MATCHMAKE_PLAYERCOUNT_MAX )
         //print( "playerCount: " + playerCount )

         for ( let i = MATCHMAKE_PLAYERCOUNT_MAX; i >= playerCount; i-- )
         {
            let players = TryToMatchmake( MATCHMAKING_STATUS.MATCHMAKING_LFG, i )
            if ( players !== undefined )
            {
               //print( "Success!" )
               MatchmakingCountdownThen( players, StartGame )
            }
            else
            {
               //print( "Failure!" )
            }
         }
      }

      return true
   }

   Thread( LobbyUpToDateCheck_mayClearServer )

   // live lobbies need to be up to date or they refresh
   if ( !file.lobbyUpToDate )
      return false

   let players = TryToMatchmake( MATCHMAKING_STATUS.MATCHMAKING_LFG, MATCHMAKE_PLAYERCOUNT_MAX )

   if ( players !== undefined )
      MatchmakingCountdownThen( players, SendMatchmadePlayersToNewReservedServer )

   return true
}

function ReservedServer_ContinueMatchmaking(): boolean
{
   {
      let players = Players.GetPlayers()
      players = players.filter( function ( player )
      {
         return player.Character !== undefined
      } )

      if ( players.size() === MATCHMAKE_PLAYERCOUNT_MAX )
      {
         StartGame( players )
         return false
      }
   }

   const MIN_TIME = 5
   const MAX_TIME = 7

   if ( Workspace.DistributedGameTime < MIN_TIME - 1 )
      return true

   {
      const playerCount = GraphCapped( Workspace.DistributedGameTime, MIN_TIME, MAX_TIME, MATCHMAKE_PLAYERCOUNT_MAX, GetFallbackPlayerCount() )
      for ( let i = MATCHMAKE_PLAYERCOUNT_MAX; i >= playerCount; i-- )
      {
         let players = Players.GetPlayers()
         players = players.filter( function ( player )
         {
            return player.Character !== undefined
         } )

         if ( players.size() === i )
         {
            StartGame( players )
            return false
         }
      }
   }

   if ( Workspace.DistributedGameTime < MAX_TIME + 1 )
      return true

   // took too long to try to start
   SendPlayersToLobby( Players.GetPlayers() )

   return false
}

function MatchmakingCountdownThen( players: Array<Player>, successFunc: ( players: Array<Player> ) => void )
{
   function FilterPlayers()
   {
      players = players.filter( function ( player )
      {
         if ( player.Character === undefined )
            return false

         if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) !== MATCHMAKING_STATUS.MATCHMAKING_COUNTDOWN )
            return false

         return true
      } )
   }

   Thread(
      function ()
      {
         for ( let player of players )
         {
            Countdown( player )
         }

         let startingCount = players.size()
         let endTime = Workspace.DistributedGameTime + MATCHMAKING_COUNTDOWN_SERVERTIME

         for ( ; ; )
         {
            wait( 1 )
            FilterPlayers()
            if ( players.size() < startingCount )
               break
            if ( Workspace.DistributedGameTime >= endTime )
               break
         }

         if ( players.size() === startingCount )
         {
            successFunc( players )
            return
         }

         // lost a player, back to LFG
         for ( let player of players )
         {
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
         }
      } )
}

function SendMatchmadePlayersToNewReservedServer( players: Array<Player> )
{
   Thread( function ()
   {
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
         SetPlayerPersistence( player, PPRS_PREMATCH_COINS, GetNetVar_Number( player, NETVAR_SCORE ) )

         Thread(
            function ()
            {
               // failsafe if the server fails
               wait( 30 )
               if ( player !== undefined && player.Character !== undefined )
                  SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
            } )
      }

      //wait( 1 ) // allow time for fade out

      Assert( !LOCAL, "Should not be reserving servers from local" )
      print( "Teleporting players to reserved server" )
      TeleportPlayers_ToNewReservedServer( players )
   } )
}

function StartGame( players: Array<Player> )
{
   for ( let player of players )
   {
      SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
   }

   print( "StartGame with " + players.size() + " players" )

   CreateGame( players,

      // match completed function
      function ()
      {
         for ( let player of players )
         {
            if ( PlayerExists( player ) )
               PlayerPickupsEnabled( player )
         }

         // clear out the server
         if ( IsReservedServer() )
         {
            print( "GAME IS OVER, TELEPORT PLAYERS BACK TO START PLACE" )
            Thread(
               function ()
               {
                  for ( ; ; )
                  {
                     SendPlayersToLobby( Players.GetPlayers() )
                     wait( 4 )
                  }
               } )
            return
         }
      } )
}

function StartNPE( player: Player )
{
   print( "StartNPE for " + player.Name )

   SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
   CreateNPE( player,
      function () 
      {
         if ( !PlayerExists( player ) )
            return

         // match completed function
         print( player.Name + " has completed NPE" )
         SetPlayerPersistence( player, PPRS_COMPLETED_NPE, true )
         ResetNetVar( player, NETVAR_JSON_GAMESTATE )
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
         PlayerPickupsEnabled( player )
         return
      } )
}

function RoundTripPlayersToLobby()
{
   print( "RoundTripPlayersToLobby" )

   Thread( function ()
   {
      let sendPlayers: Array<Player> = []

      {
         let players = Players.GetPlayers()
         for ( let player of players )
         {
            if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
            {
               TeleportPlayers_ToLobbyUpdate( [player] )
               continue
            }

            sendPlayers.push( player )
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
         }
      }

      if ( sendPlayers.size() )
      {
         print( "Sending " + sendPlayers.size() + " players to reserved server with sendMeBackToLobby" )

         TeleportPlayers_ToLobbyUpdate( sendPlayers )
      }

      Thread( function ()
      {
         wait( 5 )
         for ( let player of sendPlayers )
         {
            if ( player.Character !== undefined )
               player.Kick( "Updating Lobby, please rejoin" )
         }
      } )
   } )
}

function LobbyUpToDateCheck_mayClearServer()
{
   if ( LobbyUpToDate() ) // latent
      return

   file.lobbyUpToDate = false

   for ( ; ; )
   {
      RoundTripPlayersToLobby()
      wait( 1 )
   }
}

function GetPlayersWithMatchmakingStatus( status: MATCHMAKING_STATUS ): Array<Player>
{
   let found: Array<Player> = []
   let players = Players.GetPlayers()
   for ( let player of players )
   {
      if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) === status )
         found.push( player )
   }
   return found
}

function Countdown( player: Player )
{
   SetNetVar( player, NETVAR_RENDERONLY_MATCHMAKING_NUMINFO, MATCHMAKING_COUNTDOWN_SERVERTIME )
   SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_COUNTDOWN )
}