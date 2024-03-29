import { HttpService, RunService, UserInputService, Workspace } from "@rbxts/services"
import { AddCaptureInputChangeCallback, AddOnTouchEndedCallback } from "client/cl_input"
import { AddTaskSpec, AddTaskUI, TaskStatus, TASK_UI } from "client/cl_tasks"
import { AddDraggedButton, GetDraggedButton, ReleaseDraggedButton, ElementWithinElement, AddCallback_MouseClick, MoveOverTime, ElementDist_TopLeft, UIORDER, ElementDist, ElementDistFromXY, AddPlayerGuiFolderExistsCallback } from "client/cl_ui"
import { TASK_EXIT, TASK_RESTORE_LIGHTS } from "shared/sh_gamestate"
import { Tween, TweenThenDestroy } from "shared/sh_tween"
import { ArrayRandomize, BlendColors, ExecOnChildWhenItExists, GetChildren_NoFutureOffspring, GetExistingFirstChildWithNameAndClassName, Graph, LoadSound, RandomFloatRange, RandomInt, Thread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { AddRPC, SendRPC_Client } from "shared/sh_rpc"

const IMAGE_WEB = 'rbxassetid://170195297'

class File
{
   trashSound = LoadSound( 411946349 )
   bookSound = LoadSound( 1238528678 )
   kingSound = LoadSound( 4994284848 )
   checkerSound = LoadSound( 4880817564 )
   matchboxOpenSound = LoadSound( 4381758333 )
   matchboxLightSound = LoadSound( 261841453 )
   matchboxFlameSound = LoadSound( 1072005487 )
   matchboxPopOut = LoadSound( 180404792 )

   touchPositions: Array<Vector3> = []

   restoreLightsFlipSound = LoadSound( 5136823037 )
   restoreLightsRedraw = false
   restoreLightsFusePositions: Array<boolean> = [false, false, false, false, false, false, false]
}

let file = new File()

export function CL_TasksContentSetup()
{
   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      ExecOnChildWhenItExists( gui, 'TaskUI', function ( taskUI: ScreenGui )
      {
         taskUI.Enabled = false
         taskUI.DisplayOrder = UIORDER.UIORDER_TASKS
         AddTaskUI( TASK_UI.TASK_CONTROLLER, taskUI )

         ExecOnChildWhenItExists( taskUI, 'Frame', function ( frame: Frame )
         {
            ExecOnChildWhenItExists( frame, 'tasks', function ( tasksFolder: Folder )
            {
               let taskFrames = tasksFolder.GetChildren() as Array<Frame>

               for ( let taskFrame of taskFrames )
               {
                  let startFunc = GetStartFunc( taskFrame.Name )
                  let title = GetTitle( taskFrame.Name )
                  taskFrame.Visible = false
                  AddTaskSpec( taskFrame.Name, startFunc, title, taskFrame )
               }
            } )
         } )
      } )
   } )

   AddOnTouchEndedCallback(
      function ( touchPositions: Array<Vector3>, gameProcessedEvent: boolean )
      {
         file.touchPositions = touchPositions
      } )

   AddRPC( "RPC_FromServer_RestoreLighting_Fuse", function ( fusesJson: string )
   {
      let fuseArray = HttpService.JSONDecode( fusesJson ) as Array<boolean>
      file.restoreLightsFusePositions = fuseArray
      file.restoreLightsRedraw = true
   } )
}

function GetStartFunc( name: string ): Function
{
   switch ( name )
   {
      case TASK_EXIT:
         return Task_Exit

      case "put_books_away":
         return Task_PutBooksAway

      case "clean_out_fridge":
         return Task_CleanOutFridge

      case "task_light_candle":
         return Task_LightCandle

      case "win_at_checkers":
         return Task_WinAtCheckers

      case "sweep_the_floor":
         return Task_SweepTheFloor

      case TASK_RESTORE_LIGHTS:
         return Task_RestoreLights
   }

   Assert( false, "No func for " + name )
   throw undefined
}

function GetTitle( name: string ): string
{
   switch ( name )
   {
      case TASK_EXIT:
         return "Escape the Mansion"

      case "put_books_away":
         return "Put Away Books"

      case "clean_out_fridge":
         return "Clean Out the Fridge"

      case "task_light_candle":
         return "Light the Candle"

      case "win_at_checkers":
         return "Win at Checkers"

      case "sweep_the_floor":
         return "Sweep away Cobwebs"

      case TASK_RESTORE_LIGHTS:
         return "Restore Lights"
   }

   Assert( false, "No title found for " + name )
   throw undefined
}

