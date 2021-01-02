import { Assert } from "./sh_assert";
import { SetNetVar, GetNetVar_Number } from "./sh_player_netvars";
import { IsServer } from "./sh_utils";

export const NETVAR_SCORE = "N_SC"

export function SH_ScoreSetup()
{

}

export function SetScore( player: Player, score: number )
{
   Assert( IsServer(), "IsServer()" )
   SetNetVar( player, NETVAR_SCORE, score )
}

export function ClearScore( player: Player )
{
   Assert( IsServer(), "IsServer()" )
   SetNetVar( player, NETVAR_SCORE, 0 )
}

export function IncrementScore( player: Player, add: number )
{
   print( "IncrementScore: " + player.UserId + " " + add )
   Assert( IsServer(), "IsServer()" )
   let score = GetScore( player )
   score += add
   SetNetVar( player, NETVAR_SCORE, score )
}

export function GetScore( player: Player ): number
{
   return GetNetVar_Number( player, NETVAR_SCORE )
}
