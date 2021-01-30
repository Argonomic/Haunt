import { Players, TeleportService } from "@rbxts/services";
import { Workspace } from "@rbxts/services";
import { ReplicatedStorage } from "@rbxts/services"

class File
{
   isServer: boolean | undefined
}

let file = new File()


export type TextLabels = Array<TextLabel>


export function SetServer()
{
   file.isServer = true
}

export function SetClient()
{
   file.isServer = false
}

export function IsServer(): boolean
{
   if ( file.isServer === undefined )
   {
      Assert( false, "IsServer is not defined" )
      throw undefined
   }
   return file.isServer
}

export function IsClient(): boolean
{
   if ( file.isServer === undefined )
   {
      Assert( false, "IsServer is not defined" )
      throw undefined
   }
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

export function GetChildrenWithName( parent: Instance, name: string ): Array<Instance>
{
   let kids = parent.GetChildren()
   let found = []
   for ( let kid of kids )
   {
      if ( kid.Name === name )
         found.push( kid )
   }

   return found
}

export function GetFirstChildWithName( parent: Instance, name: string ): Instance | undefined
{
   let kids = parent.GetChildren()

   for ( let kid of kids )
   {
      if ( kid.Name === name )
         return kid
   }

   return undefined
}

export function GetFirstChildWithNameAndClassName( parent: Instance, name: string, className: string ): Instance | undefined
{
   let kids = parent.GetChildren()

   for ( let kid of kids )
   {
      if ( kid.Name === name )
      {
         Assert( kid.ClassName === className, "Child " + name + " has wrong classname, expected " + className + " but found " + kid.ClassName )
         return kid
      }
   }

   return undefined
}

export function GetExistingFirstChildWithNameAndClassName( parent: Instance, name: string, className: string ): Instance | undefined
{
   let kids = parent.GetChildren()

   for ( let kid of kids )
   {
      if ( kid.Name === name )
      {
         Assert( kid.ClassName === className, "Child " + name + " has wrong classname, expected " + className + " but found " + kid.ClassName )
         return kid
      }
   }

   Assert( false, "Could not find " + name )
   throw undefined
}

export function GetChildren_NoFutureOffspring( parent: Instance ): Array<Instance>
{
   Assert( parent !== undefined, "No parent defined" )
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
      if ( parent === undefined )
         return undefined

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

/*
export function GetColor( thing: Instance ): Color3
{
   if ( thing.IsA( 'Player' ) )
   {
      let character = thing.Character
      if ( character !== undefined )
      {
         let primaryPart = character.PrimaryPart
         if ( primaryPart !== undefined )
         {
            return primaryPart.Color
         }
      }
   }
   else if ( thing.IsA( 'BasePart' ) )
   {
      return thing.Color
   }

   return new Color3( 0, 0, 0 )
}
*/

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

export function ArrayFind( arr: Array<unknown>, val: unknown ): number | undefined
{
   for ( let i = 0; i < arr.size(); i++ )
   {
      if ( arr[i] === val )
         return i
   }
   return undefined
}

export function ArrayRandom( tbl: Array<unknown> )
{
   let p = RandomInt( tbl.size() )
   return tbl[p]
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

export function RandomFloatRange( min: number, max: number ): number
{
   return Graph( math.random(), 0, 1, min, max )
}

export function RandomInt( num: number )
{
   return math.floor( math.random( 0, num - 1 ) )
}

export function CreateRemoteEvent( name: string ): RemoteEvent
{
   Assert( IsServer(), "Can't do this on the client" )
   let remoteEvent = new Instance( "RemoteEvent" )
   remoteEvent.Name = name
   remoteEvent.Parent = ReplicatedStorage
   return remoteEvent
}

export function Thread( func: Function ): Function
{
   let newFunc = coroutine.wrap( func )
   pcall(
      function ()
      {
         newFunc()
      }
   )

   return newFunc
}

export function WaitThread( func: Function )
{
   let result = coroutine.create( func )
   Resume( result )
   for ( ; ; )
   {
      if ( coroutine.status( result ) === "dead" )
         return
      wait()
   }
}

export function WaitThreadOrTimeout( func: Function, timeout: number ): boolean
{
   let endTime = Workspace.DistributedGameTime + timeout
   let result = coroutine.create( func )
   Resume( result )
   for ( ; ; )
   {
      if ( coroutine.status( result ) === "dead" )
         return true
      wait()
      if ( Workspace.DistributedGameTime >= endTime )
         return false
   }
   return true
}

export function SetPlayerState( player: Player, setting: Enum.HumanoidStateType, value: boolean )
{
   let character = player.Character
   if ( character === undefined )
   {
      Assert( false, "character === undefined" )
      throw undefined
   }

   let human = GetInstanceChildWithName( character, "Humanoid" )
   if ( human === undefined )
   {
      Assert( false, "human === undefined" )
      throw undefined
   }

   ( human as Humanoid ).SetStateEnabled( setting, value )
}

export function VectorNormalize( vec: Vector3 ): Vector3 
{
   let len = vec.Magnitude
   if ( len === 0 )
      len = 1
   return new Vector3( vec.X / len, vec.Y / len, vec.Z / len )
}


export function SetPlayerTransparency( player: Player, value: number )
{
   //print( "set player transparency to " + value )
   let char = player.Character
   if ( char === undefined )
      return

   //print( "!OOO SetPlayerTransparency " + player.Name + " " + value + " parts " + char.GetChildren().size() )

   SetCharacterTransparency( char, value )
}

export function SetCharacterTransparency( char: Model, value: number )
{
   /*
   {
      for ( let player of Players.GetPlayers() )
      {
         if ( player.Character === char )
         {
            print( "SetCharacterTransparency " + player.Name + " " + value + " " + debug.traceback() )
            break
         }
      }
   }
   */
   let head = char.FindFirstChild( "Head" )
   if ( head )
   {
      let face = head.FindFirstChild( "face" )
      if ( face )
         ( face as BasePart ).Transparency = value
   }

   for ( let child of char.GetChildren() )
   {
      let handle = child.FindFirstChild( "Handle" )
      if ( handle !== undefined )
         child = handle

      if ( child.IsA( 'BasePart' ) )
         child.Transparency = value
   }

   let primaryPart = char.PrimaryPart
   if ( primaryPart !== undefined )
      primaryPart.Transparency = 1
}


export function IsAlive( player: Player ): boolean
{
   if ( player.Character === undefined )
      return false

   let humanoid = GetFirstChildWithName( player.Character as Model, "Humanoid" ) as ( Humanoid | undefined )
   if ( humanoid === undefined )
      return false

   return humanoid.Health > 0
}

export function GetHumanoid( player: Player ): Humanoid | undefined
{
   let character = player.Character
   if ( character === undefined )
      return undefined

   return GetFirstChildWithName( character, "Humanoid" ) as ( Humanoid | undefined )
}

export function RemoveQuitPlayers( arr: Array<Player> )
{
   for ( let i = 0; i < arr.size(); i++ )
   {
      if ( arr[i].Character === undefined )
      {
         arr.remove( i )
         i--
      }
   }
}

export function UserIDToPlayer(): Map<number, Player>
{
   let players = Players.GetPlayers()
   let results = new Map<number, Player>()
   for ( let player of players )
   {
      results.set( player.UserId, player )
   }
   return results
}

export function RecursiveOnChildren( instance: Instance, func: Function )
{
   let children = instance.GetChildren()
   for ( let child of children )
   {
      if ( func( child ) )
         continue

      RecursiveOnChildren( child, func )
   }
}

export function LightenColor( color: Color3, scale: number ): Color3
{
   let colors = [color.r, color.g, color.b]
   for ( let i = 0; i < colors.size(); i++ )
   {
      colors[i] += ( 1.0 - colors[i] ) * scale
   }

   return new Color3( colors[0], colors[1], colors[2] )
}

export function BlendColors( color1: Color3, color2: Color3, dif: number ): Color3
{
   let unDif = 1.0 - dif
   return new Color3(
      color1.r * dif + color2.r * unDif,
      color1.g * dif + color2.g * unDif,
      color1.b * dif + color2.b * unDif )
}

export function ScaleColor( color: Color3, scale: number ): Color3
{
   let colors = [color.r, color.g, color.b]
   for ( let i = 0; i < colors.size(); i++ )
   {
      colors[i] = colors[i] * scale
   }

   return new Color3( colors[0], colors[1], colors[2] )
}

export function GetLocalPlayer(): Player
{
   Assert( IsClient(), "Can't get local player on the server!" )
   return Players.LocalPlayer
}

/*
export function ClonePlayerModel( player: Player ): Model | undefined
{
   if ( player.Character === undefined )
      return undefined

   let character = player.Character as Model
   character.Archivable = true
   let bodyParts = character.GetChildren()
   let clonedModel = new Instance( "Model" ) as Model

   for ( let bodyPart of bodyParts )
   {
      if ( bodyPart.IsA( "Humanoid" ) || bodyPart.IsA( "Accessory" ) || bodyPart.IsA( "MeshPart" ) || bodyPart.IsA( "BasePart" ) || bodyPart.IsA( "Pants" ) || bodyPart.IsA( "Shirt" ) || bodyPart.IsA( "ShirtGraphic" ) || bodyPart.IsA( "BodyColors" ) )
      {
         if ( bodyPart.Archivable === false ) 
         {
            bodyPart.Archivable = true
            let clone = bodyPart.Clone()
            clone.Parent = clonedModel
            bodyPart.Archivable = false
         }
         else
         {
            let clone = bodyPart.Clone()
            clone.Parent = clonedModel
         }

         if ( bodyPart.IsA( "Humanoid" ) )
         {
            bodyPart.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
            bodyPart.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
         }
      }
   }

   clonedModel.PrimaryPart = GetExistingFirstChildWithNameAndClassName( clonedModel, "HumanoidRootPart", 'Part' ) as Part

   return clonedModel
}
*/

export function SetPlayerYaw( player: Player, yaw: number )
{
   if ( player.Character === undefined )
      return
   SetCharacterYaw( player.Character as Model, yaw )
}

export function SetCharacterYaw( model: Model, yaw: number )
{
   Assert( model.PrimaryPart !== undefined, "Model has no primarypart" )
   let part = model.PrimaryPart as BasePart
   let position = part.Position
   let cFrame = new CFrame( position )
   model.SetPrimaryPartCFrame( cFrame.mul( CFrame.Angles( math.rad( 0 ), math.rad( yaw ), math.rad( 0 ) ) ) )
}

export function SetPlayerPosition( player: Player, position: Vector3 )
{
   if ( player.Character === undefined )
      return
   let character = player.Character as Model
   character.SetPrimaryPartCFrame( new CFrame( position ) )
}

/*
export function EnablePlayerAnchored( player: Player )
{
   if ( player.Character === undefined )
      return
   let character = player.Character as Model
   let part = character.PrimaryPart as BasePart
   part.Anchored = true
}

export function DisablePlayerAnchored( player: Player )
{
   if ( player.Character === undefined )
      return
   let character = player.Character as Model
   let part = character.PrimaryPart as BasePart
   part.Anchored = false
}
*/

export function KillPlayer( player: Player )
{
   let human = GetHumanoid( player )
   if ( human )
      human.TakeDamage( human.Health )
}

export function DamagePlayer( player: Player, damage: number )
{
   let human = GetHumanoid( player )
   if ( human )
   {
      damage = math.min( damage, human.Health )
      human.TakeDamage( damage )
   }
}

export function GetHealth( player: Player ): number
{
   let human = GetHumanoid( player )
   if ( human )
      return human.Health
   return 100
}

/*
export function TrimArrayDistSorted( thing: Instance, baseParts: Array<Instance>, maxDist: number )
{
   let org = GetPosition( thing )

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
   for ( let i = 0; i < filtered.size(); i++ )
   {
      baseParts[i] = filtered[i]
   }
   for ( let i = filtered.size(); i < baseParts.size(); i++ )
   {
      baseParts.remove( i )
      i--
   }
}
*/

export function CloneChild( instance: Instance ): Instance
{
   Assert( instance.Parent !== undefined, "Tried to clone thing with no parent" )
   return instance.Clone()
}

export function Resume( thrd: thread )
{
   if ( thrd === coroutine.running() )
      return

   Assert( coroutine.status( thrd ) === "suspended", "Tried to resume thread with status " + coroutine.status( thrd ) )
   coroutine.resume( thrd )
}

function Assert( bool: boolean, msg: string )
{
   if ( bool )
      return

   let stack = debug.traceback()
   print( "\n\n\n" )
   print( "\rASSERT FAILED: " + msg )
   print( stack )
   print( "\n\n\n" )

   assert( false, msg )
}

export function Wait( time: number )
{
   let endTime = Workspace.DistributedGameTime + time
   for ( ; ; )
   {
      let remaining = endTime - Workspace.DistributedGameTime
      if ( remaining <= 0 )
         break
      wait( remaining )
   }
}

export function FilterHasCharacters( players: Array<Player> ): Array<Player>
{
   return players.filter( function ( player )
   {
      return player.Character !== undefined
   } )
}

export function TeleportPlayersToLobby( players: Array<Player>, msg: string )
{
   print( "Teleport " + players.size() + " players to lobby" )

   Thread( function ()
   {
      //players = players.filter( function ( player )
      //{
      //   return player.Name !== "Argonomic"
      //} )
      let pair = pcall(
         function ()
         {
            TeleportService.TeleportPartyAsync( game.PlaceId, players )
            wait( 2 )
         } )

      if ( pair[0] )
         Wait( 10 )
      else
         print( "TeleportPlayersToLobby failed!" )

      // failsafe
      for ( let player of players )
      {
         if ( player.Character !== undefined )
            player.Kick( msg )
      }
   } )
}
