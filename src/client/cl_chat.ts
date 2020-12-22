import { ExecOnChildWhenItExists, GetFirstChildWithName } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

export function CL_ChatSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( packageFolder: Instance )
   {
      let gui = packageFolder.Parent as Instance
      ExecOnChildWhenItExists( gui, 'Chat', function ( chat: ScreenGui )
      {
         chat.DisplayOrder = UIORDER.UIORDER_CHAT
         ExecOnChildWhenItExists( chat, 'Frame', function ( frame: Frame ) 
         {
            frame.Size = new UDim2( 1, 0, 0.8, 0 )
            frame.Transparency = 0.6
            frame.BackgroundColor3 = new Color3( 0.2, 0.2, 0.2 )
         } )
      } );
   } )
}
