import { AddNetVar, GetNetVar_Number } from "shared/sh_player_netvars"

export const NETVAR_JSON_TASKLIST = "JS_TL"
export const NETVAR_JSON_PLAYERINFO = "JS_GPI"
export const NETVAR_MATCHMAKING_STATUS = "MMS"
export const NETVAR_MATCHMAKING_NUMWITHYOU = "N_WY"
export const NETVAR_ROLE = "E_RL"

export enum MATCHMAKING_STATUS
{
   MATCHMAKING_PRACTICE = 0,
   MATCHMAKING_LFG,
   MATCHMAKING_PLAYING
}

export enum ROLE
{
   ROLE_CAMPER = 0,
   ROLE_POSSESSED
}

export enum GAME_STATE
{
   GAME_STATE_PREMATCH = 0,
   GAME_STATE_PLAYING,
   GAME_STATE_VOTING,
   GAME_STATE_COMPLETE,
}


export class Assignment
{
   roomName: string
   taskName: string
   status: number

   constructor( roomName: string, taskName: string, status: number )
   {
      this.roomName = roomName
      this.taskName = taskName
      this.status = status
   }
}

// sent to the client and updated on change, even if a player is no longer on the server
export class ClientVisibleGamePlayerInfo
{
   id: number
   costume = 0
   name: string
   evil = false

   constructor( player: Player )
   {
      this.id = player.UserId
      this.name = player.Name
   }
}

export function AddGameStateNetVars()
{
   AddNetVar( "string", NETVAR_JSON_TASKLIST, "{}" )
   AddNetVar( "string", NETVAR_JSON_PLAYERINFO, "{}" )
   AddNetVar( "number", NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
   AddNetVar( "number", NETVAR_MATCHMAKING_NUMWITHYOU, 0 )
   AddNetVar( "number", NETVAR_ROLE, ROLE.ROLE_CAMPER )
}

export function IsPracticing( player: Player ): boolean
{
   let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
   /*
   switch ( status )
   {
      case MATCHMAKING_STATUS.MATCHMAKING_LFG:
         print( "player " + player.Name + " matchmaking status: MATCHMAKING_STATUS.MATCHMAKING_LFG" )
         break
      case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
         print( "player " + player.Name + " matchmaking status: MATCHMAKING_STATUS.MATCHMAKING_PLAYING" )
         break
      case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
         print( "player " + player.Name + " matchmaking status: MATCHMAKING_STATUS.MATCHMAKING_PRACTICE" )
         break
      default:
         print( "unknown status " + status )
         break
   }
   */
   return status === MATCHMAKING_STATUS.MATCHMAKING_PRACTICE
}
