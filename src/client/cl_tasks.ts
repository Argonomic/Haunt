import { AddRPC } from "shared/sh_rpc"
import { ReleaseDraggedButton, AddCallback_MouseUp } from "client/cl_ui"
import { SendRPC } from "./cl_utils"
import { Assert, LoadSound } from "shared/sh_utils"
import { Players } from "@rbxts/services"
import { SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { AddPlayerCannotUseCallback, SetUseDebounceTime } from "./cl_use"

export enum TASK_UI
{
   TASK_LIST,
   TASK_CONTROLLER,
}

class File
{
   camera: Camera | undefined
   taskUI: Record<TASK_UI, ScreenGui | undefined> = { 0: undefined, 1: undefined }

   taskSpecs: Record<string, TaskSpec> = {}

   successSound = LoadSound( 4612375233 )

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
   closeFunction: Function | undefined
   success = false
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

   AddPlayerCannotUseCallback( function ()
   {
      return HasActiveTask()
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

   throw undefined
}



export function RPC_FromServer_CancelTask()
{
   let activeTaskStatus = file.activeTaskStatus
   if ( activeTaskStatus === undefined )
      return

   let closeFunction = activeTaskStatus.closeFunction
   if ( closeFunction )
      closeFunction()
}

export function RPC_FromServer_OnPlayerUseTask( roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( Players.LocalPlayer, 0 )

   let taskUIController = GetTaskUI( TASK_UI.TASK_CONTROLLER ) as EDITOR_TaskUI

   // already active task?
   if ( taskUIController.Enabled )
      return

   let taskSpec = file.taskSpecs[taskName]
   Assert( taskSpec !== undefined, "Unknown task " + taskName )

   let newFrame = taskSpec.frame.Clone()
   newFrame.Visible = true
   newFrame.Parent = taskSpec.frame.Parent

   //SetPlayerState( Players.LocalPlayer, Enum.HumanoidStateType.Running, false )

   taskUIController.Frame.Header.Text = taskSpec.title
   taskUIController.Enabled = true
   let closeButton = taskUIController.Frame.CloseButton

   let activeTaskStatus = new TaskStatus()
   file.activeTaskStatus = activeTaskStatus

   let closeFunction = function ()
   {
      if ( activeTaskStatus.success )
      {
         file.successSound.Play()
         SendRPC( "RPC_FromClient_OnPlayerFinishTask", roomName, taskName )
         SetUseDebounceTime( 1 ) // hide use for a second
      }

      SetPlayerWalkSpeed( Players.LocalPlayer, 16 )

      //SetPlayerState( Players.LocalPlayer, Enum.HumanoidStateType.Running, true )
      newFrame.Destroy()
      taskUIController.Enabled = false;
      let think = activeTaskStatus.think
      if ( think !== undefined )
         think.Disconnect()

      let closeButtonCallback = activeTaskStatus.closeButtonCallback
      if ( closeButtonCallback !== undefined )
         closeButtonCallback.Disconnect()

      ReleaseDraggedButton()
      file.activeTaskStatus = undefined
   }

   activeTaskStatus.closeFunction = closeFunction

   activeTaskStatus.closeButtonCallback = AddCallback_MouseUp( closeButton, function ()
   {
      closeFunction()
   } )

   activeTaskStatus.think = taskSpec.startFunc( newFrame, closeFunction, file.activeTaskStatus )
}

