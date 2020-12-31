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
import { SharedGameStateInit } from "shared/sh_gamestate"
import { CL_TaskListSetup } from "./cl_taskList"
import { CL_MinimapSetup } from "./cl_minimap"
import { CL_CalloutsSetup } from "./cl_callouts2d"
import { CL_FadeOverlaySetup } from "./cl_fadeoverlay"
import { Thread } from "shared/sh_utils"
import { Assert, SH_AssertSetup } from "shared/sh_assert"
import { CL_UseSetup } from "./cl_use"
import { CL_ReadyUpSetup } from "./cl_readyup"
import { CL_GameStateSetup } from "./cl_gamestate"
import { SH_UseContentSetup } from "shared/content/sh_use_content"
import { SH_UseSetup } from "shared/sh_use"
import { CL_ChatSetup } from "./cl_chat"
import { CL_MeetingSetup } from "./cl_meeting"
import { SH_CooldownSetup } from "shared/sh_cooldown"
import { SH_TimeSetup } from "shared/sh_time"
import { CL_MatchScreenSetup } from "./cl_matchScreen"
import { CL_MatchScreenContentSetup } from "./content/cl_matchScreen_content"
import { CL_Ability_Setup } from "./cl_ability"
import { SH_AbilitySetup } from "shared/sh_ability"
import { SH_AbilityContentSetup } from "shared/content/sh_ability_content"
import { CL_AbilityContentSetup } from "./content/cl_ability_content"
import { SH_CoinsSetup } from "shared/sh_coins"
import { SH_PickupsSetup } from "shared/sh_pickups"

class File
{
   finishedInit = false
}
let file = new File()

function FinishCheck()
{
   wait()
   Assert( file.finishedInit, "Client Never finished init" )
}
Thread( FinishCheck )

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
SharedGameStateInit()

CL_RoomSetup()
CL_TasksSetup()
CL_TasksContentSetup()
CL_CameraSetup()
CL_InputSetup()
CL_PlayerSetup()
DoneCreatingNVs()

CL_UISetup()
CL_MinimapSetup()
CL_TaskListSetup()
CL_CalloutsSetup()
CL_FadeOverlaySetup()
CL_UseSetup()
CL_Ability_Setup()
CL_AbilityContentSetup()
CL_ReadyUpSetup()
CL_GameStateSetup()
CL_ChatSetup()
CL_MeetingSetup()
CL_MatchScreenSetup()
CL_MatchScreenContentSetup()
SH_OnPlayerConnectSetup()

file.finishedInit = true