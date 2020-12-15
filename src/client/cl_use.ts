import { RunService, Workspace } from "@rbxts/services"
import { GetPlayerCooldownTimeRemaining } from "shared/sh_cooldown"
import { USE_COOLDOWNS } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { GetUseResultsForAttempt, UseResults } from "shared/sh_use"
import { Assert, GetFirstChildWithName, GetLocalPlayer, IsAlive } from "shared/sh_utils"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui"
import { SendRPC } from "./cl_utils"


class File
{
   debounceTime = 0
   playerUseDisabledCallback: Array<Function> = []
   useUI: ScreenGui | undefined
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
   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.useUI !== undefined )
      {
         file.useUI.Parent = gui
         return
      }
      let useUI = GetFirstChildWithName( gui, 'UseUI' ) as ScreenGui
      file.useUI = useUI
      useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

      let imageButton = GetFirstChildWithName( useUI, 'ImageButton' ) as ImageButton
      let textButton = GetFirstChildWithName( imageButton, "TextButton" ) as TextButton
      Assert( textButton !== undefined, "Couldn't find TextLabel" )
      let countdown = GetFirstChildWithName( imageButton, "Countdown" ) as TextLabel

      let player = GetLocalPlayer()

      textButton.MouseButton1Up.Connect( function ()
      {
         let useResults = GetUseResultsForAttempt( player )
         if ( useResults === undefined )
            return

         if ( GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
            return

         SendRPC( "RPC_FromClient_OnUse" )
      } )

      imageButton.MouseButton1Up.Connect( function ()
      {
         let useResults = GetUseResultsForAttempt( player )
         if ( useResults === undefined )
            return

         if ( GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
            return

         SendRPC( "RPC_FromClient_OnUse" )
      } )


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

      const COLOR_GRAY = new Color3( 0.5, 0.5, 0.5 )
      const COLOR_WHITE = new Color3( 1.0, 1.0, 1.0 )

      RunService.RenderStepped.Connect( function ()
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
            textButton.Text = newUseResults.usable.text
            useUI.Enabled = true

            let cooldownRemaining = GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + newUseResults.usable.useType )
            if ( cooldownRemaining > 0 )
               cooldownRemaining++ // add one because otherwise 0.5 is not drawn, but can't use.

            cooldownRemaining = math.floor( cooldownRemaining );
            if ( cooldownRemaining > 0 )
            {
               countdown.Text = cooldownRemaining + ""
               countdown.Visible = true
               imageButton.ImageTransparency = 0.5
               textButton.TextTransparency = 0.5
               textButton.TextColor3 = COLOR_GRAY
            }
            else
            {
               countdown.Visible = false
               imageButton.ImageTransparency = 0
               textButton.TextTransparency = 0
               textButton.TextColor3 = COLOR_WHITE
            }
         }
      } )

   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.useUI !== undefined )
            file.useUI.Parent = undefined
      } )
}