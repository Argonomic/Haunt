import * as u from "shared/sh_utils"
import { Players, RunService } from "@rbxts/services"
import { AddTaskSpec, AddTaskUI } from "client/cl_tasks"
import { CheckOutOfBoundsOfParent, AddStickyButton, GetDraggedButton, ReleaseDraggedButton, ElementWithinElement } from "client/cl_ui"

class File
{
   trashSound = u.LoadSound( 411946349 )
   bookSound = u.LoadSound( 1238528678 )
}

let file = new File()


type EDITOR_ScreenUIWithFrame = ScreenGui &
{
   Frame: Frame &
   {
      TextLabel: TextLabel
   }
}


export function CL_TasksContentSetup()
{
   let gui = Players.LocalPlayer.WaitForChild( 'PlayerGui' )
   let taskUI = gui.WaitForChild( 'TaskUI' ) as ScreenGui
   taskUI.Enabled = false
   AddTaskUI( "TaskUIController", taskUI )

   let frame = taskUI.WaitForChild( 'Frame' )
   let tasksFolder = frame.WaitForChild( 'tasks' ) as Folder
   let taskFrames = tasksFolder.GetChildren() as Array<Frame>

   for ( let taskFrame of taskFrames )
   {
      let startFunc = GetStartFunc( taskFrame.Name )
      let title = GetTitle( taskFrame.Name )
      AddTaskSpec( taskFrame.Name, startFunc, title, taskFrame )
   }

   let taskList = gui.WaitForChild( 'TaskList' ) as EDITOR_ScreenUIWithFrame
   taskList.Frame.TextLabel.Visible = false

   AddTaskUI( "TaskList", ( taskList as ScreenGui ) )

   /*
   
      local playerTaskStatus = {}
      for _, room in pairs( _G.rooms ) do
         for _, task in pairs( room.tasks ) do
            table.insert( playerTaskStatus, task )
         end
      end
      _G.u.AddPlayerTaskStatus( playerTaskStatus )
   
      _G.u.UpdateTaskList()
   
   */
}

function GetStartFunc( name: string ): Function
{
   switch ( name )
   {
      case "put_books_away":
         return Task_PutBooksAway

      case "clean_out_fridge":
         return Task_CleanOutFridge
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
   }

   u.Assert( false, "No title found for " + name )

   throw undefined
}

function Task_PutBooksAway( frame: Frame, closeTaskThread: thread )
{
   let books: Array<ImageButton> = []
   let bookPositions: Array<UDim2> = []
   let bookSpots: Array<ImageLabel> = []

   let children = frame.GetChildren()
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

   let status: Record<string, any> = {}
   status.count = 0

   return RunService.RenderStepped.Connect( function ()
   {
      let button = GetDraggedButton()
      if ( button === undefined )
         return

      let dest = bookSpotDestinations.get( button ) as ImageLabel
      let x = math.abs( dest.AbsolutePosition.X - button.AbsolutePosition.X )
      let y = math.abs( dest.AbsolutePosition.Y - button.AbsolutePosition.Y )

      if ( x < 5 && y < 5 )
      {
         file.bookSound.Play()
         ReleaseDraggedButton()
         button.Position = dest.Position;
         ( buttonConnections.get( button ) as RBXScriptConnection ).Disconnect()
         let count = status.count as number
         count++
         status.count = count
         if ( count >= books.size() )
         {
            status.success = true
            coroutine.resume( closeTaskThread )
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



function Task_CleanOutFridge( frame: Frame, closeTaskThread: thread )
{
   let items: Array<ImageButton> = []
   let itemPositions: Array<UDim2> = []
   let trash: ImageLabel | undefined = undefined

   let children = frame.GetChildren()
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

   let status: Record<string, any> = {}
   status.count = 0

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
         let count = status.count as number
         count += 1
         status.count = count
         if ( count >= items.size() )
         {
            status.success = true
            coroutine.resume( closeTaskThread )
            return
         }
      }

      if ( CheckOutOfBoundsOfParent( button ) )
      {
         ReleaseDraggedButton()
         button.Position = startPositions.get( button as ImageButton ) as UDim2
      }

   } )
}
