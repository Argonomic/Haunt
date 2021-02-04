import { GetTaskSpec } from "client/cl_tasks"
import { NETVAR_JSON_GAMESTATE, NETVAR_JSON_ASSIGNMENTS, GAME_STATE, NETVAR_MEETINGS_CALLED, EmergencyMeetingsRemaining } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars"
import { GetFirstChildWithName, GetLocalPlayer, Graph, Thread } from "shared/sh_utils"
import { GetMinimapReferencesFrame } from "./cl_minimap"
import { AddPlayerGuiFolderExistsCallback, ToggleButton, UIORDER } from "./cl_ui"
import { GetLocalAssignments } from "./cl_gamestate"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { Tween } from "shared/sh_tween"
import { GetLocalMatch } from "./cl_localMatch"

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
   existingUI: EDITOR_ScreenUIWithFrame | undefined
   taskLabels: Array<TextLabel> = []
   toggleButton: ToggleButton | undefined
   framePosition = new UDim2( 0, 0, 0, 0 )
   lastSize = 0

   lastAssignmentCount = 0
}

export function TasksRemaining(): number
{
   let count = 0
   let assignments = GetLocalAssignments()
   for ( let assignment of assignments )
   {
      if ( assignment.status === 0 )
         count++
   }
   return count
}

let file = new File()

export function CL_TaskListSetup()
{
   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         Thread(
            function ()
            {
               wait() // for actions elsewhere
               RefreshTaskList()
            } )
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
      clone.Enabled = false
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
      baseLabel.TextScaled = true // was false??
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
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.existingUI !== undefined )
            file.existingUI.Parent = undefined
      } )
}


function RefreshTaskList()
{
   if ( file.existingUI === undefined )
      return
   if ( file.toggleButton === undefined )
      return
   let toggleButton = file.toggleButton
   let existingUI = file.existingUI

   let frame = GetMinimapReferencesFrame()
   if ( frame !== undefined )
   {
      file.framePosition = new UDim2( 0, frame.AbsolutePosition.X, 0, frame.AbsoluteSize.Y + frame.AbsolutePosition.X )
      file.existingUI.Frame.Position = file.framePosition
   }

   let assignments = GetLocalAssignments()
   let taskSizeIncrease = assignments.size() - file.lastSize
   //print( "taskSizeIncrease: " + taskSizeIncrease )
   file.lastSize = assignments.size()

   if ( file.lastAssignmentCount !== assignments.size() )
   {
      file.lastAssignmentCount = assignments.size()
      //if ( file.toggleButton !== undefined )
      //   file.toggleButton.Open()
   }

   let count = 0
   for ( let assignment of assignments )
   {
      if ( assignment.status === 0 )
         count++
   }

   for ( let label of file.taskLabels )
   {
      label.Text = ""
   }

   let match = GetLocalMatch()
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         break

      default:
         existingUI.Enabled = false
         return
   }

   class DrawTask
   {
      total: number = 0
      remaining: number = 0
      roomName = "---"
      title = "---"
   }

   let drawTasksArr: Array<DrawTask> = []
   {
      let drawTasks = new Map<string, DrawTask>()
      for ( let assignment of assignments )
      {
         if ( !drawTasks.has( assignment.taskName ) )
         {
            let drawTask = new DrawTask()
            drawTask.roomName = assignment.roomName
            let taskSpec = GetTaskSpec( assignment.taskName )
            drawTask.title = taskSpec.title
            drawTasks.set( assignment.taskName, drawTask )
            drawTasksArr.push( drawTask )
         }
      }

      for ( let assignment of assignments )
      {
         let drawTask = drawTasks.get( assignment.taskName ) as DrawTask
         drawTask.total++

         if ( assignment.status === 0 )
            drawTask.remaining++
      }
   }

   drawTasksArr = drawTasksArr.filter( function ( drawTask )
   {
      return drawTask.remaining > 0
   } )

   let startIndex
   let localPlayer = GetLocalPlayer()

   if ( match.IsImpostor( localPlayer ) )
   {
      file.taskLabels[0].Text = "Kill the innocent before they"
      file.taskLabels[1].Text = "complete their tasks and escape"
      startIndex = 2
   }
   else if ( match.IsDetective( LOCAL_PLAYER ) )
   {
      file.taskLabels[0].Text = "You are the Detective."
      file.taskLabels[1].Text = "Discover the Impostors before it's too late."
      let remaining = EmergencyMeetingsRemaining( match, LOCAL_PLAYER )
      file.taskLabels[2].Text = remaining + " emergency meetings remaining."
      startIndex = 3
   }
   else
   {
      file.taskLabels[0].Text = "Complete your tasks while avoiding"
      file.taskLabels[1].Text = "any Impostors, then escape."
      file.taskLabels[2].Text = drawTasksArr.size() + " Tasks Remaining:"
      startIndex = 3
   }

   let index = startIndex
   for ( let drawTask of drawTasksArr )
   {
      if ( drawTask.remaining === 0 )
         continue

      let label = file.taskLabels[index]
      if ( drawTask.total === 1 )
         label.Text = drawTask.title + " (" + drawTask.roomName + ")"
      else
         label.Text = drawTask.title + " (" + ( drawTask.total - drawTask.remaining ) + "/" + drawTask.total + ")"

      index++
      if ( index >= file.taskLabels.size() )
         break
   }

   if ( existingUI.Enabled && drawTasksArr.size() === 0 )
   {
      /*
      Thread(
         function ()
         {
            //toggleButton.Close()

            let position = file.framePosition
            let newPosition = new UDim2( position.X.Scale - 0.25, position.X.Offset, position.Y.Scale, position.Y.Offset )
            // deep close it
            Tween( existingUI.Frame, { Position: newPosition, 'AnchorPoint': new Vector2( 1.0, 0 ) }, 1.0 )
            wait( 1.0 )
            existingUI.Enabled = false
         } )
      */
   }
   else if ( !existingUI.Enabled )
   {
      existingUI.Enabled = true

      //if ( taskSizeIncrease > 0 )
      //   toggleButton.Open()
   }
}
