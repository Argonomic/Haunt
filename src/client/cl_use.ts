import { Players, RunService, Workspace } from "@rbxts/services"
import { GetUsable, Usable } from "shared/sh_use"
import { Assert, ExecOnChildWhenItExists, GetFirstChildWithName, IsAlive } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"
import { SendRPC } from "./cl_utils"

export type PLAYER_OR_PART = Player | BasePart

class File
{
   useTargets: Array<PLAYER_OR_PART> = []
   useTargetGetter: Array<Function> = []
   //onUseCallbacks: Array<Function> = []
   debounceTime = 0
   playerCannotUseCallback: Array<Function> = []
}

let file = new File()

/*
export function AddOnUseCallback( func: Function )
{
   file.onUseCallbacks.push( func )
}
*/

export function AddPlayerCannotUseCallback( func: Function )
{
   file.playerCannotUseCallback.push( func )
}

export function SetUseDebounceTime( time: number )
{
   file.debounceTime = Workspace.DistributedGameTime + time
}

function UseButtonVisible( useUI: ScreenGui, imageButton: ImageButton, textLabel: TextLabel )
{
   let player = Players.LocalPlayer

   function CanUse(): boolean
   {
      if ( !IsAlive( player ) )
         return false

      if ( Workspace.DistributedGameTime < file.debounceTime )
         return false

      for ( let callback of file.playerCannotUseCallback )
      {
         if ( callback() )
            return false

      }

      return true
   }

   useUI.Enabled = false
   let lastUsable: Usable | undefined
   RunService.RenderStepped.Connect( function ()
   {
      if ( useUI.Enabled )
      {
         if ( !CanUse() )
         {
            useUI.Enabled = false
            return
         }
      }

      if ( !CanUse() )
         return

      let newUsable = GetUsable( player, file.useTargets )
      if ( newUsable !== lastUsable )
      {
         lastUsable = newUsable
         if ( newUsable === undefined )
         {
            useUI.Enabled = false
            return
         }

         imageButton.Image = newUsable.image
         textLabel.Text = newUsable.text
         useUI.Enabled = true
      }
   } )
}

export function CL_UseSetup()
{
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      ExecOnChildWhenItExists( gui, "UseUI", function ( useUI: ScreenGui )
      {
         useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

         ExecOnChildWhenItExists( useUI, "ImageButton", function ( imageButton: ImageButton )
         {
            let textLabel = GetFirstChildWithName( imageButton, "TextLabel" )
            if ( textLabel === undefined )
            {
               Assert( false, "Couldn't find TextLabel" )
               return
            }

            imageButton.MouseButton1Up.Connect( function ()
            {
               let usable = GetUsable( Players.LocalPlayer, file.useTargets )
               if ( usable !== undefined )
               {
                  SendRPC( "RPC_FromClient_OnUse", usable.useType )
                  //for ( let callback of file.onUseCallbacks )
                  //{
                  //   callback( usable.useType )
                  //}
               }
            } )

            UseButtonVisible( useUI, imageButton, textLabel as TextLabel )
         } )
      } )
   } )
}

export function ResetUseTargets()
{
   file.useTargets = []

   for ( let func of file.useTargetGetter )
   {
      file.useTargets = file.useTargets.concat( func() )
   }
}

export function AddUseTargetGetter( func: Function )
{
   file.useTargetGetter.push( func )
}