import { Players, RunService, Workspace } from "@rbxts/services"
import { Assert, ExecOnChildWhenItExists, GetChildrenWithName, GetChildren_NoFutureOffspring, GetInstanceChildWithName, GetPosition, GetWorkspaceChildByName, Graph, PlayerTouchesPart } from "shared/sh_utils"

/*
type RoomBaseFolder = Folder &
{
   BaseFolderObject: Folder | PackageLink
}
*/

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

   for ( let roomFolder of roomFolders )
   {
      let found = GetChildrenWithName( roomFolder, "Floor" ) as Array<BasePart>
      floors = floors.concat( found )
   }

   let boundsXZ = GetBoundsXZ( floors )
   //print( "Bounds x:" + boundsXZ.minX + "," + boundsXZ.maxX + "  z:" + boundsXZ.minZ + "," + boundsXZ.maxZ )
   //print( "Size x:" + ( boundsXZ.maxX - boundsXZ.minX ) + " z: " + ( boundsXZ.maxZ - boundsXZ.minZ ) )
   //print( "Found " + floors.size() + " floors" )

   let shadowBorder = 0.02

   ExecOnChildWhenItExists( Players.LocalPlayer, 'PlayerGui', function ( gui: Instance )
   {
      ExecOnChildWhenItExists( gui, 'Minimap', function ( minimapUI: ScreenGui )
      {
         let frameName = "MiniFrame"
         let scale = 3.0
         ExecOnChildWhenItExists( minimapUI, frameName, function ( baseFrame: ScreenGui )
         {
            minimapUI.Enabled = true
            let frames = CreateFramesForMinimap( baseFrame, floors, 20 )
            let background = CreateFramesForMinimap( baseFrame, floors, 10 )
            for ( let frame of background )
            {
               frame.BackgroundColor3 = new Color3( 0, 0, 0 )
            }

            SizeFramesForMinimap( floors, frames, boundsXZ, scale, shadowBorder )
            SizeFramesForMinimap( floors, background, boundsXZ, scale, 0 )

            PositionFramesForMinimap( floors, frames, boundsXZ, scale )
            PositionFramesForMinimap( floors, background, boundsXZ, scale )

            let xCenter = boundsXZ.minX + ( boundsXZ.maxX - boundsXZ.minX ) * 0.5
            let zCenter = boundsXZ.minZ + ( boundsXZ.maxZ - boundsXZ.minZ ) * 0.5

            RunService.RenderStepped.Connect( function ()
            {
               let position = GetPosition( Players.LocalPlayer )
               let posX = xCenter - position.X
               let posZ = zCenter - position.Z
               //print( "pos x/z " + posX + "," + posZ )

               PositionFramesForMinimap( floors, frames, boundsXZ, scale, posX, posZ )
               PositionFramesForMinimap( floors, background, boundsXZ, scale, posX, posZ )
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

function CreateFramesForMinimap( baseFrame: ScreenGui, floors: Array<BasePart>, zIndex: number ): Array<Frame>
{
   let results = []
   for ( let floor of floors )
   {
      let frame = new Instance( "Frame" )
      frame.Parent = baseFrame
      frame.BackgroundColor3 = new Color3( floor.Color.r * 0.3, floor.Color.g * 0.3, floor.Color.b * 0.3 )

      frame.BorderSizePixel = 0
      frame.ZIndex = zIndex + floor.Position.Y

      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
      results.push( frame )
   }

   return results
}


function SizeFramesForMinimap( floors: Array<BasePart>, frames: Array<Frame>, boundsXZ: BoundsXZ, scale: number, border: number )
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

function PositionFramesForMinimap( floors: Array<BasePart>, frames: Array<Frame>, boundsXZ: BoundsXZ, scale: number, offsetX?: number, offsetZ?: number )
{
   const halfScale = scale * 0.50
   let totalX = boundsXZ.maxX - boundsXZ.minX
   let totalZ = boundsXZ.maxZ - boundsXZ.minZ
   let total = math.max( totalX, totalZ )

   //let xBufferLow = ( ( total - totalX ) * 0.5 ) / total
   //let xBufferHigh = 1.0 - xBufferLow
   //let zBufferLow = ( ( total - totalZ ) * 0.5 ) / total
   //let zBufferHigh = 1.0 - zBufferLow

   let xBuffer = ( 1.0 - ( total - totalX ) / total ) * halfScale
   let zBuffer = ( 1.0 - ( total - totalZ ) / total ) * halfScale
   //print( " " )
   //print( "xbuf " + xBuffer + " " + zBuffer )
   //zBuffer = halfScale * 1.0
   //xBuffer = halfScale * 0.75
   //print( "xbuf " + xBuffer + " " + zBuffer )

   if ( offsetX === undefined )
      offsetX = 0

   if ( offsetZ === undefined )
      offsetZ = 0

   for ( let i = 0; i < floors.size(); i++ )
   {
      let floor = floors[i]
      let frame = frames[i]
      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, zBufferLow, zBufferHigh ) * scale - quarterScale
      //let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, xBufferLow, xBufferHigh ) * scale - quarterScale
      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, zBufferLow, zBufferHigh ) * scale

      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, zBufferLow, zBufferHigh ) * scale
      //let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, xBufferLow, xBufferHigh ) * scale

      //let posX = Graph( ( floor.Position.Z + offsetZ ), boundsXZ.maxZ, boundsXZ.minZ, -halfScale, halfScale ) * zBufferHigh + zBufferLow + halfScale
      //let posY = Graph( ( floor.Position.X + offsetX ), boundsXZ.minX, boundsXZ.maxX, -halfScale, halfScale ) * xBufferHigh + xBufferLow + halfScale

      // works for 1.0
      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -0.5, 0.5 ) + 0.5
      //let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -0.5, 0.5 ) + 0.5

      // works for 2.0
      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -1.0, 1.0 ) + 0.5
      //let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -1.0, 1.0 ) + 0.5

      //let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -halfScale, halfScale ) + 0.5
      //let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -halfScale, halfScale ) + 0.5

      // works for 0.5
      let posX = Graph( floor.Position.Z + offsetZ, boundsXZ.maxZ, boundsXZ.minZ, -zBuffer, zBuffer ) + 0.5
      let posY = Graph( floor.Position.X + offsetX, boundsXZ.minX, boundsXZ.maxX, -xBuffer, xBuffer ) + 0.5

      frame.Position = new UDim2( posX, 0, posY, 0 )
      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
   }
}



/*
function CreateFramesForMinimap( baseFrame: ScreenGui, floors: Array<BasePart>, boundsXZ: BoundsXZ, scale: number, zIndex: number ): Array<Frame>
{
   const halfScale = scale * 0.5
   let totalX = boundsXZ.maxX - boundsXZ.minX
   let totalZ = boundsXZ.maxZ - boundsXZ.minZ
   let total = math.max( totalX, totalZ )

   let xBufferLow = ( ( total - totalX ) * 0.5 ) / total
   let xBufferHigh = 1.0 - xBufferLow

   let zBufferLow = ( ( total - totalZ ) * 0.5 ) / total
   let zBufferHigh = 1.0 - zBufferLow

   let xRatio = totalX / total
   let zRatio = totalZ / total

   let results = []
   for ( let floor of floors )
   {
      let frame = new Instance( "Frame" )
      frame.Parent = baseFrame
      frame.BackgroundColor3 = floor.Color
      frame.BorderSizePixel = 0
      frame.ZIndex = zIndex + floor.Position.Y

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

      let posX = Graph( floor.Position.Z, boundsXZ.maxZ, boundsXZ.minZ, zBufferLow, zBufferHigh ) * scale - halfScale
      let posY = Graph( floor.Position.X, boundsXZ.minX, boundsXZ.maxX, xBufferLow, xBufferHigh ) * scale - halfScale

      frame.Size = new UDim2( sizeX, 0, sizeY, 0 )
      frame.Position = new UDim2( posX, 0, posY, 0 )
      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
      results.push( frame )
   }

   return results
}
*/