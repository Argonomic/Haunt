import { Room } from "shared/sh_rooms"
import { Workspace } from "@rbxts/services";
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { GetFirstChildWithNameAndClassName, GetHumanoid, GetLocalPlayer, Thread } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { ConvertToDynamicArtInfos, CreateDynamicArt, DynamicArtInfo } from "./cl_dynamicArt";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

const LOCAL_PLAYER = GetLocalPlayer()

type EDITOR_CameraUI = ScreenGui &
{
   Frame: Frame &
   {
      InfoFrame: Frame &
      {
         Status: TextLabel
      }

      CameraButton: TextButton
   }
}

class File
{
   viewCamera = new Instance( 'Camera' )
   localCamera = new Instance( 'Camera' )

   currentRoom: Room | undefined
   cameraUI: EDITOR_CameraUI = new Instance( 'ScreenGui' ) as EDITOR_CameraUI

   overrideCamera = false
   _overheadCamera = false

   cameraUpdateCallbacks: Array<() => void> = []

   dynamicArtInfos: Array<DynamicArtInfo> = []
   dynamicArtModels: Array<BasePart> = []
}

export function EnableCameraModeUI()
{
   file.cameraUI.Enabled = true
}

export function DisableCameraModeUI()
{
   file.cameraUI.Enabled = false
}

export function IsOverheadCamera(): boolean
{
   return file._overheadCamera || file.overrideCamera
}

export function SetOverheadCameraOverride( override: boolean )
{
   file.overrideCamera = override
   UpdatePlayerCamera()
}

export function ToggleOverheadCamera()
{
   file._overheadCamera = !file._overheadCamera
   UpdatePlayerCamera()
}

export function AddCameraUpdateCallback( func: () => void )
{
   file.cameraUpdateCallbacks.push( func )
}

function UpdatePlayerCamera()
{
   for ( let child of file.dynamicArtModels )
   {
      child.Destroy()
   }
   file.dynamicArtModels = []
   file.localCamera.CameraType = Enum.CameraType.Scriptable

   if ( IsOverheadCamera() )
   {
      file.viewCamera.CameraType = Enum.CameraType.Scriptable
      file.cameraUI.Frame.CameraButton.Text = "Overhead"
   }
   else
   {
      let humanoid = GetHumanoid( LOCAL_PLAYER )
      if ( humanoid !== undefined )
         file.viewCamera.CameraSubject = humanoid
      file.viewCamera.CameraType = Enum.CameraType.Custom
      file.dynamicArtModels = CreateDynamicArt( file.dynamicArtInfos )
      file.cameraUI.Frame.CameraButton.Text = "Over Shoulder"
   }
   for ( let callback of file.cameraUpdateCallbacks )
   {
      Thread(
         function ()
         {
            callback()
         } )
   }
   for ( let callback of file.cameraUpdateCallbacks )
   {
      Thread(
         function ()
         {
            callback()
         } )
   }
}

export function GetCameraUI(): ScreenGui
{
   return file.cameraUI
}

Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
let file = new File()

