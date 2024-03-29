import { BoundsXZ } from "./sh_bounds"
import { GetChildren_NoFutureOffspring, GetFirstChildWithName, GetFirstChildWithNameAndClassName, GetInstanceChildWithName, GetWorkspaceChildByName } from "./sh_utils"
import { Assert } from "shared/sh_assert"
import { EDITOR_GameplayFolder } from "./sh_gamestate"

export const FAST_ROOM_ITERATION = false
const DEFAULT_FIELDOFVIEW = 20

class File
{
   onRoomSetupCallbacks: Record<string, Array<Function>> = {}
   rooms = new Map<string, Room>()
}
let file = new File()


type EDITOR_UsableTask = BasePart &
{
   $className: "Part",
   taskName: StringValue &
   {
      Value: string
   }
}

type EDITOR_NumberValue = Instance &
{
   $className: "NumberValue",
   Value: number
}

type EDITOR_Vector3Value = Instance &
{
   $className: "Vector3Value",
   Value: Vector3
}

export class Room
{
   name: string = ""
   doors: Array<Instance> = []
   center: BasePart | undefined
   tasks = new Map<string, Task>()
   cameraStart = new Vector3( 0, 0, 0 )
   cameraEnd = new Vector3( 0, 0, 0 )
   cameraRotation = 0
   fieldOfView: number = DEFAULT_FIELDOFVIEW
   bounds: BoundsXZ | undefined
   cameraAspectRatioMultiplier = 1.0
   startPoints: Array<Vector3> = []
   meetingTrigger: BasePart | undefined
   vent: EDITOR_Vent | undefined
}

export class RoomAndTask
{
   room: Room
   task: Task
   constructor( room: Room, task: Task )
   {
      this.room = room
      this.task = task
   }
}

export type EDITOR_Vent = Model &
{
   Top: Part
   Union: Part
   Bottom: Part
   scr_vent_trigger: Part
}

export class Task
{
   readonly name: string
   readonly volume: BasePart
   readonly duringPlayingOnly: boolean

   constructor( name: string, volume: BasePart, duringPlayingOnly: boolean )
   {
      this.name = name
      this.volume = volume
      this.duringPlayingOnly = duringPlayingOnly
   }
}

export function SH_RoomsSetup()
{
}

