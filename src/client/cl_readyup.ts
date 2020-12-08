import { Players } from "@rbxts/services";
import { NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_NUMWITHYOU } from "shared/sh_gamestate";
import { AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars";
import { DEV_READYUP } from "shared/sh_settings";
import { Assert, GetFirstChildWithName, GetFirstChildWithNameAndClassName, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui";
import { SendRPC } from "./cl_utils";

class ReadyUI
{
   readyUI: ScreenGui
   checkboxReal: TextButton
   checkboxPractice: TextButton
   check: ImageLabel
   status: TextLabel

   constructor( readyUI: ScreenGui, checkboxReal: TextButton, checkboxPractice: TextButton, check: ImageLabel, status: TextLabel )
   {
      this.readyUI = readyUI
      this.checkboxReal = checkboxReal
      this.checkboxPractice = checkboxPractice
      this.check = check
      this.status = status
   }
}

class File
{
   readyUI: ReadyUI | undefined
   baseReadyUI: ScreenGui | undefined
}

let file = new File()

export function DestroyReadyUp()
{
   if ( file.readyUI === undefined )
      return

   ( file.readyUI as ReadyUI ).readyUI.Destroy()
}

export function SetReadyUp( status: MATCHMAKING_STATUS, readyMessage: string )
{
   if ( file.baseReadyUI === undefined )
      return

   if ( file.readyUI === undefined )
      CreateReadyUI()

   Assert( file.readyUI !== undefined, "Ready UI is undefined" )

   let readyUI = file.readyUI as ReadyUI

   switch ( status )
   {
      case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
         readyUI.check.Position = readyUI.checkboxPractice.Position
         break

      case MATCHMAKING_STATUS.MATCHMAKING_LFG:
         readyUI.check.Position = readyUI.checkboxReal.Position
         break
   }

   readyUI.status.Text = readyMessage
}

export function CL_ReadyUpSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      let readyUI = GetFirstChildWithNameAndClassName( gui, 'ReadyUI', 'ScreenGui' ) as ScreenGui
      readyUI.Enabled = false
      readyUI.DisplayOrder = UIORDER.UIORDER_READY

      file.baseReadyUI = readyUI
      CreateReadyUI()
      UpdateReadyUp()
   } )

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS, function ()
   {
      UpdateReadyUp()
   } )

   AddNetVarChangedCallback( NETVAR_MATCHMAKING_NUMWITHYOU, function ()
   {
      UpdateReadyUp()
   } )
}

function UpdateReadyUp()
{
   let player = Players.LocalPlayer
   let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
   let numWithYou = GetNetVar_Number( player, NETVAR_MATCHMAKING_NUMWITHYOU )
   print( "UpdateReadyUp: " + status )

   switch ( status )
   {
      case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
         SetReadyUp( status, "Practicing.. go explore!" )
         break

      case MATCHMAKING_STATUS.MATCHMAKING_LFG:
         SetReadyUp( status, "Waiting for " + numWithYou + " more players" )
         break

      case MATCHMAKING_STATUS.MATCHMAKING_PLAYING:
         DestroyReadyUp()
         break
   }
}


function CreateReadyUI()
{
   if ( file.baseReadyUI === undefined )
      return

   let readyUI = file.baseReadyUI.Clone()
   readyUI.Parent = file.baseReadyUI.Parent
   readyUI.Enabled = true
   let checkboxReal: TextButton | undefined
   let checkboxPractice: TextButton | undefined
   let check: ImageLabel | undefined
   let status: TextLabel | undefined
   let frame = GetFirstChildWithName( readyUI, "Frame" ) as Frame | undefined
   if ( frame === undefined )
      return

   let toggleButton = new ToggleButton( frame,
      { 'Position': new UDim2( -0.04, 25, 1, -25 ), 'AnchorPoint': new Vector2( 1, 1 ) },
      { 'Position': new UDim2( 0, 25, 1, -25 ), 'AnchorPoint': new Vector2( 0, 1 ) }
   )
   toggleButton.button.BackgroundColor3 = new Color3( 125 / 256, 170 / 256, 133 / 256 )

   let children = frame.GetChildren()

   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "checkbox_play":
            checkboxReal = child as TextButton
            break

         case "checkbox_practice":
            checkboxPractice = child as TextButton
            break

         case "Check":
            check = child as ImageLabel
            break

         case "InfoFrame":
            let infoFrame = child as Frame
            status = GetFirstChildWithName( infoFrame, "TextLabel" ) as TextLabel | undefined
            break
      }
   }

   Assert( status !== undefined && check !== undefined && checkboxReal !== undefined && checkboxPractice !== undefined, "Buttons were not found" )
   if ( status === undefined || check === undefined || checkboxReal === undefined || checkboxPractice === undefined )
      return

   checkboxReal.MouseButton1Up.Connect( function ()
   {
      if ( status === undefined || check === undefined || checkboxReal === undefined || checkboxPractice === undefined )
         return
      //check.Position = checkboxReal.Position
      SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_LFG )
   } )

   checkboxPractice.MouseButton1Up.Connect( function ()
   {
      if ( status === undefined || check === undefined || checkboxReal === undefined || checkboxPractice === undefined )
         return
      //check.Position = checkboxPractice.Position
      SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
   } )

   if ( DEV_READYUP )
   {
      Thread(
         function ()
         {
            wait( 2 )
            SendRPC( "RPC_FromClient_RequestChange_MatchmakingStatus", MATCHMAKING_STATUS.MATCHMAKING_LFG )
         }
      )
   }

   file.readyUI = new ReadyUI( readyUI, checkboxReal, checkboxPractice, check, status )
}