import { IsAlive, Thread, Wait } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { GAME_STATE, ROLE, Match, GAMERESULTS } from "shared/sh_gamestate"
import { MATCHMAKE_PLAYERCOUNT_STARTSERVER } from "shared/sh_settings"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { ScoreToStash } from "../sv_score"
import { DistributePointsToPlayers, ClearAssignments, SetPlayerRole, BecomeSpectator, SetGameState, GetMatchIndex, PlayerDistributesCoins, DestroyMatch, GetAllPlayersInMatchWithCharacters, PlayerToMatch, GetAllConnectedPlayersInMatch, HandleVoteResults, AddPlayer, GetMatches, CreateMatch, SV_SendRPC, UpdateGame, StartMatchWithNormalImpostorsAndCampers } from "../sv_gameState"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"
import { SetSharedVarInt } from "shared/sh_sharedVar"
import { GetGameModeConsts, SetGameModeConsts } from "shared/sh_gameModeConsts"
import { CreateGameModeConsts } from "shared/content/sh_gameModeConsts_content"


export function SV_GameMode_RoundBasedSetup()
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

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         if ( match.GetGameResults_NoParityAllowed() !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break

      case GAME_STATE.GAME_STATE_PLAYING:
         switch ( match.GetGameResults_ParityAllowed() )
         {
            case GAMERESULTS.RESULTS_STILL_PLAYING:
               break

            case GAMERESULTS.RESULTS_SUDDEN_DEATH:
               SetGameState( match, GAME_STATE.GAME_STATE_SUDDEN_DEATH )
               return

            default:
               SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
               return
         }
         break

      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( match.GetGameResults_ParityAllowed() !== GAMERESULTS.RESULTS_SUDDEN_DEATH )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
         break
   }

   Assert( debugState === match.GetGameState(), "1 Did not RETURN after SETGAMESTATE" )



}

function GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   let minPlayersToStartGame = GetGameModeConsts().minPlayersToStartGame
   // leaving this match state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INTRO:
         if ( GetAllPlayersInMatchWithCharacters( match ).size() < minPlayersToStartGame || match.GetLivingImpostorsCount() <= 0 )
         {
            print( "Failed to leave intro:" )
            print( "GetAllPlayersInMatchWithCharacters(match).size(): " + GetAllPlayersInMatchWithCharacters( match ).size() )
            print( "minPlayersToStartGame: " + minPlayersToStartGame )
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
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "GameStateChanged, GAMERESULTS: " + gameResults )
         if ( gameResults !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
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

         let livingCampers = match.GetLivingCampersCount()
         if ( match.GetSVState().previouslyLivingCampers === 0 || match.GetSVState().previouslyLivingCampers > livingCampers )
         {
            let toSpawn = 60 + match.shState.roundNum * 60
            toSpawn -= GetTotalValueOfWorldCoins( match )
            if ( toSpawn > 0 )
               SpawnRandomCoins( match, toSpawn )

            match.GetSVState().previouslyLivingCampers = livingCampers
            match.shState.roundNum++
         }

         for ( let player of GetAllConnectedPlayersInMatch( match ) )
         {
            SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
            ResetAllCooldownTimes( player )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         HandleVoteResults( match )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "Match Complete. Match results: " + gameResults )
         print( "Impostors: " + match.GetLivingImpostorsCount() )
         print( "Campers: " + match.GetLivingCampersCount() )

         for ( let player of GetAllConnectedPlayersInMatch( match ) )
         {
            ClearAssignments( match, player )
            if ( !IsAlive( player ) )
               continue

            //KillPlayer( player )
            SV_SendRPC( "RPC_FromServer_CancelTask", match, player )
         }

         {
            let players: Array<Player> = []
            switch ( gameResults ) 
            {
               case GAMERESULTS.RESULTS_IMPOSTORS_WIN:
                  players = match.GetLivingCampers()
                  break

               case GAMERESULTS.RESULTS_CAMPERS_WIN:
                  players = match.GetLivingImpostors()
                  break
            }
            for ( let player of players )
            {
               BecomeSpectator( player, match )
               if ( PlayerToMatch( player ) === match )
                  PlayerDistributesCoins( player, match )
            }

            DistributePointsToPlayers( match.GetLivingPlayers(), GetTotalValueOfWorldCoins( match ) )

            for ( let player of match.GetLivingPlayers() )
            {
               ScoreToStash( player )
            }
         }

         Thread(
            function ()
            {
               Wait( 10 ) // watch ending
               DestroyMatch( match )
            } )
         break
   }
}


function FindMatchForPlayer( player: Player )
{
   print( "FindMatchForPlayer for " + player.Name ) // + " " + debug.traceback() )
   // any matches waiting for players?
   for ( let match of GetMatches() )
   {
      if ( match.GetGameState() > GAME_STATE.GAME_STATE_COUNTDOWN )
         continue
      if ( GetAllConnectedPlayersInMatch( match ).size() >= MATCHMAKE_PLAYERCOUNT_STARTSERVER )
         continue

      AddPlayer( match, player )
      SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
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

