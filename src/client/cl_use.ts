import { Players, RunService, Workspace } from "@rbxts/services"
import { GetUseResultsForAttempt, UseResults } from "shared/sh_use"
import { Assert, GetFirstChildWithName, IsAlive } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"
import { SendRPC } from "./cl_utils"


class File
{
   debounceTime = 0
   playerUseDisabledCallback: Array<Function> = []
}

let file = new File()

export function AddPlayerUseDisabledCallback( func: Function )
{
   file.playerUseDisabledCallback.push( func )
}

export function SetUseDebounceTime( time: number )
{
   file.debounceTime = Workspace.DistributedGameTime + time
}

export function CL_UseSetup()
{
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      let useUI = GetFirstChildWithName( gui, 'UseUI' ) as ScreenGui
      useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

      let imageButton = GetFirstChildWithName( useUI, 'ImageButton' ) as ImageButton
      let textLabel = GetFirstChildWithName( imageButton, "TextLabel" ) as TextLabel
      Assert( textLabel !== undefined, "Couldn't find TextLabel" )

      imageButton.MouseButton1Up.Connect( function ()
      {
         let useResults = GetUseResultsForAttempt( Players.LocalPlayer )
         if ( useResults === undefined )
            return

         SendRPC( "RPC_FromClient_OnUse" )
      } )

      let player = Players.LocalPlayer

      function CanUse(): boolean
      {
         if ( !IsAlive( player ) )
            return false

         if ( Workspace.DistributedGameTime < file.debounceTime )
            return false

         for ( let callback of file.playerUseDisabledCallback )
         {
            if ( callback() )
               return false
         }

         return true
      }

      useUI.Enabled = false
      let lastUseResults: UseResults | undefined

      let connect = RunService.RenderStepped.Connect( function ()
      {
         if ( !CanUse() )
         {
            if ( useUI.Enabled )
               useUI.Enabled = false

            return
         }

         let newUseResults = GetUseResultsForAttempt( player )
         if ( newUseResults !== lastUseResults )
         {
            lastUseResults = newUseResults
            if ( newUseResults === undefined )
            {
               useUI.Enabled = false
               return
            }

            imageButton.Image = newUseResults.usable.image
            textLabel.Text = newUseResults.usable.text
            useUI.Enabled = true
         }
      } )

      useUI.AncestryChanged.Connect( function ()
      {
         connect.Disconnect()
         useUI.Destroy()
      } )

   } )
}
