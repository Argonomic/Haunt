import { Assert } from "shared/sh_assert"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { SetNetVar } from "shared/sh_player_netvars"
import { GetMatchScore, GetStashScore, NETVAR_LAST_STASHED, NETVAR_SCORE, NETVAR_STASH, PPRS_COINS } from "shared/sh_score"
import { IsServer } from "shared/sh_utils"
import { GetPlayerPersistence_Number, IncrementPlayerPersistence } from "./sv_persistence"

export function SV_ScoreSetup()
{
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      let coins = GetPlayerPersistence_Number( player, PPRS_COINS, 0 )
      SetStashScore( player, coins )
   } )
}

export function ClearMatchScore( player: Player )
{
   print( "PPRS_PREMATCH_COINS ScoreToStash " + player.Name )
   Assert( IsServer(), "IsServer()" )
   SetNetVar( player, NETVAR_SCORE, 0 )
}

export function IncrementMatchScore( player: Player, add: number )
{
   Assert( IsServer(), "IsServer()" )
   let score = GetMatchScore( player )
   score += add
   print( "PPRS_PREMATCH_COINS IncrementMatchScore " + player.Name + ", " + score )
   SetNetVar( player, NETVAR_SCORE, score )
}

export function SetStashScore( player: Player, score: number )
{
   Assert( IsServer(), "IsServer()" )
   SetNetVar( player, NETVAR_STASH, score )
}

export function ScoreToStash( player: Player )
{
   print( "PPRS_PREMATCH_COINS ScoreToStash " + player.Name )
   let score = GetMatchScore( player )
   SetNetVar( player, NETVAR_LAST_STASHED, score )
   ClearMatchScore( player )
   IncrementPlayerPersistence( player, PPRS_COINS, score )
   SetStashScore( player, GetStashScore( player ) + score )
}
