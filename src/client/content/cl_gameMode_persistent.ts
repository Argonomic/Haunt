import { Workspace } from "@rbxts/services"
import { GetLocalMatch } from "client/cl_gamestate"
import { CreateGameModeConsts } from "shared/content/sh_gameModeConsts_content"
import { Assert } from "shared/sh_assert"
import { SetGameModeConsts } from "shared/sh_gameModeConsts"
import { AddRoleChangeCallback, GAME_STATE, IsCamperRole, IsImpostorRole, IsSpectatorRole, Match, PlayerInfo, ROLE } from "shared/sh_gamestate"
import { ClonePlayerModels, GetPlayerFromUserID, PlayerHasClone } from "shared/sh_onPlayerConnect"
import { DEV_SKIP_INTRO, SKIP_INTRO_TIME } from "shared/sh_settings"
import { GetLocalPlayer, Thread, WaitThread } from "shared/sh_utils"
import { DrawMatchScreen_BecameImpostor, DrawMatchScreen_Intro } from "./cl_matchScreen_content"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   drewIntro = false
}
let file = new File()

export function CL_GameMode_PersistentSetup()
{
   let gmc = CreateGameModeConsts()
   gmc.gameStateChanged = GameStateChanged
   gmc.gameStateThink = GameStateThink

   SetGameModeConsts( gmc )

   let lastRole = ROLE.ROLE_CAMPER
   AddRoleChangeCallback( function ( player: Player, match: Match )
   {
      if ( player !== LOCAL_PLAYER )
         return
      let wasLastRole = lastRole
      let newRole = match.GetPlayerRole( player )
      lastRole = newRole

      if ( IsSpectatorRole( wasLastRole ) && !IsSpectatorRole( newRole ) )
      {
         file.drewIntro = false
         return
      }

      if ( GetLocalMatch().GetGameState() >= GAME_STATE.GAME_STATE_MEETING_DISCUSS )
      {
         if ( IsCamperRole( wasLastRole ) && IsImpostorRole( newRole ) )
         {
            Thread( DrawMatchScreen_BecameImpostor )
         }
      }
   } )
}

function GameStateThink( match: Match )
{
   if ( !file.drewIntro )
   {
      WaitThread( DrawIntro )
      file.drewIntro = true
   }
}

function GameStateChanged( match: Match, oldGameState: GAME_STATE )
{
   //let newGameState = match.GetGameState()
   //print( "\nGAME STATE CHANGED FROM " + oldGameState + " TO " + newGameState )
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


function DrawIntro()
{
   let match = GetLocalMatch()
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
            let isDetective = match.IsDetective( LOCAL_PLAYER )
            DrawMatchScreen_Intro( foundLocalImpostor, match.shState.startingImpostorCount, lineup, isDetective )
         } )
   }
}