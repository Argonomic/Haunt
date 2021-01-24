import { ExecOnChildWhenItExists, Thread, } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

export function CL_ChatSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( packageFolder: Folder )
   {
      ExecOnChildWhenItExists( packageFolder.Parent as Instance, 'Chat',
         function ( chat: ScreenGui )
         {
            chat.DisplayOrder = UIORDER.UIORDER_CHAT

            ExecOnChildWhenItExists( chat, 'Frame',
               function ( frame: Frame )
               {
                  Thread(
                     function ()
                     {
                        wait() // this is competing with something else?
                        //frame.Size = new UDim2( 0.4, 0, 0.7, 0 )
                        frame.AnchorPoint = new Vector2( 0, 1 )
                        frame.Position = new UDim2( 0, 0, 1, 0 )
                        frame.Transparency = 0.13
                        frame.BackgroundColor3 = new Color3( 0.2, 0.2, 0.2 )
                     } )
               } )
         } )
   } )
}
