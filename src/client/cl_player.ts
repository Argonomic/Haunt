import { StarterGui } from "@rbxts/services"
import { IsPracticing } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { SPECTATOR_TRANS } from "shared/sh_settings"
import { GetLocalPlayer, IsAlive, SetPlayerTransparency, Thread } from "shared/sh_utils"
import { GetLocalGame } from "./cl_gamestate"
import { AddPlayerGuiFolderExistsCallback } from "./cl_ui"

export function CL_PlayerSetup()
{
   function DisableResetCostume()
   {
      StarterGui.SetCore( 'ResetButtonCallback', false )
   }

   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      Thread( function ()
      {
         let count = 0
         for ( ; ; )
         {
            wait() // have to do some hand holding to disable the reset character button

            Thread( function ()
            {
               if ( pcall( DisableResetCostume ) )
                  count++
            } )

            print( "StarterGui.SetCore( 'ResetButtonCallback', false ) " + count )
            if ( count )
               return
         }
      } )
   } )

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