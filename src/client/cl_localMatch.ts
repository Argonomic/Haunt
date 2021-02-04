import { Match } from "shared/sh_gamestate"

class File
{
   localMatch = new Match()
}
let file = new File()

export function CL_LocalMatchSetup()
{

}

export function GetLocalMatch(): Match
{
   return file.localMatch
}