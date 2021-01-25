import { Players } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { GetPlayerFromDescendant, GetTouchingParts, Thread } from "shared/sh_utils"
import { Assert } from "./sh_assert"

class File
{
   lastPlayerPos = new Map<Player, Vector3>()
}
let file = new File()

function GetLastPlayerPosition( player: Player ): Vector3
{
   if ( !file.lastPlayerPos.has( player ) )
      return new Vector3( 0, 0, 0 )
   Assert( file.lastPlayerPos.has( player ), "Tried to GetLastPlayerPosition of player that does not exist" )
   return file.lastPlayerPos.get( player ) as Vector3
}

export function SH_UtilsGeometrySetup()
{
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      file.lastPlayerPos.set( player, new Vector3( 0, 0, 0 ) )
   } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      Thread( function ()
      {
         for ( ; ; )
         {
            wait( 0.5 )
            if ( player.Character === undefined )
               return

            file.lastPlayerPos.set( player, GetPosition( player ) )
         }
      } )
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         Thread( function ()
         {
            wait()
            file.lastPlayerPos.delete( player )
         } )
      } )
}

export function GetPosition( thing: Instance ): Vector3
{
   Assert( thing !== undefined, "Can't get position of undefined" )
   if ( thing.IsA( 'Player' ) )
   {
      if ( thing.Character !== undefined )
      {
         if ( thing.Character.PrimaryPart !== undefined )
            return thing.Character.PrimaryPart.Position
      }
      return GetLastPlayerPosition( thing ) // player may not have a character
   }

   if ( thing.IsA( 'Model' ) )
   {
      let model = thing as Model
      if ( model.PrimaryPart !== undefined )
         return model.PrimaryPart.Position

      print( "Model named " + model.Name + " has no primary part" )
      for ( let child of model.GetChildren() )
      {
         if ( child.IsA( 'BasePart' ) )
            return child.Position
      }
      print( "And children count " + model.GetChildren().size() )

      Assert( false, "Model has no position" )
      throw undefined
   }

   if ( thing.IsA( 'BasePart' ) )
      return thing.Position

   Assert( false, "Unknown type of thing " + thing.ClassName )
   throw undefined
}

export function GetClosest( player: Player, baseParts: Array<BasePart> ): BasePart
{
   let playerOrg = GetPosition( player )
   Assert( baseParts.size() > 0, "No parts" )
   let closestPart = baseParts[0]
   let closestDist = playerOrg.sub( closestPart.Position ).Magnitude

   for ( let i = 1; i < baseParts.size(); i++ )
   {
      let basePart = baseParts[i]
      let dist = playerOrg.sub( basePart.Position ).Magnitude
      if ( dist < closestDist )
      {
         closestDist = dist
         closestPart = basePart
      }
   }

   return closestPart
}

export function Distance( a: Instance, b: Instance ): number
{
   let pos1 = GetPosition( a )
   let pos2 = GetPosition( b )
   return pos1.sub( pos2 ).Magnitude
}

export function PlayerTouchesPart( player: Player, basePart: BasePart ): boolean
{
   let playerOrg = GetPosition( player )
   let dist = ( playerOrg.sub( basePart.Position ) ).Magnitude

   if ( dist > basePart.Size.Magnitude )
      return false

   let parts = GetTouchingParts( basePart )

   for ( let part of parts )
   {
      let partPlayer = GetPlayerFromDescendant( part )
      if ( partPlayer === player )
         return true
   }

   return false
}

export function ArrayDistSorted( org: Vector3, baseParts: Array<Instance>, maxDist: number ): Array<Instance>
{
   let dist = new Map<Instance, number>()
   let filtered = baseParts.filter( function ( part )
   {
      let distance = org.sub( GetPosition( part ) ).Magnitude
      if ( distance > maxDist )
         return false
      dist.set( part, distance )
      return true
   } )

   function DistSort( a: Instance, b: Instance ): boolean
   {
      return ( dist.get( a ) as number ) < ( dist.get( b ) as number )
   }

   filtered.sort( DistSort )
   return filtered
}

