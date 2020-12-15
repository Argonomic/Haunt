import { RunService, UserInputService, Workspace } from "@rbxts/services"
import { AddCaptureInputChangeCallback } from "client/cl_input"
import { AddTaskSpec, AddTaskUI, TaskStatus, TASK_UI } from "client/cl_tasks"
import { AddDraggedButton, GetDraggedButton, ReleaseDraggedButton, ElementWithinElement, AddCallback_MouseUp, MoveOverTime, ElementDist_TopLeft, UIORDER, ElementDist, ElementDistFromXY, AddPlayerGuiFolderExistsCallback } from "client/cl_ui"
import { TASK_EXIT } from "shared/sh_gamestate"
import { TweenThenDestroy } from "shared/sh_tween"
import { ArrayRandomize, Assert, ExecOnChildWhenItExists, GetChildrenWithName, GetChildren_NoFutureOffspring, GetExistingFirstChildWithNameAndClassName, LoadSound, RandomFloatRange, RandomInt } from "shared/sh_utils"

const IMAGE_WEB = 'rbxassetid://170195297'

class File
{
   trashSound = LoadSound( 411946349 )
   bookSound = LoadSound( 1238528678 )
   kingSound = LoadSound( 4994284848 )
   checkerSound = LoadSound( 4880817564 )
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

      case "win_at_checkers":
         return Task_WinAtCheckers

      case "sweep_the_floor":
         return Task_SweepTheFloor
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
         return "Put Books Away"

      case "clean_out_fridge":
         return "Clean Out the Fridge"

      case "win_at_checkers":
         return "Win at Checkers"

      case "sweep_the_floor":
         return "Sweep the Floor"
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


   let count = 0

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      let dest = bookSpotDestinations.get( button ) as ImageLabel
      if ( ElementDist_TopLeft( button, dest ) < 8 )
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

   if ( !TOUCH_ENABLED )
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
      let size = background.AbsoluteSize.X * 0.09

      let button: ImageButton | undefined
      if ( TOUCH_ENABLED )
      {
         for ( let i = 0; i < webs.size(); i++ )
         {
            let imageLabel = webs[i]
            if ( ElementDistFromXY( imageLabel, inputX, inputY ) < size )
            {
               WebGoesAway( imageLabel )
               webs.remove( i )
               i--
               count--
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

   let mouseUp: RBXScriptConnection | undefined
   let moveTime = 0
   let count = 0
   let kinged = false
   const MOVE_TIME = 0.25

   function onCheckerClick()
   {
      print( "Click checker" )
      if ( Workspace.DistributedGameTime <= moveTime )
         return

      if ( kingMe.Visible && !kinged )
         return

      moveTime = MOVE_TIME

      if ( kinged )
      {
         MoveOverTime(
            kingPiece,
            checkerSpots[count].Position.add( new UDim2( 0, 0, -0.02, 0 ) )
            , MOVE_TIME, function () { } )
      }

      file.checkerSound.Play()
      MoveOverTime( clickChecker, checkerSpots[count].Position, MOVE_TIME,
         function ()
         {
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
                     if ( mouseUp !== undefined )
                        mouseUp.Disconnect()
                     status.success = true
                     closeTaskThread()
                  }
               )
            }
         }
      )
   }

   mouseUp = AddCallback_MouseUp( clickChecker, onCheckerClick )

   AddCallback_MouseUp( kingMe, function ()
   {
      print( "Click king" )
      if ( kinged )
         return

      MoveOverTime( kingPiece, clickChecker.Position.add( new UDim2( 0, 0, -0.02, 0 ) ), MOVE_TIME * 2,
         function ()
         {
            kinged = true
            kingMe.Visible = false
            file.kingSound.Play()
            AddCallback_MouseUp( kingPiece, onCheckerClick )

            //kingPiece.Parent = clickChecker
            //kingPiece.Position = new UDim2( 0.01, 0, 0.2, 0 )
            //kingPiece.Size = new UDim2( 1, 0, 1, 0 )
         }
      )
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



function Task_Exit( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let background: ImageLabel | undefined
   let doorFrame: Frame | undefined
   let children = GetChildren_NoFutureOffspring( frame )
   for ( let child of children )
   {
      switch ( child.Name )
      {
         case "Background":
            background = child as ImageLabel
            break

         case "DoorFrame":
            doorFrame = child as Frame
            break
      }
   }

   Assert( background !== undefined, "Could not find background" )
   if ( background === undefined )
      return

   Assert( doorFrame !== undefined, "Could not find doorFrame" )
   if ( doorFrame === undefined )
      return


   let key = GetExistingFirstChildWithNameAndClassName( doorFrame, "Key", "ImageButton" ) as ImageButton

   Assert( key !== undefined, "Could not find key" )
   if ( key === undefined )
      return

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

   const DIST = 14
   return RunService.RenderStepped.Connect( function ()
   {
      if ( key === undefined )
         return
      if ( background === undefined )
         return

      let button = GetDraggedButton()
      if ( button === undefined )
         return

      if ( ElementDist( key, cloneKey ) > DIST )
         return

      status.success = true
      closeTaskThread()
   } )
}
