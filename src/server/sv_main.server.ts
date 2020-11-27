import { SH_OnPlayerConnectSetup } from "shared/sh_onPlayerConnect"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";
import { SV_GameStateSetup } from "server/sv_gameState";
import { SH_PlayerNetVarsSetup, DoneCreatingNVs } from "shared/sh_player_netvars";
import { Assert, SetServer, Thread } from "shared/sh_utils";

class File
{
   finishedInit = false
}
let file = new File()

function FinishCheck()
{
   wait()
   Assert( file.finishedInit, "Never finished init" )
}
Thread( FinishCheck )


SetServer()
SH_RPCSetup()
SH_PlayerNetVarsSetup()
SH_OnPlayerConnectSetup()
SV_RoomsSetup()
SV_GameStateSetup()

DoneCreatingNVs()

file.finishedInit = true