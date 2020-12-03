import { Players } from "@rbxts/services"
import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU, IsPracticing, ROLE, Game } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { AddRPC } from "shared/sh_rpc"
import { MAX_PLAYERS, MIN_PLAYERS } from "shared/sh_settings"
import { CreateGame } from "./sv_gameState"
import { PutPlayerInStartRoom } from "./sv_rooms"

class File
{
   practiceGame = new Game()
}

let file = new File()

export function SV_MatchmakingSetup()
{
   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
         PutPlayerInStartRoom( player )
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
      file.practiceGame.AddPlayer( player, ROLE.ROLE_CAMPER )
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

      TryToMatchmake()
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


function TryToMatchmake()
{
   let players = GetPlayersWithMatchmakingStatus( MATCHMAKING_STATUS.MATCHMAKING_LFG )

   if ( players.size() < MIN_PLAYERS )
      return

   players = players.slice( 0, MAX_PLAYERS )

   for ( let player of players )
   {
      SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PLAYING )
      file.practiceGame.RemovePlayer( player )
   }

   CreateGame( players )

   file.practiceGame.BroadcastGamestate()
   TryToMatchmake() // maybe there are left over players to start a game with?
}


