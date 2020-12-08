import { Workspace } from "@rbxts/services"
import { Assert, IsClient } from "./sh_utils"

class File
{
   timeDelta = 0
}

let file = new File()

export function GetServerTime(): number
{
   return Workspace.DistributedGameTime - file.timeDelta
}

export function SetTimeDelta( delta: number )
{
   Assert( IsClient(), "Only clients should change deltatime" )
   file.timeDelta = delta
}

export function SH_TimeSetup()
{
}