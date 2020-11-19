import { Players } from "@rbxts/services";
import { Workspace } from "@rbxts/services";
import { PutPlayerInStartRoom } from "server/sv_rooms";

class File
{
   isServer: boolean = false
}

let file = new File()

export function SetServer()
{
   file.isServer = true
}

export function IsServer(): boolean
{
   return file.isServer
}

export function IsClient(): boolean
{
   return !file.isServer
}


export function GetWorkspaceChildByName( name: string ): any
{
   let kids = Workspace.GetChildren()
   for ( let kid of kids )
   {
      if ( kid.Name === name )
         return kid
   }

   print( "Could not find " + name + " in workspace" )
   return undefined
}

export function Assert( bool: boolean, msg: string )
{
   if ( bool )
      return

   print( "ASSERT FAILED: " + msg )
}

export function GetInstanceChildWithName( parent: Instance, name: string ): unknown
{
   let kids = parent.GetChildren()
   for ( let kid of kids )
   {
      if ( kid.Name === name )
         return kid
   }

   return undefined
}

export function GetPlayerFromCharacter( character: Model ): Player | undefined
{
   for ( let player of Players.GetPlayers() ) 
   {
      if ( player.Character === character )
         return player
   }

   return undefined
}

export function GetPlayerFromDescendant( descendant: Instance ): Player | undefined
{
   for ( ; ; )
   {
      let parent = descendant.Parent
      if ( parent === Workspace )
      {
         let model = descendant as Model
         return GetPlayerFromCharacter( model )
      }

      descendant = parent as Instance
   }
}

export function GetTouchingParts( part: BasePart ): Array<BasePart>
{
   let connection = part.Touched.Connect( function ()
   {
   } )

   let results = part.GetTouchingParts()
   connection.Disconnect()

   return results
}

export function GetPosition( thing: Instance ): Vector3
{
   switch ( thing.ClassName )
   {
      case "Player":
         {
            let player = thing as Player
            let part = player.Character?.PrimaryPart as BasePart
            return part.Position
         }

      case "Part":
         {
            let part = thing as BasePart
            return part.Position
         }
   }

   Assert( false, "Unknown type of thing " + thing.ClassName )
   throw undefined
}

export function LoadSound( id: number ): Sound
{
   let sound = new Instance( "Sound", game.Workspace ) as Sound
   sound.SoundId = "rbxassetid://" + id
   return sound
}

export function GraphCapped( x: number, x1: number, x2: number, y1: number, y2: number )
{
   if ( x1 < x2 )
   {
      if ( x < x1 )
         x = x1
      else if ( x > x2 )
         x = x2
   }
   else
   {
      if ( x > x1 )
         x = x1
      else if ( x < x2 )
         x = x2
   }

   return Graph( x, x1, x2, y1, y2 )
}

export function Graph( x: number, x1: number, x2: number, y1: number, y2: number )
{
   let slope = 1.0 * ( y2 - y1 ) / ( x2 - x1 )
   return y1 + slope * ( x - x1 )
}

export function ArrayRandomize( tbl: Array<unknown> )
{
   for ( let i = 0; i < tbl.size(); i++ )
   {
      let p = math.random( i + 1 )
      Assert( p >= 0 && p < tbl.size(), "bad!" )
      let swap = tbl[p]
      tbl[p] = tbl[i]
      tbl[i] = swap
   }
}



