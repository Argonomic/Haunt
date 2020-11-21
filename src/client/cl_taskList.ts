import * as u from "shared/sh_utils"
import { HttpService, Players, SocialService } from "@rbxts/services"
import { AddTaskUI, GetTaskSpec, GetTaskUI, TASK_UI } from "client/cl_tasks"
import { Assignment, JSON_TASKLIST } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"


type EDITOR_ScreenUIWithFrame = ScreenGui &
{
   Frame: Frame &
   {
      TextLabel: TextLabel
   }
}

class File
{
   recreateTaskListUI: Function | undefined
   assignments: Array<Assignment> = []
   existingUI: ScreenGui | undefined
}

let file = new File()

function TaskListChanged()
{
   let json = GetNetVar_String( Players.LocalPlayer, JSON_TASKLIST )
   print( "DECODE " + json )
   let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
   file.assignments = assignments
   //print( "Total assignments: " + file.assignments.size() )
   if ( file.recreateTaskListUI !== undefined )
      file.recreateTaskListUI()
}

export function CL_TaskListSetup()
{
   AddNetVarChangedCallback( JSON_TASKLIST, TaskListChanged )

   AddCallback_OnPlayerConnected( function ()
   {
      u.ExecOnChildWhenItExists( Players.LocalPlayer, 'PlayerGui', function ( child: Instance )
      {
         u.ExecOnChildWhenItExists( child, 'TaskList', function ( taskList: EDITOR_ScreenUIWithFrame )
         {
            taskList.Enabled = false

            AddTaskUI( TASK_UI.TASK_LIST, taskList )
            file.recreateTaskListUI = RecreateTaskListUI
            RecreateTaskListUI()
         } )
      } )
   } )
}

function RecreateTaskListUI()
{
   if ( file.existingUI !== undefined )
   {
      file.existingUI.Destroy()
      file.existingUI = undefined
   }

   let taskList = GetTaskUI( TASK_UI.TASK_LIST )

   let copy = taskList.Clone() as EDITOR_ScreenUIWithFrame
   file.existingUI = copy

   copy.Enabled = true
   copy.Parent = taskList.Parent
   copy.Name = copy.Name + " COPY"
   let baseLabel = copy.Frame.TextLabel
   let count = 0

   function assignmentLabel( assignment: Assignment )
   {
      let label = baseLabel.Clone()
      label.Parent = baseLabel.Parent
      label.Position = new UDim2( baseLabel.Position.X.Scale, 0, baseLabel.Position.Y.Scale + ( count * 0.1 ), 0 )
      let taskSpec = GetTaskSpec( assignment.taskName )

      let text = assignment.roomName + ": " + taskSpec.title
      if ( assignment.status > 0 )
         label.Text = text + " (1/1)"
      else
         label.Text = text + " (0/1)"

      count++
   }

   for ( let assignment of file.assignments )
   {
      assignmentLabel( assignment )
   }

   //copy.Frame.Size = new UDim2( 

   baseLabel.Destroy()
}