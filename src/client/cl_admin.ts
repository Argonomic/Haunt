import { UserInputService } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { SendRPC_Client } from "shared/sh_rpc";
import { ADMINS } from "shared/sh_settings";
import { ArrayFind, GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback } from "./cl_ui";

const LOCAL_PLAYER = GetLocalPlayer()

type EDITOR_Admin = ScreenGui &
{
   TextButton: TextButton
}

class File
{
   adminUI: ScreenGui | undefined
}
let file = new File()

export function CL_AdminSetup()
{
   AddPlayerGuiFolderExistsCallback(
      function ( folder: Folder )
      {
         if ( file.adminUI !== undefined )
         {
            file.adminUI.Parent = folder
            return
         }

         let adminUI = GetExistingFirstChildWithNameAndClassName( folder, 'AdminUI', 'ScreenGui' ) as EDITOR_Admin
         file.adminUI = adminUI
         file.adminUI.Enabled = !UserInputService.TouchEnabled && ArrayFind( ADMINS, LOCAL_PLAYER.Name ) !== undefined

         adminUI.TextButton.MouseButton1Click.Connect(
            function ()
            {
               SendRPC_Client( "RPC_FromClient_AdminClick" )
            } )
      } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.adminUI !== undefined )
            file.adminUI.Parent = undefined
      } )


}