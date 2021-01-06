import { HttpService, Workspace } from "@rbxts/services"
import { GetTaskSpec } from "client/cl_tasks"
import { Assignment, AssignmentIsSame, IsPracticing, NETVAR_JSON_GAMESTATE, NETVAR_JSON_TASKLIST, NETVAR_MEETINGS_CALLED, USETYPES } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_Number, GetNetVar_String } from "shared/sh_player_netvars"
import { AddRoomChangedCallback, GetCurrentRoom, GetRooms } from "./cl_rooms"
import { GetFirstChildWithName, GetLocalPlayer, Graph, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddCallout, ClearCallouts, InitCallouts } from "./cl_callouts2d"
import { Room, Task } from "shared/sh_rooms"
import { AddMapIcon, ClearMinimapIcons, GetMinimapReferencesFrame } from "./cl_minimap"
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui"
import { GetUsableByType } from "shared/sh_use"
import { GetLocalGame, GetLocalIsSpectator } from "./cl_gamestate"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { Tween } from "shared/sh_tween"

const CALLOUTS_NAME = "TASKLIST_CALLOUTS"
const LOCAL_PLAYER = GetLocalPlayer()

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
   lastAssignmentCount = 0
   existingUI: EDITOR_ScreenUIWithFrame | undefined
   taskLabels: Array<TextLabel> = []
   toggleButton: ToggleButton | undefined
   framePosition = new UDim2( 0, 0, 0, 0 )
   gainedAssignmentTime = new Map<Assignment, number>()
}

export function TasksRemaining(): number
{
   let count = 0
   for ( let assignment of file.assignments )
   {
      if ( assignment.status === 0 )
         count++
   }
   return count
}

let file = new File()

function RefreshTaskList()
{
   if ( file.existingUI === undefined )
      return

   let frame = GetMinimapReferencesFrame()
   if ( frame !== undefined )
   {
      file.framePosition = new UDim2( 0, frame.AbsolutePosition.X, 0, frame.AbsoluteSize.Y + frame.AbsolutePosition.X )
      file.existingUI.Frame.Position = file.framePosition
   }

   let json = GetNetVar_String( GetLocalPlayer(), NETVAR_JSON_TASKLIST )
   let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
   file.assignments = assignments

   if ( file.lastAssignmentCount !== assignments.size() )
   {
      file.lastAssignmentCount = assignments.size()
      if ( file.toggleButton !== undefined )
         file.toggleButton.Open()
   }

   RedrawTaskListUI()
}

export function CL_TaskListSetup()
{
   InitCallouts( CALLOUTS_NAME )

   AddRoomChangedCallback( RecreateTaskListCallouts2d )

   GetUsableByType( USETYPES.USETYPE_TASK ).DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let parts: Array<BasePart> = []
         let room = GetCurrentRoom( LOCAL_PLAYER )

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

         if ( GetLocalIsSpectator() )
            return []

         if ( GetNetVar_Number( player, NETVAR_MEETINGS_CALLED ) > 0 )
            return []

         let room = GetCurrentRoom( LOCAL_PLAYER )
         if ( room.meetingTrigger !== undefined )
            return [room.meetingTrigger]

         return []
      } )

   AddNetVarChangedCallback( NETVAR_JSON_TASKLIST,
      function ()
      {
         let json = GetNetVar_String( GetLocalPlayer(), NETVAR_JSON_TASKLIST )
         let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
         let lostAssignments = new Map<Assignment, boolean>()
         for ( let pair of file.gainedAssignmentTime )
         {
            lostAssignments.set( pair[0], true )
         }

         for ( let assignment of assignments )
         {
            if ( lostAssignments.has( assignment ) )
               lostAssignments.delete( assignment )

            if ( !file.gainedAssignmentTime.has( assignment ) )
               file.gainedAssignmentTime.set( assignment, Workspace.DistributedGameTime )
         }

         for ( let pair of lostAssignments )
         {
            // remove assignments we don't have anymore
            file.gainedAssignmentTime.delete( pair[0] )
         }

         RefreshTaskList()
      } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait()  // wait for role to be updated elsewhere
               RefreshTaskList()
            } )
      } )

   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.existingUI !== undefined )
      {
         file.existingUI.Parent = folder
         return
      }

      let taskList = GetFirstChildWithName( folder, 'TaskList' ) as EDITOR_ScreenUIWithFrame
      taskList.Enabled = false
      taskList.DisplayOrder = UIORDER.UIORDER_TASKLIST

      let clone = taskList.Clone()
      clone.Name = clone.Name + " COPY"
      clone.Enabled = !IsPracticing( GetLocalPlayer() )
      clone.Parent = folder
      clone.ResetOnSpawn = false
      file.existingUI = clone

      clone.Frame.Position = file.framePosition

      clone.Frame.Position = new UDim2( 0.01, 0, 1, -clone.Frame.AbsolutePosition.X )

      let toggleButton = new ToggleButton( clone.Frame, 0,
         { AnchorPoint: new Vector2( 1.0, 0 ) }, // hidden
         { AnchorPoint: new Vector2( 0.0, 0 ) } // visible
      )
      toggleButton.button.Position = new UDim2( 1, 5, 0, 5 )
      file.toggleButton = toggleButton

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

      RefreshTaskList()
      RecreateTaskListCallouts2d()
      RecreateTaskListMapIcons()
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.existingUI !== undefined )
            file.existingUI.Parent = undefined
      } )
}



