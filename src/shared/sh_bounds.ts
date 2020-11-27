export class BoundsXZ
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

export function GetBoundsXZ( parts: Array<BasePart> ): BoundsXZ
{
   let minX = 99999
   let maxX = -99999
   let minZ = 99999
   let maxZ = -99999

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

export function GetBoundsMidXY( boundsXZ: BoundsXZ ): Vector2
{
   return new Vector2(
      ( boundsXZ.maxZ - boundsXZ.minZ ) * 0.5 + boundsXZ.minZ,
      ( boundsXZ.maxX - boundsXZ.minX ) * 0.5 + boundsXZ.minX
   )
}