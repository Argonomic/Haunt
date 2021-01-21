import { GAME_STATE, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, LoadSound, Thread } from "shared/sh_utils";
import { GetLocalMatch } from "./cl_gamestate";
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
   BEEP.Volume = 0.15

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

   function DrawCountdown()
   {
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

         let lastTime = -1
         for ( ; ; )
         {
            let match = GetLocalMatch()
            if ( match.GetGameState() !== GAME_STATE.GAME_STATE_COUNTDOWN )
               break

            let time = math.floor( match.GetTimeRemainingForState() )
            if ( time <= 0 )
               break

            if ( time !== lastTime )
            {
               lastTime = time
               gameStartingUI.Timer.Text = time + ""
               if ( time <= 5 )
                  BEEP.Play()
            }

            wait()
         }

         file.currentUI = undefined
         gameStartingUI.Destroy()
      } )
   }

   /*
   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait() // wait for gamestate to update

               if ( file.currentUI !== undefined )
                  return

               let match = GetLocalMatch()
               if ( match.GetGameState() === GAME_STATE.GAME_STATE_COUNTDOWN )
                  Thread( DrawCountdown )
            } )
      } )
   */
}

