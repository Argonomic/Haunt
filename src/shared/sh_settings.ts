import { RunService } from "@rbxts/services"
const LOCAL = RunService.IsStudio()

export const DEV_SKIP_INTRO = LOCAL && true
export const DEV_1_TASK = LOCAL && true

// MATCHMAKING
export const MATCHMAKE_SERVER_VERSION = 1
export const MATCHMAKE_PLAYERCOUNT_FALLBACK = 3
export const MATCHMAKE_PLAYERCOUNT_STARTSERVER = 4

export const MATCHMAKE_PLAYER_CAN_MATCHMAKE_TIME = 10
export const MATCHMAKE_PLAYER_WAITING_FOR_FRIEND_TIME = 45
export const MATCHMAKE_PLAYER_OPENED_FRIEND_INVITE = 15
export const START_COUNTDOWN = 7
export const RESERVEDSERVER_WAITS_FOR_PLAYERS = 10

// POINTS
export const COIN_VALUE_SILVER = 1
export const COIN_VALUE_GOLD = 10
export const COIN_VALUE_GEM = 50
export const TASK_VALUE = 10

// IN GAME
export const MAX_TASKLIST_SIZE = 10
export const INTRO_TIME = 10
export const SKIP_INTRO_TIME = 2
export const PLAYER_WALKSPEED = 16 // * 2.5
export const PLAYER_WALKSPEED_SPECTATOR = 16 * 1.333
export const SPAWN_ROOM = "Foyer"
export const KILL_DIST = 6.5
export const REPORT_DIST = 5
export const MEETING_VOTE_TIME = 60
export const SUDDEN_DEATH_TIME = 90
export const SPECTATOR_TRANS = 0.6

export let MEETING_DISCUSS_TIME = 14
export let COOLDOWNTIME_KILL = 45
export let COOLDOWNTIME_SABOTAGE_LIGHTS = 70
export let COOLDOWNTIME_MEETING = 20

if ( DEV_SKIP_INTRO )
{
   COOLDOWNTIME_KILL = 0
   COOLDOWNTIME_SABOTAGE_LIGHTS = 4
   COOLDOWNTIME_MEETING = 0
   MEETING_DISCUSS_TIME = 2
}

export const PLAYER_COLORS =
   [
      new Color3( 39 / 256, 115 / 256, 255 / 256 ), // blue
      new Color3( 255 / 256, 0 / 256, 0 / 256 ), // red
      new Color3( 85 / 256, 255 / 256, 127 / 256 ), // green
      new Color3( 255 / 256, 255 / 256, 0 / 256 ), // yellow
      new Color3( 255 / 256, 150 / 256, 29 / 256 ), // orange
      new Color3( 255 / 256, 85 / 256, 255 / 256 ), // pink
      new Color3( 85 / 256, 255 / 256, 255 / 256 ), // teal
      new Color3( 163 / 256, 85 / 256, 34 / 256 ), // brown
      new Color3( 1 / 256, 1 / 256, 1 / 256 ), // white
      new Color3( 135 / 256, 135 / 256, 135 / 256 ), // gray
   ]

export const ADMINS = ["Argonomic", "ArgonomicDev"]

print( "SRV1" )