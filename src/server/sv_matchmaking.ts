import { HttpService, Players, TeleportService, Workspace } from "@rbxts/services"
import { TELEPORT_PlayerData, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU, IsPracticing, ROLE, Game, LOCAL } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { AddRPC } from "shared/sh_rpc"
import { MAX_FRIEND_WAIT_TIME, MATCHMAKE_PLAYERCOUNT_DESIRED, MATCHMAKE_PLAYERCOUNT_FALLBACK } from "shared/sh_settings"
import { GraphCapped, Resume, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddPlayer, AssignAllTasks, CreateGame, IsReservedServer } from "./sv_gameState"
import { PutPlayerInStartRoom } from "./sv_rooms"

export const DATASTORE_MATCHMAKING = "datastore_matchmaking"

class File
{
   practiceGame = new Game()
   reservedServerPlayerCount = 10
   reservedServingTryingToMatchmake = false
   playerToSearchStartedTime = new Map<Player, number>()
   matchmakeThread = Thread( function () { wait( 9999 ) } )

   isFriends = new Map<Player, Map<Player, boolean>>()
}

let file = new File()

export function SV_MatchmakingSetup()
{
   if ( IsReservedServer() )
   {
      AddRPC( 'RPC_FromClient_SetPlayerCount', function ( player: Player, num: number )
      {
         file.reservedServerPlayerCount = num
      } )
   }

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      switch ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
         case MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY:
            PutPlayerInStartRoom( player )
            break
      }
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      print( "AddCallback_OnPlayerConnected " + player.UserId )
      Thread( function ()
      {
         let friends = new Map<Player, boolean>()
         let players = Players.GetPlayers()
         for ( let other of players )
         {
            if ( other === player )
               continue

            if ( player.IsFriendsWith( other.UserId ) )
            {
               friends.set( other, true )
               if ( !file.isFriends.has( other ) )
               {
                  print( "Other: " + other.UserId + " " + other.Character )
                  Assert( false, "file.isFriends.has( other )" )
               }

               let otherFriends = file.isFriends.get( other ) as Map<Player, boolean>
               otherFriends.set( player, true )
               file.isFriends.set( other, otherFriends )
            }
         }
         file.isFriends.set( player, friends )
         print( "file.isFriends.set " + player.UserId )
      } )

      if ( IsReservedServer() )
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY )

      let playerInfo = AddPlayer( file.practiceGame, player, ROLE.ROLE_CAMPER )
      playerInfo.playernum = 0 // Needs to be set to something, but doesn't really matter for practice
      AssignAllTasks( player, file.practiceGame )
      file.practiceGame.BroadcastGamestate()
      UpdateMatchmakingStatus_AndMatchmake()
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         print( "file.isFriends.delete " + player.UserId )
         file.isFriends.delete( player )
         for ( let pair of file.isFriends )
         {
            if ( pair[1].has( player ) )
               pair[1].delete( player )
         }

         if ( file.practiceGame.HasPlayer( player ) )
         {
            file.practiceGame.RemovePlayer( player )
            file.practiceGame.BroadcastGamestate()
         }
         UpdateMatchmakingStatus_AndMatchmake()
      } )

   AddRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", function ( player: Player, newStatus: MATCHMAKING_STATUS )
   {
      if ( IsReservedServer() )
      {
         Thread( function ()
         {
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY )
            wait( 1 ) // wait for transition
            let data = new TELEPORT_PlayerData()
            data.matchmaking = newStatus
            let json = HttpService.JSONEncode( data )
            TeleportService.Teleport( game.PlaceId, player, json )
         } )
         return
      }

      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      if ( status === MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
         return

      switch ( newStatus )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
            break

         case MATCHMAKING_STATUS.MATCHMAKING_LFG:
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
            file.playerToSearchStartedTime.set( player, Workspace.DistributedGameTime )
            break
      }

      UpdateMatchmakingStatus_AndMatchmake()
   } )

   file.matchmakeThread = Thread( function ()
   {
      for ( ; ; )
      {
         print( "\n" )
         let allPlayers = Players.GetPlayers()
         for ( let player of allPlayers )
         {
            print( player.UserId + " " + ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) as number ) )
         }
         print( "\n" )
         let practicePlayers = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )

         let lfgPlayersFriends = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS )
         for ( let i = 0; i < lfgPlayersFriends.size(); i++ )
         {
            let player = lfgPlayersFriends[i]
            if ( TimeInQueue( player ) <= MAX_FRIEND_WAIT_TIME )
            {
               let practicingFriends = GetFriendCount( practicePlayers, player )

               if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_NUMWITHYOU ) !== practicingFriends )
                  SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, practicingFriends )

               if ( practicingFriends !== 0 )
                  continue
            }

            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
            lfgPlayersFriends.remove( i )
            i--

            if ( !file.playerToSearchStartedTime.has( player ) )
               file.playerToSearchStartedTime.set( player, Workspace.DistributedGameTime )
         }

         let lfgPlayers = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )
         for ( let i = 0; i < lfgPlayers.size(); i++ )
         {
            let player = lfgPlayers[i]
            if ( TimeInQueue( player ) > MAX_FRIEND_WAIT_TIME )
               continue

            let practicingFriends = GetFriendCount( practicePlayers, player )
            if ( practicingFriends === 0 )
               continue

            SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, practicingFriends )
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS )
            lfgPlayers.remove( i )
            lfgPlayersFriends.push( player )
            i--
         }

         const PLAYERCOUNT = GetMatchmakingMinPlayersForLongestWaitTime( lfgPlayers )
         print( "MM LFG:" + lfgPlayers.size() + ", LFGWF:" + lfgPlayersFriends.size() + ", looking for " + PLAYERCOUNT + " players" )

         let waitingForPlayerCount = PLAYERCOUNT - lfgPlayers.size()
         for ( let player of lfgPlayers )
         {
            SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, waitingForPlayerCount )

            let friends = GetFriends( lfgPlayers, player )
            let lowestTime = GetLowestMatchmakingTime( friends )
            let myTime = file.playerToSearchStartedTime.get( player ) as number
            if ( lowestTime < myTime )
               file.playerToSearchStartedTime.set( player, lowestTime + 0.01 )// let original matchmaker have priority 
         }

         let players: Array<Player> = []

         if ( IsReservedServer() )
         {
            players = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY )
         }
         else
         {
            players = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )
            players.sort( SortByMatchmakeTime )
         }

         players = players.filter( function ( player )
         {
            return player.Character !== undefined
         } )

         if ( players.size() < PLAYERCOUNT )
         {
            if ( IsReservedServer() )
            {
               if ( Workspace.DistributedGameTime > 40 )
               {
                  print( "Matchmaking took too long, send players home" )
                  SendPlayersToLobby()
                  return
               }

               wait( 1 )
            }
            else
            {
               if (
                  GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG ).size() ||
                  GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS ).size()
               )
               {
                  wait( 1.8 )
               }
               else
               {
                  print( "file.matchmakeThread yield" )
                  coroutine.yield()
               }
            }
         }
         else
         {
            players = players.slice( 0, PLAYERCOUNT )

            if ( LOCAL || IsReservedServer() )
            {
               for ( let player of players )
               {
                  SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
                  file.practiceGame.RemovePlayer( player )
               }

               print( "file.matchmakeThread creategame" )
               CreateGame( players,
                  function () // game completed function
                  {
                     if ( !LOCAL )
                     {
                        print( "GAME IS OVER, TELEPORT PLAYERS BACK TO START PLACE" )
                        SendPlayersToLobby()
                        return
                     }
                  } )

               if ( IsReservedServer() )
               {
                  print( "file.matchmakeThread IsReservedServer() finished" )
                  return
               }
            }
            else
            {
               Thread( function ()
               {
                  print( "file.matchmakeThread send to reserved" )
                  for ( let player of players )
                  {
                     SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
                     file.practiceGame.RemovePlayer( player )
                  }

                  //wait( 1 ) // allow time for fade out

                  Assert( !LOCAL, "Should not be reserving servers from local" )
                  print( "Teleporting players to reserved server" )
                  let code = TeleportService.ReserveServer( game.PlaceId )

                  let data = new TELEPORT_PlayerData()
                  data.playerCount = players.size()
                  let json = HttpService.JSONEncode( data )
                  TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none", json )
               } )
            }
         }

         file.practiceGame.BroadcastGamestate()
      }
   } )
}

