import { RunService } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerCharacterAncestryChanged, APlayerHasConnected } from "shared/sh_onPlayerConnect";
import { Tween } from "shared/sh_tween";
import { ExecOnChildWhenItExists, GetFirstChildWithName, Graph, LoadSound, Thread } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { AddCaptureInputChangeCallback, AddOnTouchEndedCallback } from "./cl_input";

const DRAGGED_ZINDEX_OFFSET = 20
const LIVE = " Live"

export type ImageButtonWithParent = ImageButton &
{
   Parent: GuiObject
}

export enum UIORDER
{
   UIORDER_FADEOVERLAY = 1,
   UIORDER_CALLOUTS,
   UIORDER_MINIMAP,
   UIORDER_SCORE_POPUP,
   UIORDER_SCORE_TOTAL,
   UIORDER_USEBUTTON,
   UIORDER_TASKLIST,
   UIORDER_COUNTDOWN,
   UIORDER_SUDDEN_DEATH,
   UIORDER_READY,
   UIORDER_TASKS,
   UIORDER_MEETING,
   UIORDER_RETURN_TO_LOBBY,

   UIORDER_MATCHSCREEN,
   UIORDER_SCORE_GAIN,

   UIORDER_CHAT,
   UIORDER_LAST,
}


class File
{
   playedBeta = true
   pickupSound = LoadSound( 4831091467 )
   dragOffsetX = 0
   dragOffsetY = 0
   draggedButton: ImageButtonWithParent | undefined
   draggedButtonRenderStepped: RBXScriptConnection | undefined
   draggedButtonStartPosition: UDim2 | undefined
   playerGuiExistsCallbacks: Array<Function> = []

