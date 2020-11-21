import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { Assignment, AddGameStateNetVars, JSON_TASKLIST, MAX_TASKLIST_SIZE } from "shared/sh_gamestate"
import { SetNetVar } from "shared/sh_player_netvars"
import { GetAllRoomsAndTasks, GetRoom } from "./sv_rooms"
import { HttpService } from "@rbxts/services"
import { AddRPC } from "shared/sh_rpc"
import { Task } from "shared/sh_rooms"
import { SendRPC } from "./sv_utils"
import { CheckOutOfBoundsOfParent } from "client/cl_ui"

class File
{
   assignments = new Map<Player, Array<Assignment>>()
}

let file = new File()

export function SV_GameStateSetup()
{
   AddGameStateNetVars()

   AddCallback_OnPlayerConnected( OnPlayerConnected )
   AddRPC( "RPC_FromClient_OnPlayerUseFromRoom", RPC_FromClient_OnPlayerUseFromRoom )
   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )
}

export function PlayerHasUnfinishedAssignment( player: Player, roomName: string, taskName: string ): boolean
{
   let assignments = file.assignments.get( player )
   if ( assignments === undefined )
   {
      u.Assert( false, "Player has no assignments" )
      throw undefined
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
         return assignment.status === 0
   }

   return false
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   let assignments = file.assignments.get( player )
   if ( assignments === undefined )
   {
      u.Assert( false, "Player has no assignments" )
      return
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
      {
         assignment.status = 1
      }
   }
   UpdateTasklistNetvar( player )
}

function AssignTasks( player: Player )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   u.ArrayRandomize( roomsAndTasks )
   roomsAndTasks = roomsAndTasks.slice( 0, MAX_TASKLIST_SIZE )
   for ( let roomAndTask of roomsAndTasks )
   {
      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name, 0 )
      assignments.push( assignment )
   }

   file.assignments.set( player, assignments )
   UpdateTasklistNetvar( player )
}

function UpdateTasklistNetvar( player: Player )
{
   let assignments = file.assignments.get( player )
   u.Assert( assignments !== undefined, "Player does not have tasklist" )
   if ( assignments === undefined )
      return

   let encode = HttpService.JSONEncode( assignments )
   print( "ENCODE " + encode )
   SetNetVar( player, JSON_TASKLIST, encode )
}

function OnPlayerConnected( player: Player )
{
   AssignTasks( player )
}

function RPC_FromClient_OnPlayerUseFromRoom( player: Player, roomName: string )
{
   print( "RPC_FromClient_OnPlayerUseFromRoom " + roomName )
   let room = GetRoom( roomName )
   u.Assert( room !== undefined, "Unknown room " + roomName )

   let playerOrg = u.GetPosition( player )

   let usedTask = function ( task: Task ): boolean
   {
      let dist = math.abs( ( playerOrg.sub( task.volume.Position ) ).Magnitude )

      if ( dist > 6 )
         return false

      let parts = u.GetTouchingParts( task.volume as BasePart )

      for ( let part of parts )
      {
         let partPlayer = u.GetPlayerFromDescendant( part )
         if ( partPlayer === player )
         {
            if ( PlayerHasUnfinishedAssignment( player, roomName, task.name ) )
               SendRPC( "RPC_FromServer_OnPlayerUseTask", player, roomName, task.name )

            // cancel if you walk away
            let co = coroutine.create( function ()
            {
               for ( ; ; )
               {
                  wait( 1 )
                  if ( !u.PlayerTouchesPart( player, task.volume, 8 ) )
                     break
               }

               if ( PlayerHasUnfinishedAssignment( player, roomName, task.name ) )
                  SendRPC( "RPC_FromServer_CancelTask", player )
            } )
            coroutine.resume( co )

            return true
         }
      }
      return false
   }

   for ( let task of room.tasks )
   {
      if ( usedTask( task ) )
         return
   }
}

