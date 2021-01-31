import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { FilterHasCharacters, GetFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { SocialService } from "@rbxts/services";
import { GAME_STATE, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate";
import { GetLocalMatch } from "./cl_gamestate";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetMinPlayersForGame } from "shared/sh_gameModeConsts";

const LOCAL_PLAYER = GetLocalPlayer()

type Editor_WaitingToStartUI = ScreenGui &
{
   Frame: Frame &
   {
      InfoFrame: Frame &
      {
         Status: TextLabel
      }

      FriendsButton: TextButton
   }
}

class File
{
   waitingStart: Editor_WaitingToStartUI | undefined
   toggleButton: ToggleButton | undefined
   displayedReturnToQueue = false
   displayedReadyUp = false
}

let file = new File()

export function CL_WaitingStartSetup()
{
   let localPlayer = GetLocalPlayer()

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.waitingStart !== undefined )
      {
         file.waitingStart.Parent = gui
         return
      }

      let waitingUI = GetFirstChildWithNameAndClassName( gui, 'WaitingStartUI', 'ScreenGui' ) as Editor_WaitingToStartUI
      waitingUI.Enabled = false
      waitingUI.DisplayOrder = UIORDER.UIORDER_READY

      file.waitingStart = waitingUI

      let frame = waitingUI.Frame

      /*
      let toggleButton = new ToggleButton( frame, 180,
         { 'Position': new UDim2( 1, -25, 0.6, -25 ), 'AnchorPoint': new Vector2( 0, 0.75 ) }, // hidden
         { 'Position': new UDim2( 1, -25, 0.6, -25 ), 'AnchorPoint': new Vector2( 1, 0.75 ) }, // visible
      )
      toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )
      toggleButton.button.Position = new UDim2( 0, -5, 0, 0 )
      toggleButton.button.AnchorPoint = new Vector2( 1, 0 )
      file.toggleButton = toggleButton
      toggleButton.SnapClosed()
      Thread( function ()
      {
         wait( 30 )
         if ( !toggleButton.EverClicked() )
            toggleButton.Open()
      } )
      */

      frame.FriendsButton.MouseButton1Click.Connect( function ()
      {
         pcall( function ()
         {
            SendRPC_Client( "RPC_FromClient_OpenedFriendInvite" )
            if ( SocialService.CanSendGameInviteAsync( localPlayer ) )
               SocialService.PromptGameInvite( localPlayer )
         } )
      } )

      UpdateWaitingStartUI()
   } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      Thread(
         function ()
         {
            wait() // wait for json to be proc'd
            UpdateWaitingStartUI()
         } )
   } )

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      if ( file.waitingStart !== undefined )
         file.waitingStart.Parent = undefined
   } )
}

function UpdateWaitingStartUI()
{
   if ( file.waitingStart === undefined )
      return

   let waitingUI = file.waitingStart as Editor_WaitingToStartUI

   let match = GetLocalMatch()
   //print( "UpdateWaitingStartUI: " + match.GetGameState() )

   let drawingCountdown = false
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_COUNTDOWN:

         if ( !drawingCountdown )
         {
            Thread( function ()
            {
               drawingCountdown = true
               waitingUI.Enabled = true
               for ( ; ; )
               {
                  if ( match.GetGameState() !== GAME_STATE.GAME_STATE_COUNTDOWN )
                     break

                  let time = math.floor( match.GetTimeRemainingForState() )
                  waitingUI.Frame.InfoFrame.Status.Text = time + ""
                  if ( time <= 0 )
                     break

                  wait( 1 )
               }
               drawingCountdown = false
            } )
         }
         break

      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
         let players = FilterHasCharacters( match.GetAllPlayers() )
         let count = GetMinPlayersForGame() - players.size()
         let text
         if ( count <= 1 )
            text = "Waiting for 1 more player"
         else
            text = "Waiting for " + count + " more players"

         waitingUI.Frame.InfoFrame.Status.Text = text

         //waitingUI.Frame.InfoFrame.Status.Text = "Waiting for players"
         waitingUI.Enabled = true
         break

      case GAME_STATE.GAME_STATE_COUNTDOWN:
         waitingUI.Frame.InfoFrame.Status.Text = "Starting New Match"
         waitingUI.Enabled = true
         break

      default:
         Thread(
            function ()
            {
               if ( waitingUI.Enabled )
               {
                  if ( file.toggleButton !== undefined )
                  {
                     let toggleButton = file.toggleButton as ToggleButton
                     toggleButton.Close()
                     wait( toggleButton.time )
                  }

                  waitingUI.Enabled = false
               }
            } )
         break
   }
}

