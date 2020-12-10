import { RunService } from "@rbxts/services";
import { WaitForMatchScreenFrame } from "client/cl_matchScreen";
import { AddPlayerGuiFolderExistsCallback, GetUIPackageFolder } from "client/cl_ui";
import { Tween, TweenCharacterParts } from "shared/sh_tween";
import { Assert, ClonePlayerModel, GetExistingFirstChildWithNameAndClassName, GetLocalPlayer, SetCharacterTransparency, SetCharacterYaw, Thread } from "shared/sh_utils";

class File
{
   player: Player = GetLocalPlayer()
}
let file = new File()

export function CL_MatchScreenContentSetup()
{
   if ( false ) // for quick testing
   {
      AddPlayerGuiFolderExistsCallback( function ()
      {
         Thread(
            function ()
            {
               wait( 1 )
               let players: Array<Player> = []
               for ( let i = 0; i < 10; i++ )
               {
                  players.push( GetLocalPlayer() )
               }
               for ( ; ; )
               {
                  MatchIntro( [], players, 2 )
                  wait( 8 )
               }
            } )
      } )
   }
}

export function MatchIntro( possessed: Array<Player>, campers: Array<Player>, possessedCount: number )
{
   let foundLocalPossessed = false
   if ( possessed.size() )
   {
      for ( let player of possessed )
      {
         if ( file.player === player )
         {
            foundLocalPossessed = true
            break
         }
      }
      Assert( foundLocalPossessed, "MatchIntro had possessed players but local player is not possessed" )
   }

   let matchScreenFrame = WaitForMatchScreenFrame()
   let baseFrame = matchScreenFrame.frame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let template = GetTemplateUI()
   let templateFrame = GetExistingFirstChildWithNameAndClassName( template, 'TitleFrame', 'Frame' ) as Frame

   let frame = templateFrame.Clone()
   frame.Parent = baseFrame
   frame.Transparency = 1

   let title = GetExistingFirstChildWithNameAndClassName( frame, 'Title', 'TextLabel' ) as TextLabel
   let subTitle = GetExistingFirstChildWithNameAndClassName( frame, 'SubTitle', 'TextLabel' ) as TextLabel
   let lowerTitle = GetExistingFirstChildWithNameAndClassName( frame, 'LowerTitle', 'TextLabel' ) as TextLabel
   let viewportFrame = GetExistingFirstChildWithNameAndClassName( frame, 'ViewportFrame', 'ViewportFrame' ) as ViewportFrame

   title.Text = "Shhh..."
   if ( foundLocalPossessed )
      subTitle.Text = "You are possessed!"
   else
      subTitle.Text = "You are an innocent camper"

   if ( possessedCount === 1 )
      lowerTitle.Text = "There is 1 imposter"
   else
      lowerTitle.Text = "There are " + possessedCount + " imposters"

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   const FADE_IN = 2

   let debug = false
   if ( debug )
   {
      title.TextTransparency = 0
      subTitle.TextTransparency = 0
      lowerTitle.TextTransparency = 0
      wait( 1 )
   }
   else
   {
      wait( 0.8 )
      Tween( title, { TextTransparency: 0 }, FADE_IN )
      wait( 2.0 )
      Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
      wait( 0.4 )

      Thread(
         function ()
         {
            wait( 2 )
            if ( !foundLocalPossessed )
               Tween( lowerTitle, { TextTransparency: 0 }, FADE_IN )
         } )
   }

   let basePos = new Vector3( 0, 0, 0 )// GetPosition( file.player )
   let camPosVec = new Vector3( 0, 1, -6 )

   let viewportCamera = new Instance( "Camera" ) as Camera

   let numVal = new Instance( 'Vector3Value' ) as Vector3Value
   numVal.Parent = viewportCamera
   numVal.Value = camPosVec

   viewportFrame.CurrentCamera = viewportCamera
   viewportCamera.Parent = viewportFrame

   // For rapid iteration
   //RunService.RenderStepped.Connect(
   //   SetCamera
   //)
   let vecEnd1 = basePos.add( new Vector3( 0, 0, 120 ) )
   let vecStart1 = basePos.add( numVal.Value.add( new Vector3( 0, 8, 0 ) ).mul( 1.3 ) )
   viewportCamera.CFrame = new CFrame( vecStart1, vecEnd1 )


   let count = 0
   let odd = true
   const dist = 3.0
   let allPlayers = possessed.concat( campers )

   allPlayers.sort( SortLocalPlayer )

   let clonedCampers: Array<Model> = []
   for ( let i = 0; i < allPlayers.size(); i++ )
   {
      let player = allPlayers[i]
      let offsetCount = count
      let yaw = -15 * offsetCount
      let offset = new Vector3( dist, 0, 0 ).mul( offsetCount )
      let multiplier = 1
      if ( odd )
      {
         multiplier = -1
         count++
      }
      odd = !odd

      offset = offset.mul( multiplier )
      offset = offset.add( new Vector3( 0, 0, offsetCount * 1.5 ) ) // depth
      offset = offset.add( new Vector3( dist * -0.5, 0, 0.0 ) ) // left
      yaw *= multiplier

      let clonedModel = ClonePlayerModel( player ) as Model
      clonedModel.Parent = viewportFrame
      clonedModel.SetPrimaryPartCFrame( new CFrame( basePos.add( offset ) ) )

      if ( i > possessed.size() )
         clonedCampers.push( clonedModel )

      SetCharacterYaw( clonedModel, 90 + yaw )
      SetCharacterTransparency( clonedModel, 0 )
   }

   const CAMERA_TIME = 1.7
   Tween( viewportFrame, { ImageTransparency: 0 }, CAMERA_TIME * 0.5 )

   //wait( 3 )
   let vecEnd2 = basePos
   let vecStart2 = basePos.add( numVal.Value )
   Tween( viewportCamera, { CFrame: new CFrame( vecStart2, vecEnd2 ) }, CAMERA_TIME, Enum.EasingStyle.Exponential, Enum.EasingDirection.Out )

   if ( foundLocalPossessed )
   {
      Thread(
         function ()
         {
            wait( 1.6 )
            let goal = { Transparency: 1 }
            for ( let model of clonedCampers )
            {
               TweenCharacterParts( model, goal, 1.0 )
            }
         } )
   }

   wait( FADE_IN )

   {
      if ( !debug )
         wait( 2 )
   }

   let delta = vecEnd2.sub( vecStart2 )
   delta = delta.add( new Vector3( 0, 2, 0 ) )
   delta = delta.mul( 2 )
   vecStart2 = vecStart2.add( delta )
   vecEnd2 = vecEnd2.add( delta )
   Tween( viewportCamera, { CFrame: new CFrame( vecStart2, vecEnd2 ) }, 2.0, Enum.EasingStyle.Quint, Enum.EasingDirection.In )

   if ( debug )
      wait( 2343 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 1.5 )
   wait( 0.75 )
   Tween( baseFrame, { Transparency: 1 }, 1.0 )
   wait( 1.0 )

   baseFrame.Destroy()
   coroutine.resume( matchScreenFrame.onCompletionResumeThisThread )
}

function GetTemplateUI(): ScreenGui
{
   let folder = GetUIPackageFolder()
   return GetExistingFirstChildWithNameAndClassName( folder, 'TemplateUIs', 'ScreenGui' ) as ScreenGui
}

function SortLocalPlayer( a: Player, b: Player ): boolean
{
   return a === file.player && b !== file.player
}