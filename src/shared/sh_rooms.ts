import * as u from "shared/sh_utils"
import { Workspace } from "@rbxts/services"

const DEFAULT_FIELDOFVIEW = 20

type BLOCKER_STYLES = "CornerWedgePart" | "FlagStand" | "MeshPart" | "NegateOperation" | "Part" | "PartOperation" | "Platform" | "Seat" | "SkateboardPlatform" | "SpawnLocation" | "Terrain" | "TrussPart" | "UnionOperation" | "VehicleSeat" | "WedgePart"

class BlockerInfo
{
   className: BLOCKER_STYLES = "Part"
   part: boolean = true
   position: Vector3 = new Vector3( 0, 0, 0 )
   anchored: boolean = false
   canCollide: boolean = false
   size: Vector3 = new Vector3( 0, 0, 0 )
   material: Enum.Material = Enum.Material.Air
   color = new Color3( 0, 0, 0 )
   brickColor = new BrickColor( 0, 0, 0 )
   orientation: Vector3 = new Vector3( 0, 0, 0 )
}

class File
{
   onRoomSetupCallbacks: Record<string, Array<Function>> = {}
}

let file = new File()

type BaseFolder = Folder &
{
   Folder: Folder
}

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
   tasks: Array<Task> = []
   cameraStart = new Vector3( 0, 0, 0 )
   cameraEnd = new Vector3( 0, 0, 0 )
   fieldOfView: number = DEFAULT_FIELDOFVIEW
   clientBlockerInfo: Array<BlockerInfo> = []
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

export class Task
{
   readonly name: string
   readonly volume: BasePart

   constructor( name: string, volume: BasePart )
   {
      this.name = name
      this.volume = volume
   }
}

