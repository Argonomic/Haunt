import * as u from "shared/sh_utils"
import { CL_CameraSetup } from "client/cl_camera"
import { CL_InputSetup } from "client/cl_input"
import { CL_RoomSetup } from "client/cl_rooms"
import { CL_TasksContentSetup } from "client/content/cl_tasks_content"
import { CL_TasksSetup } from "client/cl_tasks"
import { CL_UISetup } from "client/cl_ui"
import { CL_PlayerSetup } from "client/cl_player"
import { SH_PlayerSetup } from "shared/sh_player"
import { SH_RPCSetup } from "shared/sh_rpc"
import { DoneCreatingNVs, SH_PlayerNetVarsSetup } from "shared/sh_player_netvars"
import { AddGameStateNetVars } from "shared/sh_gamestate"

u.Thread( SH_RPCSetup )
u.Thread( SH_PlayerNetVarsSetup )
u.Thread( CL_RoomSetup )
u.Thread( CL_TasksSetup )
u.Thread( CL_TasksContentSetup )
u.Thread( CL_CameraSetup )
u.Thread( CL_InputSetup )
u.Thread( CL_PlayerSetup )
u.Thread( SH_PlayerSetup )
AddGameStateNetVars()
u.Thread( CL_UISetup )

DoneCreatingNVs()
