import * as u from "shared/sh_utils"
import { AddCallback_OnPlayerConnected } from "shared/sh_player"
import { AddGameStateNetVars, MAX_TASKLIST_SIZE, TASKLIST_ROOM, TASKLIST_TASK } from "shared/sh_gamestate"
import { SetNetVar_Number, GetNetVar_Number, SetNetVar_String } from "shared/sh_player_netvars"
import { Players } from "@rbxts/services"
import { GetAllRoomsAndTasks } from "./sv_rooms"

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
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   u.ArrayRandomize( roomsAndTasks )

   for ( let i = 0; i < roomsAndTasks.size() && i < MAX_TASKLIST_SIZE; i++ )
   {
      // fedss
      let roomsAndTask = roomsAndTasks[i]
      //SetNetVar_String( player, TASKLIST_ROOM + i, roomsAndTask.room.name )
      //SetNetVar_String( player, TASKLIST_TASK + i, roomsAndTask.task.name )
   }

}