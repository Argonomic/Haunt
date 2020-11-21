import * as u from "shared/sh_utils"
import { Players, RunService, Workspace } from "@rbxts/services"
import { AddTaskSpec, AddTaskUI, TaskStatus, TASK_UI } from "client/cl_tasks"
import { CheckOutOfBoundsOfParent, AddStickyButton, GetDraggedButton, ReleaseDraggedButton, ElementWithinElement, AddCallback_MouseUp } from "client/cl_ui"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"

class File
{
   trashSound = u.LoadSound( 411946349 )
   bookSound = u.LoadSound( 1238528678 )
   kingSound = u.LoadSound( 4994284848 )
   checkerSound = u.LoadSound( 4880817564 )
}

let file = new File()



export function CL_TasksContentSetup()
{
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      u.ExecOnChildWhenItExists( player, 'PlayerGui', function ( gui: Instance )
      {
         u.ExecOnChildWhenItExists( gui, 'TaskUI', function ( taskUI: ScreenGui )
         {
            taskUI.Enabled = false
            AddTaskUI( TASK_UI.TASK_CONTROLLER, taskUI )

            u.ExecOnChildWhenItExists( taskUI, 'Frame', function ( frame: Frame )
            {
               u.ExecOnChildWhenItExists( frame, 'tasks', function ( tasksFolder: Folder )
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
   } )
}

function GetStartFunc( name: string ): Function
{
   switch ( name )
   {
      case "put_books_away":
         return Task_PutBooksAway

      case "clean_out_fridge":
         return Task_CleanOutFridge

      case "win_at_checkers":
         return Task_WinAtCheckers
   }

   u.Assert( false, "No func for " + name )

   throw undefined
}

function GetTitle( name: string ): string
{
   switch ( name )
   {
      case "put_books_away":
         return "Put Books Away"

      case "clean_out_fridge":
         return "Clean Out the Fridge"

      case "win_at_checkers":
         return "Win at Checkers"
   }

   u.Assert( false, "No title found for " + name )

   throw undefined
}

function Task_PutBooksAway( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let books: Array<ImageButton> = []
   let bookPositions: Array<UDim2> = []
   let bookSpots: Array<ImageLabel> = []

   let children = u.GetChildren_NoFutureOffspring( frame )
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

   u.ArrayRandomize( books )
   u.ArrayRandomize( bookSpots )

   const startPositions = new Map<ImageButton, UDim2>()
   const buttonConnections = new Map<ImageButton, RBXScriptConnection>()

   for ( let i = 0; i < books.size(); i++ )
   {
      let book = books[i]
      book.Position = bookPositions[i]
      startPositions.set( book, book.Position )
      buttonConnections.set( book, AddStickyButton( book ) )
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

   class Counter
   {
      count: number = 0
   }

   let counter = new Counter()

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      let dest = bookSpotDestinations.get( button ) as ImageLabel
      let x = math.abs( dest.AbsolutePosition.X - button.AbsolutePosition.X )
      let y = math.abs( dest.AbsolutePosition.Y - button.AbsolutePosition.Y )

      if ( x < 8 && y < 8 )
      {
         file.bookSound.Play()
         ReleaseDraggedButton()
         button.Position = dest.Position;
         ( buttonConnections.get( button ) as RBXScriptConnection ).Disconnect()
         counter.count++
         if ( counter.count >= books.size() )
         {
            status.success = true
            closeTaskThread()
         }
         return
      }

      if ( CheckOutOfBoundsOfParent( button ) )
      {
         ReleaseDraggedButton()
         button.Position = startPositions.get( button as ImageButton ) as UDim2
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

function Task_WinAtCheckers( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let checkerSpots: Array<ImageButtonWithNumber> = []
   let checkerBlackLive: Array<ImageButtonWithNumber> = []
   let checkerBlackSpots: Array<ImageButton> = []
   let _kingMe: TextButton | undefined
   let _kingPiece: ImageButton | undefined
   let _clickChecker: ImageButton | undefined

   let children = u.GetChildren_NoFutureOffspring( frame )
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

   class Counter
   {
      count: number = 0
      mouseUp: RBXScriptConnection | undefined
      moveTime = 0
      kinged = false
   }
   let counter = new Counter()
   const MOVE_TIME = 0.25

   function onCheckerClick()
   {
      print( "Click checker" )
      if ( Workspace.DistributedGameTime <= counter.moveTime )
         return

      if ( kingMe.Visible && !counter.kinged )
         return

      counter.moveTime = MOVE_TIME

      if ( counter.kinged )
      {
         MoveOverTime(
            kingPiece,
            checkerSpots[counter.count].Position.add( new UDim2( 0, 0, -0.02, 0 ) )
            , MOVE_TIME, function () { } )
      }

      file.checkerSound.Play()
      MoveOverTime( clickChecker, checkerSpots[counter.count].Position, MOVE_TIME,
         function ()
         {
            MoveOverTime( checkerBlackLive[counter.count], checkerBlackSpots[counter.count].Position, MOVE_TIME,
               function ()
               {
               }
            )

            counter.count++
            if ( counter.count === 3 )
            {
               kingMe.Visible = true
               return
            }

            if ( counter.count >= checkerSpots.size() )
            {
               MoveOverTime( clickChecker, clickChecker.Position, MOVE_TIME,
                  function ()
                  {
                     if ( counter.mouseUp !== undefined )
                        counter.mouseUp.Disconnect()
                     status.success = true
                     closeTaskThread()
                  }
               )
            }
         }
      )
   }

   counter.mouseUp = AddCallback_MouseUp( clickChecker, onCheckerClick )

   AddCallback_MouseUp( kingMe, function ()
   {
      print( "Click king" )
      if ( counter.kinged )
         return

      MoveOverTime( kingPiece, clickChecker.Position.add( new UDim2( 0, 0, -0.02, 0 ) ), MOVE_TIME * 2,
         function ()
         {
            counter.kinged = true
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

function MoveOverTime( element: GuiObject, endPos: UDim2, blendTime: number, runFunc: Function )
{
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

      let x = u.Graph( Workspace.DistributedGameTime, startTime, endTime, start.X.Scale, endPos.X.Scale )
      let y = u.Graph( Workspace.DistributedGameTime, startTime, endTime, start.Y.Scale, endPos.Y.Scale )
      element.Position = new UDim2( x, 0, y, 0 )
   } ) )

   /*
   
      local render = RunService.RenderStepped:connect(function()
         local pos = {}
         local scale = {}
         for _, axis in pairs( axises ) do
            pos[axis] = _G.u.Graph( workspace.DistributedGameTime, startTime, endTime, start[axis], trash.Position[axis].Scale )
            scale[axis] = _G.u.Graph( workspace.DistributedGameTime, startTime, endTime, startScale[axis], 0 )
         end
   
         draggedButton.Position = UDim2.new( pos["X"], 0, pos["Y"], 0 )
         draggedButton.Size = UDim2.new( scale["X"], 0, scale["Y"], 0 )
      end)
   
      wait( blendTime )
   
      render:Disconnect()
   */
}



function Task_CleanOutFridge( frame: Frame, closeTaskThread: Function, status: TaskStatus )
{
   let items: Array<ImageButton> = []
   let itemPositions: Array<UDim2> = []
   let trash: ImageLabel | undefined = undefined

   let children = u.GetChildren_NoFutureOffspring( frame )
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

   u.ArrayRandomize( items )

   let remove = 2
   for ( let i = 0; i < remove; i++ )
   {
      items[i].Destroy()
   }
   items = items.slice( remove, items.size() )

   const startPositions = new Map<ImageButton, UDim2>()
   const buttonConnections = new Map<ImageButton, RBXScriptConnection>()

   for ( let i = 0; i < items.size(); i++ )
   {
      let item = items[i]
      item.Position = itemPositions[i]
      startPositions.set( item, item.Position )
      buttonConnections.set( item, AddStickyButton( item ) )
   }

   class Counter
   {
      count: number = 0
   }

   let counter = new Counter()

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      if ( ElementWithinElement( button, trash as GuiObject ) )
      {
         file.trashSound.Play()
         ReleaseDraggedButton()


         /*
            local blendTime = 0.35
            local startTime = workspace.DistributedGameTime
            local endTime = workspace.DistributedGameTime + blendTime
            local axises = { "X", "Y" }
            local start = {}
            local startScale = {}
            for _, axis in pairs( axises ) do
               start[axis] = draggedButton.Position[axis].Scale
               startScale[axis] = draggedButton.Size[axis].Scale
            end
         
         
            local render = RunService.RenderStepped:connect(function()
               local pos = {}
               local scale = {}
               for _, axis in pairs( axises ) do
                  pos[axis] = _G.u.Graph( workspace.DistributedGameTime, startTime, endTime, start[axis], trash.Position[axis].Scale )
                  scale[axis] = _G.u.Graph( workspace.DistributedGameTime, startTime, endTime, startScale[axis], 0 )
               end
         
               draggedButton.Position = UDim2.new( pos["X"], 0, pos["Y"], 0 )
               draggedButton.Size = UDim2.new( scale["X"], 0, scale["Y"], 0 )
            end)
         
            wait( blendTime )
         
            render:Disconnect()
         */


         button.Destroy()
         counter.count++
         if ( counter.count >= items.size() )
         {
            status.success = true
            closeTaskThread()
            return
         }
         return
      }

      if ( CheckOutOfBoundsOfParent( button ) )
      {
         ReleaseDraggedButton()
         button.Position = startPositions.get( button as ImageButton ) as UDim2
      }

   } )
}
