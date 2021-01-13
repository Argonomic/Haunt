import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_JSON_GAMESTATE, NETVAR_JSON_ASSIGNMENTS, IsMatchmaking, NETVAR_JSON_TELEPORTDATA, NETVAR_MATCHMAKING_PLACE_IN_LINE } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars";
import { GetFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { AddRoomChangedCallback, GetCurrentRoom } from "./cl_rooms";
import { Players, SocialService } from "@rbxts/services";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetAmWaitingFor, GetTeleportData } from "shared/sh_matchmaking";
import { IsReservedServer } from "shared/sh_reservedServer";

const LOCAL_PLAYER = GetLocalPlayer()

type Editor_ReadyUI = ScreenGui &
{
   Frame: Frame &
   {
      InfoFrame: Frame &
      {
         Status: TextLabel
      }

      FriendsButton: TextButton
      PlaceInLine: TextLabel

      Friends: Folder
      FriendTemplate: Frame &
      {
         CloseButton: ImageButton
         TextLabel: TextLabel
      }
   }
}

class File
{
   matchmakingUI: Editor_ReadyUI | undefined
   toggleButton: ToggleButton | undefined
   displayedReturnToQueue = false
   displayedReadyUp = false
}

let file = new File()

export function CL_MatchmakingSetup()
{
   if ( IsReservedServer() )
      return

   let localPlayer = GetLocalPlayer()

   /*
   if ( IsMatchmaking( localPlayer ) )
   {
      AddRoomChangedCallback(
         function ()
         {
            if ( file.displayedReadyUp )
               return

            if ( GetCurrentRoom( LOCAL_PLAYER ).name !== 'Great Room' )
               return
            file.displayedReadyUp = true
            Thread( function ()
            {
               if ( file.toggleButton === undefined || file.matchmakingUI === undefined )
                  return

               wait( 2.0 )
               if ( file.toggleButton.EverClicked() )
                  return
               file.toggleButton.Open()
            } )
         } )
   }
   */

   AddNetVarChangedCallback( NETVAR_JSON_TELEPORTDATA, UpdateFriendsOnServer )
   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, UpdateFriendsOnServer )

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.matchmakingUI !== undefined )
      {
         file.matchmakingUI.Parent = gui
         return
      }

      let readyUI = GetFirstChildWithNameAndClassName( gui, 'MatchmakingUI', 'ScreenGui' ) as Editor_ReadyUI
      readyUI.Enabled = false
      readyUI.DisplayOrder = UIORDER.UIORDER_READY
      readyUI.Frame.FriendTemplate.Visible = false

      file.matchmakingUI = readyUI

      let frame = readyUI.Frame

      let toggleButton = new ToggleButton( frame, 180,
         { 'Position': new UDim2( 1, -25, 0.6, -25 ), 'AnchorPoint': new Vector2( 0, 0.75 ) }, // hidden
         { 'Position': new UDim2( 1, -25, 0.6, -25 ), 'AnchorPoint': new Vector2( 1, 0.75 ) }, // visible
      )
      toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )
      toggleButton.button.Position = new UDim2( 0, -5, 0, 0 )
      toggleButton.button.AnchorPoint = new Vector2( 1, 0 )
      file.toggleButton = toggleButton
      //toggleButton.SnapClosed()

      frame.FriendsButton.MouseButton1Click.Connect( function ()
      {
         pcall( function ()
         {
            if ( SocialService.CanSendGameInviteAsync( localPlayer ) )
               SocialService.PromptGameInvite( localPlayer )
         } )
      } )

      UpdateMatchmakingUI()
      UpdateFriendsOnServer()
   } )

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS, function ()
   {
      Thread(
         function ()
         {
            wait() // wait for possible update of other netvars
            UpdateMatchmakingUI()
         } )
   } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait() // after it actually state
               UpdateMatchmakingUI()
            } )
      } )

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      if ( file.matchmakingUI !== undefined )
         file.matchmakingUI.Parent = undefined
   } )
}

function UpdateFriendsOnServer()
{
   if ( file.matchmakingUI === undefined )
      return
   let matchmakingUI = file.matchmakingUI
   let children = matchmakingUI.Frame.Friends.GetChildren()
   for ( let child of children )
   {
      child.Destroy()
   }

   let online = new Map<number, boolean>()
   let players = Players.GetPlayers()

   for ( let player of players )
   {
      online.set( player.UserId, true )
   }

   let teleportData = GetTeleportData( LOCAL_PLAYER )
   let amWaitingFor = GetAmWaitingFor( LOCAL_PLAYER, teleportData )

   let count = 0
   for ( let pair of amWaitingFor )
   {
      let data = pair[1]
      count++
      let frame = matchmakingUI.Frame.FriendTemplate.Clone()
      frame.Parent = matchmakingUI.Frame
      frame.Visible = true
      frame.Position = new UDim2( 0, 0, 0, frame.AbsoluteSize.Y * count * 1.2 )
      frame.TextLabel.Text = data.name

      let isOnline = online.has( data.userId )
      frame.CloseButton.Visible = !isOnline

      if ( !isOnline )
      {
         frame.BackgroundTransparency = 0.666
         frame.CloseButton.MouseButton1Click.Connect(
            function ()
            {
               //ClientUpdatesTeleportData( teleportData )
               SendRPC_Client( "RPC_FromClient_NotWaitingFor", data.userId )
            } )
      }
   }
}

function UpdateMatchmakingUI()
{
   if ( file.matchmakingUI === undefined )
      return
   if ( file.toggleButton === undefined )
      return

   let readyUI = file.matchmakingUI as Editor_ReadyUI
   let toggleButton = file.toggleButton as ToggleButton

   //print( "UpdateMatchmakingUI" )
   Thread( function ()
   {
      let player = GetLocalPlayer()
      let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
      //print( "Matchmaking status: " + status )

      let placeInLine = GetNetVar_Number( player, NETVAR_MATCHMAKING_PLACE_IN_LINE )

      let text
      if ( placeInLine <= 1 )
         text = "1st"
      else if ( placeInLine === 2 )
         text = "2nd"
      else if ( placeInLine === 3 )
         text = "3rd"
      else
         text = placeInLine + "th"

      text = "You are " + text + " in line to play"

      readyUI.Frame.PlaceInLine.Text = text

      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_FOUND_GROUP:
            readyUI.Frame.InfoFrame.Status.Text = "Found enough players"
            break

         case MATCHMAKING_STATUS.MATCHMAKING_COUNTDOWN:
            readyUI.Frame.InfoFrame.Status.Text = "Game Starting"
            break

         case MATCHMAKING_STATUS.MATCHMAKING_LFG:
            readyUI.Frame.InfoFrame.Status.Text = "Waiting for more players"
            break

         case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER:
            readyUI.Frame.InfoFrame.Status.Text = "Teleporting to match"
            break

         case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY:
            readyUI.Frame.InfoFrame.Status.Text = "Teleporting to lobby"
            break
      }

      switch ( status )
      {
         case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
            Thread(
               function ()
               {
                  if ( readyUI.Enabled )
                  {
                     toggleButton.Close()
                     wait( toggleButton.time )
                     readyUI.Enabled = false
                  }
               } )
            break

         case MATCHMAKING_STATUS.MATCHMAKING_CONNECTING:
            readyUI.Enabled = false
            break

         default:
            if ( readyUI.Enabled = false )
            {
               toggleButton.SnapClosed()
               //toggleButton.Open()
            }

            readyUI.Enabled = true
            break
      }
   } )
}

