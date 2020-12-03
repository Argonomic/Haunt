import { Players } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
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
      if ( player === Players.LocalPlayer )
         return

      Thread( function ()
      {
         wait() // otherwise fights with other color setters somewhere
         if ( player === undefined )
            return

         if ( !IsAlive( player ) )
            return

         //print( "AddCallback_OnPlayerCharacterAdded " + player.Name )
         let livingPlayers = GetLocalGame().GetLivingPlayers()
         for ( let living of livingPlayers )
         {
            if ( player === living )
            {
               //print( player.Name + " is in my game" )
               return
            }
         }

         //print( player.Name + " is NOT in my game" )
         SetPlayerTransparencyAndColor( player, 1, new Color3( 0, 1, 0 ) )
      } )
   } )

}