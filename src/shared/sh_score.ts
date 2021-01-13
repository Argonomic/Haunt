import { GetNetVar_Number } from "./sh_player_netvars";

export const NETVAR_SCORE = "N_SC"
export const NETVAR_STASH = "N_ST"
export const NETVAR_LAST_STASHED = "N_LS"
export const PPRS_COINS = "_COINS"
export const PPRS_PREMATCH_COINS = "_PM_COINS"

export function SH_ScoreSetup()
{
}

export function GetMatchScore( player: Player ): number
{
   return GetNetVar_Number( player, NETVAR_SCORE )
}

export function GetStashScore( player: Player ): number
{
   return GetNetVar_Number( player, NETVAR_STASH )
}

export function GetLastStashed( player: Player ): number
{
   return GetNetVar_Number( player, NETVAR_LAST_STASHED )
}