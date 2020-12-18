export const DEV_SKIP = false
export const DEV_READYUP = false

export const MATCHMAKE_PLAYERCOUNT_FALLBACK = 10
export const MATCHMAKE_PLAYERCOUNT = 10
export const MAX_FRIEND_WAIT_TIME = 20

export const PLAYER_WALKSPEED = 16 * 1.0
export const MAX_TASKLIST_SIZE = 7
export const QUICK_START_ROOM = "Foyer"
export const SPAWN_ROOM = "Foyer"
export const KILL_DIST = 6.5
export const REPORT_DIST = 5
export const MEETING_DISCUSS_TIME = 5
export const MEETING_VOTE_TIME = 60
export const SPECTATOR_TRANS = 0.6

export let COOLDOWNTIME_KILL = 30

if ( DEV_SKIP )
   COOLDOWNTIME_KILL = 0

export let COOLDOWNTIME_MEETING = 20
if ( DEV_SKIP )
   COOLDOWNTIME_MEETING = 0

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


