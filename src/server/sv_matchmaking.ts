import { HttpService, Players, TeleportService, Workspace } from "@rbxts/services"
import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU, ROLE, Game, LOCAL, IsReservedServer } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { AddRPC } from "shared/sh_rpc"
import { MAX_FRIEND_WAIT_TIME, MATCHMAKE_PLAYERCOUNT_DESIRED, MATCHMAKE_PLAYERCOUNT_FALLBACK, DEV_SKIP, ADMINS } from "shared/sh_settings"
import { ArrayFind, GraphCapped, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddPlayer, AssignAllTasks, CreateGame } from "./sv_gameState"
import { PutPlayerInStartRoom } from "./sv_rooms"
import { IncrementServerVersion, LobbyUpToDate } from "./sv_persistence"
import { TELEPORT_PlayerData } from "shared/sh_teleport"

export const DATASTORE_MATCHMAKING = "datastore_matchmaking"

class File
{
   practiceGame = new Game()
   reservedServerPlayerCount = 10
   reservedServingTryingToMatchmake = false
   playerTimeInQueue = new Map<Player, number>()
   matchmakeThread: Function | undefined

   lobbyUpToDate = true

   friendsMap = new Map<Player, Map<Player, boolean>>()
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

   AddRPC( "RPC_FromClient_AdminClick", function ( player: Player )
   {
      if ( ArrayFind( ADMINS, player.Name ) === undefined )
         return

      IncrementServerVersion()
      Thread(
         function ()
         {
            for ( let i = 0; i < 5; i++ )
            {
               wait( 1 )
               UpdateMatchmakingStatus_AndMatchmake()
            }
         } )
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      switch ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED:
         case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
         case MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY:
            PutPlayerInStartRoom( player )
            break
      }
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      Thread( function ()
      {
         let friends = new Map<Player, boolean>()
         file.friendsMap.set( player, friends )

         let players = Players.GetPlayers()
         for ( let other of players )
         {
            if ( other === player )
               continue

            if ( !player.IsFriendsWith( other.UserId ) )
               continue

            friends.set( other, true )

            let otherFriends = file.friendsMap.get( other ) as Map<Player, boolean>
            if ( otherFriends === undefined )
               otherFriends = new Map<Player, boolean>()
            otherFriends.set( player, true )
            file.friendsMap.set( other, otherFriends )
         }
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
         file.friendsMap.delete( player )
         for ( let pair of file.friendsMap )
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

      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
         case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER:
            // not allowed to make requests in these states
            return
      }

      if ( status === newStatus )
      {
         // toggle back to undecided
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED )
         if ( file.playerTimeInQueue.has( player ) )
            file.playerTimeInQueue.delete( player )
      }
      else
      {
         switch ( newStatus )
         {
            case MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED:
            case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
               SetNetVar( player, NETVAR_MATCHMAKING_STATUS, newStatus )
               if ( file.playerTimeInQueue.has( player ) )
                  file.playerTimeInQueue.delete( player )
               break

            case MATCHMAKING_STATUS.MATCHMAKING_LFG:
               SetNetVar( player, NETVAR_MATCHMAKING_STATUS, newStatus )
               if ( !file.playerTimeInQueue.has( player ) )
                  file.playerTimeInQueue.set( player, Workspace.DistributedGameTime )
               break
         }
      }

      UpdateMatchmakingStatus_AndMatchmake()
   } )

   file.matchmakeThread = Thread( MatchmakingLoop )
}

function MatchmakingLoop()
{
   for ( ; ; )
   {
      if ( !ContinueMatchmaking() )
         break
   }

   for ( ; ; )
   {
      coroutine.yield()
   }

}

/*
print( "\n" )
let allPlayers = Players.GetPlayers()
for ( let player of allPlayers )
{
print( player.UserId + " " + ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) as number ) )
}
print( "\n" )
*/

