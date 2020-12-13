import { TweenService } from "@rbxts/services"
import { Assert } from "./sh_utils"

const ENABLED = true

export function Tween( instance: Instance, goal: any, time: number, easingStyle?: Enum.EasingStyle, easingDirection?: Enum.EasingDirection )
{
   if ( !ENABLED )
      return

   if ( easingStyle === undefined )
   {
      Assert( easingDirection === undefined, "If style is undefined, direction should be undefined" )
      easingStyle = Enum.EasingStyle.Linear
      easingDirection = Enum.EasingDirection.In
   }
   else
   {
      Assert( easingDirection !== undefined, "If style is defined, direction should be defined" )
   }

   let tweenInfo = new TweenInfo( time, easingStyle, easingDirection )
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
   } )
}

export function TweenThenDestroy( instance: Instance, goal: any, time: number, easingStyle: Enum.EasingStyle, easingDirection: Enum.EasingDirection )
{
   if ( !ENABLED )
      return

   let tweenInfo = new TweenInfo( time, easingStyle, easingDirection )
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
      instance.Destroy()
   } )
}

export function TweenCharacterParts( character: Model, goal: any, time: number )
{
   if ( !ENABLED )
      return

   let head = character.FindFirstChild( "Head" )
   if ( head )
   {
      let face = head.FindFirstChild( "face" )
      if ( face )
         Tween( ( face as BasePart ), goal, time, Enum.EasingStyle.Linear, Enum.EasingDirection.In )
   }

   function Recursive( instance: Instance )
   {
      for ( let child of instance.GetChildren() )
      {
         let handle = child.FindFirstChild( "Handle" )
         if ( handle !== undefined )
            child = handle

         if ( child.IsA( 'BasePart' ) && child !== character.PrimaryPart )
            Tween( child, goal, time, Enum.EasingStyle.Linear, Enum.EasingDirection.In )

         Recursive( child )
      }
   }

   Recursive( character )
}

export function TweenPlayerParts( player: Player, goal: any, time: number )
{
   TweenCharacterParts( player.Character as Model, goal, time )
}

export function TweenModel( model: Model, goalCFrame: CFrame, time: number, easingStyle?: Enum.EasingStyle, easingDirection?: Enum.EasingDirection ): Tween
{
   if ( easingStyle === undefined )
   {
      Assert( easingDirection === undefined, "If style is undefined, direction should be undefined" )
      easingStyle = Enum.EasingStyle.Linear
      easingDirection = Enum.EasingDirection.In
   }
   else
   {
      Assert( easingDirection !== undefined, "If style is defined, direction should be defined" )
   }

   let tweenInfo = new TweenInfo( time, easingStyle, easingDirection )
   let CFrameValue = new Instance( "CFrameValue" )
   CFrameValue.Value = model.GetPrimaryPartCFrame()

   CFrameValue.GetPropertyChangedSignal( "Value" ).Connect(
      function ()
      {
         model.SetPrimaryPartCFrame( CFrameValue.Value )
      } )

   let tween = TweenService.Create( CFrameValue, tweenInfo, { Value: goalCFrame } )
   tween.Play()

   tween.Completed.Connect(
      function ()
      {
         CFrameValue.Destroy()
      } )

   return tween
}

