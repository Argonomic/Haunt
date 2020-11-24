import { UserInputService } from "@rbxts/services";

import * as u from "shared/sh_utils"

export type ImageButtonWithParent = ImageButton &
{
   Parent: GuiObject
}

class File
{
   pickupSound = u.LoadSound( 4831091467 )
   input: InputObject | undefined
   dragOffset = new Vector2( 0, 0 )
   draggedButton: ImageButtonWithParent | undefined
   dragButtonCallbacks: Array<Function> = []
}

let file = new File()

export function AddDragButtonCallback( func: Function )
{
   file.dragButtonCallbacks.push( func )
}

export function ElementWithinElement( element1: GuiObject, element2: GuiObject ): boolean
{
   if ( element1.AbsolutePosition.X < element2.AbsolutePosition.X )
      return false
   if ( element1.AbsolutePosition.X > element2.AbsolutePosition.X + element2.AbsoluteSize.X )
      return false
   if ( element1.AbsolutePosition.Y < element2.AbsolutePosition.Y )
      return false
   if ( element1.AbsolutePosition.Y > element2.AbsolutePosition.Y + element2.AbsoluteSize.Y )
      return false

   return true
}

export function AddStickyButton( button: ImageButton ): RBXScriptConnection
{
   return button.MouseButton1Down.Connect( function ()
   {
      if ( file.draggedButton !== undefined )
         return

      let input = file.input
      if ( input === undefined )
         return

      let xOffset = input.Position.X - button.AbsolutePosition.X
      let yOffset = input.Position.Y - button.AbsolutePosition.Y

      xOffset = 0
      yOffset = 0

      file.dragOffset = new Vector2( xOffset, yOffset )

      file.draggedButton = button as ImageButtonWithParent

      file.pickupSound.Play()
   } )
}

export function AddCallback_MouseUp( button: GuiButton, func: Callback ): RBXScriptConnection
{
   return button.MouseButton1Up.Connect( func )
}

export function ReleaseDraggedButton()
{
   file.draggedButton = undefined
}

export function GetDraggedButton(): ImageButtonWithParent | undefined
{
   return file.draggedButton
}

function CaptureInputChange( input: InputObject )
{
   file.input = input
   if ( file.draggedButton !== undefined )
   {
      for ( let func of file.dragButtonCallbacks )
      {
         func( input, file.draggedButton, file.dragOffset.X, file.dragOffset.Y )
      }
   }
}

export function CheckOutOfBoundsOfParent( button: ImageButtonWithParent ): boolean
{
   {
      let dif = button.AbsolutePosition.X - button.Parent.AbsolutePosition.X
      if ( dif < button.AbsoluteSize.X * -1 )
         return true

      if ( dif > button.Parent.AbsoluteSize.X )
         return true
   }

   {
      let dif = button.AbsolutePosition.Y - button.Parent.AbsolutePosition.Y
      if ( dif < button.AbsoluteSize.Y * -1 )
         return true

      if ( dif > button.Parent.AbsoluteSize.Y )
         return true
   }

   return false
}


function InputChanged( input: InputObject, gameProcessedEvent: boolean )
{
   if ( input.UserInputType === Enum.UserInputType.MouseButton1 )
      CaptureInputChange( input )
   else if ( input.UserInputType === Enum.UserInputType.MouseMovement )
   {
      //print( "The mouse has been moved!" )
      CaptureInputChange( input )
   }
   else if ( input.UserInputType === Enum.UserInputType.MouseWheel )
   {
      //print( "The mouse wheel has been scrolled!" )
      //print( "\tWheel Movement:", input.Position.Z )
   }
   else if ( input.UserInputType === Enum.UserInputType.Gamepad1 )
   {
      if ( input.KeyCode === Enum.KeyCode.Thumbstick1 )
      {
         //print( "The left thumbstick has been moved!" )
         CaptureInputChange( input )
      }
      else if ( input.KeyCode === Enum.KeyCode.Thumbstick2 )
      {
         //print( "The right thumbstick has been moved!" )
         CaptureInputChange( input )
      }
      else if ( input.KeyCode === Enum.KeyCode.ButtonL2 )
      {
         //print( "The pressure being applied to the left trigger has changed!" )
         //print( "\tPressure:", input.Position.Z )
      }
      else if ( input.KeyCode === Enum.KeyCode.ButtonR2 )
      {
         //print( "The pressure being applied to the right trigger has changed!" )
         //print( "\tPressure:", input.Position.Z )
      }
   }
   else if ( input.UserInputType === Enum.UserInputType.Touch )
   {
      //print( "The user's finger is moving on the screen!" )
      CaptureInputChange( input )
   }
   else if ( input.UserInputType === Enum.UserInputType.Gyro )
   {
      //local rotInput, rotCFrame = UserInputService: GetDeviceRotation()
      //local rotX, rotY, rotZ = rotCFrame: toEulerAnglesXYZ()
      //local rot = Vector3.new( math.deg( rotX ), math.deg( rotY ), math.deg( rotZ ) )
      //print( "The rotation of the user's mobile device has been changed!" )
      //print( "\tPosition", rotCFrame.p )
      //print( "\tRotation:", rot )
   }
   else if ( input.UserInputType === Enum.UserInputType.Accelerometer )
   {
      //print( "The acceleration of the user's mobile device has been changed!" )
      CaptureInputChange( input )
   }
}

export function CL_UISetup()
{
   UserInputService.InputChanged.Connect( InputChanged )
}

