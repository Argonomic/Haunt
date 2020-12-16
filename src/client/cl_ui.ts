import { RunService, Workspace } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAdded, APlayerHasConnected } from "shared/sh_onPlayerConnect";
import { Tween } from "shared/sh_tween";
import { Assert, ExecOnChildWhenItExists, GetFirstChildWithName, GetFirstChildWithNameAndClassName, GetLocalPlayer, Graph, LoadSound } from "shared/sh_utils";
import { AddCaptureInputChangeCallback, AddOnTouchEndedCallback } from "./cl_input";

const DRAGGED_ZINDEX_OFFSET = 20

export type ImageButtonWithParent = ImageButton &
{
   Parent: GuiObject
}

export enum UIORDER
{
   UIORDER_FADEOVERLAY = 1,
   UIORDER_MINIMAP,
   UIORDER_CALLOUTS,
   UIORDER_USEBUTTON,
   UIORDER_TASKLIST,
   UIORDER_TASKS,
   UIORDER_MEETING,
   UIORDER_READY,
   UIORDER_CHAT,
   UIORDER_MATCHSCREEN,
   UIORDER_READY_AFTER_SPECTATE,
}


class File
{
   pickupSound = LoadSound( 4831091467 )
   dragOffsetX = 0
   dragOffsetY = 0
   draggedButton: ImageButtonWithParent | undefined
   draggedButtonRenderStepped: RBXScriptConnection | undefined
   draggedButtonStartPosition: UDim2 | undefined
   playerGuiExistsCallbacks: Array<Function> = []
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

export function ElementDist_TopLeft( element1: GuiObject, element2: GuiObject ): number
{
   return math.sqrt(
      ( ( element2.AbsolutePosition.X - element1.AbsolutePosition.X ) * ( element2.AbsolutePosition.X - element1.AbsolutePosition.X ) )
      +
      ( ( element2.AbsolutePosition.Y - element1.AbsolutePosition.Y ) * ( element2.AbsolutePosition.Y - element1.AbsolutePosition.Y ) ) )
}

export function ElementDist( element1: GuiObject, element2: GuiObject ): number
{
   let pos1 = GetElementAnchor( element1 )
   let pos2 = GetElementAnchor( element2 )

   return math.sqrt(
      ( ( pos2.X - pos1.X ) * ( pos2.X - pos1.X ) )
      +
      ( ( pos2.Y - pos1.Y ) * ( pos2.Y - pos1.Y ) ) )
}

export function ElementDistFromXY( element: GuiObject, X: number, Y: number ): number
{
   let pos = GetElementAnchor( element )

   return math.sqrt(
      ( ( X - pos.X ) * ( X - pos.X ) )
      +
      ( ( Y - pos.Y ) * ( Y - pos.Y ) ) )
}

function GetElementAnchor( element: GuiObject ): Vector2
{
   return new Vector2(
      element.AbsolutePosition.X + ( element.AbsoluteSize.X * element.AnchorPoint.X ),
      element.AbsolutePosition.Y + ( element.AbsoluteSize.Y * element.AnchorPoint.Y )
   )
}



export function AddDraggedButton( button: ImageButton ): RBXScriptConnection
{
   return button.MouseButton1Down.Connect( function ( x: number, y: number )
   {
      //print( "Button down " + x + " " + y )
      if ( file.draggedButton !== undefined )
         return

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

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      ExecOnChildWhenItExists( player, 'PlayerGui', function ( gui: Instance )
      {
         let packageFolder = GetFirstChildWithName( gui, 'Package' ) as Folder
         Assert( packageFolder !== undefined, "Can't find PACKAGE folder for UI!" )

         for ( let func of file.playerGuiExistsCallbacks )
         {
            func( packageFolder )
         }
      } )
   } )

}

export function GetUIPackageFolder(): Folder
{
   let player = GetLocalPlayer()
   let gui = GetFirstChildWithName( player, 'PlayerGui' )
   if ( gui === undefined )
   {
      Assert( false, "PlayerGui undefined" )
      throw undefined
   }

   let packageFolder = GetFirstChildWithNameAndClassName( gui, 'Package', 'Folder' ) as Folder
   if ( packageFolder === undefined )
   {
      Assert( false, "Package undefined" )
      throw undefined
   }

   return packageFolder
}

export function AddPlayerGuiFolderExistsCallback( func: ( folder: Folder ) => void )
{
   Assert( !APlayerHasConnected(), "Too late for AddPlayerGuiFolderExistsCallback" )
   file.playerGuiExistsCallbacks.push( func )
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

export class ToggleButton
{
   button: ImageButton

   private frame: GuiObject
   time: number
   private openFrameTween: any
   private closeFrameTween: any
   private taskListOpen = true
   private rotationOffset: number

   public IsOpen(): boolean
   {
      return this.taskListOpen
   }

   public Open()
   {
      if ( this.IsOpen() )
         return

      this.taskListOpen = true
      this.Update()
   }

   public Close()
   {
      if ( !this.IsOpen() )
         return

      this.taskListOpen = false
      this.Update()
   }

   private Update()
   {
      if ( this.taskListOpen )
      {
         Tween( this.frame, this.closeFrameTween, this.time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
         Tween( this.button, { Rotation: this.rotationOffset }, this.time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      }
      else
      {
         Tween( this.frame, this.openFrameTween, this.time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
         Tween( this.button, { Rotation: this.rotationOffset + 180 }, this.time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      }
   }

   constructor( frame: GuiObject, rotationOffset: number, openFrameTween: any, closeFrameTween: any )
   {
      let border = 5
      let button = new Instance( 'ImageButton' )
      button.Name = "ToggleButton"
      this.frame = frame
      this.openFrameTween = openFrameTween
      this.closeFrameTween = closeFrameTween
      this.button = button
      this.rotationOffset = rotationOffset
      button.Parent = frame
      button.AnchorPoint = new Vector2( 0, 0 )
      button.BackgroundColor3 = new Color3( 140 / 256, 142 / 256, 182 / 256 )
      button.BorderColor3 = new Color3( 27 / 256, 42 / 256, 53 / 256 )
      button.BorderSizePixel = border
      button.Size = new UDim2( 0.2, 0, 0.2, 0 )
      button.SizeConstraint = Enum.SizeConstraint.RelativeYY
      button.Image = 'rbxassetid://89290230'

      let UISizeConstraint = new Instance( 'UISizeConstraint' )
      UISizeConstraint.MaxSize = new Vector2( 40, 40 )
      UISizeConstraint.Parent = button

      this.time = 0.5
      this.Update()

      let toggleButton = this

      button.MouseButton1Up.Connect( function ()
      {
         toggleButton.taskListOpen = !toggleButton.taskListOpen
         toggleButton.Update()
      } )
   }
}