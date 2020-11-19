import * as u from "shared/sh_utils"
import { SH_PlayerSetup } from "shared/sh_player"
import { SH_RPCSetup } from "shared/sh_rpc"
import { SV_RoomsSetup } from "server/sv_rooms";

u.SetServer()
SH_RPCSetup()
SH_PlayerSetup()
SV_RoomsSetup()

