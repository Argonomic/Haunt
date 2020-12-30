import { SH_OnPlayerConnectSetup } from "shared/sh_onPlayerConnect"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";
import { SV_GameStateSetup } from "server/sv_gameState";
import { SH_PlayerNetVarsSetup, DoneCreatingNVs } from "shared/sh_player_netvars";
import { SetServer, Thread } from "shared/sh_utils";
import { Assert, SH_AssertSetup } from "shared/sh_assert"

import { SV_MatchmakingSetup } from "./sv_matchmaking";
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


SetServer()

SH_RPCSetup()
SH_PlayerNetVarsSetup()
SH_OnPlayerConnectSetup()
SH_UseSetup()
SH_UseContentSetup()
SH_AbilitySetup()
SH_AbilityContentSetup()
SH_CooldownSetup()
SH_TimeSetup()
SH_AssertSetup()

SV_CollisionGroupsSetup()
SV_RoomsSetup()
SV_GameStateSetup()
SV_UseContentSetup()
SV_AnalyticsSetup()
SV_TasksContentSetup()
SV_AbilityContentSetup()

DoneCreatingNVs()

SV_MatchmakingSetup()


file.finishedInit = true

print( "Server Version 4" )