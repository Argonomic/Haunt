import { HttpService } from "@rbxts/services"
import { GetTaskSpec } from "client/cl_tasks"
import { Assignment, IsPracticing, NETVAR_JSON_TASKLIST, USETYPES } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { AddRoomChangedCallback, CurrentRoomExists, GetCurrentRoom, GetRooms } from "./cl_rooms"
import { Assert, GetFirstChildWithName, GetLocalPlayer, Graph } from "shared/sh_utils"
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
   assignments: Array<Assignment> = []
   existingUI: EDITOR_ScreenUIWithFrame | undefined
   taskLabels: Array<TextLabel> = []
}

let file = new File()

function RefreshTaskList()
{
   print( "RefreshTaskList!" )
   let json = GetNetVar_String( GetLocalPlayer(), NETVAR_JSON_TASKLIST )
   let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
   file.assignments = assignments

   if ( file.assignments.size() )
      RedrawTaskListUI()
}

export function CL_TaskListSetup()
{
   InitCallouts( CALLOUTS_NAME )

   AddRoomChangedCallback( RecreateTaskListCallouts2d )

   GetUsableByType( USETYPES.USETYPE_TASK ).DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         if ( !CurrentRoomExists() )
            return []

         let parts: Array<BasePart> = []
         let room = GetCurrentRoom()

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

         return parts
      } )


   GetUsableByType( USETYPES.USETYPE_MEETING ).DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         if ( IsPracticing( player ) )
            return []

         if ( !CurrentRoomExists() )
            return []

         let room = GetCurrentRoom()
         if ( room.meetingTrigger !== undefined )
            return [room.meetingTrigger]

         return []
      } )

   AddNetVarChangedCallback( NETVAR_JSON_TASKLIST, RefreshTaskList )

   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      print( "AddPlayerGuiFolderExistsCallback " )
      if ( file.existingUI !== undefined )
      {
         print( "defined" )
         file.existingUI.Parent = folder
         return
      }

      let taskList = GetFirstChildWithName( folder, 'TaskList' ) as EDITOR_ScreenUIWithFrame
      taskList.Enabled = false
      taskList.DisplayOrder = UIORDER.UIORDER_TASKLIST

      let clone = taskList.Clone()
      clone.Name = clone.Name + " COPY"
      clone.Enabled = true
      clone.Parent = folder
      clone.ResetOnSpawn = false
      file.existingUI = clone
      print( "created " + clone )

      let toggleButton = new ToggleButton( clone.Frame,
         { 'AnchorPoint': new Vector2( 1.1, 0 ) }, // visible
         { 'AnchorPoint': new Vector2( 0.0, 0 ) } // hidden
      )
      toggleButton.button.Position = new UDim2( 1, 5, 0, 5 )


      let internalFrame = new Instance( 'Frame' )
      internalFrame.Parent = clone.Frame
      internalFrame.BackgroundTransparency = 1
      internalFrame.Size = new UDim2( 1, 0, 1, 0 )
      internalFrame.ClipsDescendants = true

      let baseLabel = clone.Frame.TextLabel
      baseLabel.TextSize = Graph( clone.Frame.AbsoluteSize.X, 200, 400, 14, 28 )
      baseLabel.TextWrapped = false
      baseLabel.TextScaled = false
      for ( let i = 0; i < 10; i++ )
      {
         let label = baseLabel.Clone()
         label.Parent = internalFrame
         label.Position = new UDim2( baseLabel.Position.X.Scale, 0, 0, baseLabel.AbsoluteSize.Y * 0.5 + ( i * baseLabel.AbsoluteSize.Y * 1.35 ) )
         file.taskLabels.push( label )
         if ( i === 7 )
            label.TextTransparency = 0.4
         else if ( i > 7 )
            label.TextTransparency = 0.7
      }
      baseLabel.Destroy()

      clone.AncestryChanged.Connect(
         function ()
         {
            clone.Parent = undefined
         } )

      RefreshTaskList()
      RecreateTaskListCallouts2d()
      RecreateTaskListMapIcons()
   } )
}


function RedrawTaskListUI()
{
   Assert( file.assignments.size() > 0, "No assignments!" )

   if ( file.existingUI === undefined )
      return

   let count = 0
   for ( let assignment of file.assignments )
   {
      if ( assignment.status === 0 )
         count++
   }

   let assignIndex = 0
   file.taskLabels[0].Text = count + " Tasks Remaining:"
   for ( let i = 1; i < file.taskLabels.size(); i++ )
   {
      print( "i " + i )
      let label = file.taskLabels[i]
      label.Text = ""

      for ( let p = assignIndex; p < file.assignments.size(); p++ )
      {
         let assignment = file.assignments[p]
         if ( assignment.status === 0 )
         {
            let taskSpec = GetTaskSpec( assignment.taskName )
            label.Text = assignment.roomName + ": " + taskSpec.title
            assignIndex = p + 1
            break
         }
      }

      if ( assignIndex >= file.assignments.size() )
         break
   }

   RecreateTaskListCallouts2d()
   RecreateTaskListMapIcons()
}


function RecreateTaskListMapIcons()
{
   ClearMinimapIcons()
   let rooms = GetRooms()

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