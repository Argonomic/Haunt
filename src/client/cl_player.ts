import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_player"
import { SetNetVar_Number, GetNetVar_Number } from "shared/sh_player_netvars"

class File
{
   localPlayerReady: boolean = false
}

let file = new File()

export function SetLocalPlayerReady( player: Player )
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