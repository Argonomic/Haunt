import { Assert } from "shared/sh_assert";
import { GetGameModeConsts } from "shared/sh_gameModeConsts";
import { GAME_STATE, NETVAR_JSON_GAMESTATE, NETVAR_PURCHASED_IMPOSTOR } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVar, AddNetVarChangedCallback, GetNetVar_Number } from "shared/sh_player_netvars";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetStashScore } from "shared/sh_score";
import { STORE_BUY_IMPOSTOR } from "shared/sh_settings";
import { GetFirstChildWithName, GetLocalPlayer } from "shared/sh_utils";
import { DrawBadPurchase } from "./cl_coins";
import { GetLocalMatch } from "./cl_gamestate";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

const LOCAL_PLAYER = GetLocalPlayer()

type Editor_StoreUI = ScreenGui &
{
   Frame: Frame &
   {
      InfoFrame: Frame &
      {
         Status: TextLabel
      }

      BuyButton: TextButton
   }
}

class File
{
   storeUI: Editor_StoreUI | undefined
}
let file = new File()

function GetStoreUI(): Editor_StoreUI
{
   let storeUI = file.storeUI
   if ( storeUI === undefined )
   {
      Assert( false, "No store ui" )
      throw undefined
   }
   return storeUI
}

export function CL_StoreSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.storeUI !== undefined )
      {
         GetStoreUI().Parent = folder
         return
      }

      file.storeUI = GetFirstChildWithName( folder, 'Store' ) as Editor_StoreUI
      if ( GetGameModeConsts().canPurchaseImpostor )
      {
         file.storeUI.Enabled = true
         AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
            function ()
            {
               wait() // for state to update
               GetStoreUI().Enabled = GetLocalMatch().GetGameState() < GAME_STATE.GAME_STATE_INTRO
            } )
      }
      else
      {
         file.storeUI.Enabled = false
         return
      }
      file.storeUI.DisplayOrder = UIORDER.UIORDER_SCORE_TOTAL

      ResetText()

      file.storeUI.Frame.BuyButton.MouseButton1Click.Connect(
         function ()
         {
            let score = GetStashScore( LOCAL_PLAYER )
            if ( score < STORE_BUY_IMPOSTOR )
            {
               DrawBadPurchase()
               return
            }

            SendRPC_Client( "RPC_FromClient_PurchaseImpostor" )
         } )
   } )

   AddNetVarChangedCallback( NETVAR_PURCHASED_IMPOSTOR,
      function ()
      {
         let storeUI = GetStoreUI()
         if ( GetNetVar_Number( LOCAL_PLAYER, NETVAR_PURCHASED_IMPOSTOR ) === 0 )
            ResetText()
         else
            storeUI.Frame.InfoFrame.Status.Text = "Success"
      } )

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      GetStoreUI().Parent = undefined
   } )
}

function ResetText()
{
   let storeUI = GetStoreUI()
   storeUI.Frame.InfoFrame.Status.Text = STORE_BUY_IMPOSTOR + ""
}