function GetFriendCount( practicePlayers: Array<Player>, player: Player ): number
{
   let practicingFriends = 0
   for ( let other of practicePlayers )
   {
      if ( !IsFriends( player, other ) )
         continue
      practicingFriends++
   }
   return practicingFriends
}

function GetFriends( practicePlayers: Array<Player>, player: Player ): Array<Player>
{
   let practicingFriends: Array<Player> = []
   for ( let other of practicePlayers )
   {
      if ( !IsFriends( player, other ) )
         continue
      practicingFriends.push( other )
   }
   return practicingFriends
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

function SendPlayersToLobby()
{
   Thread( function ()
   {
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY )
      }

      wait( 1 ) // For transition
      let data = new TELEPORT_PlayerData()
      data.matchmaking = MATCHMAKING_STATUS.MATCHMAKING_LFG
      let json = HttpService.JSONEncode( data )
      TeleportService.TeleportPartyAsync( game.PlaceId, players, json )
   } )
}

function IsFriends( player1: Player, player2: Player ): boolean
{
   let friends = file.isFriends.get( player1 ) as Map<Player, boolean>
   return friends.has( player2 )
}


function TimeInQueue( player: Player ): number
{
   Assert( file.playerToSearchStartedTime.has( player ), "file.playerToSearchStartedTime.has( player )" )
   return Workspace.DistributedGameTime - ( file.playerToSearchStartedTime.get( player ) as number )
}

