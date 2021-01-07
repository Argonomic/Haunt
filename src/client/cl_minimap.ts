import { RunService, Workspace } from "@rbxts/services"
import { BoundsXZ, GetBoundsXZ } from "shared/sh_bounds"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { GetChildrenWithName, GetChildren_NoFutureOffspring, GetExistingFirstChildWithNameAndClassName, GetInstanceChildWithName, GetLocalPlayer, GetPosition, GetWorkspaceChildByName, Graph } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { LiveName, AddPlayerGuiFolderExistsCallback, UIORDER, CreateCalloutStyleTextLabel } from "./cl_ui"
import { Tween } from "shared/sh_tween"

const SCR_FLOOR = "scr_floor"
const SCR_FLOOR_NONAME = "scr_floor_noname"
const SCR_FLOOR_CONNECTOR = "scr_floor_connector"
const ZINDEX_CALLOUT = 1500
const ZINDEX_ARROW = 1499

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

class File
{
   mapIcons: Array<MapIcon> = []
   minimapUI: ScreenGui | undefined
   baseFrame: Frame | undefined
   minimapReferenceFrame: Frame | undefined
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

   AddCallback_OnPlayerCharacterAncestryChanged( function ()
   {
      if ( file.minimapUI !== undefined )
         file.minimapUI.Parent = undefined
   } )


   let roomFolders = GetChildren_NoFutureOffspring( roomFolderBase )

   let floors: Array<BasePart> = []
   let floorsByRoom = new Map<string, Array<BasePart>>()

   let connectors: Array<BasePart> = []
   let connectorsByRoom = new Map<string, Array<BasePart>>()

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

   for ( let roomFolder of roomFolders )
   {
      let found: Array<BasePart> = []
      found = found.concat( GetChildrenWithName( roomFolder, SCR_FLOOR_CONNECTOR ) as Array<BasePart> )
      connectorsByRoom.set( roomFolder.Name, found )
      connectors = connectors.concat( found )
   }

   for ( let connector of connectors )
   {
      connector.Transparency = 1
   }

   let boundsXZ = GetBoundsXZ( floors )
   let shadowBorder = 0.02

   let camera = Workspace.CurrentCamera as Camera
   let viewSize = camera.ViewportSize
   //let aspectRatio = viewSize.X / viewSize.Y
   let fontSize = Graph( viewSize.Y, 374, 971, 6, 18 )

   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      if ( file.minimapUI !== undefined )
      {
         let minimapUI = GetExistingFirstChildWithNameAndClassName( gui, 'Minimap', 'ScreenGui' ) as ScreenGui
         minimapUI.Destroy()
         file.minimapUI.Parent = gui
         return
      }

      file.mapIcons = []
      let minimapUI = GetExistingFirstChildWithNameAndClassName( gui, 'Minimap', 'ScreenGui' ) as ScreenGui
      file.minimapUI = minimapUI
      LiveName( minimapUI )

      let frameName = "MiniFrame"
      minimapUI.DisplayOrder = UIORDER.UIORDER_MINIMAP

      let megaFrame = GetExistingFirstChildWithNameAndClassName( minimapUI, 'MegaFrame', 'Frame' ) as Frame
      let baseFrame = GetExistingFirstChildWithNameAndClassName( minimapUI, frameName, 'Frame' ) as Frame
      let miniFrame = baseFrame.Clone()
      miniFrame.Visible = false
      miniFrame.Parent = baseFrame.Parent
      file.minimapReferenceFrame = miniFrame
      file.baseFrame = baseFrame
      let arrow = GetExistingFirstChildWithNameAndClassName( baseFrame, 'PlayerArrow', 'ImageLabel' ) as ImageLabel
      arrow.Rotation = 35
      arrow.ZIndex = ZINDEX_ARROW

      baseFrame.BackgroundTransparency = 0 //1
      baseFrame.BorderSizePixel = 0

      for ( let mapIcon of file.mapIcons )
      {
         mapIcon.textLabel.Parent = baseFrame
      }

      minimapUI.Enabled = true
      let frames: Array<TextLabel> = []
      let background: Array<TextLabel> = []
      let connectorArt: Array<TextLabel> = []
      for ( let roomFolder of roomFolders )
      {
         let floors = floorsByRoom.get( roomFolder.Name ) as Array<BasePart>
         frames = frames.concat( CreateTextLabelsForMinimap( roomFolder.Name, baseFrame, floors, fontSize, 200 ) )
         background = background.concat( CreateTextLabelsForMinimap( roomFolder.Name, baseFrame, floors, fontSize, 100 ) )

         let connectors = connectorsByRoom.get( roomFolder.Name ) as Array<BasePart>
         connectorArt = connectorArt.concat( CreateConnectorArt( roomFolder.Name, baseFrame, connectors, 150 ) )
      }

      for ( let frame of background )
      {
         frame.BackgroundColor3 = new Color3( 0.8, 0.8, 0.8 )
      }

      class ScaleHolder
      {
         xBuffer: number
         zBuffer: number
         xCenter: number
         zCenter: number
         scale: number

