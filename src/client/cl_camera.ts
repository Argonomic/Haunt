import { Room } from "shared/sh_rooms"
import { RunService } from "@rbxts/services";
import { Workspace } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect";
import { Assert, GetPosition } from "shared/sh_utils";

class File
{
   camera: Camera
   currentRoom: Room | undefined

   position = new UDim2( 0.1, 0, 0, 0 )
   size = new UDim2( 1, 0, 1, 0 )

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
   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let camera = file.camera
      camera.CameraType = Enum.CameraType.Scriptable

      if ( 1 )
         return

      /*
      RunService.RenderStepped.Connect( function ()
      {
         if ( file.currentRoom === undefined )
            return

         // pop origin
         let org = GetPosition( player )
         let offset = file.currentRoom.cameraStart.sub( file.currentRoom.cameraEnd )
         offset = offset.mul( 0.667 )
         camera.CFrame = new CFrame( org.add( offset ), org )

         // blend fov
         let dif = 0.001
         camera.FieldOfView = ( camera.FieldOfView * dif ) + ( file.currentRoom.fieldOfView * ( 1.0 - dif ) )
      } )
      */
   } )
}

export function SetPlayerCameraToRoom( room: Room )
{
   file.currentRoom = room
   file.camera.FieldOfView = room.fieldOfView
   let cframe = new CFrame( room.cameraStart, room.cameraEnd )
   let centerOffset = GetOffSet()
   camera.CFrame = cframe.mul( centerOffset )

   //print( "Set room to " + room.name + " with camera start " + room.cameraStart + " and fov " + room.fieldOfView )

}


function ComputePosition(): Array<number>
{
   let viewSize = file.camera.ViewportSize
   let aspectRatio = viewSize.X / viewSize.Y
   let offset = UDim2Absolute( file.position )
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

function ComputeSize(): Array<number>
{
   let size = UDim2Absolute( file.size ).div( camera.ViewportSize )
   return [size.X, size.Y]
}

function GetOffSet(): CFrame
{
   let xy = ComputePosition()
   let wh = ComputeSize()

   return new CFrame(
      0, 0, 0,
      wh[0], 0, 0,
      0, wh[1], 0,
      xy[0], xy[1], 1 )
}

/*

--- Handler

function Module.Start()
   RunService:BindToRenderStep("ViewportResizer", Enum.RenderPriority.Camera.Value + 1, function()
      Camera.CFrame = Camera.CFrame * Module._getOffset()
   end)
end

function Module.Stop()
   RunService:UnbindFromRenderStep("ViewportResizer")
end

return Module
*/