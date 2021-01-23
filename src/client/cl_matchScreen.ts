import { AddCallback_OnPlayerCharacterAncestryChanged, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect";
import { PLAYER_WALKSPEED } from "shared/sh_settings";
import { Tween } from "shared/sh_tween";
import { CloneChild, GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, Thread } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";
import { IsReservedServer } from "shared/sh_reservedServer";

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   matchScreenUI = new Instance( "ScreenGui" )
   matchScreenTemplate: ScreenGui | undefined
   threadQueue: Array<thread> = []
   baseFrameTemplate: Editor_MatchScreenBaseFrame | undefined

   reservedServerRelease = false
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

      Thread(
         function ()
         {
            for ( ; ; )
            {
               if ( coroutine.status( thisThread ) === "dead" )
               {
                  Thread( function ()
                  {
                     wait( 2 ) // give the frame a chance to fade away
                     baseFrame.Destroy()
                     print( "Finished matchscreen " + str )
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
   // need to somehow assert that this is a shallow thread so it is always threaded off

   file.threadQueue.push( thisThread )

   for ( ; ; )
   {
      Assert( file.threadQueue.size() > 0, "Should not be zero" )

      if ( file.baseFrameTemplate !== undefined && LOCAL_PLAYER.Character !== undefined )
      {
         let firstThread = file.threadQueue[0]
         if ( firstThread === thisThread )
            break
         print( "waiting for thread release: " + file.threadQueue.size() )
      }

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

            /*
            if ( GetNetVar_Number( LOCAL_PLAYER, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_WAITING_FOR_RESERVEDSERVER_TO_START )
            {
               if ( SendMeBackToLobby( LOCAL_PLAYER ) )
               {
                  frame.TitleFrame.SubTitle.Text = "Updating Lobby, hold tight!"
                  Tween( frame.TitleFrame.SubTitle, { TextTransparency: 0 }, 0.5 )
                  return
               }
               else
               {
                  frame.TitleFrame.SubTitle.Text = "The match starts soon!"
                  Tween( frame.TitleFrame.SubTitle, { TextTransparency: 0 }, 2.5 )
               }
            }
            */
            if ( IsReservedServer() )
            {
               wait( 1 )
               frame.TitleFrame.SubTitle.Text = "Starting.."
               frame.TitleFrame.SubTitle.TextTransparency = 1
               Tween( frame.TitleFrame.SubTitle, { TextTransparency: 0 }, 3.5 )

               for ( ; ; )
               {
                  if ( file.reservedServerRelease )
                  {
                     wait( 1 )
                     break
                  }
                  wait()
               }
            }

            print( "CLIENT GAME STARTED" )

            const TIME = 2.0
            Tween( frame.TitleFrame.SubTitle, { TextTransparency: 1.0 }, 1.0 )
            Tween( frame, { Transparency: 1.0 }, TIME )

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

export function ReservedServerRelease()
{
   print( "ReservedServerRelease" )
   file.reservedServerRelease = true
}