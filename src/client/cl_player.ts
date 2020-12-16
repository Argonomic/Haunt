import { IsPracticing } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { SPECTATOR_TRANS } from "shared/sh_settings"
import { Assert, GetLocalPlayer, IsAlive, SetPlayerTransparency, Thread } from "shared/sh_utils"
import { GetLocalGame } from "./cl_gamestate"

export function CL_PlayerSetup()
{
   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      Thread( function ()
      {
         if ( player === undefined )
            return

         if ( !IsAlive( player ) )
            return

         let game = GetLocalGame()
         let livingPlayers = game.GetLivingPlayers()
         for ( let living of livingPlayers )
         {
            if ( player === living )
               return
         }

         if ( !game.HasPlayer( player ) )
            return

         let localPlayer = player === GetLocalPlayer()
         if ( localPlayer )
         {
            if ( !IsPracticing( player ) )
               SetPlayerTransparency( player, SPECTATOR_TRANS )
         }
         else
         {
            if ( game.IsSpectator( player ) )
               SetPlayerTransparency( player, 1 ) // need to do this here because this waits until player has a model
         }

         wait() // otherwise fights with other color setters somewhere

         if ( localPlayer )
         {
            if ( !IsPracticing( player ) )
               SetPlayerTransparency( player, SPECTATOR_TRANS )
         }
         else
         {
            if ( game.IsSpectator( player ) )
               SetPlayerTransparency( player, 1 ) // need to do this here because this waits until player has a model
         }
      } )
   } )

}