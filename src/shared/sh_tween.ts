import { TweenService } from "@rbxts/services"

export function Tween( instance: Instance, goal: any, time: number, easing: Enum.EasingStyle )
{
   let tweenInfo = new TweenInfo( time, easing )
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
   } )
}

export function TweenThenDestroy( instance: Instance, goal: any, time: number, easing: Enum.EasingStyle )
{
   let tweenInfo = new TweenInfo( time, easing )
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
      instance.Destroy()
   } )
}

export function TweenThenExecute( instance: Instance, goal: any, time: number, easing: Enum.EasingStyle, func: Function )
{
   let tweenInfo = new TweenInfo( time, easing )
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
      func()
   } )
}


