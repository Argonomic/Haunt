import { TweenService } from "@rbxts/services"
import { Assert } from "./sh_utils"

export function Tween( instance: Instance, goal: any, time: number, easingStyle?: Enum.EasingStyle, easingDirection?: Enum.EasingDirection )
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
   let tween = TweenService.Create( instance, tweenInfo, goal )
   tween.Play()
   tween.Completed.Connect( function ( playbackState: Enum.PlaybackState )
   {
      tween.Destroy()
   } )
}

export function TweenThenDestroy( instance: Instance, goal: any, time: number, easingStyle: Enum.EasingStyle, easingDirection: Enum.EasingDirection )
{
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

         if ( child.IsA( 'BasePart' ) )
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