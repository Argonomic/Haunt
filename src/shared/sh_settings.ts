import { RunService } from "@rbxts/services"

export const TEST = ( RunService.IsStudio() || game.PlaceId === 5954656113 ) && true

export enum GAMEMODES
{
   MODE_ROUNDBASED = 0,
   MODE_PERSISTENT,
}
export const GAME_MODE: GAMEMODES = GAMEMODES.MODE_ROUNDBASED

export const DEV_SKIP_INTRO = TEST && false
export const DEV_1_TASK = TEST && true
export let DEV_FAST_TIMERS: boolean = TEST && true

// MATCHMAKING
export const MATCHMAKE_SERVER_VERSION = 1
export let MATCHMAKE_PLAYERCOUNT_STARTSERVER = 50

export const MATCHMAKE_PLAYER_CAN_MATCHMAKE_TIME = 1
export const MATCHMAKE_PLAYER_WAITING_FOR_FRIEND_TIME = 45
export const MATCHMAKE_PLAYER_OPENED_FRIEND_INVITE = 30

export let START_COUNTDOWN = 31
if ( TEST )
   START_COUNTDOWN = 10

export const RESERVEDSERVER_WAITS_FOR_PLAYERS = 10

// POINTS
export const COIN_VALUE_SILVER = 1
export const COIN_VALUE_GOLD = 10
export const COIN_VALUE_GEM = 50
export const TASK_VALUE = 10

// IN GAME
export const MIN_TASKLIST_SIZE = 6
export const MAX_TASKLIST_SIZE = 10
export const INTRO_TIME = 10
export const SKIP_INTRO_TIME = 2
export const PLAYER_WALKSPEED = 16 * 1.05 // * 2.5
export const PLAYER_WALKSPEED_SPECTATOR = 16 * 1.5
export const SPAWN_ROOM = "Foyer"
export const KILL_DIST = 6.5
export const REPORT_DIST = 5
export const MEETING_VOTE_TIME = 35
export const MEETING_VOTE_RESULTS = 8
export const SUDDEN_DEATH_TIME = 90
export const SPECTATOR_TRANS = 0.4 // 0.6
export const STORE_BUY_IMPOSTOR = 250
export const DETECTIVE_BONUS = 500

export let MEETING_DISCUSS_TIME = 0
export let COOLDOWNTIME_SABOTAGE_LIGHTS = 70
export let COOLDOWNTIME_IMPOSTOR_HIT_KILL = 5 // an impostor hits another impostor and gets a lower kill cooldown

if ( DEV_FAST_TIMERS )
{
   COOLDOWNTIME_SABOTAGE_LIGHTS = 6
   MEETING_DISCUSS_TIME = 2
   START_COUNTDOWN = 8
   print( "********** DEV_FAST_TIMERS ***********" )
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

print( "SRV 2.3.21 2.6" )
print( " " )