function Task_PutBooksAway( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let books: Array<ImageButton> = []
   let bookPositions: Array<UDim2> = []
   let bookSpots: Array<ImageLabel> = []

   let children = GetChildren_NoFutureOffspring( frame )
   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "Book":
            let button = child as ImageButton
            books.push( button )
            bookPositions.push( button.Position )
            break

         case "BookSpot":
            bookSpots.push( child as ImageLabel )
            break
      }
   }

   ArrayRandomize( books )
   ArrayRandomize( bookSpots )

   const buttonConnections = new Map<ImageButton, RBXScriptConnection>()

   for ( let i = 0; i < books.size(); i++ )
   {
      let book = books[i]
      book.Position = bookPositions[i]
      buttonConnections.set( book, AddDraggedButton( book ) )
   }

   const bookSpotDestinations = new Map<ImageButton, ImageLabel>()

   // display random spots to return books to
   for ( let i = 0; i < bookSpots.size(); i++ )
   {
      let bookSpot = bookSpots[i]
      if ( i >= books.size() )
      {
         bookSpot.Visible = false
      }
      else
      {
         bookSpot.BackgroundTransparency = 1
         bookSpot.ImageTransparency = 0.333
         bookSpot.ImageColor3 = new Color3( 0, 0, 0 )
         bookSpot.Image = books[i].Image
         bookSpotDestinations.set( books[i], bookSpot )
      }
   }

   const TOUCH_ENABLED = UserInputService.TouchEnabled // simpler version for touch

   let count = 0

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      let dest = bookSpotDestinations.get( button ) as ImageLabel
      let size = frame.AbsoluteSize.X * 0.025
      if ( TOUCH_ENABLED )
         size *= 4

      if ( ElementDist_TopLeft( button, dest ) < size )
      {
         file.bookSound.Play()
         ReleaseDraggedButton()
         button.Position = dest.Position;
         ( buttonConnections.get( button ) as RBXScriptConnection ).Disconnect()
         count++
         if ( count >= books.size() )
         {
            status.success = true
            closeTaskThread()
         }
         return
      }

   } )
}

type ImageButtonWithNumber = ImageButton &
{
   Number: NumberValue
}

function SortByButtonNumber( a: ImageButtonWithNumber, b: ImageButtonWithNumber ): boolean
{
   return a.Number.Value < b.Number.Value
}

type RestoreLights = Frame &
{
   Fuses: Folder
}

function Task_RestoreLights( frame: RestoreLights, closeTaskThread: Function, status: TaskStatus )
{
   let fuses = frame.Fuses.GetChildren() as Array<ImageButton>
   Assert( fuses.size() === file.restoreLightsFusePositions.size(), "Size of file.restoreLightsFusePositions does not match number of fuses in image" )

   file.restoreLightsRedraw = true
   const RED = new Color3( 1.0, 0.8, 0.8 )
   const GREEN = new Color3( 0.8, 1.0, 0.8 )

   let localFusePositions: Array<boolean> = []
   let localRedraw = false

   for ( let i = 0; i < fuses.size(); i++ )
   {
      localFusePositions[i] = file.restoreLightsFusePositions[i]

      let fuse = fuses[i]
      fuse.MouseButton1Click.Connect( function ()
      {
         localRedraw = true
         file.restoreLightsFlipSound.Play()
         localFusePositions[i] = !localFusePositions[i]
         SendRPC_Client( "RPC_FromClient_RestoreLighting_Fuse", i, localFusePositions[i] )
      } )
   }

   return RunService.RenderStepped.Connect( function ()
   {
      let trues = 0
      if ( file.restoreLightsRedraw )
      {
         for ( let i = 0; i < fuses.size(); i++ )
         {
            localFusePositions[i] = file.restoreLightsFusePositions[i]
            if ( localFusePositions[i] )
               trues++
         }

         file.restoreLightsRedraw = false
         localRedraw = true
      }

      if ( localRedraw )
      {
         localRedraw = false
         for ( let i = 0; i < localFusePositions.size(); i++ )
         {
            let fuse = fuses[i]
            if ( localFusePositions[i] )
            {
               fuse.Image = 'rbxassetid://6123744137'
               fuse.ImageColor3 = GREEN
            }
            else
            {
               fuse.Image = 'rbxassetid://6123692159'
               fuse.ImageColor3 = RED
            }
         }
      }

      /*
      // server closes this one, because its shared across players
      if ( trues === fuses.size() )
      {
         status.success = true
         closeTaskThread()
      }
      */
   } )
}

