import { GetAbility, AddAbilitiesChangedCallback, GetPlayerAbilities, CanUseAbility, ABILITY_COOLDOWNS } from "shared/sh_ability";
import { GetRenderedCooldownTimeRemaining } from "shared/sh_cooldown";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetExistingFirstChildWithNameAndClassName, GetLocalPlayer } from "shared/sh_utils";
import { AddClickable, AddPlayerGuiFolderExistsCallback, EDITOR_ClickableUI, UIClickResults, UI_CLICK_RESULTS_TYPE } from "./cl_ui";
import { GetUseUIForReference } from "./cl_use";

class File
{
   template: EDITOR_ClickableUI | undefined
   guis: Array<EDITOR_ClickableUI> = []
}
let file = new File()


export function CL_Ability_Setup()
{
   let lastFolder: Folder | undefined
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      lastFolder = folder
      if ( file.template !== undefined )
      {
         RedrawAbilityUIs( folder )
         return
      }

      let ui = GetExistingFirstChildWithNameAndClassName( folder, 'AbilityUI', 'ScreenGui' ) as EDITOR_ClickableUI
      file.template = ui
      ui.Parent = undefined
      ui.Enabled = false
      ui.ResetOnSpawn = false
      RedrawAbilityUIs( folder )
   } )

   let localPlayer = GetLocalPlayer()
   AddAbilitiesChangedCallback(
      function ( player: Player )
      {
         if ( player !== localPlayer )
            return

         if ( lastFolder !== undefined )
            RedrawAbilityUIs( lastFolder )
      } )
}

export function RedrawAbilityUIs( folder: Folder )
{
   print( "RedrawAbilityUIs" )
   let template = file.template
   if ( template === undefined )
      return

   // redraw player abilities
   for ( let ui of file.guis )
   {
      ui.Destroy()
   }

   file.guis = []

   let player = GetLocalPlayer()
   let abilityIndices = GetPlayerAbilities( player )
   let referenceUI = GetUseUIForReference()
   let position = referenceUI.ImageButton.Position

   let xSize = referenceUI.ImageButton.AbsoluteSize.X

   function CanClickFunc(): boolean 
   {
      return true
   }

   print( "abilityIndices: " + abilityIndices.size() )

   for ( let index of abilityIndices )
   {
      let ability = GetAbility( index )
      let ui = template.Clone()
      ui.Name = ui.Name + " Clone"
      ui.Enabled = true
      ui.Parent = folder

      ui.ImageButton.Position = new UDim2( position.X.Scale, position.X.Offset + xSize * ( file.guis.size() + 1 ) * -1.2, position.Y.Scale, position.Y.Offset )
      file.guis.push( ui )

      function OnClickFunc(): void 
      {
         if ( !CanUseAbility( player, ability.abilityIndex ) )
            return

         SendRPC_Client( "RPC_FromClient_UseAbility", index )
      }

      let setImage = false

      function SetArt_ReturnClickResults( imageButton: ImageButton, textButton: TextButton ): UIClickResults 
      {
         let results = new UIClickResults()
         results.cooldown = GetRenderedCooldownTimeRemaining( player, ABILITY_COOLDOWNS + index )
         results.resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_COOLDOWN

         if ( !setImage )
         {
            setImage = true
            imageButton.Image = ability.icon
            textButton.Text = ability.name
         }

         if ( !CanUseAbility( player, ability.abilityIndex ) )
            results.resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_VISIBLE_DISABLED

         return results
      }

      AddClickable( ui, CanClickFunc, OnClickFunc, SetArt_ReturnClickResults )
   }
}
