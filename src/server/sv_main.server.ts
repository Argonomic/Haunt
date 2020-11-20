import * as u from "shared/sh_utils"
import { SH_PlayerSetup } from "shared/sh_player"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";
import { SV_GameStateSetup } from "server/sv_gameState";
import { SH_PlayerNetVarsSetup, DoneCreatingNVs } from "shared/sh_player_netvars";


u.SetServer()
SH_RPCSetup()
SH_PlayerNetVarsSetup()
SH_PlayerSetup()
SV_RoomsSetup()
SV_GameStateSetup()

DoneCreatingNVs()
