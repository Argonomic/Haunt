import { SH_OnPlayerConnectSetup } from "shared/sh_onPlayerConnect"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";
import { SV_GameStateSetup } from "server/sv_gameState";
import { SH_PlayerNetVarsSetup, DoneCreatingNVs } from "shared/sh_player_netvars";
import { Assert, SetServer, Thread } from "shared/sh_utils";
import { SV_MatchmakingSetup } from "./sv_matchmaking";
import { SV_CollisionGroupsSetup } from "server/sv_collisionGroups";
import { SH_UseContentSetup } from "shared/content/sh_use_content";
import { SH_UseSetup } from "shared/sh_use";
import { SV_UseContentSetup } from "./content/sv_use_content";
import { SH_CooldownSetup } from "shared/sh_cooldown";
import { SH_TimeSetup } from "shared/sh_time";

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
SH_CooldownSetup()
SH_TimeSetup()

SV_CollisionGroupsSetup()
SV_RoomsSetup()
SV_GameStateSetup()
SV_UseContentSetup()

DoneCreatingNVs()

SV_MatchmakingSetup()



file.finishedInit = true

print( "Server Version 3" )