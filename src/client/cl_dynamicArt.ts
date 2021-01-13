import { Workspace } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { IsClient } from "shared/sh_utils"

type STYLES = "CornerWedgePart" | "FlagStand" | "MeshPart" | "NegateOperation" | "Part" | "PartOperation" | "Platform" | "Seat" | "SkateboardPlatform" | "SpawnLocation" | "Terrain" | "TrussPart" | "UnionOperation" | "VehicleSeat" | "WedgePart"

export class DynamicArtInfo
{
   className: STYLES = "Part"
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

export function CL_DynamicArtSetup()
{
}

export function ConvertToDynamicArtInfos( dynamicArtInfos: Array<BasePart> ): Array<DynamicArtInfo>
{
   Assert( IsClient(), "IsClient()" )
   let results: Array<DynamicArtInfo> = []
   for ( let instance of dynamicArtInfos )
   {
      let dynamicArt = instance as BasePart
      let dynamicArtInfo = new DynamicArtInfo()
      dynamicArtInfo.className = dynamicArt.ClassName
      dynamicArtInfo.position = dynamicArt.Position
      dynamicArtInfo.anchored = dynamicArt.Anchored
      dynamicArtInfo.canCollide = dynamicArt.CanCollide
      dynamicArtInfo.size = dynamicArt.Size
      dynamicArtInfo.material = dynamicArt.Material
      dynamicArtInfo.color = dynamicArt.Color
      dynamicArtInfo.brickColor = dynamicArt.BrickColor
      dynamicArtInfo.orientation = dynamicArt.Orientation

      results.push( dynamicArtInfo )
      dynamicArt.Destroy()
   }
   return results
}

export function CreateDynamicArt( dynamicArtInfos: Array<DynamicArtInfo> ): Array<BasePart>
{
   let parts: Array<BasePart> = []
   for ( let dynamicArtInfo of dynamicArtInfos )
   {
      //let str = dynamicArtInfo.className as string
      let createPart: BasePart | undefined = undefined
      switch ( dynamicArtInfo.className )
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
            Assert( false, "Part type " + dynamicArtInfo.className + " isn't handled yet, add here" )
      }
      let part = createPart as BasePart

      part.Position = dynamicArtInfo.position
      part.Anchored = dynamicArtInfo.anchored
      part.CanCollide = dynamicArtInfo.canCollide
      part.Size = dynamicArtInfo.size
      part.Material = dynamicArtInfo.material
      part.Color = dynamicArtInfo.color
      part.BrickColor = dynamicArtInfo.brickColor
      part.Orientation = dynamicArtInfo.orientation

      parts.push( part )
   }

   return parts
}