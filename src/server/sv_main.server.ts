import { SetServer, Thread } from "shared/sh_utils";
SetServer()

import { SH_OnPlayerConnectSetup } from "shared/sh_onPlayerConnect"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";
import { SV_GameStateSetup } from "server/sv_gameState";
import { SH_PlayerNetVarsSetup, DoneCreatingNVs } from "shared/sh_player_netvars";
import { Assert, SH_AssertSetup } from "shared/sh_assert"
import { SV_CollisionGroupsSetup } from "server/sv_collisionGroups";
import { SH_UseContentSetup } from "shared/content/sh_use_content";
import { SH_UseSetup } from "shared/sh_use";
import { SV_UseContentSetup } from "./content/sv_use_content";
import { SH_CooldownSetup } from "shared/sh_cooldown";
import { SH_TimeSetup } from "shared/sh_time";
import { SV_AnalyticsSetup } from "./sv_analytics";
import { SV_TasksContentSetup } from "./content/sv_tasks_content";
import { SH_AbilitySetup } from "shared/sh_ability";
import { SH_AbilityContentSetup } from "shared/content/sh_ability_content";
import { SV_AbilityContentSetup } from "./content/sv_ability_content";
import { SH_CoinsSetup } from "shared/sh_coins";
import { SH_PickupsSetup } from "shared/sh_pickups";
import { SV_CoinsSetup } from "./sv_coins";
import { SV_UseSetup } from "./sv_use";
import { SV_PersistenceSetup } from "./sv_persistence";
import { SH_ScoreSetup } from "shared/sh_score";
import { SH_GameStateSetup } from "shared/sh_gamestate";
import { SV_ScoreSetup } from "./sv_score";
import { SH_ReservedServerSetup } from "shared/sh_reservedServer";
import { SV_MatchMakingSetup } from "./sv_matchmaking";
import { SH_UtilsGeometrySetup } from "../shared/sh_utils_geometry";
import { SH_SharedVarSetup } from "shared/sh_sharedVar";
import { SV_PlayerSpawnLocationSetup } from "./sv_playerSpawnLocation";
import { SV_ChatSetup } from "./sv_chat";
import { GAMEMODES, GAME_MODE } from "shared/sh_settings";
import { SV_GameMode_RoundBasedSetup } from "./content/sv_gameMode_roundBased";

class File
{
   finishedInit = false
}
let file = new File()

function FinishCheck()
{
   wait()
   Assert( file.finishedInit, "Server Never finished init" )
}
Thread( FinishCheck )

SH_ReservedServerSetup()
SH_SharedVarSetup()
SH_RPCSetup()
SH_PlayerNetVarsSetup()
SH_UseSetup()
SH_UseContentSetup()
SH_AbilitySetup()
SH_AbilityContentSetup()
SH_CooldownSetup()
SH_TimeSetup()
SH_AssertSetup()
SH_PickupsSetup()
SH_CoinsSetup()
SH_ScoreSetup()
SH_GameStateSetup()

SV_CollisionGroupsSetup()
SV_RoomsSetup()
SV_GameStateSetup()
SV_UseContentSetup()
SV_AnalyticsSetup()
SV_TasksContentSetup()
SV_AbilityContentSetup()
SV_CoinsSetup()
SV_PersistenceSetup()
SV_UseSetup()
SV_ScoreSetup()
SV_MatchMakingSetup()
SV_PlayerSpawnLocationSetup()
SH_UtilsGeometrySetup()
SV_ChatSetup()

switch ( GAME_MODE )
{
   case GAMEMODES.GAMETYPE_ROUNDBASE:
      SV_GameMode_RoundBasedSetup()
      break

   default:
      Assert( false, "No known game mode: " + GAME_MODE )
      break
}

DoneCreatingNVs()
SH_OnPlayerConnectSetup()

file.finishedInit = true
