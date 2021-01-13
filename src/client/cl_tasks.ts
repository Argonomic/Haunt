import { AddRPC, SendRPC_Client } from "shared/sh_rpc"
import { Assignment, AssignmentIsSame, NETVAR_JSON_ASSIGNMENTS } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { ReleaseDraggedButton, AddCallback_MouseClick } from "client/cl_ui"
import { GetLocalPlayer, LoadSound, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { AddPlayerUseDisabledCallback, SetUseDebounceTime } from "./cl_use"
import { PLAYER_WALKSPEED } from "shared/sh_settings"
import { Tween } from "shared/sh_tween"
import { HttpService } from "@rbxts/services"

export enum TASK_UI
{
   TASK_CONTROLLER,
}

class File
{
   camera: Camera | undefined
   taskUI: Record<TASK_UI, ScreenGui | undefined> = { 0: undefined }

   taskSpecs: Record<string, TaskSpec> = {}

   successSound = LoadSound( 131323304 ) // 4612375233 )

   activeTaskStatus: TaskStatus | undefined
}

class TaskSpec
{
   frame: GuiObject
   title: string
   startFunc: Function

   constructor( title: string, frame: Frame, startFunc: Function )
   {
      this.title = title
      this.frame = frame
      this.startFunc = startFunc
   }
}

export function HasActiveTask(): boolean
{
   return file.activeTaskStatus !== undefined
}

export class TaskStatus
{
   think: RBXScriptConnection | undefined
   closeButtonCallback: RBXScriptConnection | undefined
   closeFunction: ( () => void ) = function () { }
   success = false
   taskSpec: TaskSpec
   roomName: string
   taskName: string

   constructor( taskSpec: TaskSpec, roomName: string, taskName: string )
   {
      this.taskSpec = taskSpec
      this.roomName = roomName
      this.taskName = taskName
   }
}

type EDITOR_TaskUI = ScreenGui &
{
   Frame: GuiObject &
   {
      Header: TextLabel
      CloseButton: GuiButton
   }
}

let file = new File()

export function CL_TasksSetup()
{
   AddRPC( "RPC_FromServer_OnPlayerUseTask", RPC_FromServer_OnPlayerUseTask )
   AddRPC( "RPC_FromServer_CancelTask", RPC_FromServer_CancelTask )

   AddPlayerUseDisabledCallback( function ()
   {
      return HasActiveTask()
   } )

   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         if ( !HasActiveTask() )
            return
         let activeTaskStatus = file.activeTaskStatus
         if ( activeTaskStatus === undefined )
            return

         let json = GetNetVar_String( GetLocalPlayer(), NETVAR_JSON_ASSIGNMENTS )
         let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
         for ( let assignment of assignments )
         {
            if ( AssignmentIsSame( assignment, activeTaskStatus.roomName, activeTaskStatus.taskName ) )
               return
         }

         // no longer have the current task
         CancelAnyOpenTask()
      } )

}

export function AddTaskUI( name: TASK_UI, ui: ScreenGui )
{
   file.taskUI[name] = ui
}

export function AddTaskSpec( name: string, startFunc: Function, title: string, taskFrame: Frame )
{
   file.taskSpecs[name] = new TaskSpec( title, taskFrame, startFunc )
}

export function GetTaskSpec( name: string ): TaskSpec
{
   Assert( file.taskSpecs[name] !== undefined, "Unknown taskspec " + name )
   return file.taskSpecs[name]
}

export function GetTaskUI( name: TASK_UI ): ScreenGui
{
   if ( file.taskUI[name] !== undefined )
      return file.taskUI[name] as ScreenGui

   Assert( false, "GetTaskUI" )
   throw undefined
}


export function CancelAnyOpenTask()
{
   let activeTaskStatus = file.activeTaskStatus
   if ( activeTaskStatus === undefined )
      return

   activeTaskStatus.closeFunction()
}

export function RPC_FromServer_CancelTask()
{
   CancelAnyOpenTask()
}

export function RPC_FromServer_OnPlayerUseTask( roomName: string, taskName: string )
{
   let localPlayer = GetLocalPlayer()
   SetPlayerWalkSpeed( localPlayer, 0 )

   let taskUIController = GetTaskUI( TASK_UI.TASK_CONTROLLER ) as EDITOR_TaskUI

   // already active task?
   if ( taskUIController.Enabled )
      return

   let taskSpec = file.taskSpecs[taskName]
   Assert( taskSpec !== undefined, "Unknown task " + taskName )

   let newFrame = taskSpec.frame.Clone()

   taskUIController.Frame.Position = new UDim2( 0.5, 0, 2.0, 0 )
   Tween( taskUIController.Frame, {
      Position: new UDim2( 0.5, 0, 0.5, 0 )
   }, 0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )

   newFrame.Visible = true
   newFrame.Parent = taskSpec.frame.Parent

   //SetPlayerState( GetLocalPlayer(), Enum.HumanoidStateType.Running, false )

   taskUIController.Frame.Header.Text = taskSpec.title
   taskUIController.Enabled = true
   let closeButton = taskUIController.Frame.CloseButton

   let activeTaskStatus = new TaskStatus( taskSpec, roomName, taskName )
   file.activeTaskStatus = activeTaskStatus

   let closeFunction = function ()
   {
      if ( activeTaskStatus.success )
      {
         file.successSound.Play()
         SendRPC_Client( "RPC_FromClient_OnPlayerFinishTask", roomName, taskName )
         SetUseDebounceTime( 1 ) // hide use for a second
      }

      SetPlayerWalkSpeed( GetLocalPlayer(), PLAYER_WALKSPEED )

      //SetPlayerState( GetLocalPlayer(), Enum.HumanoidStateType.Running, true )
      let think = activeTaskStatus.think
      if ( think !== undefined )
         think.Disconnect()

      let closeButtonCallback = activeTaskStatus.closeButtonCallback
      if ( closeButtonCallback !== undefined )
         closeButtonCallback.Disconnect()

      file.activeTaskStatus = undefined
      Thread( function ()
      {
         wait( 0.15 )
         Tween( taskUIController.Frame, {
            Position: new UDim2( 0.5, 0, 2.0, 0 )
         }, 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
         wait( 0.5 )
         taskUIController.Enabled = false;
         ReleaseDraggedButton()
         newFrame.Destroy()
      } )
   }

   activeTaskStatus.closeFunction = closeFunction

   activeTaskStatus.closeButtonCallback = AddCallback_MouseClick( closeButton, function ()
   {
      closeFunction()
   } )

   activeTaskStatus.think = taskSpec.startFunc( newFrame, closeFunction, file.activeTaskStatus )
}

