import { IsReservedServer, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU, NETVAR_JSON_GAMESTATE, NETVAR_JSON_TASKLIST, ROLE, GAME_STATE, IsPracticing } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars";
import { DEFAULT_REMIND_MATCHMAKING, DEV_READYUP } from "shared/sh_settings";
import { GetFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { GetLocalGame } from "./cl_gamestate";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { SendRPC } from "./cl_utils";
import { TasksRemaining } from "./cl_taskList";
import { AddRoomChangedCallback, GetCurrentRoom } from "./cl_rooms";
import { SocialService } from "@rbxts/services";
import { AddRPC } from "shared/sh_rpc";


type Editor_ReadyUI = ScreenGui &
{
   Frame: Frame &
   {
      InfoFrame: Frame &
      {
         Status: TextLabel
      }

      checkbox_play: TextButton
      checkbox_practice: TextButton
      FriendsButton: TextButton
      Check: ImageLabel
      COLORING: TextLabel
      GameChoice: TextLabel
      Practice: TextLabel
      Real: TextLabel
   }
}

class File
{
   oldTaskListCount = -1
   _readyUI: Editor_ReadyUI | undefined
   toggleButton: ToggleButton | undefined
   displayedReturnToQueue = false
   displayedReadyUp = false
}

let file = new File()

export function CL_ReadyUpSetup()
{
   let localPlayer = GetLocalPlayer()

   if ( IsPracticing( localPlayer ) )
   {
      AddRoomChangedCallback(
         function ()
         {
            if ( file.displayedReadyUp )
               return

            if ( GetCurrentRoom().name !== 'Great Room' )
               return
            file.displayedReadyUp = true
            Thread( function ()
            {
               if ( file.toggleButton === undefined || file._readyUI === undefined )
                  return

               wait( 2.0 )
               if ( file.toggleButton.EverClicked() )
                  return
               file.toggleButton.Open()
            } )
         } )
   }

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file._readyUI !== undefined )
      {
         file._readyUI.Parent = gui
         return
      }

      let readyUI = GetFirstChildWithNameAndClassName( gui, 'ReadyUI', 'ScreenGui' ) as Editor_ReadyUI
      readyUI.Enabled = false
      readyUI.DisplayOrder = UIORDER.UIORDER_READY
      readyUI.Frame.Check.Visible = false

      file._readyUI = readyUI

      let frame = readyUI.Frame

      let toggleButton = new ToggleButton( frame, 180,
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 0, 0.75 ) }, // hidden
         { 'Position': new UDim2( 1, -25, 0.5, -25 ), 'AnchorPoint': new Vector2( 1, 0.75 ) }, // visible
      )
      toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )
      toggleButton.button.Position = new UDim2( 0, -5, 0, 0 )
      toggleButton.button.AnchorPoint = new Vector2( 1, 0 )
      file.toggleButton = toggleButton
      toggleButton.SnapClosed()

      frame.checkbox_play.MouseButton1Click.Connect( function ()
      {
         SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_LFG )
      } )

      frame.checkbox_practice.MouseButton1Click.Connect( function ()
      {
         SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
      } )

      frame.FriendsButton.MouseButton1Click.Connect( function ()
      {
         pcall( function ()
         {
            if ( SocialService.CanSendGameInviteAsync( localPlayer ) )
               SocialService.PromptGameInvite( localPlayer )
         } )
      } )

      if ( DEV_READYUP )
      {
         Thread(
            function ()
            {
               wait( 4.2 )
               if ( !IsReservedServer() )
                  SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_LFG )
            }
         )
      }

      UpdateReadyUp()
   } )

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS, function ()
   {
      UpdateReadyUp()
   } )

   if ( IsPracticing( localPlayer ) )
   {
      Thread( function ()
      {
         RemindMatchmaking()
      } )
   }

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_NUMWITHYOU, function ()
   {
      UpdateReadyUp()
   } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait() // after it actually state
               UpdateReadyUp()
            } )
      } )

   AddNetVarChangedCallback( NETVAR_JSON_TASKLIST,
      function ()
      {
         Thread(
            function ()
            {
               wait() // wait for it to update
               if ( file.toggleButton === undefined )
                  return

               let taskListCount = TasksRemaining()
               if ( taskListCount === file.oldTaskListCount )
                  return

               file.oldTaskListCount = taskListCount

               if ( taskListCount > 0 )
                  return

               Thread( function ()
               {
                  if ( file.toggleButton === undefined )
                     return
                  if ( file.toggleButton.IsOpen() )
                     return

                  wait( 3.0 )
                  file.toggleButton.Open()
               } )

               UpdateReadyUp()
            } )
      } )

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      if ( file._readyUI !== undefined )
         file._readyUI.Parent = undefined
   } )
}


