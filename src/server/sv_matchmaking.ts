import { LocalizationService, Players, TeleportService, Workspace } from "@rbxts/services"
import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU, IsPracticing, ROLE, Game, LOCAL } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { AddRPC } from "shared/sh_rpc"
import { MAX_PLAYERS, MIN_PLAYERS } from "shared/sh_settings"
import { Assert, Thread } from "shared/sh_utils"
import { AddPlayer, AssignAllTasks, CreateGame, IsReservedServer } from "./sv_gameState"
import { PutPlayerInStartRoom } from "./sv_rooms"

class File
{
   practiceGame = new Game()
   reservedServerPlayerCount = 10
   reservedServingTryingToMatchmake = false
}

let file = new File()

export function SV_MatchmakingSetup()
{
   if ( IsReservedServer() )
   {
      AddRPC( 'RPC_FromClient_SetPlayerCount', function ( player: Player, num: number )
      {
         print( "RPC_FromClient_SetPlayerCount " + num )
         file.reservedServerPlayerCount = num
      } )
   }


   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      switch ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
            PutPlayerInStartRoom( player )
            break

         case MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY:
            if ( file.reservedServingTryingToMatchmake )
               return
            file.reservedServingTryingToMatchmake = true

            let minPlayerTime = Workspace.DistributedGameTime + 10
            let maxSearchTime = Workspace.DistributedGameTime + 20

            for ( ; ; )
            {
               if ( Workspace.DistributedGameTime > maxSearchTime )
               {
                  print( "Matchmaking took too long, send players home" )
                  for ( let player of Players.GetPlayers() )
                  {
                     TeleportService.Teleport( game.PlaceId, player )
                  }
                  return
               }

               let minPlayers = file.reservedServerPlayerCount
               if ( Workspace.DistributedGameTime > minPlayerTime )
                  minPlayers = MIN_PLAYERS
               if ( TryToMatchmake( minPlayers, file.reservedServerPlayerCount ) )
                  return
               wait( 0.5 )
            }
            break
      }
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      if ( IsReservedServer() )
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY )

      AddPlayer( file.practiceGame, player, ROLE.ROLE_CAMPER )
      AssignAllTasks( player, file.practiceGame )
      file.practiceGame.BroadcastGamestate()
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         if ( IsPracticing( player ) )
         {
            file.practiceGame.RemovePlayer( player )
            file.practiceGame.BroadcastGamestate()
         }
      } )

   AddRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", function ( player: Player, newStatus: MATCHMAKING_STATUS )
   {
      if ( IsReservedServer() )
         return

      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      if ( status === MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
         return

      SetNetVar( player, NETVAR_MATCHMAKING_STATUS, newStatus )

      // update LFG Searcher count
      let lfgPlayers = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )
      let searchers = MIN_PLAYERS - lfgPlayers.size()
      for ( let player of lfgPlayers )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, searchers )
      }

      TryToMatchmake( MIN_PLAYERS, MAX_PLAYERS )
   } )
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

function TryToMatchmake( minPlayers: number, maxPlayers: number ): boolean
{
   print( "TryToMatchmake: IsReserved?" + IsReservedServer() + " IsLocal?" + LOCAL )

   let players: Array<Player> = []
   if ( IsReservedServer() )
      players = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY )
   else
      players = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )

   players = players.filter( function ( player )
   {
      return player.Character !== undefined
   } )

   print( "players.size():" + players.size() + " < minPlayers:" + minPlayers + " maxPlayers:" + maxPlayers )

   if ( players.size() < minPlayers )
      return false

   players = players.slice( 0, maxPlayers )

   if ( LOCAL || IsReservedServer() )
   {
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
         file.practiceGame.RemovePlayer( player )
      }

      CreateGame( players,
         function ()
         {
            if ( !LOCAL )
            {
               print( "GAME IS OVER, TELEPORT PLAYERS BACK TO START PLACE" )
               for ( let player of Players.GetPlayers() )
               {
                  TeleportService.Teleport( game.PlaceId, player )
               }
               return
            }

            /*
            for ( let player of players )
            {
               if ( player !== undefined )
               {
                  print( "Player " + player.UserId + " joins practice" )
                  SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
                  AddPlayer( file.practiceGame, player, ROLE.ROLE_CAMPER )
               }
            }
            file.practiceGame.BroadcastGamestate()
            */
         } )

      if ( IsReservedServer() )
         return true
   }
   else
   {
      Assert( !LOCAL, "Should not be reserving servers from local" )
      print( "Teleporting players to reserved server" )
      let code = TeleportService.ReserveServer( game.PlaceId )
      TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none", players.size() )
   }

   file.practiceGame.BroadcastGamestate()
   TryToMatchmake( minPlayers, maxPlayers ) // maybe there are left over players to start a game with?
   return false
}

