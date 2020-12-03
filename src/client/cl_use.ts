import { Players, RunService, Workspace } from "@rbxts/services"
import { GetUsableForUseAttempt, Usable, UsePosition } from "shared/sh_use"
import { Assert, GetFirstChildWithName, IsAlive } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"
import { SendRPC } from "./cl_utils"

export type PLAYER_OR_PART = Player | BasePart

class File
{
   useTargets: Array<PLAYER_OR_PART> = []
   usePositions: Array<UsePosition> = []
   useTargetGetter: Array<Function> = []
   usePositionsGetter: Array<Function> = []
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
      if ( !CanUse() )
      {
         if ( useUI.Enabled )
            useUI.Enabled = false

         return
      }

      let newUsable = GetUsableForUseAttempt( player, file.useTargets, file.usePositions )
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
      let useUI = GetFirstChildWithName( gui, 'UseUI' ) as ScreenGui
      useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

      let imageButton = GetFirstChildWithName( useUI, 'ImageButton' ) as ImageButton

      let textLabel = GetFirstChildWithName( imageButton, "TextLabel" )
      if ( textLabel === undefined )
      {
         Assert( false, "Couldn't find TextLabel" )
         return
      }

      imageButton.MouseButton1Up.Connect( function ()
      {
         let usable = GetUsableForUseAttempt( Players.LocalPlayer, file.useTargets, file.usePositions )
         if ( usable === undefined )
            return

         SendRPC( "RPC_FromClient_OnUse", usable.useType )
      } )

      UseButtonVisible( useUI, imageButton, textLabel as TextLabel )
   } )
}

export function ResetUseTargets()
{
   file.useTargets = []

   for ( let func of file.useTargetGetter )
   {
      file.useTargets = file.useTargets.concat( func() )
   }
   for ( let func of file.usePositionsGetter )
   {
      file.usePositions = file.usePositions.concat( func() )
   }
}

export function AddUseTargetGetter( func: Function )
{
   file.useTargetGetter.push( func )
}

export function AddUsePositionsGetter( func: Function )
{
   file.usePositionsGetter.push( func )
}