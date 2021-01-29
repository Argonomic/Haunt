import { Workspace } from "@rbxts/services"
import { GetLocalRole, GetLocalMatch } from "client/cl_gamestate"
import { Assert } from "shared/sh_assert"
import { GameModeConsts, SetGameModeConsts } from "shared/sh_gameModeConsts"
import { GAMERESULTS, GAME_STATE, IsCamperRole, IsImpostorRole, Match, PlayerInfo, ROLE } from "shared/sh_gamestate"
import { ClonePlayerModels, GetPlayerFromUserID, PlayerHasClone } from "shared/sh_onPlayerConnect"
import { GetLastStashed } from "shared/sh_score"
import { DEV_SKIP_INTRO, SKIP_INTRO_TIME } from "shared/sh_settings"
import { GetLocalPlayer, WaitThread } from "shared/sh_utils"
import { DrawMatchScreen_Intro, DrawMatchScreen_Victory } from "./cl_matchScreen_content"

const LOCAL_PLAYER = GetLocalPlayer()

export function CL_GameMode_RoundBasedSetup()
{
   SetGameModeConsts( new GameModeConsts(
      GameStateChanged,
      GameStateThink,
      4
   ) )
}

function GameStateThink( match: Match )
{

}

function GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   let newGameState = match.GetGameState()
   print( "\nGAME STATE CHANGED FROM " + oldGameState + " TO " + newGameState )

   // entering this match state
   switch ( newGameState )
   {
      case GAME_STATE.GAME_STATE_INTRO:

         print( "" )
         print( "Entering INTRO at " + Workspace.DistributedGameTime )

         if ( DEV_SKIP_INTRO )
         {
            wait( SKIP_INTRO_TIME )
         }
         else
         {
            let impostors = match.GetImpostors()

            let foundLocalImpostor = false
            if ( impostors.size() )
            {
               for ( let player of impostors )
               {
                  if ( LOCAL_PLAYER === player )
                  {
                     foundLocalImpostor = true
                     break
                  }
               }
               Assert( foundLocalImpostor, "DrawMatchScreen_Intro had impostors players but local player is not impostors" )
            }

            print( "wait for all players loaded at " + Workspace.DistributedGameTime )

            let timeOut = Workspace.DistributedGameTime + 5
            for ( ; ; )
            {
               let allPlayersLoaded = true
               if ( Workspace.DistributedGameTime > timeOut )
                  break

               for ( let player of match.GetAllPlayers() )
               {
                  if ( !PlayerHasClone( player ) )
                  {
                     allPlayersLoaded = false
                     break
                  }
               }
               if ( allPlayersLoaded )
                  break

               wait()
            }

            WaitThread(
               function ()
               {
                  print( "ASD: player count " + match.GetAllPlayerInfo().size() )
                  let playerInfos = match.GetAllPlayerInfo()
                  playerInfos = playerInfos.filter( function ( playerInfo )
                  {
                     return PlayerHasClone( GetPlayerFromUserID( playerInfo._userid ) )
                  } )

                  playerInfos.sort( SortPlayerInfosByLocalAndImpostor )
                  let all: Array<Player> = []
                  for ( let playerInfo of playerInfos )
                  {
                     all.push( GetPlayerFromUserID( playerInfo._userid ) )
                  }

                  let lineup = ClonePlayerModels( all )
                  DrawMatchScreen_Intro( foundLocalImpostor, match.shState.startingImpostorCount, lineup )
               } )
         }

         break

      case GAME_STATE.GAME_STATE_COMPLETE:

         let playerInfos = match.GetAllPlayerInfo()
         let gameResults = match.GetGameResults_NoParityAllowed()

         let score = GetLastStashed( LOCAL_PLAYER )
         let mySurvived = false
         switch ( GetLocalRole() )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_IMPOSTOR:
            case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
               mySurvived = true
               break
         }

         let role = match.GetPlayerRole( LOCAL_PLAYER )
         let localWasInGame = role !== ROLE.ROLE_SPECTATOR_LATE_JOINER
         switch ( gameResults )
         {
            case GAMERESULTS.RESULTS_CAMPERS_WIN:
               WaitThread( function ()
               {
                  let impostorsWin = false
                  let myWinningTeam = IsCamperRole( role ) || role === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED
                  DrawMatchScreen_Victory( playerInfos, impostorsWin, myWinningTeam, mySurvived, score, localWasInGame )
               } )
               break

            case GAMERESULTS.RESULTS_IMPOSTORS_WIN:
               WaitThread( function ()
               {
                  let impostorsWin = true
                  let myWinningTeam = IsImpostorRole( role ) || role === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED
                  DrawMatchScreen_Victory( playerInfos, impostorsWin, myWinningTeam, mySurvived, score, localWasInGame )
               } )
               break
         }
   }
}


function SortPlayerInfosByLocalAndImpostor( a: PlayerInfo, b: PlayerInfo )
{
   if ( a._userid === LOCAL_PLAYER.UserId && b._userid !== LOCAL_PLAYER.UserId )
      return true
   if ( b._userid === LOCAL_PLAYER.UserId && a._userid !== LOCAL_PLAYER.UserId )
      return false

   let match = GetLocalMatch()
   let aImp = match.IsImpostor( GetPlayerFromUserID( a._userid ) )
   let bImp = match.IsImpostor( GetPlayerFromUserID( b._userid ) )
   return aImp && !bImp
}

