import { ContextActionService, UserInputService } from "@rbxts/services";

class File
{
   //input: InputObject | undefined
   captureInputChangeCallbacks: Array<Function> = []
   onTouchEndedCallbacks: Array<Function> = []
}

let file = new File()


export function AddOnTouchEndedCallback( func: Function )
{
   file.onTouchEndedCallbacks.push( func )
}


export function CL_InputSetup()
{
   UserInputService.InputChanged.Connect( InputChanged )


   /*
   for ( ; ; )
   {
      wait( 0.5 )
      UserInputService.MouseIconEnabled = true
   }
   */

   /*
   let onPressUse = function ( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( inputObject.KeyCode === Enum.KeyCode.Unknown )
         return

      if ( state === Enum.UserInputState.End )
         OnUse()
   }
   ContextActionService.BindAction( "PlayerInput", onPressUse, false, Enum.KeyCode.ButtonR2, Enum.KeyCode.E )
   */

   function FocusControl( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( state === Enum.UserInputState.Begin )
      {
         ContextActionService.UnbindAction( "FocusControl" )
      }
   }
   ContextActionService.BindAction( "FocusControl", FocusControl, false, Enum.UserInputType.MouseButton1, Enum.UserInputType.Touch, Enum.UserInputType.Focus )

   if ( UserInputService.TouchEnabled )
   {
      /*
      UserInputService.TouchTap.Connect(
         function ( touchPositions: Array<InputObject>, gameProcessedEvent: boolean )
         {
            OnUse()
         } )
      */

      /*
UserInputService.TouchStarted.Connect(
   function ( touch: InputObject, gameProcessedEvent: boolean )
   {
      file.lastTouchPosition = touch.Position
      print( "\n\tSet file.lastTouchPosition " + file.lastTouchPosition )
   } )
      */

      UserInputService.TouchEnded.Connect(
         function ( touch: InputObject, gameProcessedEvent: boolean )
         {
            for ( let callback of file.onTouchEndedCallbacks )
            {
               callback()
            }
         } )
      //UserInputService.TouchLongPress.Connect( TouchLong )
      //UserInputService.TouchMoved.Connect( TouchMove )
      //UserInputService.TouchEnded.Connect( TouchEnd )
   }
}



/*
local UserInputService = game:GetService("UserInputService")

-- The parent of this script (a ScreenGui)
local touchScreenGui = script.Parent

-- Create the GUI frame that the user interacts with through Touch
-- events
local touchGui = Instance.new("Frame")
touchGui.Name = "TouchGui"
touchGui.AnchorPoint = Vector2.new(0.5, 0.5)

-- Fires when the touches their device’s screen
local function TouchTap(touchPositions, gameProcessedEvent)
   touchGui.Parent = touchScreenGui
   touchGui.Position = UDim2.new(0, touchPositions[1].X, 0, touchPositions[1].Y)
   touchGui.Size = UDim2.new(0,50,0,50)
end

-- Fires when a user starts touching their device's screen and does not
-- move their finger for a short period of time
local function TouchLong(touchPositions, state, gameProcessedEvent)
   touchGui.Size = UDim2.new(0,100,0,100)
end

-- Fires when the user moves their finger while touching their device's
-- screen
local function TouchMove(touch, gameProcessedEvent)
   touchGui.Position = UDim2.new(0, touch.Position.X, 0, touch.Position.Y)
end

-- Fires when the user stops touching their device's screen
local function TouchEnd(touch, gameProcessedEvent)
   touchGui.Parent = nil
   touchGui.Size = UDim2.new(0,50,0,50)
end

-- Only use the Touch events if the user is on a mobile device
if UserInputService.TouchEnabled then
   UserInputService.TouchTap:Connect(TouchTap)
   UserInputService.TouchLongPress:Connect(TouchLong)
   UserInputService.TouchMoved:Connect(TouchMove)
   UserInputService.TouchEnded:Connect(TouchEnd)
end*/

function CaptureInputChange( input: InputObject )
{
   //print( " " )
   //print( input.UserInputType )
   //print( input.UserInputState )
   // /file.input = input
   input.UserInputState.Name
   for ( let callback of file.captureInputChangeCallbacks )
   {
      callback( input )
   }
}

export function AddCaptureInputChangeCallback( func: Function )
{
   file.captureInputChangeCallbacks.push( func )
}



function InputChanged( input: InputObject, gameProcessedEvent: boolean )
{
   if ( input.UserInputType === Enum.UserInputType.MouseButton1 )
   {
      CaptureInputChange( input )
   }
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



/*
print( "UserInputService.TouchEnabled " + UserInputService.TouchEnabled )
   if ( UserInputService.TouchEnabled )
   {
      button.MouseButton1Up.Connect( function ()
      {
         print( "MouseButton1Up!" )
         if ( file.draggedButton !== button )
            return
         ReleaseDraggedButton()
      } )
   }

 */