function UpdateReadyUp()
{
   Thread( function ()
   {
      if ( file._readyUI === undefined )
         return

      let readyUI = file._readyUI
      let player = GetLocalPlayer()
      let game = GetLocalGame()
      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      let numWithYou = GetNetVar_Number( player, NETVAR_MATCHMAKING_NUMWITHYOU )

      function DisplaySpectatorReturnToQueue()
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

               wait( 4 ) // for victory screen

               toggleButton.SnapClosed()
               readyUI.Frame.Check.Visible = false
               readyUI.Enabled = true
               readyUI.Frame.InfoFrame.Status.Text = "Spectate or leave this game?"
               readyUI.DisplayOrder = UIORDER.UIORDER_READY_AFTER_SPECTATE // move this to the front

               wait()
               toggleButton.Open()
            } )
      }

      if ( game.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
      {
         DisplaySpectatorReturnToQueue()
         return
      }

      if ( game.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
      {
         readyUI.Enabled = false
         return
      }

      if ( game.IsSpectator( player ) )
      {
         DisplaySpectatorReturnToQueue()
         return
      }

      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED:
            readyUI.Frame.Check.Visible = false
            readyUI.Frame.InfoFrame.Status.Text = "Warm up or play?"
            readyUI.Enabled = true
            break

         case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
            readyUI.Frame.Check.Visible = true
            readyUI.Frame.Check.Position = readyUI.Frame.checkbox_practice.Position
            if ( file.oldTaskListCount === 0 )
               readyUI.Frame.InfoFrame.Status.Text = "Ready to play?"
            else
               readyUI.Frame.InfoFrame.Status.Text = "Warming up.. go explore!"
            readyUI.Enabled = true
            break

         case MATCHMAKING_STATUS.MATCHMAKING_LFG:
            readyUI.Frame.Check.Visible = true
            readyUI.Frame.Check.Position = readyUI.Frame.checkbox_play.Position
            if ( numWithYou === 1 )
               readyUI.Frame.InfoFrame.Status.Text = "Waiting for " + numWithYou + " more player"
            else
               readyUI.Frame.InfoFrame.Status.Text = "Waiting for " + numWithYou + " more players"
            readyUI.Enabled = true
            break

         case MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS:
            readyUI.Frame.Check.Visible = true
            readyUI.Frame.Check.Position = readyUI.Frame.checkbox_play.Position
            if ( numWithYou === 1 )
               readyUI.Frame.InfoFrame.Status.Text = "Waiting for " + numWithYou + " friend to Ready Up"
            else
               readyUI.Frame.InfoFrame.Status.Text = "Waiting for " + numWithYou + " friends to Ready Up"
            readyUI.Enabled = true
            break

         case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
            Thread(
               function ()
               {
                  if ( file.toggleButton !== undefined )
                  {
                     file.toggleButton.Close()
                     wait( file.toggleButton.time )
                  }
                  readyUI.Enabled = false
               } )
            break
      }
   } )
}

function RemindMatchmaking()
{
   let localPlayer = GetLocalPlayer()
   let count = 0

   function func()
   {
      let undecided = GetNetVar_Number( localPlayer, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED

      let toggleButton = file.toggleButton
      if ( toggleButton === undefined )
         return

      if ( !undecided || toggleButton.IsOpen() )
      {
         count = 0
         return
      }

      count++
      if ( count >= DEFAULT_REMIND_MATCHMAKING )
         toggleButton.Open()
   }


   for ( ; ; )
   {
      wait( 1 )
      func()
   }
}