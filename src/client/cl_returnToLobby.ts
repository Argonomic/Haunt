import { GetFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { GetLocalGame } from "./cl_gamestate";
import { ROLE, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { SendRPC } from "./cl_utils";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";

type Editor_ReturnToLobbyUI = ScreenGui &
{
   Frame: Frame &
   {
      LeaveMatch: TextButton
      Spectate: TextButton
   }
}

class File
{
   returnToLobbyUI: Editor_ReturnToLobbyUI | undefined
   toggleButton: ToggleButton | undefined
   displayedReturnToQueue = false
}

let file = new File()

export function CL_ReturnToLobbySetup()
{
   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.returnToLobbyUI !== undefined )
      {
         file.returnToLobbyUI.Parent = gui
         return
      }

      let ReturnToLobbyUI = GetFirstChildWithNameAndClassName( gui, 'ReturnToLobbyUI', 'ScreenGui' ) as Editor_ReturnToLobbyUI
      ReturnToLobbyUI.Enabled = false
      ReturnToLobbyUI.DisplayOrder = UIORDER.UIORDER_RETURN_TO_LOBBY

      file.returnToLobbyUI = ReturnToLobbyUI

      let frame = ReturnToLobbyUI.Frame

      let toggleButton = new ToggleButton( frame, 180,
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 0, 0.75 ) }, // hidden
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 1, 0.75 ) }, // visible
      )
      toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )
      toggleButton.button.Position = new UDim2( 0, -5, 0, 0 )
      toggleButton.button.AnchorPoint = new Vector2( 1, 0 )
      file.toggleButton = toggleButton
      toggleButton.SnapClosed()

      frame.Spectate.MouseButton1Click.Connect( function ()
      {
         toggleButton.Close()
      } )

      frame.LeaveMatch.MouseButton1Click.Connect( function ()
      {
         SendRPC( "RPC_FromClient_RequestLobby" )
      } )

   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.returnToLobbyUI !== undefined )
            file.returnToLobbyUI.Parent = undefined
      } )

   let game = GetLocalGame()
   let player = GetLocalPlayer()

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait() // after it actually state

               wait( 4 )
               if ( game.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
               {
                  DisplayReturnToLobby()
                  return
               }

               if ( game.IsSpectator( player ) )
               {
                  DisplayReturnToLobby()
                  return
               }
            } )
      } )
}


function DisplayReturnToLobby()
{
   if ( file.displayedReturnToQueue )
      return
   file.displayedReturnToQueue = true // don't make it keep popping out

   Thread(
      function ()
      {
         let toggleButton = file.toggleButton
         if ( toggleButton === undefined )
            return

         let ui = file.returnToLobbyUI
         if ( ui === undefined )
            return

         wait( 4 )

         ui.Enabled = true

         wait() // doesn't open without
         if ( !toggleButton.EverClicked() )
            toggleButton.Open()
      } )
}
