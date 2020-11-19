import * as u from "shared/sh_utils"
import { Players } from "@rbxts/services";
import { Room } from "shared/sh_rooms"
import { RunService } from "@rbxts/services";
import { Workspace } from "@rbxts/services";

class File
{
   camera: Camera
   currentRoom: Room | undefined

   constructor( camera: Camera )
   {
      this.camera = camera
   }
}

u.Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
let camera = Workspace.CurrentCamera as Camera
let file = new File( camera )

export function CL_CameraSetup()
{
   let player = Players.LocalPlayer
   let camera = file.camera
   camera.CameraType = Enum.CameraType.Scriptable

   if ( 1 )
      return

   RunService.RenderStepped.Connect( function ()
   {
      if ( file.currentRoom === undefined )
         return

      // pop origin
      let org = u.GetPosition( player )
      let offset = file.currentRoom.cameraStart.sub( file.currentRoom.cameraEnd )
      offset = offset.mul( 0.667 )
      camera.CFrame = new CFrame( org.add( offset ), org )

      // blend fov
      let dif = 0.001
      camera.FieldOfView = ( camera.FieldOfView * dif ) + ( file.currentRoom.fieldOfView * ( 1.0 - dif ) )
   } )
}

export function SetPlayerCameraToRoom( room: Room )
{
   file.currentRoom = room
   file.camera.FieldOfView = room.fieldOfView
   file.camera.CFrame = new CFrame( room.cameraStart, room.cameraEnd )
   print( "Set room to " + room.name + " with camera start " + room.cameraStart + " and fov " + room.fieldOfView )

}
