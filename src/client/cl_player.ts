import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_player"


class File
{
   localPlayerReady: boolean = false
}

let file = new File()

export function SetLocalPlayerReady()
{
   file.localPlayerReady = true
}

export function GetLocalPlayerReady(): boolean
{
   return file.localPlayerReady
}

export function CL_PlayerSetup()
{
   AddCallback_OnPlayerConnected( SetLocalPlayerReady )
}