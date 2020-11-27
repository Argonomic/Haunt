import { Players, Workspace } from "@rbxts/services"
import { Assert, ExecOnChildWhenItExists, Graph, TextLabels } from "shared/sh_utils"
import { UIORDER } from "./cl_ui"

class File
{
   activeCallouts = new Map<string, TextLabels>()
   screenUI = new Instance( "ScreenGui" )
}
let file = new File()

export function CL_CalloutsSetup()
{
   ExecOnChildWhenItExists( Players.LocalPlayer, 'PlayerGui', function ( gui: Instance )
   {
      let screenUI = file.screenUI
      screenUI.Name = "Callouts2d"
      screenUI.Parent = gui
      screenUI.DisplayOrder = UIORDER.UIORDER_CALLOUTS
   } )
}

export function InitCallouts( name: string )
{
   Assert( !file.activeCallouts.has( name ), "Already created callouts named " + name )
   file.activeCallouts.set( name, [] )
}

export function ClearCallouts( name: string )
{
   Assert( file.activeCallouts.has( name ), "No callouts named " + name )

   let callouts = file.activeCallouts.get( name ) as TextLabels
   for ( let callout of callouts )
   {
      callout.Destroy()
   }
   file.activeCallouts.set( name, [] )
}

export function AddCallout( name: string, worldPoint: Vector3 )
{
   let camera = Workspace.CurrentCamera
   if ( camera === undefined )
      return

   let [vector, onScreen] = camera.WorldToScreenPoint( worldPoint )
   let viewSize = camera.ViewportSize
   //print( "\t** add callout " + vector )

   let textLabel = CreateCalloutTextLabel()
   textLabel.Parent = file.screenUI

   let X = Graph( vector.X, 0, viewSize.X, 0, 1.0 )
   let Y = Graph( vector.Y, 0, viewSize.Y, 0, 1.0 )
   textLabel.Position = new UDim2( X, 0, Y, 0 )

   let callouts = file.activeCallouts.get( name ) as TextLabels
   callouts.push( textLabel )
   file.activeCallouts.set( name, callouts )

   //let screenPoint = new Vector2( vector.X, vector.Y )
   //let depth = vector.Z
}

export function CreateCalloutTextLabel(): TextLabel
{
   let textLabel = new Instance( "TextLabel" )
   textLabel.AnchorPoint = new Vector2( 0.5, 0.5 )
   textLabel.Size = new UDim2( 0.05, 0, 0.1, 0 )
   textLabel.TextScaled = true
   textLabel.Text = "!"
   textLabel.BorderSizePixel = 0
   textLabel.BackgroundTransparency = 1.0
   textLabel.Font = Enum.Font.LuckiestGuy
   textLabel.TextColor3 = new Color3( 1, 1, 0.25 )
   textLabel.TextStrokeTransparency = 0.0
   return textLabel
}