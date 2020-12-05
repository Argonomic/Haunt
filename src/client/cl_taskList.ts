import { HttpService, Players } from "@rbxts/services"
import { AddTaskUI, GetTaskSpec, GetTaskUI, TASK_UI } from "client/cl_tasks"
import { Assignment, IsPracticing, NETVAR_JSON_TASKLIST, USETYPES } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { AddRoomChangedCallback, CurrentRoomExists, GetCurrentRoom, GetRooms } from "./cl_rooms"
import { Assert, ExecOnChildWhenItExists, GetFirstChildWithName, Graph } from "shared/sh_utils"
import { AddCallout, ClearCallouts, InitCallouts } from "./cl_callouts2d"
import { Room, Task } from "shared/sh_rooms"
import { AddMapIcon, ClearMinimapIcons } from "./cl_minimap"
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui"
import { GetUsableByType } from "shared/sh_use"

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

function RefreshTaskList()
{
   let json = GetNetVar_String( Players.LocalPlayer, NETVAR_JSON_TASKLIST )
   let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
   file.assignments = assignments

   if ( file.existingUI !== undefined )
   {
      file.existingUI.Destroy()
      file.existingUI = undefined
   }

   if ( file.assignments.size() && file.recreateTaskListUI !== undefined )
      file.recreateTaskListUI()
}

export function CL_TaskListSetup()
{
   InitCallouts( CALLOUTS_NAME )

   AddRoomChangedCallback( RecreateTaskListCallouts2d )
   GetUsableByType( USETYPES.USETYPE_TASK ).DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let parts: Array<BasePart> = []
         if ( !CurrentRoomExists() )
            return parts

         let room = GetCurrentRoom()

         if ( IsPracticing( Players.LocalPlayer ) )
         {
            for ( let taskPark of room.tasks )
            {
               let task = taskPark[1]
               parts.push( task.volume )
            }
         }
         else
         {
            for ( let assignment of file.assignments )
            {
               if ( assignment.roomName !== room.name )
                  continue
               if ( assignment.status !== 0 )
                  continue

               Assert( room.tasks.has( assignment.taskName ), "Room " + room.name + " has no task " + assignment.taskName )
               let task = room.tasks.get( assignment.taskName ) as Task
               parts.push( task.volume )
            }
         }

         return parts
      } )

   AddNetVarChangedCallback( NETVAR_JSON_TASKLIST, RefreshTaskList )

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      let taskList = GetFirstChildWithName( gui, 'TaskList' ) as EDITOR_ScreenUIWithFrame
      taskList.Enabled = false
      taskList.DisplayOrder = UIORDER.UIORDER_TASKLIST

      AddTaskUI( TASK_UI.TASK_LIST, taskList )
      file.recreateTaskListUI = RecreateTaskListUI
      RefreshTaskList()

      RecreateTaskListCallouts2d()
      RecreateTaskListMapIcons()
   } )
}





function RecreateTaskListUI()
{
   Assert( file.assignments.size() > 0, "No assignments!" )

   let taskList = GetTaskUI( TASK_UI.TASK_LIST )

   let copy = taskList.Clone() as EDITOR_ScreenUIWithFrame
   file.existingUI = copy

   copy.Enabled = true
   copy.Parent = taskList.Parent
   copy.Name = copy.Name + " COPY"

   ExecOnChildWhenItExists( copy, 'Frame', function ( frame: Frame )
   {
      new ToggleButton( frame,
         { 'AnchorPoint': new Vector2( 1.0, 0 ) },
         { 'AnchorPoint': new Vector2( 0.0, 0 ) }
      )
   } )

   let baseLabel = copy.Frame.TextLabel
   let count = 0

   //let viewSize = ( Workspace.CurrentCamera as Camera ).ViewportSize
   baseLabel.TextSize = Graph( copy.Frame.AbsoluteSize.X, 200, 400, 14, 28 )
   //baseLabel.TextSize = Graph( viewSize.Y, 374, 971, 11, 28 )
   baseLabel.TextWrapped = false
   baseLabel.TextScaled = false
   //   let topOffset = baseLabel.AbsolutePosition.Y - copy.Frame.AbsolutePosition.Y

   function AssignmentLabel( assignment: Assignment )
   {
      let label = baseLabel.Clone()
      label.Parent = baseLabel.Parent
      //      label.Position = new UDim2( baseLabel.Position.X.Scale, 0, baseLabel.Position.Y.Scale + ( count * 0.075 ), 0 )
      label.Position = new UDim2( baseLabel.Position.X.Scale, 0, 0, 0.05 + ( count * baseLabel.TextSize * 1.25 ) )
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
   RecreateTaskListMapIcons()
}


function RecreateTaskListMapIcons()
{
   ClearMinimapIcons()
   let rooms = GetRooms()

   if ( IsPracticing( Players.LocalPlayer ) )
   {
      for ( let roomPair of rooms )
      {
         let room = roomPair[1]

         for ( let taskPark of room.tasks )
         {
            let task = taskPark[1]
            AddMapIcon( task.volume.Position )
         }
      }

      return
   }

   for ( let assignment of file.assignments )
   {
      if ( assignment.status !== 0 )
         continue

      Assert( rooms.has( assignment.roomName ), "No known room " + assignment.roomName )

      let room = rooms.get( assignment.roomName ) as Room

      Assert( room.tasks.has( assignment.taskName ), "Room " + room.name + " has no task " + assignment.taskName )
      let task = room.tasks.get( assignment.taskName ) as Task

      AddMapIcon( task.volume.Position )
   }
}

function RecreateTaskListCallouts2d()
{
   if ( !CurrentRoomExists() )
      return

   ClearCallouts( CALLOUTS_NAME )

   let room: Room = GetCurrentRoom()

   if ( IsPracticing( Players.LocalPlayer ) )
   {
      for ( let taskPair of room.tasks )
      {
         let task = taskPair[1]
         AddCallout( CALLOUTS_NAME, task.volume.Position )
      }

      return
   }

   for ( let assignment of file.assignments )
   {
      if ( assignment.roomName !== room.name )
         continue
      if ( assignment.status !== 0 )
         continue

      Assert( room.tasks.has( assignment.taskName ), "Room " + room.name + " has no task " + assignment.taskName )
      let task = room.tasks.get( assignment.taskName ) as Task
      AddCallout( CALLOUTS_NAME, task.volume.Position )
   }
}