export const DEV_STARTMEETING = false
export const DEV_READYUP = true
export const MIN_PLAYERS = 5
export const MAX_PLAYERS = 10
export const MAX_TASKLIST_SIZE = 5
export const QUICK_START_ROOM = "Foyer"
export const SPAWN_ROOM = "Foyer"
export const KILL_DIST = 6.5
export const REPORT_DIST = 5
export const MEETING_DISCUSS_TIME = 5

export let MEETING_VOTE_TIME = 60
if ( DEV_STARTMEETING )
   MEETING_VOTE_TIME = 6000

export const SPECTATOR_TRANS = 0.6

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


export const COOLDOWN_KILL = 8
