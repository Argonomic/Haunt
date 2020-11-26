import { RunService, Workspace } from "@rbxts/services";
import { Assert, Graph, LoadSound } from "shared/sh_utils";
import { AddCaptureInputChangeCallback, AddOnTouchEndedCallback } from "./cl_input";

const DRAGGED_ZINDEX_OFFSET = 20

export type ImageButtonWithParent = ImageButton &
{
   Parent: GuiObject
}

class File
{
   pickupSound = LoadSound( 4831091467 )
   dragOffsetX = 0
   dragOffsetY = 0
   draggedButton: ImageButtonWithParent | undefined
   draggedButtonRenderStepped: RBXScriptConnection | undefined
   draggedButtonStartPosition: UDim2 | undefined
}

let file = new File()


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

export function ElementDist( element1: GuiObject, element2: GuiObject ): number
{
   return math.sqrt(
      ( ( element2.AbsolutePosition.X - element1.AbsolutePosition.X ) * ( element2.AbsolutePosition.X - element1.AbsolutePosition.X ) )
      +
      ( ( element2.AbsolutePosition.Y - element1.AbsolutePosition.Y ) * ( element2.AbsolutePosition.Y - element1.AbsolutePosition.Y ) ) )
}


export function AddDraggedButton( button: ImageButton ): RBXScriptConnection
{
   return button.MouseButton1Down.Connect( function ( x: number, y: number )
   {
      //print( "Button down " + x + " " + y )
      if ( file.draggedButton !== undefined )
         return

      /*
      let input = GetInput()
      if ( input === undefined )
         return

      let inputPosition = input.Position
      if ( UserInputService.TouchEnabled )
      {
         inputPosition = GetLastTouchPosition()
         print( "GetLastTouchPosition: " + inputPosition )
      }

      file.dragOffsetX = inputPosition.X - button.AbsolutePosition.X
      file.dragOffsetY = inputPosition.Y - button.AbsolutePosition.Y
      */

      file.dragOffsetX = x - ( button.AbsolutePosition.X )
      file.dragOffsetY = y - ( button.AbsolutePosition.Y )
      file.dragOffsetY -= 36 // I think this is due to the extra bar that games have along the top

      file.draggedButtonStartPosition = button.Position
      file.draggedButton = button as ImageButtonWithParent
      file.draggedButton.ZIndex += DRAGGED_ZINDEX_OFFSET

      file.pickupSound.Play()

      file.draggedButtonRenderStepped = RunService.RenderStepped.Connect( function ()
      {
         Assert( file.draggedButton !== undefined, "No dragged button!" )
         let button = file.draggedButton as ImageButtonWithParent

         if ( CheckOutOfBoundsOfParent( button ) )
            ReleaseDraggedButton()
      } )
   } )
}

export function AddCallback_MouseUp( button: GuiButton, func: Callback ): RBXScriptConnection
{
   return button.MouseButton1Up.Connect( func )
}

export function ReleaseDraggedButton()
{
   let button = file.draggedButton
   if ( button === undefined )
      return

   let draggedButtonStartPosition = file.draggedButtonStartPosition
   Assert( file.draggedButtonStartPosition !== undefined, "file.draggedButtonStartPosition undefined" )
   if ( draggedButtonStartPosition === undefined )
      return

   let draggedButtonRenderStepped = file.draggedButtonRenderStepped
   Assert( file.draggedButtonRenderStepped !== undefined, "file.draggedButtonRenderStepped undefined" )
   if ( draggedButtonRenderStepped === undefined )
      return
   draggedButtonRenderStepped.Disconnect()

   button.ZIndex -= DRAGGED_ZINDEX_OFFSET
   button.Position = draggedButtonStartPosition

   file.draggedButtonStartPosition = undefined
   file.draggedButton = undefined
}

export function GetDraggedButton(): ImageButtonWithParent | undefined
{
   return file.draggedButton
}

function CheckOutOfBoundsOfParent( button: ImageButtonWithParent ): boolean
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

export function CL_UISetup()
{
   AddOnTouchEndedCallback( function ( touch: InputObject, gameProcessedEvent: boolean )
   {
      ReleaseDraggedButton()
   } )

   AddCaptureInputChangeCallback( function ( input: InputObject )
   {
      let button = file.draggedButton
      if ( button === undefined )
         return

      let frame = button.Parent as Frame

      let offsetX = file.dragOffsetX - button.AnchorPoint.X * button.AbsoluteSize.X
      let offsetY = file.dragOffsetY - button.AnchorPoint.Y * button.AbsoluteSize.Y
      let x = Graph( input.Position.X - offsetX, frame.AbsolutePosition.X, frame.AbsolutePosition.X + frame.AbsoluteSize.X, 0, 1 )
      let y = Graph( input.Position.Y - offsetY, frame.AbsolutePosition.Y, frame.AbsolutePosition.Y + frame.AbsoluteSize.Y, 0, 1 )

      button.Position = new UDim2( x, 0, y, 0 )
   } )

}

/*
export function DragButtonInFrame( input: InputObject, button: GuiObject, xOffset: number, yOffset: number )
{
   xOffset -= button.AnchorPoint.X * button.AbsoluteSize.X
   yOffset -= button.AnchorPoint.Y * button.AbsoluteSize.Y
   let x = u.Graph( input.Position.X - xOffset, frame.AbsolutePosition.X, frame.AbsolutePosition.X + frame.AbsoluteSize.X, 0, 1 )
   let y = u.Graph( input.Position.Y - yOffset, frame.AbsolutePosition.Y, frame.AbsolutePosition.Y + frame.AbsoluteSize.Y, 0, 1 )

   button.Position = new UDim2( x, 0, y, 0 )
}
*/






export function MoveOverTime( element: GuiObject, endPos: UDim2, blendTime: number, runFunc: Function )
{
   // replace with TWEEN
   let startTime = Workspace.DistributedGameTime
   let endTime = Workspace.DistributedGameTime + blendTime
   let start = element.Position

   class Render
   {
      rbx: RBXScriptConnection
      constructor( rbx: RBXScriptConnection )
      {
         this.rbx = rbx
      }
   }

   let rbx = new Render( RunService.RenderStepped.Connect( function ()
   {
      if ( Workspace.DistributedGameTime >= endTime )
      {
         element.Position = endPos
         rbx.rbx.Disconnect()
         runFunc()
         return
      }

      let x = Graph( Workspace.DistributedGameTime, startTime, endTime, start.X.Scale, endPos.X.Scale )
      let y = Graph( Workspace.DistributedGameTime, startTime, endTime, start.Y.Scale, endPos.Y.Scale )
      element.Position = new UDim2( x, 0, y, 0 )
   } ) )
}
