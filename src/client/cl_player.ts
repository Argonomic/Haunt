import { Players } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { SPECTATOR_TRANS } from "shared/sh_settings"
import { IsAlive, SetPlayerTransparencyAndColor, Thread } from "shared/sh_utils"
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

         if ( player === Players.LocalPlayer )
            SetPlayerTransparencyAndColor( player, SPECTATOR_TRANS, new Color3( 1, 0, 0 ) )
         else
            SetPlayerTransparencyAndColor( player, 1, new Color3( 0, 1, 0 ) )

         wait() // otherwise fights with other color setters somewhere
         if ( player === Players.LocalPlayer )
            SetPlayerTransparencyAndColor( player, SPECTATOR_TRANS, new Color3( 1, 0, 0 ) )
         else
            SetPlayerTransparencyAndColor( player, 1, new Color3( 0, 1, 0 ) )
      } )
   } )

}