function Task_SweepTheFloor( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   const TOUCH_ENABLED = UserInputService.TouchEnabled // simpler version for touch

   let background: ImageLabel | undefined
   let broom: ImageButton | undefined
   let children = GetChildren_NoFutureOffspring( frame )
   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "Background":
            background = child as ImageLabel
            break

         case "Broom":
            broom = child as ImageButton
            break
      }
   }
   Assert( background !== undefined, "Could not find background" )
   if ( background === undefined )
      return

   Assert( broom !== undefined, "Could not find broom" )
   if ( broom === undefined )
      return

   background.ZIndex = 1
   background.ClipsDescendants = true
   broom.ZIndex = 3

   if ( TOUCH_ENABLED )
      broom.Destroy()
   else
      AddDraggedButton( broom )

   let count = 0

   let webs: Array<ImageLabel> = []

   let minSize = 0.15
   let maxSize = 1.00
   let borderMin = 0.05
   let borderMax = 1.0 - borderMin

   for ( let i = 0; i < 10; i++ )
   {
      count++

      let imageLabel = new Instance( "ImageLabel" )
      imageLabel.Parent = background
      imageLabel.AnchorPoint = new Vector2( 0.5, 0.5 )
      imageLabel.Size = new UDim2( RandomFloatRange( minSize, maxSize ), 0, RandomFloatRange( minSize, maxSize ), 0 )
      imageLabel.BorderSizePixel = 0
      imageLabel.BackgroundTransparency = 1.0
      imageLabel.ImageColor3 = new Color3( 1, 1, 1 )
      imageLabel.Image = IMAGE_WEB
      imageLabel.Position = new UDim2( RandomFloatRange( borderMin, borderMax ), 0, RandomFloatRange( borderMin, borderMax ), 0 )
      imageLabel.ImageTransparency = 0
      imageLabel.ZIndex = 2
      webs.push( imageLabel )
   }

   let webMove = 0.5
   function WebGoesAway( imageLabel: ImageLabel )
   {
      file.trashSound.Play()
      let time = 2.5
      let propertyTable1 =
      {
         "ImageTransparency": 1.0,
         "Position": new UDim2( RandomFloatRange( -webMove, webMove ), 0, RandomFloatRange( -webMove, webMove ), 0 )
      }

      TweenThenDestroy( imageLabel, propertyTable1, time, Enum.EasingStyle.Exponential, Enum.EasingDirection.Out )
   }

   let checkTime = 0
   let taskCompleted = false
   let taskCompletionTime = 0


   let inputX = 0
   let inputY = 0
   if ( TOUCH_ENABLED )
   {
      AddCaptureInputChangeCallback( function ( input: InputObject )
      {
         inputX = input.Position.X
         inputY = input.Position.Y
      } )
   }

   return RunService.RenderStepped.Connect( function ()
   {
      if ( taskCompleted )
      {
         if ( Workspace.DistributedGameTime < taskCompletionTime )
            return

         status.success = true
         closeTaskThread()
         return
      }

      if ( background === undefined )
         return
      if ( Workspace.DistributedGameTime < checkTime )
         return
      checkTime = Workspace.DistributedGameTime + 0.075
      let size = background.AbsoluteSize.X * 0.15

      let button: ImageButton | undefined
      if ( TOUCH_ENABLED )
      {
         for ( let i = 0; i < webs.size(); i++ )
         {
            let imageLabel = webs[i]
            let touchPositions = file.touchPositions.concat( [new Vector3( inputX, inputY, 0 )] )

            let removedWeb = false

            for ( let touchPosition of touchPositions )
            {
               if ( ElementDistFromXY( imageLabel, touchPosition.X, touchPosition.Y ) < size )
               {
                  WebGoesAway( imageLabel )
                  webs.remove( i )
                  i--
                  count--
                  removedWeb = true
               }

               if ( removedWeb )
                  break
            }
         }
      }
      else
      {
         button = GetDraggedButton()
         if ( button === undefined )
            return

         for ( let i = 0; i < webs.size(); i++ )
         {
            let imageLabel = webs[i]
            if ( ElementDist( button, imageLabel ) < size )
            {
               WebGoesAway( imageLabel )
               webs.remove( i )
               i--
               count--
            }
         }
      }

      if ( count <= 0 )
      {
         taskCompleted = true
         taskCompletionTime = Workspace.DistributedGameTime + 0.5
      }
   } )
}

