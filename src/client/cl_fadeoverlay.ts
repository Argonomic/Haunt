import { Players, RunService, Workspace } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { Assert, ExecOnChildWhenItExists, GetChildrenWithName, GetPosition, GraphCapped } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"

const FADE_CIRCLE = 'rbxassetid://6006022378'

Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
class File
{
   screenUI = new Instance( "ScreenGui" )
   camera: Camera

   constructor( camera: Camera )
   {
      this.camera = camera
   }
}
let file = new File( Workspace.CurrentCamera as Camera )

const TRANSPARENCY = 0.333

export function CL_FadeOverlaySetup()
{
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      let screenUI = file.screenUI
      screenUI.Name = "OverlayUI"
      screenUI.Parent = gui
      screenUI.DisplayOrder = UIORDER.UIORDER_FADEOVERLAY

      let fadeCircle = new Instance( "ImageLabel" )
      fadeCircle.Image = FADE_CIRCLE
      fadeCircle.BorderSizePixel = 0
      fadeCircle.ImageTransparency = TRANSPARENCY
      fadeCircle.BackgroundTransparency = 1.0
      fadeCircle.AnchorPoint = new Vector2( 0.5, 0.5 )
      fadeCircle.Parent = screenUI
      fadeCircle.Size = new UDim2( 0.25, 0, 0.25, 0 )

      function CreateOutsideFrames( count: number )
      {
         let frame = new Instance( "Frame" )
         frame.Transparency = TRANSPARENCY
         frame.BackgroundColor3 = new Color3( 0, 0, 0 )
         frame.BorderSizePixel = 0
         frame.Parent = fadeCircle
         switch ( count )
         {
            case 0:
               frame.AnchorPoint = new Vector2( 0, 1 )
               frame.Position = new UDim2( 0, 0, 0, 0 )
               frame.Size = new UDim2( 1, 0, 10, 0 )
               break

            case 1:
               frame.AnchorPoint = new Vector2( 0, -1 )
               frame.Position = new UDim2( 0, 0, 1, 0 )
               frame.Size = new UDim2( 1, 0, 10, 0 )
               break

            case 2:
               frame.AnchorPoint = new Vector2( 1, 0.5 )
               frame.Position = new UDim2( 0, 0, 0, 0 )
               frame.Size = new UDim2( 10, 0, 10, 0 )
               break

            case 3:
               frame.AnchorPoint = new Vector2( 0, 0.5 )
               frame.Position = new UDim2( 1, 0, 0, 0 )
               frame.Size = new UDim2( 10, 0, 10, 0 )
               break
         }
      }

      for ( let i = 0; i < 4; i++ )
      {
         CreateOutsideFrames( i )
      }

      let camera = file.camera

      let LIGHTDIST = 25
      let player = Players.LocalPlayer
      RunService.RenderStepped.Connect( function ()      
      {
         let pos = GetPosition( player )
         let offset = pos.add( new Vector3( 0, 0, LIGHTDIST ) )
         let [offVector, _1] = camera.WorldToScreenPoint( offset )
         let [vector, _2] = camera.WorldToScreenPoint( pos )

         let dist = offVector.sub( vector ).Magnitude
         fadeCircle.Position = new UDim2( 0, vector.X, 0, vector.Y )
         fadeCircle.Size = new UDim2( 0, dist, 0, dist )

         let childs = GetChildrenWithName( Workspace, "testpart" )
         for ( let _child of childs )
         {
            let child = _child as BasePart
            let childDist = child.Position.sub( pos ).Magnitude
            let transparency = GraphCapped( childDist, LIGHTDIST * 0.5, LIGHTDIST * 0.6, 0.0, 1.0 )
            let color = GraphCapped( childDist, LIGHTDIST * 0.5, LIGHTDIST * 0.6, 1.0, 0.5 )

            child.Transparency = transparency
            child.Color = new Color3( color, color, color )
         }
      } )
   } )
}

