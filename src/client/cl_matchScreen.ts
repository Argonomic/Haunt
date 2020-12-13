import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect";
import { Tween } from "shared/sh_tween";
import { Assert, GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, GetUIPackageFolder, UIORDER } from "./cl_ui";

class File
{
   matchScreenUI: ScreenGui = new Instance( 'ScreenGui' )
   threadQueue: Array<thread> = []
   baseFrameTemplate: Frame | undefined
}

let file = new File()

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
      Assert( file.matchScreenUI.Parent !== undefined, "file.matchScreenUI should have a parent" )
      Assert( file.baseFrameTemplate !== undefined, "file.baseFrameTemplate !== undefined" )
      Assert( file.baseFrameTemplate !== undefined, "Undefined" )

      let baseFrame = ( file.baseFrameTemplate as Frame ).Clone()
      let titleFrame = GetExistingFirstChildWithNameAndClassName( baseFrame, 'TitleFrame', 'Frame' ) as Frame
      let title = GetExistingFirstChildWithNameAndClassName( titleFrame, 'Title', 'TextLabel' ) as TextLabel
      let subTitle = GetExistingFirstChildWithNameAndClassName( titleFrame, 'SubTitle', 'TextLabel' ) as TextLabel
      let lowerTitle = GetExistingFirstChildWithNameAndClassName( titleFrame, 'LowerTitle', 'TextLabel' ) as TextLabel
      let centerprint = GetExistingFirstChildWithNameAndClassName( titleFrame, 'Centerprint', 'TextLabel' ) as TextLabel
      let viewportFrame = GetExistingFirstChildWithNameAndClassName( titleFrame, 'ViewportFrame', 'ViewportFrame' ) as ViewportFrame
      let viewportCamera = new Instance( "Camera" ) as Camera

      baseFrame.Parent = file.matchScreenUI
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

      Thread(
         function ()
         {
            for ( ; ; )
            {
               //print( "coroutine.status( thisThread ): " + str + " " + coroutine.status( thisThread ) + " " + thisThread )
               if ( coroutine.status( thisThread ) === "dead" )
               {
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
   let thisThread = coroutine.running()
   Assert( thisThread !== undefined, "Must be threaded off" )

   file.threadQueue.push( thisThread )

   for ( ; ; )
   {
      Assert( file.threadQueue.size() > 0, "Should not be zero" )

      let firstThread = file.threadQueue[0]
      if ( firstThread === thisThread )
         break

      wait( 0.1 )
   }

   return new MatchScreenFrame( str )
}

export function CL_MatchScreenSetup()
{
   file.matchScreenUI.ResetOnSpawn = false

   AddPlayerGuiFolderExistsCallback(
      function ( folder: Folder )
      {
         let matchScreenUI = file.matchScreenUI
         matchScreenUI.Parent = folder

         if ( file.baseFrameTemplate === undefined )
         {
            matchScreenUI.Name = 'MatchScreenUI'
            matchScreenUI.IgnoreGuiInset = true
            matchScreenUI.DisplayOrder = UIORDER.UIORDER_MATCHSCREEN

            let folder = GetUIPackageFolder()
            let template = GetExistingFirstChildWithNameAndClassName( folder, 'TemplateUIs', 'ScreenGui' ) as ScreenGui
            let baseFrameTemplate = GetExistingFirstChildWithNameAndClassName( template, 'BaseFrame', 'Frame' ) as Frame
            file.baseFrameTemplate = baseFrameTemplate
            baseFrameTemplate.Parent = undefined // so it is not destroyed when character cycles

            // Fade in
            Thread( function ()
            {
               let frame = baseFrameTemplate.Clone()
               frame.Transparency = 0
               frame.ZIndex = 0
               wait( 0.2 )
               const TIME = 0.8
               Tween( frame, { Transparency: 1.0 }, TIME, Enum.EasingStyle.Linear, Enum.EasingDirection.Out )
               wait( TIME )
               frame.Destroy()
            } )
         }
      }
   )

   let localPlayer = GetLocalPlayer()
   AddCallback_OnPlayerCharacterAdded(
      function ( player: Player )
      {
         if ( player !== localPlayer )
            return
         let character = localPlayer.Character as Model
         Assert( character !== undefined, "Undefined" )
         character.AncestryChanged.Connect(
            function ()
            {
               file.matchScreenUI.Parent = undefined
            } )
      } )

}