function Task_WinAtCheckers( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let checkerSpots: Array<ImageButtonWithNumber> = []
   let checkerBlackLive: Array<ImageButtonWithNumber> = []
   let checkerBlackSpots: Array<ImageButton> = []
   let _kingMe: TextButton | undefined
   let _kingPiece: ImageButton | undefined
   let _clickChecker: ImageButton | undefined

   let children = GetChildren_NoFutureOffspring( frame )
   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "ClickChecker":
            _clickChecker = child as ImageButton
            break

         case "KingPiece":
            _kingPiece = child as ImageButton
            break

         case "KingMe":
            _kingMe = child as TextButton
            break

         case "CheckerBlackDest":
            {
               let button = child as ImageButton
               checkerBlackSpots.push( button )
               button.Visible = false
            }
            break

         case "CheckerBlackLive":
            {
               let button = child as ImageButtonWithNumber
               checkerBlackLive.push( button )
            }
            break

         case "CheckerDest":
            {
               let button = child as ImageButtonWithNumber
               checkerSpots.push( button )
               button.Visible = false
            }
            break
      }
   }

   checkerSpots.sort( SortByButtonNumber )
   checkerBlackLive.sort( SortByButtonNumber )

   if ( _clickChecker === undefined )
      return

   if ( _kingMe === undefined )
      return

   if ( _kingPiece === undefined )
      return


   let kingMe = _kingMe as TextButton
   let kingPiece = _kingPiece as ImageButton
   let clickChecker = _clickChecker as ImageButton

   let moveTime = 0
   let count = 0
   let kinged = false
   const MOVE_TIME = 0.25

   let startTime = Workspace.DistributedGameTime

   let startColor = clickChecker.ImageColor3
   let mergeColor = new Color3( 0.85, 0.85, 0 )
   let flicker = RunService.RenderStepped.Connect( function ()
   {
      if ( clickChecker === undefined )
         return

      let scale = math.sin( Workspace.DistributedGameTime * 8 )
      scale = Graph( scale, -1, 1, 0.0, 1.0 )
      let color = BlendColors( startColor, mergeColor, scale )

      if ( kingMe.Visible && !kinged )
      {
         kingMe.BackgroundColor3 = color
         clickChecker.ImageColor3 = startColor
         return
      }

      clickChecker.ImageColor3 = color
   } )


   function onCheckerClick()
   {
      if ( Workspace.DistributedGameTime <= moveTime )
         return

      if ( kingMe.Visible && !kinged )
         return

      moveTime = MOVE_TIME

      if ( kinged )
      {
         if ( count < checkerSpots.size() )
            MoveOverTime(
               kingPiece,
               checkerSpots[count].Position.add( new UDim2( 0, 0, -0.02, 0 ) )
               , MOVE_TIME, function () { } )
      }

      file.checkerSound.Play()
      if ( count < checkerSpots.size() )
         MoveOverTime( clickChecker, checkerSpots[count].Position, MOVE_TIME,
            function ()
            {
               if ( count < checkerBlackLive.size() )
                  MoveOverTime( checkerBlackLive[count], checkerBlackSpots[count].Position, MOVE_TIME,
                     function ()
                     {
                     }
                  )

               count++
               if ( count === 3 )
               {
                  kingMe.Visible = true
                  return
               }

               if ( count >= checkerSpots.size() )
               {
                  MoveOverTime( clickChecker, clickChecker.Position, MOVE_TIME,
                     function ()
                     {
                        flicker.Disconnect()
                        status.success = true
                        closeTaskThread()
                     }
                  )
               }
            }
         )
   }

   let extraClickBuffer = new Instance( 'ImageButton' )
   extraClickBuffer.Parent = clickChecker
   extraClickBuffer.Size = new UDim2( 2.5, 0, 2.5, 0 )
   extraClickBuffer.AnchorPoint = new Vector2( 0.3, 0.3 )
   extraClickBuffer.BackgroundTransparency = 1.0

   AddCallback_MouseClick( clickChecker, onCheckerClick )
   AddCallback_MouseClick( extraClickBuffer, onCheckerClick )

   AddCallback_MouseClick( kingMe, function ()
   {
      if ( kinged )
         return

      MoveOverTime( kingPiece, clickChecker.Position.add( new UDim2( 0, 0, -0.02, 0 ) ), MOVE_TIME * 2,
         function ()
         {
            kinged = true
            kingMe.Visible = false
            file.kingSound.Play()
            AddCallback_MouseClick( kingPiece, onCheckerClick )

            //kingPiece.Parent = clickChecker
            //kingPiece.Position = new UDim2( 0.01, 0, 0.2, 0 )
            //kingPiece.Size = new UDim2( 1, 0, 1, 0 )
         }
      )
   } )




}


