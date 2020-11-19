import { ContextActionService } from "@rbxts/services";
import { GetCurrentRoom } from "client/cl_rooms"
import * as cl from "client/cl_utils"

export function CL_InputSetup()
{
   let onPressUse = function ( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( inputObject.KeyCode === Enum.KeyCode.Unknown )
         return

      print( "** * * * onPressUse " + inputObject.KeyCode )
      if ( state === Enum.UserInputState.Begin )
         print( "Begin input" )

      if ( state === Enum.UserInputState.End )
         print( "End input" )

      cl.SendRPC( "RPC_FromClient_OnPlayerUseFromRoom", GetCurrentRoom().name )
   }
   ContextActionService.BindAction( "PlayerInput", onPressUse, false, Enum.KeyCode.ButtonR2, Enum.KeyCode.E )

   let focusControl = function ( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( state === Enum.UserInputState.Begin )
      {
         ContextActionService.UnbindAction( "FocusControl" )
      }
   }
   ContextActionService.BindAction( "FocusControl", focusControl, false, Enum.UserInputType.MouseButton1, Enum.UserInputType.Touch, Enum.UserInputType.Focus )
}
