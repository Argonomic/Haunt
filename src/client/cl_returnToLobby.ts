import { GetFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { GetLocalMatch } from "./cl_gamestate";
import { ROLE, NETVAR_JSON_GAMESTATE, IsSpectatorRole, GAME_STATE, SHAREDVAR_GAMEMODE_CANREQLOBBY } from "shared/sh_gamestate";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetSharedVarInt } from "shared/sh_sharedVar";

const LOCAL_PLAYER = GetLocalPlayer()

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
   //toggleButton: ToggleButton | undefined
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

      /*
      let toggleButton = new ToggleButton( frame, 180,
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 0, 0.75 ) }, // hidden
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 1, 0.75 ) }, // visible
      )
      toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )
      toggleButton.button.Position = new UDim2( 0, -5, 0, 0 )
      toggleButton.button.AnchorPoint = new Vector2( 1, 0 )
      file.toggleButton = toggleButton
      toggleButton.SnapClosed()
      */

      frame.Spectate.MouseButton1Click.Connect( function ()
      {
         //toggleButton.Close()
         ReturnToLobbyUI.Enabled = false
      } )

      frame.LeaveMatch.MouseButton1Click.Connect( function ()
      {
         SendRPC_Client( "RPC_FromClient_RequestLobby" )
         ReturnToLobbyUI.Enabled = false
         /*
         toggleButton.Close()
         Thread(
            function ()
            {
               wait( 1 )
               ReturnToLobbyUI.Enabled = false
            } )
            */
      } )

   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.returnToLobbyUI !== undefined )
            file.returnToLobbyUI.Parent = undefined
      } )

   let lastRole = ROLE.ROLE_SPECTATOR_LATE_JOINER
   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         if ( GetSharedVarInt( SHAREDVAR_GAMEMODE_CANREQLOBBY ) !== 1 )
            return

         if ( file.returnToLobbyUI === undefined )
            return
         let ui = file.returnToLobbyUI as Editor_ReturnToLobbyUI

         Thread(
            function ()
            {
               wait() // after it actually state

               let match = GetLocalMatch()
               //print( "PLAYER IS SPECTATOR: " + match.IsSpectator( LOCAL_PLAYER ) )

               let newRole = match.GetPlayerRole( LOCAL_PLAYER )
               //print( "New role: " + newRole + " last role " + lastRole )

               let wasLastRole = lastRole
               lastRole = newRole

               if ( !IsSpectatorRole( newRole ) || match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
               {
                  ui.Enabled = false
                  return
               }

               wait( 4 )

               if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
                  return

               switch ( match.GetPlayerRole( LOCAL_PLAYER ) )
               {
                  case ROLE.ROLE_SPECTATOR_CAMPER:
                  case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
                  case ROLE.ROLE_SPECTATOR_IMPOSTOR:
                     if ( !IsSpectatorRole( wasLastRole ) )
                        ui.Enabled = true
                     break
               }
            } )
      } )
}