type Editor_TaskLightCandle = Frame &
{
   MatchPoints: Folder
   Darkness: Frame
   ClickMatchboxGet: ImageButton
   ClickMatchboxOpen: ImageButton
   MatchboxMatch: ImageButton
   Background: ImageLabel
   Candle: ImageLabel
   Flame: ImageLabel
   Sparks: ImageLabel
   MatchboxBK: ImageLabel
   MatchboxCase: ImageLabel
   MatchboxDrawerEnd: ImageLabel
   MatchboxDrawerStart: ImageLabel
   FlameTargetArea: Frame
}

function Task_LightCandle( frameIn: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let frame = frameIn as Editor_TaskLightCandle
   let children = frameIn.GetChildren()

   let matchPoints: Array<ImageLabel> = []
   for ( let matchPoint of frame.MatchPoints.GetChildren() )
   {
      matchPoints.push( matchPoint as ImageLabel )
   }

   for ( let matchPoint of matchPoints )
   {
      matchPoint.Transparency = 1.0
   }

   frame.ClickMatchboxGet.ImageTransparency = 1.0
   frame.ClickMatchboxOpen.ImageTransparency = 1.0
   frame.MatchboxDrawerEnd.Visible = false

   frame.Flame.Visible = false
   let frameFlame = frame.Flame.Clone()
   frameFlame.Parent = frame

   frame.MatchboxMatch.Visible = false
   frame.FlameTargetArea.Transparency = 1.0
   frame.Sparks.BackgroundTransparency = 1.0
   frame.Sparks.ImageTransparency = 1.0

   let matches: Array<ImageButton> = []

   let boxConnect = frame.ClickMatchboxOpen.MouseButton1Click.Connect(
      function ()
      {
         boxConnect.Disconnect()

         Thread(
            function ()
            {
               file.matchboxOpenSound.Play()
               Tween( frame.MatchboxDrawerStart,
                  {
                     Position: frame.MatchboxDrawerEnd.Position
                  }, 0.8, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )
               wait( 0.4 )

               frame.ClickMatchboxGet.MouseButton1Click.Connect(
                  function ()
                  {
                     file.matchboxPopOut.Play()
                     let count = RandomInt( 2 ) + 3
                     for ( let i = 0; i < count; i++ )
                     {
                        if ( matches.size() >= 15 )
                           return

                        let match = frame.MatchboxMatch.Clone()
                        match.Visible = true
                        match.Parent = frame
                        matches.push( match )

                        const x = RandomFloatRange( match.AbsoluteSize.X * -0.5, match.AbsoluteSize.X * 1.2 )
                        const y = RandomFloatRange( match.AbsoluteSize.Y * -0.5, match.AbsoluteSize.Y * 3.0 )
                        let offset = new UDim2( 0, x, 0, y )
                        let position = match.Position.add( offset )
                        match.Rotation = RandomFloatRange( 30, 50 )
                        let rotation = RandomFloatRange( -90, 90 )
                        Tween( match, { Position: position, Rotation: rotation }, 1.0, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )

                        AddDraggedButton( match )
                     }
                  } )

            } )
      } )

   let rotatedButtons = new Map<ImageButton, boolean>()
   let matchStartedTouchingTime = new Map<ImageLabel, number>()
   let matchEndedTouchingTime = new Map<ImageLabel, number>()
   let matchWithin = new Map<ImageLabel, boolean>()
   let lastFoundTime = new Map<ImageLabel, number>()
   for ( let match of matchPoints )
   {
      matchStartedTouchingTime.set( match, 0 )
      matchEndedTouchingTime.set( match, 0 )
      matchWithin.set( match, false )
      lastFoundTime.set( match, 0 )
   }

   let lit = false
   let skullLit = false
   let lightingSkull = false
   let lightingSkullTime = 0
   let originalSparksSize = frame.Sparks.Size.add( new UDim2( 0, 0, 0, 0 ) )
   let originalFlameSize = frameFlame.Size.add( new UDim2( 0, 0, 0, 0 ) )

   let lastDraggedButton: ImageButton | undefined


   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
      {
         if ( lastDraggedButton !== undefined )
         {
            for ( let i = 0; i < matches.size(); i++ )
            {
               if ( matches[i] === lastDraggedButton )
               {
                  matches.remove( i )
                  break
               }
            }
            lastDraggedButton.Destroy()
            lastDraggedButton = undefined
         }

         lit = false
         frameFlame.Visible = false
         return
      }

      lastDraggedButton = button

      if ( lit )
      {
         frame.Sparks.Position = button.Position
         frameFlame.Position = button.Position

         if ( skullLit )
            return

         if ( ElementWithinElement( button, frame.FlameTargetArea ) )
         {
            if ( !lightingSkull )
            {
               lightingSkull = true
               lightingSkullTime = Workspace.DistributedGameTime
            }

            if ( Workspace.DistributedGameTime - lightingSkullTime > 0.250 )
            {
               Tween( frame.Darkness, { BackgroundTransparency: 1 }, 1 )
               skullLit = true
               let skullFlame = frame.Flame.Clone()
               skullFlame.Parent = frame
               skullFlame.Position = frame.FlameTargetArea.Position
               skullFlame.Visible = true
               skullFlame.ZIndex++
               Tween( frameFlame, { Size: new UDim2( 0, 0, 0, 0 ) }, 0.5 )
               ScaleFlame( skullFlame, originalFlameSize )
               file.matchboxFlameSound.Play()
               Thread( function ()
               {
                  wait( 0.6 )
                  let draggedButton = GetDraggedButton()
                  ReleaseDraggedButton()
                  if ( draggedButton !== undefined )
                     draggedButton.Destroy()

                  status.success = true
                  closeTaskThread()
               } )

            }
         }
         else
         {
            lightingSkull = false
         }
      }

      if ( skullLit )
      {
         return
      }

      if ( !rotatedButtons.has( button ) )
      {
         // straighten out the match
         Tween( button, { Rotation: 0 }, 0.5, Enum.EasingStyle.Quart, Enum.EasingDirection.InOut )
         rotatedButtons.set( button, true )
      }

      let isTouchingNow = new Map<ImageLabel, boolean>()
      for ( let matchPoint of matchPoints )
      {
         if ( ElementWithinElement( button, matchPoint ) )
         {
            isTouchingNow.set( matchPoint, true )
            if ( ( matchWithin.get( matchPoint ) as boolean ) === false )
            {
               matchStartedTouchingTime.set( matchPoint, Workspace.DistributedGameTime )
               matchWithin.set( matchPoint, true )
            }
         }
         else
         {
            if ( matchWithin.get( matchPoint ) === true )
            {
               matchEndedTouchingTime.set( matchPoint, Workspace.DistributedGameTime )
               matchWithin.set( matchPoint, false )
            }
         }
      }

      for ( let pair of matchStartedTouchingTime )
      {
         if ( isTouchingNow.has( pair[0] ) )
         {
            let touchingTime = Workspace.DistributedGameTime - pair[1]
            if ( touchingTime >= 0.4 )
               lastFoundTime.set( pair[0], Workspace.DistributedGameTime )
            continue
         }

         let timeSinceStoppedTouching = Workspace.DistributedGameTime - ( matchEndedTouchingTime.get( pair[0] ) as number )
         if ( timeSinceStoppedTouching > 0.2 )
            continue
         lastFoundTime.set( pair[0], Workspace.DistributedGameTime )

         let thisMatchEndedTouchingTime = matchEndedTouchingTime.get( pair[0] ) as number
         for ( let otherPair of matchEndedTouchingTime )
         {
            if ( otherPair[0] === pair[0] )
               continue
            let delta = otherPair[1] - thisMatchEndedTouchingTime
            if ( delta > 0 && delta < 0.20 )
               lastFoundTime.set( otherPair[0], Workspace.DistributedGameTime )
         }
      }

      let found = 0
      for ( let match of matchPoints )
      {
         let lastFound = lastFoundTime.get( match ) as number
         if ( Workspace.DistributedGameTime - lastFound <= 1.0 )
            found++
      }

      if ( found >= 3 )
      {
         if ( !lit )
         {
            lit = true
            lightingSkull = false
            file.matchboxLightSound.Play()
            frameFlame.Visible = true
            frame.Sparks.Visible = true
            frame.Sparks.Rotation = RandomFloatRange( 0, 360 )
            frame.Sparks.Size = originalSparksSize
            frame.Sparks.ImageTransparency = 0
            frame.Sparks.Position = button.Position
            Tween( frame.Sparks, {
               Size: new UDim2( originalSparksSize.X.Scale * 4.25, 0, originalSparksSize.Y.Scale * 4.25, 0 ),
               Rotation: frame.Sparks.Rotation + 100,
               ImageTransparency: 1
            }, 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )

            ScaleFlame( frameFlame, originalFlameSize )
         }
      }

   } )
}


