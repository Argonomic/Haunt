import { Assert } from "shared/sh_assert"
import { GAME_STATE, ROLE, Match, IsCamperRole, IsSpectatorRole, } from "shared/sh_gamestate"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { SetPlayerRole, SetGameState, GetMatchIndex, DestroyMatch, GetAllPlayersInMatchWithCharacters, GetAllConnectedPlayersInMatch, HandleVoteResults, AddPlayer, GetMatches, CreateMatch, SV_SendRPC, UpdateGame, StartMatchWithNormalImpostorsAndCampers, AssignTasks, GiveExitTask, MatchPutPlayersInRoom } from "../sv_gameState"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"
import { GetGameModeConsts, SetGameModeConsts } from "shared/sh_gameModeConsts"
import { CreateGameModeConsts } from "shared/content/sh_gameModeConsts_content"
import { GetCurrentRoom, PlayerHasCurrentRoom } from "server/sv_rooms"

export function SV_GameMode_PersistentSetup()
{
   let gmc = CreateGameModeConsts()
   gmc.gameStateChanged = GameStateChanged
   gmc.gameStateThink = GameStateThink
   gmc.svFindMatchForPlayer = FindMatchForPlayer

   SetGameModeConsts( gmc )
}

function GameStateThink( match: Match )
{
   let debugState = match.GetGameState()
   //print( "GameStateThink match:" + GetMatchIndex( match ) + " gamestate:" + debugState )
   // quick check on whether or not match is even still going
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
         SetGameState( match, GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS )
         return

   }

   Assert( debugState === match.GetGameState(), "1 Did not RETURN after SETGAMESTATE" )
}

function GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   let MATCHMAKE_PLAYERCOUNT_MINPLAYERS = GetGameModeConsts().MATCHMAKE_PLAYERCOUNT_MINPLAYERS
   // leaving this match state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INTRO:
         if ( GetAllPlayersInMatchWithCharacters( match ).size() < MATCHMAKE_PLAYERCOUNT_MINPLAYERS || match.GetLivingImpostorsCount() <= 0 )
         {
            print( "Failed to leave intro:" )
            print( "GetAllPlayersInMatchWithCharacters(match).size(): " + GetAllPlayersInMatchWithCharacters( match ).size() )
            print( "MATCHMAKE_PLAYERCOUNT_MINPLAYERS: " + MATCHMAKE_PLAYERCOUNT_MINPLAYERS )
            print( "match.GetLivingImpostorsCount(): " + match.GetLivingImpostorsCount() )
            print( "match.shState.startingImpostorCount: " + match.shState.startingImpostorCount )
            // players left during intro
            DestroyMatch( match )
            return
         }
         break
   }

   print( "Match " + GetMatchIndex( match ) + " entering GameState " + match.GetGameState() )
   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         if ( GetAllConnectedPlayersInMatch( match ).size() < 4 )
         {
            DestroyMatch( match )
            return
         }

         break
   }


   // entering this match state
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INTRO:
         StartMatchWithNormalImpostorsAndCampers( match )
         break


      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let toSpawn = 100 + match.shState.roundNum * 60
         toSpawn -= GetTotalValueOfWorldCoins( match )
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

function FindMatchForPlayer( player: Player )
{
   print( "FindMatchForPlayer for " + player.Name ) // + " " + debug.traceback() )
   // any matches waiting for players?
   for ( let match of GetMatches() )
   {
      let role = ROLE.ROLE_CAMPER
      for ( let otherPlayer of match.GetAllPlayers() )
      {
         if ( player.UserId !== otherPlayer.UserId )
            continue

         role = match.GetPlayerRole( otherPlayer )

         if ( PlayerHasCurrentRoom( otherPlayer ) )
         {
            let room = GetCurrentRoom( otherPlayer )
            MatchPutPlayersInRoom( match, [player], room )
         }
         break
      }

      AddPlayer( match, player )

      SetPlayerRole( match, player, role )
      if ( !IsSpectatorRole( role ) )
      {
         if ( IsCamperRole( role ) )
            AssignTasks( match, player )
         else
            GiveExitTask( match, player )
      }

      UpdateGame( match )
      return
   }

   print( "%%%%%% 2 Creating new match" )
   // make a new match
   let match = CreateMatch()
   AddPlayer( match, player )
   SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
   UpdateGame( match )
}


/*
Flow:
start as innocent in foyer
complete all tasks
you become an impostor immediately

Details:
Dead player is a spectator until they
   or for 30 seconds?
   or corpse run?
   or run to foyer?
   all tasks reset?

Players can call a meeting 1 time
   60 second coolup

corpses fade after 60 seconds
impostors can two shot each other
   kill still has 30 second cooldown
   both players are pushed away from each other
   impostors dont leave a corpse

How do impostors get their money out?
   Get exit task?

*/