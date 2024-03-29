import { StarterGui } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { SPECTATOR_TRANS } from "shared/sh_settings"
import { GetLocalPlayer, SetPlayerTransparency, Thread } from "shared/sh_utils"
import { GetLocalMatch } from "./cl_localMatch"
import { AddPlayerGuiFolderExistsCallback } from "./cl_ui"

const LOCAL_PLAYER = GetLocalPlayer()

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

            if ( count )
               return
         }
      } )
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( player !== LOCAL_PLAYER )
         return

      Thread( function ()
      {
         for ( let i = 0; i < 2; i++ ) 
         {
            wait() // otherwise fights with other color setters somewhere
            if ( player.Character === undefined )
               return

            let match = GetLocalMatch()
            if ( match.IsSpectator( player ) )
               SetPlayerTransparency( player, SPECTATOR_TRANS )
         }
      } )
   } )

}