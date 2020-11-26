import { HttpService, Players } from "@rbxts/services"
import { AddTaskUI, GetTaskSpec, GetTaskUI, TASK_UI } from "client/cl_tasks"
import { Assignment, JSON_TASKLIST } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { AddRoomChangedCallback, CurrentRoomExists, GetCurrentRoom, GetRooms } from "./cl_rooms"
import { Assert, ExecOnChildWhenItExists } from "shared/sh_utils"
import { AddCallout, ClearCallouts, InitCallouts } from "./cl_callouts2d"
import { Room, Task } from "shared/sh_rooms"
import { AddMapIcon, ClearMinimapIcons } from "./cl_minimap"

const CALLOUTS_NAME = "TASKLIST_CALLOUTS"

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
   let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
   file.assignments = assignments
   //print( "Total assignments: " + file.assignments.size() )
   if ( file.recreateTaskListUI !== undefined )
      file.recreateTaskListUI()
}

export function CL_TaskListSetup()
{
   InitCallouts( CALLOUTS_NAME )

   AddRoomChangedCallback( RecreateTaskListCallouts2d )

   AddNetVarChangedCallback( JSON_TASKLIST, TaskListChanged )

   AddCallback_OnPlayerConnected( function ()
   {
      ExecOnChildWhenItExists( Players.LocalPlayer, 'PlayerGui', function ( child: Instance )
      {
         ExecOnChildWhenItExists( child, 'TaskList', function ( taskList: EDITOR_ScreenUIWithFrame )
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

   function AssignmentLabel( assignment: Assignment )
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
      AssignmentLabel( assignment )
   }

   //copy.Frame.Size = new UDim2( 

   baseLabel.Destroy()

   RecreateTaskListCallouts2d()

   ClearMinimapIcons()
   let rooms = GetRooms()

   function AddAssignmentMinimapIcon( assignment: Assignment )
   {
      if ( assignment.status !== 0 )
         return

      Assert( rooms.has( assignment.roomName ), "No known room " + assignment.roomName )

      let room = rooms.get( assignment.roomName ) as Room

      Assert( room.tasks.has( assignment.taskName ), "Room " + room.name + " has no task " + assignment.taskName )
      let task = room.tasks.get( assignment.taskName ) as Task

      AddMapIcon( task.volume.Position )
   }

   for ( let assignment of file.assignments )
   {
      AddAssignmentMinimapIcon( assignment )
   }
}

export function RecreateTaskListCallouts2d()
{
   if ( !CurrentRoomExists() )
      return

   ClearCallouts( CALLOUTS_NAME )

   let room = GetCurrentRoom()

   function AddCalloutForAssignment( assignment: Assignment )
   {
      if ( assignment.roomName !== room.name )
         return
      if ( assignment.status !== 0 )
         return

      Assert( room.tasks.has( assignment.taskName ), "Room " + room.name + " has no task " + assignment.taskName )
      let task = room.tasks.get( assignment.taskName ) as Task
      AddCallout( CALLOUTS_NAME, task.volume.Position )
   }

   for ( let assignment of file.assignments )
   {
      AddCalloutForAssignment( assignment )
   }
}