function CreateRoomFromFolder( folder: Folder ): Room
{
   let children = u.GetChildren_NoFutureOffspring( folder )
   let room = new Room()
   room.name = folder.Name

   function addRoomChild( child: Folder | BasePart | Instance )
   {
      switch ( child.Name )
      {
         case "usable_task":
            {
               let childPart = child as BasePart
               u.Assert( childPart.ClassName === "Part", "trigger_door should be a Part" )

               childPart.CanCollide = false
               childPart.Transparency = 1.0

               let taskRef = childPart as EDITOR_UsableTask
               let task = new Task( taskRef.taskName.Value, taskRef )
               room.tasks.push( task )
            }
            break

         case "part_roomcenter_delete":
            {
               let childPart = child as BasePart
               u.Assert( childPart.ClassName === "Part", "trigger_door should be a Part" )

               room.center = childPart
               room.cameraEnd = childPart.Position

               childPart.CanCollide = false
               childPart.Transparency = 1.0

               let childCameraFov = u.GetInstanceChildWithName( childPart, "camera_fov" )
               if ( childCameraFov !== undefined )
               {
                  u.Assert( ( childCameraFov as Instance ).ClassName === "NumberValue", "Wrong type" )
                  room.fieldOfView = ( childCameraFov as EDITOR_NumberValue ).Value
               }

               let cameraDist: number | undefined

               let childCameraDist = u.GetInstanceChildWithName( childPart, "camera_dist" )
               if ( childCameraDist !== undefined )
               {
                  cameraDist = ( childCameraDist as EDITOR_NumberValue ).Value
               }
               u.Assert( cameraDist !== undefined, "part_roomcenter_delete does not have camera_dist field" )
               if ( cameraDist === undefined )
                  return

               let editorCameraOffset: EDITOR_Vector3Value | undefined
               let childCameraOffset = u.GetInstanceChildWithName( childPart, "camera_offset" )
               if ( childCameraOffset !== undefined )
               {
                  u.Assert( ( childCameraOffset as Instance ).ClassName === "Vector3Value", "Wrong type" )
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

               room.cameraStart = room.cameraEnd.add( camOffset.mul( cameraDist ) )
            }
            break

         case "trigger_door":
            {
               let childPart = child as BasePart
               u.Assert( childPart.ClassName === "Part", "trigger_door should be a Part" )

               childPart.Transparency = 1.0
               room.doors.push( childPart )
            }


            break

         case "client_blockers":
            {
               let blockers = u.GetChildren_NoFutureOffspring( child )
               for ( let instance of blockers )
               {
                  let blocker = instance as BasePart
                  let blockerInfo = new BlockerInfo()
                  blockerInfo.className = blocker.ClassName
                  blockerInfo.position = blocker.Position
                  blockerInfo.anchored = blocker.Anchored
                  blockerInfo.canCollide = blocker.CanCollide
                  blockerInfo.size = blocker.Size
                  blockerInfo.material = blocker.Material
                  blockerInfo.color = blocker.Color
                  blockerInfo.brickColor = blocker.BrickColor
                  blockerInfo.orientation = blocker.Orientation

                  room.clientBlockerInfo.push( blockerInfo )

                  if ( u.IsClient() )
                     blocker.Destroy()
               }
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

   u.Assert( room.center !== undefined, "Could not find part_roomcenter_delete for room " + folder.Name )

   return room
}

export function CreateClientBlockers( room: Room ): Array<BasePart>
{
   let parts: Array<BasePart> = []
   for ( let blockerInfo of room.clientBlockerInfo )
   {
      //let str = blockerInfo.className as string
      let createPart: BasePart | undefined = undefined
      switch ( blockerInfo.className )
      {
         case "CornerWedgePart":
            createPart = new Instance( "CornerWedgePart", Workspace )
            break

         case "MeshPart":
            createPart = new Instance( "MeshPart", Workspace )
            break

         case "NegateOperation":
            createPart = new Instance( "NegateOperation", Workspace )
            break

         case "Part":
            createPart = new Instance( "Part", Workspace )
            break

         case "PartOperation":
            createPart = new Instance( "PartOperation", Workspace )
            break

         case "Seat":
            createPart = new Instance( "Seat", Workspace )
            break

         case "SkateboardPlatform":
            createPart = new Instance( "SkateboardPlatform", Workspace )
            break

         case "SpawnLocation":
            createPart = new Instance( "SpawnLocation", Workspace )
            break

         case "TrussPart":
            createPart = new Instance( "TrussPart", Workspace )
            break

         case "UnionOperation":
            createPart = new Instance( "UnionOperation", Workspace )
            break

         case "VehicleSeat":
            createPart = new Instance( "VehicleSeat", Workspace )
            break

         case "WedgePart":
            createPart = new Instance( "WedgePart", Workspace )
            break


         default:
            u.Assert( false, "Part type " + blockerInfo.className + " isn't handled yet, add here" )
      }
      let part = createPart as BasePart

      part.Position = blockerInfo.position
      part.Anchored = blockerInfo.anchored
      part.CanCollide = blockerInfo.canCollide
      part.Size = blockerInfo.size
      part.Material = blockerInfo.material
      part.Color = blockerInfo.color
      part.BrickColor = blockerInfo.brickColor
      part.Orientation = blockerInfo.orientation

      parts.push( part )
   }

   return parts
}

export function AddRoomsFromWorkspace(): Map<string, Room>
{
   const roomFolder = u.GetWorkspaceChildByName( "Rooms" ) as BaseFolder
   let roomFolders = u.GetChildren_NoFutureOffspring( roomFolder )
   let rooms = new Map<string, Room>()

   for ( let _roomFolder of roomFolders )
   {
      const roomFolder = _roomFolder as Folder
      u.Assert( roomFolder.ClassName === "Folder", "A non-folder thing was put in Workspace.Base.Rooms" )

      let room = CreateRoomFromFolder( roomFolder )
      rooms.set( room.name, room )
   }

   return rooms
}

export function AddCallback_OnRoomSetup( name: string, func: Function )
{
   if ( file.onRoomSetupCallbacks[name] === undefined )
      file.onRoomSetupCallbacks[name] = []
   file.onRoomSetupCallbacks[name].push( func )
}