function UpdateMatchmakingStatus_AndMatchmake()
{
   if ( coroutine.status( file.matchmakeThread ) === "dead" )
      return

   if ( coroutine.running() !== file.matchmakeThread )
      Resume( file.matchmakeThread )
}

function GetLowestMatchmakingTime( players: Array<Player> ): number
{
   let time = Workspace.DistributedGameTime
   for ( let player of players )
   {
      if ( !file.playerToSearchStartedTime.has( player ) )
         continue
      let playerTime = file.playerToSearchStartedTime.get( player ) as number
      if ( playerTime < time )
         time = playerTime
   }
   return time
}

function SortByMatchmakeTime( a: Player, b: Player )
{
   return ( file.playerToSearchStartedTime.get( a ) as number ) < ( file.playerToSearchStartedTime.get( b ) as number )
}

function GetLongestSearchTime( players: Array<Player> ): number
{
   let time = 0
   for ( let player of players )
   {
      if ( !file.playerToSearchStartedTime.has( player ) )
         continue
      let searchTime = Workspace.DistributedGameTime - ( file.playerToSearchStartedTime.get( player ) as number )
      if ( searchTime > time )
         time = searchTime
   }
   return time
}

function GetMatchmakingMinPlayersForLongestWaitTime( players: Array<Player> ): number
{
   if ( IsReservedServer() )
      return math.floor( GraphCapped( Workspace.DistributedGameTime, 10, 20, MATCHMAKE_PLAYERCOUNT_DESIRED, MATCHMAKE_PLAYERCOUNT_FALLBACK ) )

   let timer = GetLongestSearchTime( players )
   return math.floor( GraphCapped( timer, 25, 45, MATCHMAKE_PLAYERCOUNT_DESIRED, MATCHMAKE_PLAYERCOUNT_FALLBACK ) )
}