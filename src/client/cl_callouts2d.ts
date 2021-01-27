import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { AddMapIcon } from "./cl_minimap"
import { AddNetVarChangedCallback } from "shared/sh_player_netvars"
import { CreateCalloutStyleTextLabel, AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui"
import { AddRoomChangedCallback } from "./cl_rooms"
import { Assert } from "shared/sh_assert"
import { ClearMinimapIcons } from "./cl_minimap"
import { CanUseTask, NETVAR_JSON_ASSIGNMENTS, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate"
import { GetCurrentRoom, GetRooms } from "./cl_rooms"
import { TextLabels, GetLocalPlayer, Graph, Thread } from "shared/sh_utils"
import { GetLocalAssignments, GetLocalMatch } from "./cl_gamestate"
import { Room, Task } from "shared/sh_rooms"
import { Workspace } from "@rbxts/services"

const LOCAL_PLAYER = GetLocalPlayer()
const CALLOUTS_NAME = "TASKLIST_CALLOUTS"

class File
{
   activeCallouts = new Map<string, TextLabels>()
   screenUI: ScreenGui | undefined
}
let file = new File()

export function CL_CalloutsSetup()
{
   InitCallouts( CALLOUTS_NAME )

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.screenUI !== undefined )
      {
         file.screenUI.Parent = gui
         return
      }

      let screenUI = new Instance( "ScreenGui" )
      file.screenUI = screenUI
      screenUI.Name = "Callouts2d"
      screenUI.Parent = gui
      screenUI.DisplayOrder = UIORDER.UIORDER_CALLOUTS
      file.screenUI = screenUI
      RedrawAssignmentCalloutsAndMapIcons()
   } )

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      if ( file.screenUI !== undefined )
         file.screenUI.Parent = undefined
   } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         Thread(
            function ()
            {
               wait() // wait for netvar to be used elsewhere
               RedrawAssignmentCalloutsAndMapIcons()
            } )
      } )

   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         Thread(
            function ()
            {
               wait() // wait for netvar to be used elsewhere
               RedrawAssignmentCalloutsAndMapIcons()
            } )
      } )

   AddRoomChangedCallback( function ()
   {
      RedrawAssignmentCalloutsAndMapIcons()
   } )
}

export function InitCallouts( name: string )
{
   Assert( !file.activeCallouts.has( name ), "Already created callouts named " + name )
   file.activeCallouts.set( name, [] )
}

export function ClearCallouts( name: string )
{
   Assert( file.activeCallouts.has( name ), "No callouts named " + name )

   let callouts = file.activeCallouts.get( name ) as TextLabels
   for ( let callout of callouts )
   {
      callout.Destroy()
   }
   file.activeCallouts.set( name, [] )
}

export function AddCallout( name: string, worldPoint: Vector3 )
{
   let camera = Workspace.CurrentCamera
   if ( camera === undefined )
      return

   let [vector, onScreen] = camera.WorldToScreenPoint( worldPoint )
   let viewSize = camera.ViewportSize
   //print( "\t** add callout " + vector )

   let textLabel = CreateCalloutStyleTextLabel()
   textLabel.Parent = file.screenUI

   let X = Graph( vector.X, 0, viewSize.X, 0, 1.0 )
   let Y = Graph( vector.Y, 0, viewSize.Y, 0, 1.0 )
   textLabel.Position = new UDim2( X, 0, Y, 0 )

   let callouts = file.activeCallouts.get( name ) as TextLabels
   callouts.push( textLabel )
   file.activeCallouts.set( name, callouts )

   //let screenPoint = new Vector2( vector.X, vector.Y )
   //let depth = vector.Z
}

function RedrawAssignmentCalloutsAndMapIcons()
{
   ClearMinimapIcons()
   ClearCallouts( CALLOUTS_NAME )

   let assignments = GetLocalAssignments()

   let match = GetLocalMatch()
   if ( !CanUseTask( match, LOCAL_PLAYER ) ) // callouts shouldn't know about usables, should be other way around
      return

   {
      let rooms = GetRooms()

      for ( let assignment of assignments )
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

   {
      let room: Room = GetCurrentRoom( LOCAL_PLAYER )

      for ( let assignment of assignments )
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
}
