import { Workspace } from "@rbxts/services"
import { GetRenderedCooldownTimeRemaining } from "shared/sh_cooldown"
import { USE_COOLDOWNS } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { GetUseResultsForAttempt } from "shared/sh_use"
import { GetFirstChildWithName, GetLocalPlayer, IsAlive } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddClickable, AddPlayerGuiFolderExistsCallback, UIClickResults, EDITOR_ClickableUI, UI_CLICK_RESULTS_TYPE } from "./cl_ui"
import { SendRPC } from "./cl_utils"


class File
{
   debounceTime = 0
   playerUseDisabledCallback: Array<Function> = []
   useUI: EDITOR_ClickableUI | undefined
}

let file = new File()

export function GetUseUIForReference(): EDITOR_ClickableUI 
{
   if ( file.useUI === undefined )
   {
      Assert( false, "GetUseUIForReference" )
      throw undefined
   }
   return file.useUI
}

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
      let useUI = GetFirstChildWithName( gui, 'UseUI' ) as EDITOR_ClickableUI
      file.useUI = useUI


      let player = GetLocalPlayer()

      function CanClickFunc(): boolean 
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

      function OnClickFunc(): void 
      {
         let useResults = GetUseResultsForAttempt( player )
         if ( useResults === undefined )
            return

         if ( GetRenderedCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
            return

         SendRPC( "RPC_FromClient_OnUse" )
      }

      let lastUseType: undefined | number

      function SetArt_ReturnClickResults( imageButton: ImageButton, textButton: TextButton ): UIClickResults 
      {
         let results = new UIClickResults()
         let newUseResults = GetUseResultsForAttempt( player )
         if ( newUseResults === undefined )
         {
            results.resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_HIDE
            return results
         }

         results.cooldown = GetRenderedCooldownTimeRemaining( player, USE_COOLDOWNS + newUseResults.usable.useType )
         results.resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_COOLDOWN

         if ( newUseResults.usedThing === undefined )
            results.resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_VISIBLE_DISABLED

         if ( newUseResults.usable.useType === lastUseType )
            return results

         lastUseType = newUseResults.usable.useType
         imageButton.Image = newUseResults.usable.image
         textButton.Text = newUseResults.usable.text
         return results
      }

      AddClickable( useUI, CanClickFunc, OnClickFunc, SetArt_ReturnClickResults )
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.useUI !== undefined )
            file.useUI.Parent = undefined
      } )
}



/*
function DFSDFDFd( useUI: ScreenGui )
{
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
         if ( cooldownRemaining > 0 || newUseResults.usedThing === undefined )
         {
            if ( cooldownRemaining > 0 )
            {
               countdown.Text = cooldownRemaining + ""
               countdown.Visible = true
            }
            else
            {
               countdown.Visible = false
            }

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

}

*/