export function CL_CameraSetup()
{
   file.viewCamera.Destroy()
   file.viewCamera = Workspace.CurrentCamera as Camera
   file.viewCamera.CFrame = new CFrame( new Vector3( 0, 0, 0 ) )
   file.viewCamera.GetPropertyChangedSignal( "ViewportSize" ).Connect( function ()
   {
      if ( file.currentRoom !== undefined )
         ResetCameraForCurrentRoom()
   } )


   let firstPerson = GetFirstChildWithNameAndClassName( Workspace, 'FirstPerson', 'Folder' ) as Folder
   let baseParts: Array<BasePart> = []
   for ( let child of firstPerson.GetChildren() )
   {
      if ( child.IsA( 'BasePart' ) )
         baseParts.push( child as BasePart )
   }
   file.dynamicArtInfos = ConvertToDynamicArtInfos( baseParts )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      UpdatePlayerCamera()
      Thread(
         function ()
         {
            for ( ; ; )
            {
               let humanoid = GetHumanoid( LOCAL_PLAYER )
               if ( humanoid !== undefined )
               {
                  file.viewCamera.CameraSubject = humanoid
                  break
               }
               wait()
            }
         } )
   } )

   let firstLoad = true
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( firstLoad )
      {
         firstLoad = false
         file.cameraUI.Destroy()
         file.cameraUI = GetFirstChildWithNameAndClassName( folder, 'CameraUI', 'ScreenGui' ) as EDITOR_CameraUI
         file.cameraUI.Enabled = false
         file.cameraUI.DisplayOrder = UIORDER.UIORDER_SCORE_TOTAL
         file.cameraUI.Frame.CameraButton.MouseButton1Click.Connect(
            function ()
            {
               ToggleOverheadCamera()
            } )

         return
      }

      file.cameraUI.Parent = folder
   } )
   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      file.cameraUI.Parent = undefined
   } )
}

export function SetPlayerCameraToRoom( room: Room )
{
   file.currentRoom = room

   ResetCameraForCurrentRoom()
}

export function GetLocalCamera()
{
   return file.localCamera
}

function ResetCameraForCurrentRoom()
{
   let cameras: Array<Camera> = [file.localCamera]
   if ( IsOverheadCamera() )
   {
      cameras.push( file.viewCamera )
   }
   else
   {
      file.viewCamera.FieldOfView = 70
   }

   for ( let camera of cameras )
   {
      //ahi
      Assert( file.currentRoom !== undefined, "Current room is not set" )
      let room = file.currentRoom as Room
      camera.FieldOfView = room.fieldOfView

      let cframe = new CFrame( room.cameraStart, room.cameraEnd )
      cframe = cframe.mul( CFrame.Angles( math.rad( 0 ), math.rad( 0 ), math.rad( room.cameraRotation ) ) )

      // put camera in room center
      let viewSize = camera.ViewportSize
      let aspectRatio = viewSize.X / viewSize.Y
      let position = new UDim2( 0, 0, 0, 0 )

      let scale = aspectRatio * room.cameraAspectRatioMultiplier * 0.7
      if ( scale > 1.0 )
         scale = 1.0

      let size = new UDim2( scale, 0, scale, 0 )

      let centerOffset = GetOffSet( camera, position, size )
      camera.CFrame = cframe.mul( centerOffset )
   }

}


function ComputePosition( camera: Camera, fromPos: UDim2 ): Array<number>
{
   let viewSize = camera.ViewportSize
   let aspectRatio = viewSize.X / viewSize.Y
   let offset = UDim2Absolute( camera, fromPos )
   let position = offset.div( viewSize )

   let hFactor = math.tan( math.rad( camera.FieldOfView ) / 2 )
   let wFactor = hFactor * aspectRatio

   return [-position.X * wFactor * 2, position.Y * hFactor * 2]
}


function UDim2Absolute( camera: Camera, udim2: UDim2 ): Vector2
{
   let viewSize = camera.ViewportSize
   return new Vector2(
      ( udim2.X.Scale * viewSize.X ) + udim2.X.Offset,
      ( udim2.Y.Scale * viewSize.Y ) + udim2.Y.Offset
   )
}

function ComputeSize( camera: Camera, fromSize: UDim2 ): Array<number>
{
   let size = UDim2Absolute( camera, fromSize ).div( camera.ViewportSize )
   return [size.X, size.Y]
}

function GetOffSet( camera: Camera, position: UDim2, size: UDim2 ): CFrame
{
   let xy = ComputePosition( camera, position )
   let wh = ComputeSize( camera, size )

   return new CFrame(
      0, 0, 0,
      wh[0], 0, 0,
      0, wh[1], 0,
      xy[0], xy[1], 1 )
}
