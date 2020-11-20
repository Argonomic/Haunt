import { AddNetVar_String } from "shared/sh_player_netvars"
import * as u from "shared/sh_utils"

export const MAX_TASKLIST_SIZE = 10
export const TASKLIST_ROOM = "TLr"
export const TASKLIST_TASK = "TLt"
export const TASKLIST_NONE = "none"

export function AddGameStateNetVars()
{
   for ( let i = 0; i < MAX_TASKLIST_SIZE; i++ )
   {
      AddNetVar_String( TASKLIST_ROOM + i, "none" )
      AddNetVar_String( TASKLIST_TASK + i, TASKLIST_NONE )
   }


}