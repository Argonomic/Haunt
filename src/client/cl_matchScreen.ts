import { Tween } from "shared/sh_tween";
import { Assert, GetLocalPlayer, Thread } from "shared/sh_utils";
import { GetLocalRole } from "./cl_gamestate";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

class File
{
   matchScreenUI: ScreenGui = new Instance( 'ScreenGui' )
   existingThreads: Array<thread> = []

   think: thread | undefined
}

let file = new File()

class MatchScreenFrame
{
   onCompletionResumeThisThread: thread
   frame: Frame

   constructor( onCompletionResumeThisThread: thread, frame: Frame )
   {
      this.onCompletionResumeThisThread = onCompletionResumeThisThread
      this.frame = frame
   }
}

function ThinkThread()
{
   for ( ; ; )
   {
      if ( file.existingThreads.size() )
      {
         let existingThread = file.existingThreads[0]
         file.existingThreads.remove( 0 )
         coroutine.resume( existingThread )
      }

      coroutine.yield()
   }
}

export function WaitForMatchScreenFrame(): MatchScreenFrame
{
   let thisThread = coroutine.running()
   Assert( thisThread !== undefined, "Must be threaded off" )

   let think = file.think

   Assert( think !== undefined, "Undefined think" )
   if ( think === undefined )
      throw undefined

   switch ( coroutine.status( think ) )
   {
      case "dead":
         Assert( false, "Should never die" )
         throw undefined

      case "running":
         // another screen is drawing, so queue this thread, so it can wait until resume
         file.existingThreads.push( thisThread )
         coroutine.yield()
         break

      case "suspended":
         // no other screen is drawing
         break
   }

   Assert( file.matchScreenUI.Parent !== undefined, "file.matchScreenUI should have a parent" )
   let frame = GetFullScreenFrame( file.matchScreenUI )
   return new MatchScreenFrame( think, frame )
}

export function CL_MatchScreenSetup()
{
   file.matchScreenUI.ResetOnSpawn = false

   AddPlayerGuiFolderExistsCallback(
      function ( folder: Folder )
      {
         /*
         let matchScreenUI: ScreenGui = new Instance( 'ScreenGui' )
         file.matchScreenUI.Destroy()
         file.matchScreenUI = matchScreenUI
         */
         let matchScreenUI = file.matchScreenUI
         matchScreenUI.Enabled = true
         matchScreenUI.Parent = folder
         matchScreenUI.Name = 'MatchScreenUI'
         matchScreenUI.IgnoreGuiInset = true
         matchScreenUI.DisplayOrder = UIORDER.UIORDER_MATCHSCREEN

         // Fade in
         Thread( function ()
         {
            let frame = GetFullScreenFrame( matchScreenUI )
            frame.Transparency = 0
            frame.ZIndex = 0
            wait( 0.2 )
            const TIME = 0.8
            Tween( frame, { Transparency: 1.0 }, TIME, Enum.EasingStyle.Linear, Enum.EasingDirection.Out )
            wait( TIME )
            frame.Destroy()
         } )

            // clean up
            ; ( GetLocalPlayer().Character as Model ).AncestryChanged.Connect( function ()
            {
               file.matchScreenUI.Parent = undefined //.Destroy()
               print( "matchScreenUI.AncestryChanged" )
            } )

      } )

   file.think = Thread( ThinkThread )
}

function GetFullScreenFrame( ui: ScreenGui )
{
   let frame: Frame = new Instance( 'Frame' )
   frame.Parent = ui
   frame.AnchorPoint = new Vector2( 0.5, 0.5 )
   frame.BackgroundColor3 = new Color3( 0, 0, 0 )
   frame.Size = new UDim2( 1, 0, 1, 0 )
   frame.Position = new UDim2( 0.5, 0, 0.5, 0 )
   frame.Transparency = 1
   frame.ZIndex = 1
   return frame
}