         constructor( scale: number, shadowBorder: number )
         {
            this.scale = scale
            SizeFramesForMinimap( floors, frames, boundsXZ, scale, shadowBorder )
            SizeFramesForMinimap( floors, background, boundsXZ, scale, -shadowBorder )
            SizeFramesForMinimap( connectors, connectorArt, boundsXZ, scale, 0 )

            this.xCenter = boundsXZ.minX + ( boundsXZ.maxX - boundsXZ.minX ) * 0.5
            this.zCenter = boundsXZ.minZ + ( boundsXZ.maxZ - boundsXZ.minZ ) * 0.5

            const totalX = boundsXZ.maxX - boundsXZ.minX
            const totalZ = boundsXZ.maxZ - boundsXZ.minZ
            const total = math.max( totalX, totalZ )

            const halfScale = scale * 0.50
            this.xBuffer = ( 1.0 - ( total - totalX ) / total ) * halfScale
            this.zBuffer = ( 1.0 - ( total - totalZ ) / total ) * halfScale
         }
      }

      let scaleHolder = new ScaleHolder( 2, shadowBorder )

      let button = new Instance( 'TextButton' )
      button.Parent = baseFrame
      button.ZIndex = 99999
      button.Size = new UDim2( 1, 0, 1, 0 )
      button.BackgroundTransparency = 1
      button.Text = ""
      button.MouseButton1Click.Connect( function ()
      {
         let targetFrame
         if ( scaleHolder.scale === 2 )
         {
            scaleHolder = new ScaleHolder( 1.0, shadowBorder * 0.4 )
            targetFrame = megaFrame
         }
         else
         {
            scaleHolder = new ScaleHolder( 2, shadowBorder )
            targetFrame = miniFrame
         }

         Tween( baseFrame, {
            Position: targetFrame.Position,
            Size: targetFrame.Size,
            AnchorPoint: targetFrame.AnchorPoint
         }, 0.25 )
      } )


      function SetFramePositions( floors: Array<BasePart>, frames: Array<TextLabel>, offsetX: number, offsetZ: number )
      {
         for ( let i = 0; i < floors.size(); i++ )
         {
            const floor = floors[i]
            const frame = frames[i]
            const posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -scaleHolder.zBuffer, scaleHolder.zBuffer ) + 0.5
            const posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -scaleHolder.xBuffer, scaleHolder.xBuffer ) + 0.5
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
            let posX = Graph( position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -scaleHolder.zBuffer, scaleHolder.zBuffer ) + 0.5
            let posY = Graph( position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -scaleHolder.xBuffer, scaleHolder.xBuffer ) + 0.5

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

      let player = GetLocalPlayer()
      RunService.RenderStepped.Connect( function ()
      {
         let position = GetPosition( player )
         let posX = scaleHolder.xCenter - position.X
         let posZ = scaleHolder.zCenter - position.Z

         SetFramePositions( floors, frames, posX, posZ )
         SetFramePositions( floors, background, posX, posZ )
         SetFramePositions( connectors, connectorArt, posX, posZ )
         SetIconPositions( posX, posZ )

         if ( player.Character !== undefined && player.Character.PrimaryPart !== undefined )
            arrow.Rotation = 180 + 360 - ( player.Character.PrimaryPart as BasePart ).Orientation.Y - 90
      } );

   } )
}

function CreateTextLabelsForMinimap( roomName: string, baseFrame: Frame, floors: Array<BasePart>, fontSize: number, zIndex: number ): Array<TextLabel>
{
   let results = []
   for ( let floor of floors )
   {
      let frame = new Instance( "TextLabel" ) // good example of typescript - change this text
      frame.Parent = baseFrame
      frame.BackgroundColor3 = new Color3( floor.Color.r * 0.3, floor.Color.g * 0.3, floor.Color.b * 0.3 )

      frame.TextColor3 = new Color3( 1, 1, 1 )
      frame.TextWrapped = true
      frame.TextSize = fontSize
      frame.Text = ""
      //if ( fontSize < 10 )
      //   frame.TextScaled = true

      frame.BorderSizePixel = 0
      frame.ZIndex = zIndex + floor.Position.Y
      frame.AnchorPoint = new Vector2( 0.5, 0.5 )

      frame.Name = floor.Name + " " + zIndex
      if ( floor.Name === SCR_FLOOR )
         frame.Text = roomName

      results.push( frame )
   }

   return results
}

function CreateConnectorArt( roomName: string, baseFrame: Frame, floors: Array<BasePart>, zIndex: number ): Array<TextLabel>
{
   let results = []
   for ( let floor of floors )
   {
      let frame = new Instance( "TextLabel" ) // good example of typescript - change this text
      frame.Parent = baseFrame
      frame.BackgroundColor3 = new Color3( 0.2, 0.2, 0.2 )

      frame.TextColor3 = new Color3( 1, 1, 1 )
      frame.TextWrapped = true
      frame.BorderSizePixel = 0
      frame.Text = ""
      frame.Name = floor.Name + " " + zIndex

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
   if ( file.minimapUI === undefined )
      return

   let textLabel = CreateCalloutStyleTextLabel()
   textLabel.AnchorPoint = new Vector2( 0.5, 0 )
   textLabel.Name = "MapIcon"
   textLabel.ZIndex = ZINDEX_CALLOUT
   let mapIcon = new MapIcon( textLabel, position )
   file.mapIcons.push( mapIcon )
   textLabel.Parent = file.baseFrame
}

export function GetMinimapReferencesFrame(): Frame | undefined
{
   return file.minimapReferenceFrame
}
