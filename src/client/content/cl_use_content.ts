import { USETYPES } from "shared/sh_gamestate"
import { Assert } from "shared/sh_assert"
import { Task } from "shared/sh_rooms"
import { GetUsableByType } from "shared/sh_use"
import { CanCallMeeting, CanUseTask } from "shared/content/sh_use_content"
import { GetLocalAssignments, GetLocalMatch } from "client/cl_gamestate"
import { GetCurrentRoom } from "client/cl_rooms"

export function CL_UseContentSetup()
{
   GetUsableByType( USETYPES.USETYPE_TASK ).DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         if ( !CanUseTask( GetLocalMatch(), player ) )
            return []

         let parts: Array<BasePart> = []
         let room = GetCurrentRoom( player )
         let assignments = GetLocalAssignments()
         for ( let assignment of assignments )
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
         let match = GetLocalMatch()

         if ( !CanCallMeeting( match, player ) )
            return []

         let room = GetCurrentRoom( player )
         if ( room.meetingTrigger !== undefined )
            return [room.meetingTrigger]

         return []
      } )
}