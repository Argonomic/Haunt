import { IsAlive, ArrayRandomize, Thread, Wait } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { GAME_STATE, NETVAR_JSON_ASSIGNMENTS, ROLE, Match, GAMERESULTS, NETVAR_MEETINGS_CALLED, SHAREDVAR_GAMEMODE_CANREQLOBBY, } from "shared/sh_gamestate"
import { SPAWN_ROOM } from "shared/sh_settings"
import { ResetNetVar } from "shared/sh_player_netvars"
import { GetRoomByName } from "../sv_rooms"
import { SpawnRandomCoins } from "server/sv_coins"
import { GetTotalValueOfWorldCoins } from "shared/sh_coins"
import { ScoreToStash } from "../sv_score"
import { DistributePointsToPlayers, ClearAssignments, SetPlayerRole, BecomeSpectator, SetGameState, AssignTasks, GetMatchIndex, PlayerDistributesCoins, DestroyMatch, GetAllPlayersInMatchWithCharacters, PlayerToMatch, GetAllConnectedPlayersInMatch, HandleVoteResults, MatchPutPlayersInRoom, SV_SendRPC } from "../sv_gameState"
import { ResetAllCooldownTimes } from "shared/sh_cooldown"
import { SetSharedVarInt } from "shared/sh_sharedVar"
import { GameModeConsts, GetGameModeConsts, SetGameModeConsts } from "shared/sh_gameModeConsts"

export function SV_GameMode_RoundBasedSetup()
{
   SetGameModeConsts( new GameModeConsts( GameStateChanged, GameStateThink, 4 ) )
   SetSharedVarInt( SHAREDVAR_GAMEMODE_CANREQLOBBY, 1 )
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
         let gameResults = match.GetGameResults_NoParityAllowed()
         print( "GameStateChanged, GAMERESULTS: " + gameResults )
         if ( gameResults !== GAMERESULTS.RESULTS_STILL_PLAYING )
         {
            SetGameState( match, GAME_STATE.GAME_STATE_COMPLETE )
            return
         }
   }

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
      case GAME_STATE.GAME_STATE_INTRO:

         let players = GetAllPlayersInMatchWithCharacters( match )
         match.RemovePlayersNotInList( players ) // remove matchmaking hangeroners

         for ( let player of players )
         {
            Assert( match.GetPlayerRole( player ) !== ROLE.ROLE_SPECTATOR_LATE_JOINER, "Late joiner in intro?" )
         }

         print( "Starting intro" )
         match.shState.dbg_spc = players.size()

         for ( let player of players )
         {
            ResetNetVar( player, NETVAR_JSON_ASSIGNMENTS )
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

         match.shState.startingImpostorCount = impostorCount
         print( "match.shState.startingImpostorCount: " + match.shState.startingImpostorCount )

         for ( let player of impostorPlayers )
         {
            print( player.Name + " to Impostor" )
            SetPlayerRole( match, player, ROLE.ROLE_IMPOSTOR )
            ClearAssignments( match, player )
         }

         for ( let player of setCampers )
         {
            SetPlayerRole( match, player, ROLE.ROLE_CAMPER )
            AssignTasks( player, match )
         }

         for ( let player of players )
         {
            Assert( player.Character !== undefined, "player.Character !== undefined" )
            Assert( ( player.Character as Model ).PrimaryPart !== undefined, "(player.Character as Model).PrimaryPart !== undefined" )
         }

         Assert( match.GetLivingImpostorsCount() > 0, "match.GetLivingImpostorsCount > 0" )
         Assert( match.GetLivingCampersCount() > 1, "match.GetLivingCampers().size > 1" )

         for ( let i = 0; i < players.size(); i++ )
         {
            let playerInfo = match.GetPlayerInfo( players[i] )
            playerInfo.playernum = i
         }
         Thread( function ()
         {
            Wait( 1.5 ) // wait for fade out
            let room = GetRoomByName( SPAWN_ROOM )
            let players = GetAllPlayersInMatchWithCharacters( match )
            MatchPutPlayersInRoom( match, players, room )
         } )

         break


      case GAME_STATE.GAME_STATE_PLAYING:
         match.ClearVotes()

         let livingCampers = match.GetLivingCampersCount()
         if ( match.GetSVState().previouslyLivingCampers === 0 || match.GetSVState().previouslyLivingCampers > livingCampers )
         {
            let toSpawn = 60 + match.GetSVState().roundsPassed * 60
            toSpawn -= GetTotalValueOfWorldCoins( match )
            if ( toSpawn > 0 )
               SpawnRandomCoins( match, toSpawn )

            match.GetSVState().previouslyLivingCampers = livingCampers
            match.GetSVState().roundsPassed++
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