function CreateRoomFromFolder( folder: Folder ): Room
{
   let children = GetChildren_NoFutureOffspring( folder )
   let room = new Room()
   room.name = folder.Name

   function addRoomChild( child: Folder | BasePart | Instance )
   {
      switch ( child.Name )
      {
         case "scr_startpoint":
            {
               let childPart = child as BasePart
               Assert( childPart.ClassName === "Part", "trigger_door should be a Part" )

               let position = new Vector3( childPart.Position.X, childPart.Position.Y + 2, childPart.Position.Z )

               childPart.Transparency = 1.0
               childPart.CanCollide = false

               room.startPoints.push( position )
            }

            break

         case "usable_task":
            {
               let childPart = child as BasePart
               let duringPlayingOnly = GetFirstChildWithName( childPart, "not_in_lobby" ) !== undefined
               duringPlayingOnly = duringPlayingOnly || GetFirstChildWithName( childPart, "not_in_npe" ) !== undefined

               Assert( childPart.ClassName === "Part", "usable_task should be a Part" )

               childPart.CanCollide = false
               childPart.Transparency = 1.0

               let taskRef = childPart as EDITOR_UsableTask
               let task = new Task( taskRef.taskName.Value, taskRef, duringPlayingOnly )

               Assert( !room.tasks.has( task.name ), "Room already has task " + task.name )
               room.tasks.set( task.name, task )
            }
            break

         case "usable_meeting":
            {
               let childPart = child as BasePart
               Assert( childPart.ClassName === "Part", "usable_meeting should be a Part" )
               childPart.CanCollide = false
               childPart.Transparency = 1.0
               room.meetingTrigger = childPart
            }
            break

         case "scr_vent":
            {
               let model = child as EDITOR_Vent
               Assert( model.ClassName === "Model", "scr_vent should be a Model" )
               model.Bottom.CanCollide = true
               room.vent = model
            }
            break

         case "part_roomcenter_delete":
            {
               let childPart = child as BasePart
               Assert( childPart.ClassName === "Part", "part_roomcenter_delete should be a Part" )

               room.center = childPart
               room.cameraEnd = childPart.Position

               childPart.CanCollide = false
               childPart.Transparency = 1.0

               let childCameraFov = GetInstanceChildWithName( childPart, "camera_fov" )
               if ( childCameraFov !== undefined )
               {
                  Assert( ( childCameraFov as Instance ).ClassName === "NumberValue", "Wrong type" )
                  room.fieldOfView = ( childCameraFov as EDITOR_NumberValue ).Value
               }

               let cameraPosOffset = new Vector3( 0, 0, 0 )
               let childCameraPosOffset = GetInstanceChildWithName( childPart, "camera_pos_offset" )
               if ( childCameraPosOffset !== undefined )
               {
                  Assert( ( childCameraPosOffset as Instance ).ClassName === "Vector3Value", "Wrong type" )
                  cameraPosOffset = ( childCameraPosOffset as EDITOR_Vector3Value ).Value
               }

               let cameraDist: number | undefined

               let childCameraDist = GetInstanceChildWithName( childPart, "camera_dist" )
               if ( childCameraDist !== undefined )
               {
                  cameraDist = ( childCameraDist as EDITOR_NumberValue ).Value
               }
               Assert( cameraDist !== undefined, "part_roomcenter_delete does not have camera_dist field" )
               if ( cameraDist === undefined )
                  return

               let childCameraRotation = GetFirstChildWithNameAndClassName( childPart, "camera_rot", 'NumberValue' ) as NumberValue
               if ( childCameraRotation !== undefined )
                  room.cameraRotation = childCameraRotation.Value

               let aspectMultiplier = GetInstanceChildWithName( childPart, "camera_aspect_multiplier" )
               if ( aspectMultiplier !== undefined )
               {
                  Assert( ( aspectMultiplier as Instance ).ClassName === "NumberValue", "Wrong type" )
                  room.cameraAspectRatioMultiplier = ( aspectMultiplier as EDITOR_NumberValue ).Value
               }

               let editorCameraOffset: EDITOR_Vector3Value | undefined
               let childCameraOffset = GetInstanceChildWithName( childPart, "camera_offset" )
               if ( childCameraOffset !== undefined )
               {
                  Assert( ( childCameraOffset as Instance ).ClassName === "Vector3Value", "Wrong type" )
                  editorCameraOffset = childCameraOffset as EDITOR_Vector3Value
               }

               let camOffset = undefined
               if ( editorCameraOffset === undefined )
               {
                  camOffset = new Vector3( 5.5, 4, 0 )
               }
               else
               {
                  camOffset = editorCameraOffset.Value
               }

               cameraDist *= 0.9
               room.cameraStart = room.cameraEnd.add( camOffset.mul( cameraDist ) )

               //room.cameraStart = room.cameraStart.add( cameraPosOffset )
               //room.cameraEnd = room.cameraEnd.add( cameraPosOffset )
            }
            break

         case "trigger_door":
            {
               let childPart = child as BasePart
               Assert( childPart.ClassName === "Part", "trigger_door should be a Part" )

               childPart.Transparency = 1.0
               room.doors.push( childPart )
            }

            break
      }

      let callbacks = file.onRoomSetupCallbacks[child.Name]
      if ( callbacks !== undefined )
      {
         for ( let callback of callbacks )
         {
            callback( child, room )
         }
      }
   }

   for ( let child of children )
   {
      addRoomChild( child )
   }

   Assert( room.center !== undefined, "Could not find part_roomcenter_delete for room " + folder.Name )

   return room
}


export function AddRoomsFromWorkspace(): Map<string, Room>
{
   let rooms = new Map<string, Room>()

   const gameplayFolder = GetWorkspaceChildByName( "Gameplay" ) as EDITOR_GameplayFolder
   let roomFolders = gameplayFolder.Rooms.GetChildren() as Array<Folder>
   for ( let roomFolder of roomFolders )
   {
      let room = CreateRoomFromFolder( roomFolder )
      rooms.set( room.name, room )
   }

   file.rooms = rooms
   return rooms
}

export function AddCallback_OnRoomSetup( name: string, func: Function )
{
   if ( file.onRoomSetupCallbacks[name] === undefined )
      file.onRoomSetupCallbacks[name] = []
   file.onRoomSetupCallbacks[name].push( func )
}

export function GetAllRooms(): Array<Room>
{
   let rooms: Array<Room> = []
   for ( let room of file.rooms )
   {
      rooms.push( room[1] )
   }

   return rooms
}
