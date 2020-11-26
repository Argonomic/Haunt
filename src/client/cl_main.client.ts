import * as u from "shared/sh_utils"
import { CL_CameraSetup } from "client/cl_camera"
import { CL_InputSetup } from "client/cl_input"
import { CL_RoomSetup } from "client/cl_rooms"
import { CL_TasksContentSetup } from "client/content/cl_tasks_content"
import { CL_TasksSetup } from "client/cl_tasks"
import { CL_UISetup } from "client/cl_ui"
import { CL_PlayerSetup } from "client/cl_player"
import { SH_OnPlayerConnectSetup } from "shared/sh_onPlayerConnect"
import { SH_RPCSetup } from "shared/sh_rpc"
import { DoneCreatingNVs, SH_PlayerNetVarsSetup } from "shared/sh_player_netvars"
import { AddGameStateNetVars } from "shared/sh_gamestate"
import { CL_TaskListSetup } from "./cl_taskList"
import { CL_MinimapSetup } from "./cl_minimap"
import { CL_CalloutsSetup } from "./cl_callouts2d"

class File
{
   finishedInit = false
}
let file = new File()

function FinishCheck()
{
   wait()
   u.Assert( file.finishedInit, "Never finished init" )
}
u.Thread( FinishCheck )


SH_RPCSetup()
SH_PlayerNetVarsSetup()
CL_RoomSetup()
CL_TasksSetup()
CL_TasksContentSetup()
CL_CameraSetup()
CL_InputSetup()
CL_PlayerSetup()
AddGameStateNetVars()
CL_UISetup()
CL_MinimapSetup()
CL_TaskListSetup()
CL_CalloutsSetup()

DoneCreatingNVs()
SH_OnPlayerConnectSetup()
file.finishedInit = true