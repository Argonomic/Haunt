import * as u from "shared/sh_utils"
import { AnyPlayerHasConnected } from "shared/sh_onPlayerConnect"

class File
{
}

let file = new File()

export function GetLocalPlayerReady(): boolean
{
   return AnyPlayerHasConnected()
}

export function CL_PlayerSetup()
{

}