class TryToMatchmake
{
   PLAYERCOUNT: number
   players: Array<Player>
   constructor()
   {
      let unqueud: Array<Player> = []
      unqueud = unqueud.concat( GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED ) )
      unqueud = unqueud.concat( GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_PRACTICE ) )

      let lfgPlayersFriends = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS )
      for ( let i = 0; i < lfgPlayersFriends.size(); i++ )
      {
         let player = lfgPlayersFriends[i]
         let friendCount = TotalFriends( unqueud, player )
         let timeInQueue = TimeInQueue( player )
         //print( "1 " + player.Name + " friendcount:" + friendCount + " timeInQueue:" + math.floor( timeInQueue ) )
         if ( timeInQueue > MAX_FRIEND_WAIT_TIME || friendCount === 0 )
         {
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG )
            lfgPlayersFriends.remove( i )
            i--

            if ( !file.playerTimeInQueue.has( player ) )
               file.playerTimeInQueue.set( player, Workspace.DistributedGameTime )
            continue
         }

         if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_NUMWITHYOU ) !== friendCount )
            SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, friendCount )
      }

      let lfgPlayers = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )
      for ( let i = 0; i < lfgPlayers.size(); i++ )
      {
         let player = lfgPlayers[i]
         let friendCount = TotalFriends( unqueud, player )
         let timeInQueue = TimeInQueue( player )
         //print( "2 " + player.Name + " friendcount:" + friendCount + " timeInQueue:" + math.floor( timeInQueue ) )
         if ( timeInQueue > MAX_FRIEND_WAIT_TIME )
            continue

         if ( friendCount === 0 )
            continue

         SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, friendCount )
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS )
         lfgPlayers.remove( i )
         lfgPlayersFriends.push( player )
         i--
      }

      const PLAYERCOUNT = GetMatchmakingMinPlayersForLongestWaitTime( lfgPlayers )
      if ( !LOCAL )
         print( "MM LFG:" + lfgPlayers.size() + ", LFGWF:" + lfgPlayersFriends.size() + ", looking for " + PLAYERCOUNT + " players" )

      let waitingForPlayerCount = PLAYERCOUNT - lfgPlayers.size()
      for ( let player of lfgPlayers )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_NUMWITHYOU, waitingForPlayerCount )

         let friends = GetFriends( lfgPlayers, player )
         let lowestTime = GetLowestMatchmakingTime( friends )
         let myTime = file.playerTimeInQueue.get( player ) as number
         if ( lowestTime < myTime )
            file.playerTimeInQueue.set( player, lowestTime + 0.01 )// let original matchmaker have priority 
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

      this.PLAYERCOUNT = PLAYERCOUNT
      this.players = players
   }
}

function ContinueMatchmaking(): boolean
{
   // live lobbies need to be up to date or they refresh
   if ( !LOCAL && !IsReservedServer() )
   {
      if ( !file.lobbyUpToDate )
         return false

      Thread( LobbyUpToDateCheck_mayClearServer )
   }

   let mm = new TryToMatchmake()
   let players = mm.players
   const PLAYERCOUNT = mm.PLAYERCOUNT

   if ( players.size() < PLAYERCOUNT )
   {
      // not enough players to matchmake yet
      WaitUntilTimeToTryAgain()
      return true
   }

   players = players.slice( 0, MATCHMAKE_PLAYERCOUNT_DESIRED )

   if ( LOCAL || IsReservedServer() )
   {
      StartGame( players )
      return false
   }

   SendMatchmadePlayersToNewReserveServer( players )
   return true
}

function SendMatchmadePlayersToNewReserveServer( players: Array<Player> )
{
   Thread( function ()
   {
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )

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
      let code = TeleportService.ReserveServer( game.PlaceId )

      let data = new TELEPORT_PlayerData()
      data.playerCount = players.size()
      let json = HttpService.JSONEncode( data )
      TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none", json )
   } )
}

function StartGame( players: Array<Player> )
{
   for ( let player of players )
   {
      SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
      file.practiceGame.RemovePlayer( player )
   }

   print( "StartGame with " + players.size() + " players" )

   CreateGame( players,
      function () 
      {
         // game completed function
         if ( !LOCAL )
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

function WaitUntilTimeToTryAgain()
{
   if ( IsReservedServer() )
   {
      if ( Workspace.DistributedGameTime > 40 )
      {
         print( "Matchmaking took too long, send players home" )
         for ( ; ; )
         {
            SendPlayersToLobby( Players.GetPlayers() )
            wait( 4 )
         }
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
         wait( 3.0 )
      }
      else
      {
         file.practiceGame.BroadcastGamestate()
         print( "file.matchmakeThread yield" )
         coroutine.yield()
      }
   }
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
               continue

            sendPlayers.push( player )
            SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
         }
      }

      if ( sendPlayers.size() )
      {
         print( "Sending " + sendPlayers.size() + " players to reserved server with sendMeBackToLobby" )
         let code = TeleportService.ReserveServer( game.PlaceId )
         let data = new TELEPORT_PlayerData()
         data.sendMeBackToLobby = true

         let json = HttpService.JSONEncode( data )
         TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], sendPlayers, "none", json )
         Thread( function ()
         {
            wait( 5 )
            for ( let player of sendPlayers )
            {
               if ( player.Character !== undefined )
                  player.Kick( "Updating Lobby, please rejoin" )
            }
         } )
      }
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

