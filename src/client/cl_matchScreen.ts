import { MATCHMAKING_STATUS, NETVAR_MATCHMAKING_STATUS } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { GetNetVar_Number } from "shared/sh_player_netvars";
import { Tween } from "shared/sh_tween";
import { Assert, CloneChild, GetExistingFirstChildWithNameAndClassName, GetFirstChildWithName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

class File
{
   matchScreenUI = new Instance( "ScreenGui" )
   matchScreenTemplate: ScreenGui | undefined
   threadQueue: Array<thread> = []
   baseFrameTemplate: Editor_MatchScreenBaseFrame | undefined
}

let file = new File()

type Editor_MatchScreenBaseFrame = Frame &
{
   TitleFrame: Frame &
   {
      Title: TextLabel
      SubTitle: TextLabel
      LowerTitle: TextLabel
      Centerprint: TextLabel
      ViewportFrame: ViewportFrame
   }
}

class MatchScreenFrame
{
   baseFrame: Frame
   titleFrame: Frame
   title: TextLabel
   subTitle: TextLabel
   lowerTitle: TextLabel
   centerprint: TextLabel
   viewportFrame: ViewportFrame
   viewportCamera: Camera

   constructor( str: string )
   {
      Assert( file.baseFrameTemplate !== undefined, "file.baseFrameTemplate !== undefined" )
      Assert( ( file.baseFrameTemplate as Editor_MatchScreenBaseFrame ).Parent === file.matchScreenTemplate && file.matchScreenTemplate !== undefined, "file.baseFrameTemplate.Parent === file.matchScreenTemplate" )

      let baseFrameTemplate = ( file.baseFrameTemplate as Editor_MatchScreenBaseFrame )
      Assert( baseFrameTemplate.Parent !== undefined, "1 baseFrameTemplate.Parent !== undefined" )
      let baseFrame = CloneChild( baseFrameTemplate ) as Editor_MatchScreenBaseFrame
      baseFrame.Parent = file.matchScreenUI
      baseFrame.Name = "BaseFrame: " + str
      Assert( baseFrame.ClassName === "Frame", "baseFrame.ClassName === 'Frame'" )
      let titleFrame = baseFrame.TitleFrame
      let title = titleFrame.Title
      let subTitle = titleFrame.SubTitle
      let lowerTitle = titleFrame.LowerTitle
      let centerprint = titleFrame.Centerprint
      let viewportFrame = titleFrame.ViewportFrame
      let viewportCamera = new Instance( "Camera" ) as Camera
      titleFrame.Transparency = 1
      viewportCamera.Parent = viewportFrame
      viewportFrame.CurrentCamera = viewportCamera
      this.baseFrame = baseFrame
      this.titleFrame = titleFrame
      this.title = title
      this.subTitle = subTitle
      this.lowerTitle = lowerTitle
      this.centerprint = centerprint
      this.viewportFrame = viewportFrame
      this.viewportCamera = viewportCamera

      let thisThread = coroutine.running()

      print( "Starting matchscreen " + str )

      Thread(
         function ()
         {
            for ( ; ; )
            {
               //print( "coroutine.status( thisThread ): " + str + " " + coroutine.status( thisThread ) + " " + thisThread )
               if ( coroutine.status( thisThread ) === "dead" )
               {
                  print( "Finished matchscreen " + str )
                  Thread( function ()
                  {
                     wait( 2 ) // give the frame a chance to fade away
                     baseFrame.Destroy()
                  } )

                  if ( thisThread === file.threadQueue[0] )
                     file.threadQueue.remove( 0 )
                  return
               }
               wait( 0.1 )
            }
         } )
   }
}

export function WaitForMatchScreenFrame( str: string ): MatchScreenFrame
{
   print( "WaitForMatchScreenFrame matchscreen " + str )
   let thisThread = coroutine.running()
   Assert( thisThread !== undefined, "Must be threaded off" )

   file.threadQueue.push( thisThread )

   for ( ; ; )
   {
      Assert( file.threadQueue.size() > 0, "Should not be zero" )

      let firstThread = file.threadQueue[0]
      if ( firstThread === thisThread )
         break
      print( "waiting for thread release: " + file.threadQueue.size() )

      wait( 0.1 )
   }

   print( "Starting matchscreen: " + str + ".." )
   return new MatchScreenFrame( str )
}

export function CL_MatchScreenSetup()
{
   file.matchScreenUI.ResetOnSpawn = false
   file.matchScreenUI.Enabled = true
   file.matchScreenUI.Name = "MatchScreenUI"
   file.matchScreenUI.IgnoreGuiInset = true
   file.matchScreenUI.DisplayOrder = UIORDER.UIORDER_MATCHSCREEN

   AddPlayerGuiFolderExistsCallback(
      function ( folder: Folder )
      {
         file.matchScreenUI.Parent = folder

         if ( file.matchScreenTemplate !== undefined )
            return

         Assert( file.baseFrameTemplate === undefined, "file.baseFrameTemplate === undefined" )
         let template = GetExistingFirstChildWithNameAndClassName( folder, 'MatchScreenUI Template', 'ScreenGui' ) as ScreenGui

         template.IgnoreGuiInset = true
         template.Parent = undefined
         template.Enabled = false
         file.matchScreenTemplate = template

         let baseFrameTemplate = GetExistingFirstChildWithNameAndClassName( template, 'BaseFrame', 'Frame' ) as Editor_MatchScreenBaseFrame
         file.baseFrameTemplate = baseFrameTemplate
         baseFrameTemplate.Name = "BaseFrame Template"

         // Fade in
         Thread( function ()
         {
            let frame = baseFrameTemplate.Clone()
            frame.Name = "Global Fade In"
            frame.Parent = file.matchScreenUI
            frame.Transparency = 0
            frame.ZIndex = 0

            wait( 1.0 )

            for ( ; ; )
            {
               print( GetNetVar_Number( GetLocalPlayer(), NETVAR_MATCHMAKING_STATUS ) )

               if ( GetNetVar_Number( GetLocalPlayer(), NETVAR_MATCHMAKING_STATUS ) !== MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY )
                  break
               wait( 0.1 )
            }

            print( "CLIENT GAME STARTED" )

            const TIME = 2.0
            Tween( frame, { Transparency: 1.0 }, TIME, Enum.EasingStyle.Linear, Enum.EasingDirection.Out )
            wait( TIME )
            frame.Destroy()
         } )
      } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         file.matchScreenUI.Parent = undefined
      } )

}
