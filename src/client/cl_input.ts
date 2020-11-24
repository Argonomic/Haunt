import { ContextActionService, GamePassService, UserInputService } from "@rbxts/services";
import { GetCurrentRoom } from "client/cl_rooms"
import * as cl from "client/cl_utils"

function PlayerTriesToUseCurrenRoom()
{
   cl.SendRPC( "RPC_FromClient_OnPlayerUseFromRoom", GetCurrentRoom().name )
}

export function CL_InputSetup()
{
   let onPressUse = function ( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( inputObject.KeyCode === Enum.KeyCode.Unknown )
         return

      print( "** * * * onPressUse " + inputObject.KeyCode )
      if ( state === Enum.UserInputState.Begin )
         print( "Begin input" )

      if ( state === Enum.UserInputState.End )
         print( "End input" )

      PlayerTriesToUseCurrenRoom()
   }
   ContextActionService.BindAction( "PlayerInput", onPressUse, false, Enum.KeyCode.ButtonR2, Enum.KeyCode.E )

   let focusControl = function ( actionName: string, state: Enum.UserInputState, inputObject: InputObject )
   {
      if ( state === Enum.UserInputState.Begin )
      {
         ContextActionService.UnbindAction( "FocusControl" )
      }
   }
   ContextActionService.BindAction( "FocusControl", focusControl, false, Enum.UserInputType.MouseButton1, Enum.UserInputType.Touch, Enum.UserInputType.Focus )

   if ( UserInputService.TouchEnabled )
   {
      UserInputService.TouchTap.Connect( OnTouch )
      //UserInputService.TouchLongPress.Connect( TouchLong )
      //UserInputService.TouchMoved.Connect( TouchMove )
      //UserInputService.TouchEnded.Connect( TouchEnd )
   }
}

function OnTouch( touchPositions: Array<InputObject>, gameProcessedEvent: boolean )
{
   PlayerTriesToUseCurrenRoom()
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