function Task_CleanOutFridge( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let items: Array<ImageButton> = []
   let itemPositions: Array<UDim2> = []
   let trash: ImageLabel | undefined = undefined

   let children = GetChildren_NoFutureOffspring( frame )
   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "Item":
            let button = child as ImageButton
            items.push( button )
            itemPositions.push( button.Position )
            break

         case "Trash":
            trash = child as ImageLabel
            break
      }
   }

   ArrayRandomize( items )

   let remove = 3
   for ( let i = 0; i < remove; i++ )
   {
      items[i].Destroy()
   }
   items = items.slice( remove, items.size() )

   const buttonConnections = new Map<ImageButton, RBXScriptConnection>()

   for ( let i = 0; i < items.size(); i++ )
   {
      let item = items[i]
      item.Position = itemPositions[i]
      buttonConnections.set( item, AddDraggedButton( item ) )
   }

   let count = 0

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      if ( ElementWithinElement( button, trash as GuiObject ) )
      {
         file.trashSound.Play()
         ReleaseDraggedButton()

         button.Destroy()
         count++
         if ( count >= items.size() )
         {
            status.success = true
            closeTaskThread()
            return
         }
         return
      }

   } )
}

type EDITOR_TaskExit = Frame &
{
   DoorFrame: Frame &
   {
      Keyhole: Frame
      Key: ImageButton
   }
   Background: ImageLabel
}