export function RedrawTaskListUI()
{
   if ( file.existingUI === undefined )
      return

   let count = 0
   for ( let assignment of file.assignments )
   {
      if ( assignment.status === 0 )
         count++
   }

   for ( let label of file.taskLabels )
   {
      label.Text = ""
   }

   let game = GetLocalGame()
   if ( game.IsSpectator( GetLocalPlayer() ) )
   {
      let toggleButton = file.toggleButton
      if ( toggleButton !== undefined && count === 0 && toggleButton.IsOpen() )
      {
         toggleButton.Close()

         let position = file.framePosition
         let newPosition = new UDim2( position.X.Scale - 0.25, position.X.Offset, position.Y.Scale, position.Y.Offset )
         // deep close it
         Tween( file.existingUI.Frame, { Position: newPosition, 'AnchorPoint': new Vector2( 1.0, 0 ) }, 1.0 )
      }
      return
   }


   class DrawTask
   {
      total: number = 0
      remaining: number = 0
      roomName = "---"
      title = "---"
   }

   let drawTasks = new Map<string, DrawTask>()
   for ( let assignment of file.assignments )
   {
      if ( !drawTasks.has( assignment.taskName ) )
      {
         let drawTask = new DrawTask()
         drawTask.roomName = assignment.roomName
         let taskSpec = GetTaskSpec( assignment.taskName )
         drawTask.title = taskSpec.title
         drawTasks.set( assignment.taskName, drawTask )
      }
   }

   for ( let assignment of file.assignments )
   {
      let drawTask = drawTasks.get( assignment.taskName ) as DrawTask
      drawTask.total++

      if ( assignment.status === 0 )
         drawTask.remaining++
   }

   for ( let pair of drawTasks )
   {
      if ( pair[1].remaining === 0 )
         drawTasks.delete( pair[0] )
   }

   let startIndex
   let localPlayer = GetLocalPlayer()

   if ( IsPracticing( localPlayer ) )
   {
      file.taskLabels[0].Text = "Try " + drawTasks.size() + " tasks:"
      startIndex = 2
   }
   else if ( game.IsImposter( localPlayer ) )
   {
      file.taskLabels[0].Text = "Kill the innocent before they"
      file.taskLabels[1].Text = "complete their tasks and escape"
      startIndex = 3
   }
   else
   {
      file.taskLabels[0].Text = "Complete your tasks while avoiding"
      file.taskLabels[1].Text = "any Imposters, then escape."
      file.taskLabels[2].Text = drawTasks.size() + " Tasks Remaining:"
      startIndex = 4
   }

   let index = startIndex
   for ( let pair of drawTasks )
   {
      let drawTask = pair[1]
      if ( drawTask.remaining === 0 )
         continue

      let label = file.taskLabels[index]
      if ( drawTask.total === 1 )
         label.Text = drawTask.roomName + ": " + drawTask.title
      else
         label.Text = drawTask.title + " (" + ( drawTask.total - drawTask.remaining ) + "/" + drawTask.total + ")"

      index++
      if ( index >= file.taskLabels.size() )
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
   ClearCallouts( CALLOUTS_NAME )

   let room: Room = GetCurrentRoom( LOCAL_PLAYER )

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

export function ClientHasAssignment( roomName: string, taskName: string ): boolean
{
   for ( let assignment of file.assignments )
   {
      if ( AssignmentIsSame( assignment, roomName, taskName ) )
         return true
   }
   return false
}

export function ClientGetAssignmentAssignedTime( roomName: string, taskName: string ): number
{
   for ( let pair of file.gainedAssignmentTime )
   {
      if ( AssignmentIsSame( pair[0], roomName, taskName ) )
         return pair[1]
   }

   Assert( false, "ClientGetAssignmentAssignedTime" )
   throw undefined
}