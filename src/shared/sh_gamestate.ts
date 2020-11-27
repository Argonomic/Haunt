import { AddNetVar } from "shared/sh_player_netvars"

export const MAX_TASKLIST_SIZE = 10
export const JSON_TASKLIST = "JSN_TASKLIST"

export class Assignment
{
   roomName: string
   taskName: string
   status: number

   constructor( roomName: string, taskName: string, status: number )
   {
      this.roomName = roomName
      this.taskName = taskName
      this.status = status
   }
}

export function AddGameStateNetVars()
{
   AddNetVar( "string", JSON_TASKLIST, "{}" )
}

