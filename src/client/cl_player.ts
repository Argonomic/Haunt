import { IsPracticing } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { SPECTATOR_TRANS } from "shared/sh_settings"
import { GetLocalPlayer, IsAlive, SetPlayerTransparency, Thread } from "shared/sh_utils"
import { GetLocalGame } from "./cl_gamestate"

class File
{
}

let file = new File()

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

         let livingPlayers = GetLocalGame().GetLivingPlayers()
         for ( let living of livingPlayers )
         {
            if ( player === living )
               return
         }

         if ( player === GetLocalPlayer() )
         {
            if ( !IsPracticing( player ) )
            {
               SetPlayerTransparency( player, SPECTATOR_TRANS )
            }
         }
         else
         {
            SetPlayerTransparency( player, 1 )
         }

         wait() // otherwise fights with other color setters somewhere
         if ( player === GetLocalPlayer() )
         {
            if ( !IsPracticing( player ) )
            {
               SetPlayerTransparency( player, SPECTATOR_TRANS )
            }
         }
         else
         {
            SetPlayerTransparency( player, 1 )
         }
      } )
   } )

}