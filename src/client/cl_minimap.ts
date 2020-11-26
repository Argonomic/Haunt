import { Players, RunService, Workspace } from "@rbxts/services"
import { Assert, ExecOnChildWhenItExists, GetChildrenWithName, GetChildren_NoFutureOffspring, GetInstanceChildWithName, GetPosition, GetWorkspaceChildByName, Graph, TextLabels } from "shared/sh_utils"
import { CreateCalloutTextLabel } from "./cl_callouts2d"

const SCR_FLOOR = "scr_floor"
const SCR_FLOOR_NONAME = "scr_floor_noname"

class BoundsXZ
{
   minX: number
   maxX: number
   minZ: number
   maxZ: number

   constructor( minX: number, maxX: number, minZ: number, maxZ: number )
   {
      this.minX = minX
      this.maxX = maxX
      this.minZ = minZ
      this.maxZ = maxZ
   }
}

class MapIcon
{
   textLabel: TextLabel
   position: Vector3
   constructor( textLabel: TextLabel, position: Vector3 )
   {
      this.textLabel = textLabel
      this.position = position
   }
}

const EMPTY_MINIMAPFRAME = new Instance( "ScreenGui" ) // deleted on start 

class File
{
   mapIcons: Array<MapIcon> = []
   minimapGui: ScreenGui = EMPTY_MINIMAPFRAME
}

let file = new File()

export function CL_MinimapSetup()
{
   const art = GetWorkspaceChildByName( "Art" ) as Folder
   let roomFolderBase = GetInstanceChildWithName( art, "Rooms" )
   if ( roomFolderBase === undefined )
   {
      Assert( false, "Could not find workspace.Art.Rooms" )
      return
   }

   let roomFolders = GetChildren_NoFutureOffspring( roomFolderBase )

   let floors: Array<BasePart> = []
   let floorsByRoom = new Map<string, Array<BasePart>>()

   let scriptNames = [SCR_FLOOR, SCR_FLOOR_NONAME]

   for ( let roomFolder of roomFolders )
   {
      let found: Array<BasePart> = []
      for ( let name of scriptNames )
      {
         found = found.concat( GetChildrenWithName( roomFolder, name ) as Array<BasePart> )
      }
      floorsByRoom.set( roomFolder.Name, found )

      floors = floors.concat( found )
   }

   let boundsXZ = GetBoundsXZ( floors )
   let shadowBorder = 0.02

   let camera = Workspace.CurrentCamera as Camera
   let viewSize = camera.ViewportSize
   print( "viewsize " + viewSize.X + " " + viewSize.Y )
   //let aspectRatio = viewSize.X / viewSize.Y
   let fontSize = Graph( viewSize.Y, 374, 971, 9, 18 )

   ExecOnChildWhenItExists( Players.LocalPlayer, 'PlayerGui', function ( gui: Instance )
   {
      ExecOnChildWhenItExists( gui, 'Minimap', function ( minimapUI: ScreenGui )
      {
         let frameName = "MiniFrame"
         let scale = 3.0
         ExecOnChildWhenItExists( minimapUI, frameName, function ( baseFrame: ScreenGui )
         {
            Assert( file.minimapGui === EMPTY_MINIMAPFRAME, "file.minimapGui === EMPTY_MINIMAPFRAME" )
            file.minimapGui.Destroy()
            file.minimapGui = baseFrame

            for ( let mapIcon of file.mapIcons )
            {
               mapIcon.textLabel.Parent = file.minimapGui
            }


            minimapUI.Enabled = true
            let frames: Array<TextLabel> = []
            let background: Array<TextLabel> = []
            for ( let roomFolder of roomFolders )
            {
               let floors = floorsByRoom.get( roomFolder.Name ) as Array<BasePart>
               frames = frames.concat( CreateTextLabelsForMinimap( roomFolder.Name, baseFrame, floors, fontSize, 20 ) )
               background = background.concat( CreateTextLabelsForMinimap( roomFolder.Name, baseFrame, floors, fontSize, 10 ) )
            }

            for ( let frame of background )
            {
               frame.BackgroundColor3 = new Color3( 0, 0, 0 )
            }

            SizeFramesForMinimap( floors, frames, boundsXZ, scale, shadowBorder )
            SizeFramesForMinimap( floors, background, boundsXZ, scale, 0 )

            let xCenter = boundsXZ.minX + ( boundsXZ.maxX - boundsXZ.minX ) * 0.5
            let zCenter = boundsXZ.minZ + ( boundsXZ.maxZ - boundsXZ.minZ ) * 0.5

            const halfScale = scale * 0.50
            const totalX = boundsXZ.maxX - boundsXZ.minX
            const totalZ = boundsXZ.maxZ - boundsXZ.minZ
            const total = math.max( totalX, totalZ )

            const xBuffer = ( 1.0 - ( total - totalX ) / total ) * halfScale
            const zBuffer = ( 1.0 - ( total - totalZ ) / total ) * halfScale

            function SetFramePositions( floors: Array<BasePart>, frames: Array<TextLabel>, offsetX: number, offsetZ: number )
            {
               for ( let i = 0; i < floors.size(); i++ )
               {
                  const floor = floors[i]
                  const frame = frames[i]
                  const posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -zBuffer, zBuffer ) + 0.5
                  const posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -xBuffer, xBuffer ) + 0.5
                  frame.Position = new UDim2( posX, 0, posY, 0 )
               }
            }

            const CLAMP = 1.05
            const CLAMP2 = CLAMP * 2.0
            function SetIconPositions( offsetX: number, offsetZ: number )
            {
               for ( let mapIcon of file.mapIcons )
               {
                  let position = mapIcon.position
                  let posX = Graph( position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -zBuffer, zBuffer ) + 0.5
                  let posY = Graph( position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -xBuffer, xBuffer ) + 0.5

                  posX *= CLAMP2
                  posX -= CLAMP
                  posY *= CLAMP2
                  posY -= CLAMP

                  let greatest = math.max( math.abs( posX ), math.abs( posY ) )
                  if ( greatest > 1.0 )
                  {
                     // clamp icon
                     posX /= greatest
                     posY /= greatest
                  }

                  posX += CLAMP
                  posX /= CLAMP2
                  posY += CLAMP
                  posY /= CLAMP2

                  mapIcon.textLabel.Position = new UDim2( posX, 0, posY, 0 )
                  //print( "pos " + posX + "," + posY )
               }
            }

            RunService.RenderStepped.Connect( function ()
            {
               let position = GetPosition( Players.LocalPlayer )
               let posX = xCenter - position.X
               let posZ = zCenter - position.Z

               SetFramePositions( floors, frames, posX, posZ )
               SetFramePositions( floors, background, posX, posZ )
               SetIconPositions( posX, posZ )
            } );
         } )
      } )
   } )
}


