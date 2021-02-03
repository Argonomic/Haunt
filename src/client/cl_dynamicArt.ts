import { Workspace } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { IsClient } from "shared/sh_utils"

type STYLES = "CornerWedgePart" | "FlagStand" | "MeshPart" | "NegateOperation" | "Part" | "PartOperation" | "Platform" | "Seat" | "SkateboardPlatform" | "SpawnLocation" | "Terrain" | "TrussPart" | "UnionOperation" | "VehicleSeat" | "WedgePart" | "Decal"

export class DecalInfo
{
   Face: Enum.NormalId
   Color3: Color3
   Texture: string
   Transparency: number

   constructor
      ( Face: Enum.NormalId, Color3: Color3, Texture: string, Transparency: number, )
   {
      this.Face = Face
      this.Color3 = Color3
      this.Texture = Texture
      this.Transparency = Transparency
   }
}

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
   decalInfo: DecalInfo | undefined
}

export function CL_DynamicArtSetup()
{
}

export function ConvertToDynamicArtInfos( baseParts: Array<BasePart> ): Array<DynamicArtInfo>
{
   Assert( IsClient(), "IsClient()" )
   let results: Array<DynamicArtInfo> = []
   for ( let instance of baseParts )
   {
      let basePart = instance as BasePart
      let dynamicArtInfo = new DynamicArtInfo()
      dynamicArtInfo.className = basePart.ClassName
      dynamicArtInfo.position = basePart.Position
      dynamicArtInfo.anchored = basePart.Anchored
      dynamicArtInfo.canCollide = basePart.CanCollide
      dynamicArtInfo.size = basePart.Size
      dynamicArtInfo.material = basePart.Material
      dynamicArtInfo.color = basePart.Color
      dynamicArtInfo.brickColor = basePart.BrickColor
      dynamicArtInfo.orientation = basePart.Orientation

      for ( let child of basePart.GetChildren() )
      {
         if ( !child.IsA( 'Decal' ) )
            continue
         let decal = child as Decal
         dynamicArtInfo.decalInfo = new DecalInfo( decal.Face, decal.Color3, decal.Texture, decal.Transparency )
         break
      }

      results.push( dynamicArtInfo )
      basePart.Destroy()
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

      if ( dynamicArtInfo.decalInfo !== undefined )
      {
         let decal = new Instance( 'Decal' )
         decal.Face = dynamicArtInfo.decalInfo.Face
         decal.Transparency = dynamicArtInfo.decalInfo.Transparency
         decal.Color3 = dynamicArtInfo.decalInfo.Color3
         decal.Texture = dynamicArtInfo.decalInfo.Texture
         decal.Parent = part
      }

      parts.push( part )
   }

   return parts
}