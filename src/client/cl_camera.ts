import { Room } from "shared/sh_rooms"
import { RunService } from "@rbxts/services";
import { Workspace } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect";
import { VectorNormalize } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { GetPosition } from "shared/sh_utils_geometry";

class File
{
   camera: Camera
   currentRoom: Room | undefined

   constructor( camera: Camera )
   {
      this.camera = camera
   }
}

Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
let camera = Workspace.CurrentCamera as Camera
let file = new File( camera )

export function CL_CameraSetup()
{
   file.camera.GetPropertyChangedSignal( "ViewportSize" ).Connect( function ()
   {
      if ( file.currentRoom !== undefined )
         ResetCameraForCurrentRoom()
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let camera = file.camera
      //camera.CameraType = Enum.CameraType.Scriptable

      if ( true )
         return

      RunService.RenderStepped.Connect( function ()
      {
         if ( file.currentRoom === undefined )
            return

         // pop origin
         let org = GetPosition( player )
         let offset = file.currentRoom.cameraStart.sub( file.currentRoom.cameraEnd )
         offset = VectorNormalize( offset )
         offset = offset.mul( 25 )
         camera.FieldOfView = 70

         //offset = offset.mul( 0.667 )
         camera.CFrame = new CFrame( org.add( offset ), org )

         // blend fov
         //let dif = 0.001
         //camera.FieldOfView = ( camera.FieldOfView * dif ) + ( file.currentRoom.fieldOfView * ( 1.0 - dif ) )
         //camera.FieldOfView = file.currentRoom.fieldOfView
      } )
   } )
}

export function SetPlayerCameraToRoom( room: Room )
{
   file.currentRoom = room

   ResetCameraForCurrentRoom()
}

function ResetCameraForCurrentRoom()
{
   if ( 1 )
      return
   //ahi
   Assert( file.currentRoom !== undefined, "Current room is not set" )
   let room = file.currentRoom as Room
   file.camera.FieldOfView = room.fieldOfView

   let cframe = new CFrame( room.cameraStart, room.cameraEnd )
   cframe = cframe.mul( CFrame.Angles( math.rad( 0 ), math.rad( 0 ), math.rad( room.cameraRotation ) ) )

   // put camera in room center
   let viewSize = file.camera.ViewportSize
   let aspectRatio = viewSize.X / viewSize.Y
   let position = new UDim2( 0, 0, 0, 0 )

   let scale = aspectRatio * room.cameraAspectRatioMultiplier * 0.7
   if ( scale > 1.0 )
      scale = 1.0

   let size = new UDim2( scale, 0, scale, 0 )

   let centerOffset = GetOffSet( position, size )
   camera.CFrame = cframe.mul( centerOffset )

   /*
let bounds = room.bounds
if (  bounds !== undefined )
{
   // put camera in room center
   let xy = GetBoundsMidXY( bounds )
   let camStart = new Vector3( room.cameraStart.X, room.cameraStart.Y, xy.X )
   let camEnd = new Vector3( room.cameraEnd.X, room.cameraEnd.Y, xy.X )

   let viewSize = file.camera.ViewportSize
   let aspectRatio = viewSize.X / viewSize.Y
   //if ( aspectRatio > 1.50 )
   //   aspectRatio = 1.50

   let totalZ = bounds.maxZ - bounds.minZ
   let totalX = bounds.maxX - bounds.minX
   let total = math.max( totalZ, totalX )
   let sizeX = totalX / total
   let sizeZ = totalZ / total
   let min = math.min( sizeX, sizeZ )
   let scale = aspectRatio * min * 0.8

   //let scale = aspectRatio * room.cameraAspectRatioMultiplier * 0.8

   let cframe = new CFrame( camStart, camEnd )
   let position = new UDim2( 0, 0, 0, 0 )
   if ( scale > 1.0 )
      scale = 1.0
   let size = new UDim2( scale, 0, scale, 0 )
   print( "scale " + scale )


   let centerOffset = GetOffSet( position, size )
   camera.CFrame = cframe.mul( centerOffset )
}
else
{
   let cframe = new CFrame( room.cameraStart, room.cameraEnd )
   let position = new UDim2( 0.1, 0, 0, 0 )
   let size = new UDim2( 1, 0, 1, 0 )

   let centerOffset = GetOffSet( position, size )
   camera.CFrame = cframe.mul( centerOffset )
}
*/

   //print( "Set room to " + room.name + " with camera start " + room.cameraStart + " and fov " + room.fieldOfView )

}


function ComputePosition( fromPos: UDim2 ): Array<number>
{
   let viewSize = file.camera.ViewportSize
   let aspectRatio = viewSize.X / viewSize.Y
   let offset = UDim2Absolute( fromPos )
   let position = offset.div( viewSize )

   let hFactor = math.tan( math.rad( file.camera.FieldOfView ) / 2 )
   let wFactor = hFactor * aspectRatio

   return [-position.X * wFactor * 2, position.Y * hFactor * 2]
}


function UDim2Absolute( udim2: UDim2 ): Vector2
{
   let viewSize = camera.ViewportSize
   return new Vector2(
      ( udim2.X.Scale * viewSize.X ) + udim2.X.Offset,
      ( udim2.Y.Scale * viewSize.Y ) + udim2.Y.Offset
   )
}

function ComputeSize( fromSize: UDim2 ): Array<number>
{
   let size = UDim2Absolute( fromSize ).div( camera.ViewportSize )
   return [size.X, size.Y]
}

function GetOffSet( position: UDim2, size: UDim2 ): CFrame
{
   let xy = ComputePosition( position )
   let wh = ComputeSize( size )

   return new CFrame(
      0, 0, 0,
      wh[0], 0, 0,
      0, wh[1], 0,
      xy[0], xy[1], 1 )
}
