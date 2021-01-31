import { Assert } from "shared/sh_assert";
import { GameModeConsts } from "shared/sh_gameModeConsts";
import { DEV_FAST_TIMERS, GAMEMODES, GAME_MODE } from "shared/sh_settings";

export function CreateGameModeConsts(): GameModeConsts
{
   let gmc = new GameModeConsts()
   switch ( GAME_MODE )
   {
      case GAMEMODES.MODE_ROUNDBASED:
         gmc.MATCHMAKE_PLAYERCOUNT_MINPLAYERS = 4
         gmc.completeTasksBecomeImpostor = false
         gmc.hasPlayerNumber = true
         gmc.hasCorpses = true
         gmc.canKillImpostors = true
         gmc.canPurchaseImpostor = true
         gmc.lastImpostorStanding = true
         gmc.suddenDeath = false
         break

      case GAMEMODES.MODE_PERSISTENT:
         gmc.MATCHMAKE_PLAYERCOUNT_MINPLAYERS = 4
         gmc.completeTasksBecomeImpostor = true
         gmc.hasPlayerNumber = false
         gmc.hasCorpses = true
         gmc.corpseTimeout = 10
         gmc.canKillImpostors = true
         gmc.spectatorDeathRun = true
         gmc.meetingCooldown = 120
         gmc.cooldownKill = 30
         break

      default:
         Assert( false, "No known game mode: " + GAME_MODE )
         break
   }

   if ( DEV_FAST_TIMERS )
   {
      gmc.meetingCooldown = 5
      gmc.cooldownKill = 0
   }

   return gmc
}