function Task_Exit( frame: EDITOR_TaskExit, closeTaskThread: Function, status: TaskStatus )
{
   let background = frame.Background
   let doorFrame = frame.DoorFrame
   let key = doorFrame.Key
   let keyhole = doorFrame.Keyhole
   keyhole.Visible = false

   background.ZIndex = 1

   let cloneKey = key.Clone()
   cloneKey.Visible = false
   cloneKey.Parent = key.Parent

   key.ZIndex = 3
   AddDraggedButton( key )

   let x
   let y

   switch ( RandomInt( 4 ) )
   {
      case 0:
         x = 0
         y = RandomFloatRange( 0, 1 )
         break

      case 1:
         x = 1
         y = RandomFloatRange( 0, 1 )
         break

      case 2:
         y = 0
         x = RandomFloatRange( 0, 1 )
         break

      case 3:
      default: // always put default after cases!
         y = 1
         x = RandomFloatRange( 0, 1 )
         break

   }

   x *= 0.9 + 0.05
   y *= 0.9 + 0.05

   key.Position = new UDim2( x, 0, y, 0 )

   return RunService.RenderStepped.Connect( function ()
   {
      if ( key === undefined )
         return
      if ( background === undefined )
         return

      let button = GetDraggedButton()
      if ( button === undefined )
         return
      if ( !ElementWithinElement( key, keyhole ) )
         return

      status.success = true
      closeTaskThread()
   } )
}


function ScaleFlame( gui: GuiObject, size: UDim2 )
{
   Thread(
      function ()
      {
         gui.Size = new UDim2( 0, 0, 0, 0 )
         Tween( gui,
            {
               Size: new UDim2( size.X.Scale * 2.0, 0, size.Y.Scale * 2.0, 0 ),
            }, 0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
         wait( 0.4 )
         Tween( gui,
            {
               Size: size,
            }, 0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In )
      } )
} 