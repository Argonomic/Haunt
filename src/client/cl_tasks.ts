import { AddRPC } from "shared/sh_rpc"
import * as u from "shared/sh_utils"
import { ReleaseDraggedButton, AddDragButtonCallback, AddCallback_MouseUp } from "client/cl_ui"
import { GetLocalPlayerReady } from "./cl_player"
import { SendRPC } from "./cl_utils"

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

   successSound = u.LoadSound( 4612375233 )

   activeTaskStatus = new TaskStatus()
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

   AddDragButtonCallback( DragButtonInFrame )
}

export function AddTaskUI( name: TASK_UI, ui: ScreenGui )
{
   if ( ui.Name === "TaskList" )
   {
      print( "****** * * ADD TASK UI " + name + " " + ui.Name )
   }

   u.Assert( GetLocalPlayerReady(), "Tried to add UI before local player connecs" )
   file.taskUI[name] = ui
}

export function AddTaskSpec( name: string, startFunc: Function, title: string, taskFrame: Frame )
{
   file.taskSpecs[name] = new TaskSpec( title, taskFrame, startFunc )
}

export function GetTaskSpec( name: string ): TaskSpec
{
   u.Assert( file.taskSpecs[name] !== undefined, "Unknown taskspec " + name )
   return file.taskSpecs[name]
}

export function GetTaskUI( name: TASK_UI ): ScreenGui
{
   if ( file.taskUI[name] !== undefined )
      return file.taskUI[name] as ScreenGui

   throw undefined
}


export function DragButtonInFrame( input: InputObject, button: GuiObject, xOffset: number, yOffset: number )
{
   // probably shouldn't do this every frame
   let taskUIController = GetTaskUI( TASK_UI.TASK_CONTROLLER )
   let frame = u.GetInstanceChildWithName( taskUIController, "Frame" ) as Frame
   //let constraint = u.GetInstanceChildWithName( taskUIController, "UISizeConstraint" ) as UISizeConstraint

   xOffset -= button.AnchorPoint.X * button.AbsoluteSize.X
   yOffset -= button.AnchorPoint.Y * button.AbsoluteSize.Y
   let x = u.Graph( input.Position.X - xOffset, frame.AbsolutePosition.X, frame.AbsolutePosition.X + frame.AbsoluteSize.X, 0, 1 )
   let y = u.Graph( input.Position.Y - yOffset, frame.AbsolutePosition.Y, frame.AbsolutePosition.Y + frame.AbsoluteSize.Y, 0, 1 )

   button.Position = new UDim2( x, 0, y, 0 )
}


export function RPC_FromServer_CancelTask()
{
   let closeFunction = file.activeTaskStatus.closeFunction
   if ( closeFunction )
      closeFunction()
}

export function RPC_FromServer_OnPlayerUseTask( roomName: string, taskName: string )
{
   let taskUIController = GetTaskUI( TASK_UI.TASK_CONTROLLER ) as EDITOR_TaskUI

   // already active task?
   if ( taskUIController.Enabled )
      return

   let taskSpec = file.taskSpecs[taskName]
   u.Assert( taskSpec !== undefined, "Unknown task " + taskName )

   let newFrame = taskSpec.frame.Clone()
   newFrame.Visible = true
   newFrame.Parent = taskSpec.frame.Parent

   //u.SetPlayerState( Players.LocalPlayer, Enum.HumanoidStateType.Running, false )

   taskUIController.Frame.Header.Text = taskSpec.title
   taskUIController.Enabled = true
   let closeButton = taskUIController.Frame.CloseButton

   file.activeTaskStatus = new TaskStatus()

   let closeFunction = function ()
   {
      if ( file.activeTaskStatus.success )
      {
         file.successSound.Play()
         SendRPC( "RPC_FromClient_OnPlayerFinishTask", roomName, taskName )
      }

      //u.SetPlayerState( Players.LocalPlayer, Enum.HumanoidStateType.Running, true )
      newFrame.Destroy()
      taskUIController.Enabled = false;
      let think = file.activeTaskStatus.think
      if ( think !== undefined )
         think.Disconnect()

      let closeButtonCallback = file.activeTaskStatus.closeButtonCallback
      if ( closeButtonCallback !== undefined )
         closeButtonCallback.Disconnect()

      ReleaseDraggedButton()
   }

   file.activeTaskStatus.closeFunction = closeFunction

   file.activeTaskStatus.closeButtonCallback = AddCallback_MouseUp( closeButton, function ()
   {
      closeFunction()
   } )

   file.activeTaskStatus.think = taskSpec.startFunc( newFrame, closeFunction, file.activeTaskStatus )

}
