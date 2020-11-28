import { Players, RunService, UserInputService } from "@rbxts/services"
import { ExecOnChildWhenItExists, PlayerTouchesPart } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"

class File
{
   useTargets: Array<BasePart> = []
   onUseCallbacks: Array<Function> = []
}

let file = new File()

export function AddOnUseCallback( func: Function )
{
   file.onUseCallbacks.push( func )
}

export function CL_UseSetup()
{
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      ExecOnChildWhenItExists( gui, "UseUI", function ( useUI: ScreenGui )
      {
         let player = Players.LocalPlayer
         useUI.Enabled = false
         useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

         RunService.RenderStepped.Connect( function ()
         {
            for ( let target of file.useTargets )
            {
               if ( PlayerTouchesPart( player, target ) )
               {
                  useUI.Enabled = true
                  return
               }
            }

            useUI.Enabled = false
         } )

         ExecOnChildWhenItExists( useUI, "ImageButton", function ( imageButton: ImageButton )
         {
            if ( UserInputService.TouchEnabled )
            {
               imageButton.TouchTap.Connect( OnUse )
            }
            else
            {
               imageButton.MouseButton1Up.Connect( OnUse )
            }
         } )
      } )
   } )
}

function OnUse()
{
   for ( let callback of file.onUseCallbacks )
   {
      callback()
   }
}


export function ResetUseTargets()
{
   file.useTargets = []
}

export function AddUseTarget( part: BasePart )
{
   file.useTargets.push( part )
}