   ancestorServices: Array<RBXScriptConnection> = []
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

export function AddCallback_MouseClick( button: GuiButton, func: Callback ): RBXScriptConnection
{
   return button.MouseButton1Click.Connect( func )
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
   Assert( button !== undefined, "button !== undefined" )
   Assert( button.Parent !== undefined, "button.Parent !== undefined" )

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
   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         for ( let service of file.ancestorServices )
         {
            service.Disconnect()
         }
         file.ancestorServices = []
      } )


   AddOnTouchEndedCallback( function ( touchPositions: Array<Vector3>, gameProcessedEvent: boolean )
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
            Thread(
               function ()
               {
                  func( packageFolder )
               } )
         }
      } )
   } )

   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      let screenGui = new Instance( 'ScreenGui' )
      screenGui.Enabled = true
      screenGui.DisplayOrder = UIORDER.UIORDER_LAST + 1
      screenGui.Name = "BETA"
      screenGui.Parent = folder

      let frame = new Instance( 'TextLabel' )
      frame.Parent = screenGui
      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
      frame.Size = new UDim2( 0.3, 0, 0.3, 0 )
      frame.Position = new UDim2( 0.5, 0, 0.5, 0 )
      frame.Text = "BETA"
      frame.BackgroundTransparency = 1
      frame.TextTransparency = 1
      frame.TextScaled = true
      frame.TextColor3 = new Color3( 1, 1, 1 )
      frame.TextStrokeTransparency = 1
      frame.TextStrokeColor3 = new Color3( 0, 0, 0 )

      if ( !file.playedBeta )
      {
         file.playedBeta = true
         wait( 4 )
         Tween( frame, { TextTransparency: 0.333 }, 0.75 )
         wait( 1.4 )

         Tween( frame,
            {
               AnchorPoint: new Vector2( 1, 1 ),
               Position: new UDim2( 1, 0, 1, 0 ),
               Size: new UDim2( 0.1, 0, 0.08, 0 )
            },
            0.75, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      }
      else
      {
         frame.AnchorPoint = new Vector2( 1, 1 )
         frame.Position = new UDim2( 1, 0, 1, 0 )
         frame.Size = new UDim2( 0.1, 0, 0.08, 0 )
      }

   } )
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
   Thread(
      function ()
      {
         Tween( element, {
            Position: endPos
         }, blendTime, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
         wait( blendTime )
         runFunc()
      } )


   /*
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
*/
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
   private transitioning = false
   private clicked = false

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

   public EverClicked()
   {
      return this.clicked
   }

   public Close()
   {
      if ( !this.IsOpen() )
         return

      this.taskListOpen = false
      this.Update()
   }

   public SnapOpen()
   {
      this.taskListOpen = true
      this.CloseTaskListOverTime( 0 )
   }

   public SnapClosed()
   {
      this.taskListOpen = false
      this.CloseTaskListOverTime( 0 )
   }

   private Transition( time: number )
   {
      if ( time === 0 )
         return
      let button = this
      Thread( function ()
      {
         button.transitioning = true
         wait( time )
         button.transitioning = false
      } )
   }

   private OpenTaskListOverTime( time: number )
   {
      Tween( this.frame, this.closeFrameTween, time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      Tween( this.button, { Rotation: this.rotationOffset }, time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      this.Transition( time )
   }

   private CloseTaskListOverTime( time: number )
   {
      Tween( this.frame, this.openFrameTween, time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      Tween( this.button, { Rotation: this.rotationOffset + 180 }, time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut )
      this.Transition( time )
   }

   private Update()
   {
      if ( this.taskListOpen )
      {
         this.OpenTaskListOverTime( this.time )
      }
      else
      {
         this.CloseTaskListOverTime( this.time )
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

      button.MouseButton1Click.Connect( function ()
      {
         if ( toggleButton.transitioning )
            return

         toggleButton.taskListOpen = !toggleButton.taskListOpen
         toggleButton.Update()
         toggleButton.clicked = true
      } )
   }
}





export enum UI_CLICK_RESULTS_TYPE
{
   RESULTS_HIDE = 0,
   RESULTS_VISIBLE,
   RESULTS_COOLDOWN,
   RESULTS_VISIBLE_DISABLED,
}

export class UIClickResults
{
   resultsType = UI_CLICK_RESULTS_TYPE.RESULTS_HIDE
   cooldown = 0
}

export type EDITOR_ClickableUI = ScreenGui &
{
   ImageButton: ImageButton &
   {
      TextButton: TextButton
      Countdown: TextLabel
   }
}

export function AddClickable( clickUI: EDITOR_ClickableUI, canClickFunc: ( () => boolean ), onClickFunc: ( () => void ), setArt_getClickResults: ( ( imageButton: ImageButton, textButton: TextButton ) => UIClickResults ) )
{
   clickUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

   let imageButton = clickUI.ImageButton
   let textButton = imageButton.TextButton
   let countdown = imageButton.Countdown

   textButton.MouseButton1Click.Connect( function ()
   {
      onClickFunc()
   } )

   imageButton.MouseButton1Click.Connect( function ()
   {
      onClickFunc()
   } )

   clickUI.Enabled = false
   let lastResultsType = UI_CLICK_RESULTS_TYPE.RESULTS_HIDE

   const COLOR_GRAY = new Color3( 0.5, 0.5, 0.5 )
   const COLOR_WHITE = new Color3( 1.0, 1.0, 1.0 )

   let service = RunService.RenderStepped.Connect( function ()
   {
      if ( !canClickFunc() )
      {
         if ( clickUI.Enabled )
            clickUI.Enabled = false
         return
      }

      let results = setArt_getClickResults( imageButton, textButton )
      switch ( results.resultsType )
      {
         case UI_CLICK_RESULTS_TYPE.RESULTS_HIDE:
            if ( results.resultsType !== lastResultsType )
               clickUI.Enabled = false
            break

         case UI_CLICK_RESULTS_TYPE.RESULTS_COOLDOWN:
         case UI_CLICK_RESULTS_TYPE.RESULTS_VISIBLE_DISABLED:
            clickUI.Enabled = true

            let cooldownRemaining = results.cooldown
            countdown.Text = cooldownRemaining + ""
            if ( cooldownRemaining > 0 || results.resultsType === UI_CLICK_RESULTS_TYPE.RESULTS_VISIBLE_DISABLED )
            {
               imageButton.ImageTransparency = 0.5
               textButton.TextTransparency = 0.5
               textButton.TextColor3 = COLOR_GRAY
            }
            else
            {
               imageButton.ImageTransparency = 0
               textButton.TextTransparency = 0
               textButton.TextColor3 = COLOR_WHITE
            }
            if ( cooldownRemaining > 0 )
               countdown.Visible = true
            else
               countdown.Visible = false

            break
      }
      lastResultsType = results.resultsType
   } )
   file.ancestorServices.push( service )
}

export function LiveName( elem: ScreenGui )
{
   Assert( elem.Name.find( LIVE ).size() === 0, "Already LiveNamed" )
   elem.Name = elem.Name + LIVE
}

export function CreateCalloutStyleTextLabel(): TextLabel
{
   let textLabel = new Instance( "TextLabel" )
   textLabel.AnchorPoint = new Vector2( 0.5, 0.5 )
   textLabel.Size = new UDim2( 0.05, 0, 0.1, 0 )
   textLabel.TextScaled = true
   textLabel.Text = "!"
   textLabel.BorderSizePixel = 0
   textLabel.BackgroundTransparency = 1.0
   textLabel.Font = Enum.Font.LuckiestGuy
   textLabel.TextColor3 = new Color3( 1, 1, 0.25 )
   textLabel.TextStrokeTransparency = 0.0
   return textLabel
}

