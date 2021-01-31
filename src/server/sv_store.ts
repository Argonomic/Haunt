import { NETVAR_PURCHASED_IMPOSTOR } from "shared/sh_gamestate";
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect";
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars";
import { AddRPC } from "shared/sh_rpc";
import { GetStashScore, PPRS_COINS } from "shared/sh_score";
import { STORE_BUY_IMPOSTOR } from "shared/sh_settings";
import { PPRS_BUYIMPOSTOR } from "./sv_gameState";
import { GetPlayerPersistence_Boolean, IncrementPlayerPersistence, SetPlayerPersistence } from "./sv_persistence";
import { SetStashScore } from "./sv_score";

export function SV_StoreSetup()
{
   AddRPC( "RPC_FromClient_PurchaseImpostor",
      function ( player: Player )
      {
         let score = GetStashScore( player ) - STORE_BUY_IMPOSTOR
         if ( score <= 0 )
            return

         if ( GetPlayerPersistence_Boolean( player, PPRS_BUYIMPOSTOR, GetNetVar_Number( player, NETVAR_PURCHASED_IMPOSTOR ) === 1 ) )
            return

         SetStashScore( player, score )
         SetPlayerPersistence( player, PPRS_BUYIMPOSTOR, true )
         IncrementPlayerPersistence( player, PPRS_COINS, -STORE_BUY_IMPOSTOR )
         SetNetVar( player, NETVAR_PURCHASED_IMPOSTOR, 1 )
      } )

   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         if ( GetPlayerPersistence_Boolean( player, PPRS_BUYIMPOSTOR, GetNetVar_Number( player, NETVAR_PURCHASED_IMPOSTOR ) === 1 ) )
            SetNetVar( player, NETVAR_PURCHASED_IMPOSTOR, 1 )
      } )
}