function TotalFriends( players: Array<Player>, player: Player ): number
{
   return GetFriends( players, player ).size()
}

function GetFriends( players: Array<Player>, player: Player ): Array<Player>
{
   let friends: Array<Player> = []
   for ( let other of players )
   {
      if ( other === player )
         continue
      if ( !IsFriends( player, other ) )
         continue
      friends.push( other )
   }
   return friends
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

function SendPlayersToLobby( players: Array<Player> )
{
   Assert( IsReservedServer(), "IsReservedServer()" )
   Thread( function ()
   {
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY )
      }

      wait( 1 ) // fade to black

      let data = new TELEPORT_PlayerData()
      data.fromReservedServer = true

      let json = HttpService.JSONEncode( data )
      TeleportService.TeleportPartyAsync( game.PlaceId, players, json )
   } )
}

function IsFriends( player1: Player, player2: Player ): boolean
{
   Assert( player1 !== player2, "player1 !== player2" )
   let friendsMap = file.friendsMap.get( player1 )
   if ( friendsMap === undefined )
   {
      Assert( false, "friendsMap is undefined for between " + player1 + " and " + player2 )
      throw undefined
   }
   return friendsMap.has( player2 )
}

function TimeInQueue( player: Player ): number
{
   Assert( file.playerTimeInQueue.has( player ), "file.playerTimeInQueue.has( player )" )
   return Workspace.DistributedGameTime - ( file.playerTimeInQueue.get( player ) as number )
}

function UpdateMatchmakingStatus_AndMatchmake()
{
   if ( file.matchmakeThread !== undefined )
      file.matchmakeThread()
}

function GetLowestMatchmakingTime( players: Array<Player> ): number
{
   let time = Workspace.DistributedGameTime
   for ( let player of players )
   {
      if ( !file.playerTimeInQueue.has( player ) )
         continue
      let playerTime = file.playerTimeInQueue.get( player ) as number
      if ( playerTime < time )
         time = playerTime
   }
   return time
}

function SortByMatchmakeTime( a: Player, b: Player )
{
   return ( file.playerTimeInQueue.get( a ) as number ) < ( file.playerTimeInQueue.get( b ) as number )
}

function GetLongestSearchTime( players: Array<Player> ): number
{
   let time = 0
   for ( let player of players )
   {
      if ( !file.playerTimeInQueue.has( player ) )
         continue
      let searchTime = Workspace.DistributedGameTime - ( file.playerTimeInQueue.get( player ) as number )
      if ( searchTime > time )
         time = searchTime
   }
   return time
}

function AnyPlayerSearchingForLessTime( players: Array<Player>, time: number ): boolean
{
   for ( let player of players )
   {
      if ( !file.playerTimeInQueue.has( player ) )
         continue
      let searchTime = Workspace.DistributedGameTime - ( file.playerTimeInQueue.get( player ) as number )
      if ( searchTime < time )
         return true
   }
   return false
}

function GetMatchmakingMinPlayersForLongestWaitTime( players: Array<Player> ): number
{
   if ( IsReservedServer() )
      return math.floor( GraphCapped( Workspace.DistributedGameTime, 10, 20, file.reservedServerPlayerCount, MATCHMAKE_PLAYERCOUNT_FALLBACK ) )

   let timer = GetLongestSearchTime( players )
   let playerCount = math.floor( GraphCapped( timer, 25, 45, MATCHMAKE_PLAYERCOUNT_DESIRED, MATCHMAKE_PLAYERCOUNT_FALLBACK ) )

   if ( DEV_SKIP )
   {
      if ( AnyPlayerSearchingForLessTime( players, 3 ) )
         return MATCHMAKE_PLAYERCOUNT_DESIRED
      return MATCHMAKE_PLAYERCOUNT_FALLBACK
   }

   if ( playerCount < MATCHMAKE_PLAYERCOUNT_DESIRED )
   {
      // if someone just started searching, then maybe someone else is about to search too?
      if ( AnyPlayerSearchingForLessTime( players, 6 ) )
         return MATCHMAKE_PLAYERCOUNT_DESIRED
   }

   return playerCount
}

