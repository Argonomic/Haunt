import * as u from "shared/sh_utils"
import { Players } from "@rbxts/services"
import { AddTaskUI, TASK_UI } from "client/cl_tasks"


type EDITOR_ScreenUIWithFrame = ScreenGui &
{
   Frame: Frame &
   {
      TextLabel: TextLabel
   }
}


export function CL_TaskListSetup()
{
   let gui = Players.LocalPlayer.WaitForChild( 'PlayerGui' )
   let taskList = gui.WaitForChild( 'TaskList' ) as EDITOR_ScreenUIWithFrame
   taskList.Frame.TextLabel.Visible = false

   AddTaskUI( TASK_UI.TASK_LIST, ( taskList as ScreenGui ) )

   /*
   
      local playerTaskStatus = {}
      for _, room in pairs( _G.rooms ) do
         for _, task in pairs( room.tasks ) do
            table.insert( playerTaskStatus, task )
         end
      end
      _G.u.AddPlayerTaskStatus( playerTaskStatus )
   
      _G.u.UpdateTaskList()
   
   */
}