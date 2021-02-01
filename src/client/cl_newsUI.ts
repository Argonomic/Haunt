import { Assert } from "shared/sh_assert";
import { GAME_STATE, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { GetFirstChildWithName, GetLocalPlayer } from "shared/sh_utils";
import { GetLocalMatch } from "./cl_gamestate";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   storeUI: ScreenGui | undefined
}
let file = new File()

function GetNewsUI(): ScreenGui
{
   let storeUI = file.storeUI
   if ( storeUI === undefined )
   {
      Assert( false, "No store ui" )
      throw undefined
   }
   return storeUI
}

export function CL_NewsUISetup()
{
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.storeUI !== undefined )
      {
         GetNewsUI().Parent = folder
         return
      }

      file.storeUI = GetFirstChildWithName( folder, 'NewsUI' ) as ScreenGui
      file.storeUI.DisplayOrder = UIORDER.UIORDER_SCORE_TOTAL
   } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
      function ()
      {
         wait() // for gamestate
         GetNewsUI().Enabled = GetLocalMatch().GetGameState() < GAME_STATE.GAME_STATE_INTRO
      } )


   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      GetNewsUI().Parent = undefined
   } )
}
