import { MATCHMAKING_STATUS, NETVAR_RENDERONLY_MATCHMAKING_NUMINFO, NETVAR_MATCHMAKING_STATUS } from "shared/sh_gamestate";
import { AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars";
import { GetServerTime } from "shared/sh_time";
import { GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, LoadSound, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

const LOCAL_PLAYER = GetLocalPlayer()
const BEEP = LoadSound( 138081500 )

type EDITOR_GameStartingUI = ScreenGui &
{
   Timer: TextLabel
}

class File
{
   gameStartingUI: EDITOR_GameStartingUI | undefined
   currentUI: EDITOR_GameStartingUI | undefined
   uiFolder: Folder | undefined
}
let file = new File()

export function CL_GameStartingSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.gameStartingUI !== undefined )
         return

      let gameStartingUI = GetExistingFirstChildWithNameAndClassName( folder, 'GameStartingUI', 'ScreenGui' ) as EDITOR_GameStartingUI
      gameStartingUI.Parent = undefined
      gameStartingUI.Enabled = false
      gameStartingUI.DisplayOrder = UIORDER.UIORDER_COUNTDOWN

      file.uiFolder = folder
      file.gameStartingUI = gameStartingUI
   } )

   function DrawCountdown( countdownTime: number )
   {
      print( "DrawCountdown " + countdownTime )
      Thread( function ()
      {
         if ( file.gameStartingUI === undefined )
            return
         if ( file.uiFolder === undefined )
            return
         let gameStartingUI = file.gameStartingUI.Clone()
         gameStartingUI.Enabled = true
         gameStartingUI.Parent = file.uiFolder
         gameStartingUI.Name = "Runtime CountdownUI"
         file.currentUI = gameStartingUI

         countdownTime = math.floor( countdownTime )

         for ( ; ; )
         {
            if ( gameStartingUI !== file.currentUI )
               break

            BEEP.Volume = 0.15
            // another thread started?
            gameStartingUI.Timer.Text = countdownTime + ""
            if ( countdownTime <= 5 )
               BEEP.Play()

            countdownTime--
            if ( countdownTime < 1 )
            {
               gameStartingUI.Destroy()
               file.currentUI = undefined
               return
            }

            wait( 1 )
         }
      } )
   }

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS,
      function ()
      {
         Thread(
            function ()
            {
               wait() // involves multiple netvars, which isn't supported properly
               if ( file.currentUI !== undefined )
               {
                  file.currentUI.Destroy()
                  file.currentUI = undefined
               }

               switch ( GetNetVar_Number( LOCAL_PLAYER, NETVAR_MATCHMAKING_STATUS ) )
               {
                  case MATCHMAKING_STATUS.MATCHMAKING_COUNTDOWN:
                     let time = GetServerTime()
                     let endTime = GetNetVar_Number( LOCAL_PLAYER, NETVAR_RENDERONLY_MATCHMAKING_NUMINFO )
                     let difference = endTime - time
                     if ( difference > 0 )
                        DrawCountdown( difference )
                     break
               }
            } )
      } )

}

