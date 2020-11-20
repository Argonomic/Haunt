import { AddNetVar_Number } from "shared/sh_player_netvars"
import * as u from "shared/sh_utils"

export function AddGameStateNetVars()
{
   AddNetVar_Number( "testnum", 3 )
}