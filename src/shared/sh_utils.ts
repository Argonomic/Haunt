import { Players } from "@rbxts/services";
import { Workspace } from "@rbxts/services";
import { ReplicatedStorage } from "@rbxts/services"
import { CL_TasksSetup } from "client/cl_tasks";

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

export function GetInstanceChildWithName( parent: Instance, name: string ): Instance | undefined
{
   let kids = parent.GetChildren()
   for ( let kid of kids )
   {
      if ( kid.Name === name )
         return kid
   }

   return undefined
}

export function GetChildren_NoFutureOffspring( parent: Instance ): Array<Instance>
{
   function catchOffspring( child: Instance )
   {
      Assert( false, "Parent " + parent.Name + " tried to create offspring " + child.Name )
   }

   parent.ChildAdded.Connect( catchOffspring )

   return parent.GetChildren()
}


export function ExecOnChildWhenItExists( parent: Instance, name: string, func: Function )
{
   let instance = GetInstanceChildWithName( parent, name )
   if ( instance === undefined )
      OnChildConnect( parent, name, func )
   else
      func( instance )
}

function OnChildConnect( instance: Instance, name: string, func: Function )
{
   //huzz
   let connection: RBXScriptConnection | undefined
   let connectTable = { connection: connection }

   let onConnect = function ( child: Instance )
   {
      if ( child.Name !== name )
         return
      if ( connectTable.connection !== undefined )
         connectTable.connection.Disconnect()
      func( child )
   }

   connectTable.connection = instance.ChildAdded.Connect( onConnect )
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
      let p = math.random( i + 1 ) - 1
      let swap = tbl[p]
      tbl[p] = tbl[i]
      tbl[i] = swap
   }
}

export function CreateRemoteEvent( name: string ): RemoteEvent
{
   Assert( IsServer(), "Can't do this on the client" )
   let remoteEvent = new Instance( "RemoteEvent" )
   remoteEvent.Name = name
   remoteEvent.Parent = ReplicatedStorage
   return remoteEvent
}

export function Thread( func: Function ): thread
{
   let result = coroutine.create( func )
   coroutine.resume( result )
   return result
}

export function SetPlayerState( player: Player, setting: Enum.HumanoidStateType, value: boolean )
{
   let character = player.Character
   if ( character === undefined )
      throw undefined

   let human = GetInstanceChildWithName( character, "Humanoid" )
   if ( human === undefined )
      throw undefined;

   ( human as Humanoid ).SetStateEnabled( setting, value )
}

export function PlayerTouchesPart( player: Player, basePart: BasePart, maxDist: number ): boolean
{
   let playerOrg = GetPosition( player )
   let dist = math.abs( ( playerOrg.sub( basePart.Position ) ).Magnitude )

   if ( dist > maxDist )
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