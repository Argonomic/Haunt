import { Assert } from "shared/sh_assert"
import { GameStateFuncs, GAME_STATE, Match, SHAREDVAR_GAMEMODE_CANREQLOBBY } from "shared/sh_gamestate"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { SetGameState, GetMatchIndex, GetAllPlayersInMatchWithCharacters, GetAllConnectedPlayersInMatch, HandleVoteResults, SV_SendRPC, SetGameStateFuncs } from "../sv_gameState"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"
import { SetSharedVarInt } from "shared/sh_sharedVar"

export function SV_GameMode_PersistentSetup()
{
   SetGameStateFuncs( new GameStateFuncs( PersistGameStateChanged, GameStateThink ) )
   SetSharedVarInt( SHAREDVAR_GAMEMODE_CANREQLOBBY, 1 )
}

function GameStateThink( match: Match )
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
         SetGameState( match, GAME_STATE.GAME_STATE_PLAYING )
         break
   }
}

function PersistGameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   print( "Match " + GetMatchIndex( match ) + " entering GameState " + match.GetGameState() )

   // leaving this state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INIT:
         let players = GetAllPlayersInMatchWithCharacters( match )
         Assert( players.size() === 0, "Already players?" )
         break
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
      case GAME_STATE.GAME_STATE_INIT:
         SetGameState( match, GAME_STATE.GAME_STATE_PLAYING )
         return

      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let toSpawn = 100 - GetTotalValueOfWorldCoins( match )
         if ( toSpawn > 0 )
            SpawnRandomCoins( match, toSpawn )

         for ( let player of GetAllConnectedPlayersInMatch( match ) )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         HandleVoteResults( match )
         break
   }
}