function GetBoundsXZ( parts: Array<BasePart> ): BoundsXZ
{
   let minX = 0
   let maxX = 0
   let minZ = 0
   let maxZ = 0

   for ( let part of parts )
   {
      if ( part.Position.X - ( part.Size.X * 0.5 ) < minX )
         minX = part.Position.X - ( part.Size.X * 0.5 )

      if ( part.Position.X + ( part.Size.X * 0.5 ) > maxX )
         maxX = part.Position.X + ( part.Size.X * 0.5 )

      if ( part.Position.Z - ( part.Size.Z * 0.5 ) < minZ )
         minZ = part.Position.Z - ( part.Size.Z * 0.5 )

      if ( part.Position.Z + ( part.Size.Z * 0.5 ) > maxZ )
         maxZ = part.Position.Z + ( part.Size.Z * 0.5 )
   }

   return new BoundsXZ( minX, maxX, minZ, maxZ )
}

function CreateTextLabelsForMinimap( roomName: string, baseFrame: ScreenGui, floors: Array<BasePart>, fontSize: number, zIndex: number ): Array<TextLabel>
{
   let results = []
   for ( let floor of floors )
   {
      let frame = new Instance( "TextLabel" ) // good example of typescript - change this text
      frame.Parent = baseFrame
      frame.BackgroundColor3 = new Color3( floor.Color.r * 0.3, floor.Color.g * 0.3, floor.Color.b * 0.3 )

      if ( floor.Name === SCR_FLOOR )
         frame.Text = roomName
      else
         frame.Text = ""

      frame.TextColor3 = new Color3( 1, 1, 1 )
      frame.TextWrapped = true
      frame.TextSize = fontSize
      //if ( fontSize < 10 )
      //   frame.TextScaled = true

      frame.BorderSizePixel = 0
      frame.ZIndex = zIndex + floor.Position.Y

      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
      results.push( frame )
   }

   return results
}


function SizeFramesForMinimap( floors: Array<BasePart>, frames: Array<TextLabel>, boundsXZ: BoundsXZ, scale: number, border: number )
{
   let totalX = boundsXZ.maxX - boundsXZ.minX
   let totalZ = boundsXZ.maxZ - boundsXZ.minZ
   let total = math.max( totalX, totalZ )

   let xRatio = totalX / total
   let zRatio = totalZ / total

   for ( let i = 0; i < floors.size(); i++ )
   {
      let floor = floors[i]
      let frame = frames[i]
      let sizeX = 0
      let sizeY = 0

      function CalcSize( floorSizeX: number, floorSizeZ: number )
      {
         sizeY = Graph( floorSizeX * scale, 0, totalX, 0, xRatio )
         sizeX = Graph( floorSizeZ * scale, 0, totalZ, 0, zRatio )
      }

      if ( floor.Orientation.Y !== 90 )
         CalcSize( floor.Size.X, floor.Size.Z )
      else
         CalcSize( floor.Size.Z, floor.Size.X )

      frame.Size = new UDim2( sizeX - border, 0, sizeY - border, 0 )
   }
}


export function ClearMinimapIcons()
{
   for ( let mapIcon of file.mapIcons )
   {
      mapIcon.textLabel.Destroy()
   }

   file.mapIcons = []
}

export function AddMapIcon( position: Vector3 )
{
   let textLabel = CreateCalloutTextLabel()
   textLabel.Name = "MapIcon"
   textLabel.ZIndex = 100
   let mapIcon = new MapIcon( textLabel, position )
   file.mapIcons.push( mapIcon )

   if ( file.minimapGui !== EMPTY_MINIMAPFRAME )
      textLabel.Parent = file.minimapGui
}