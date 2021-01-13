import { Workspace } from "@rbxts/services"
import { GetRenderedCooldownTimeRemaining } from "shared/sh_cooldown"
import { USE_COOLDOWNS } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { GetUseResultsForAttempt } from "shared/sh_use"
import { GetFirstChildWithName, GetLocalPlayer, IsAlive } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddClickable, AddPlayerGuiFolderExistsCallback, UIClickResults, EDITOR_ClickableUI, UI_CLICK_RESULTS_TYPE } from "./cl_ui"
import { SendRPC_Client } from "shared/sh_rpc"


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

         SendRPC_Client( "RPC_FromClient_OnUse" )
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

