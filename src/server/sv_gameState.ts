import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_player"
import { AddGameStateNetVars } from "shared/sh_gamestate"
import { SetNetVar_Number, GetNetVar_Number } from "shared/sh_player_netvars"
import { Players } from "@rbxts/services"

class File
{

}

let file = new File()


export function SV_GameStateSetup()
{
   AddGameStateNetVars()

   AddCallback_OnPlayerConnected( OnPlayerConnected )

}

function OnPlayerConnected( player: Player )
{

}