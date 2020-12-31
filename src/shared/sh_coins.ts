import { Workspace } from "@rbxts/services"
import { IsServer, Thread, GetPosition, ExecOnChildWhenItExists, ArrayRandomize, RandomInt, RandomFloatRange } from "./sh_utils"

const ROTVEL = 100
const PUSH = 10
const PUSH_Z = 40

export class Coin
{
   model: Part
   constructor( location: Vector3 )
   {
      let template = file.coinTemplate
      if ( template === undefined )
         throw undefined

      let folder = file.folder
      if ( folder === undefined )
         throw undefined

      this.model = template.Clone()
      this.model.Transparency = 0
      this.model.CanCollide = true
      this.model.Velocity = new Vector3( RandomFloatRange( -PUSH, PUSH ), RandomFloatRange( PUSH_Z, PUSH_Z * 2 ), RandomFloatRange( -PUSH, PUSH ) )
      this.model.RotVelocity = new Vector3( RandomFloatRange( 0, ROTVEL ), RandomFloatRange( 0, ROTVEL ), RandomFloatRange( 0, ROTVEL ) )
      this.model.Position = location
      this.model.Parent = folder
   }
}

class File
{
   coinLocations: Array<Vector3> = []
   coinTemplate: Part | undefined
   folder: Folder | undefined
}
let file = new File()

export function SH_CoinsSetup()
{
   if ( IsServer() )
   {
      Thread( function ()
      {
         wait( 1 )
         for ( ; ; )
         {
            SpawnCoins( 75 )
            wait( 10 )
            break
         }
      } )
   }

   ExecOnChildWhenItExists( Workspace, 'Coin',
      function ( child: Instance )
      {
         file.coinTemplate = child as Part
         file.coinTemplate.CanCollide = false
         file.coinTemplate.Transparency = 1
      } )

   ExecOnChildWhenItExists( Workspace, 'Coins',
      function ( child: Instance )
      {
         let coinsFolder = child as Folder
         file.folder = coinsFolder
         let children = coinsFolder.GetChildren()

         for ( let child of children )
         {
            file.coinLocations.push( GetPosition( child ).add( new Vector3( 0, 8, 0 ) ) )
            child.Destroy()
         }
      } )
}

export function SpawnCoins( count: number ): Array<Coin>
{
   let locations = file.coinLocations.concat( [] )
   ArrayRandomize( locations )
   let fraction = math.floor( locations.size() * 0.25 )
   let coinsPerspot = count / fraction
   let min = math.floor( coinsPerspot * 0.6 )
   let max = math.floor( coinsPerspot * 1.4 )
   if ( min < 1 )
      min = 1
   if ( max < 2 )
      max = 2

   let delta = max - min

   let coins: Array<Coin> = []

   for ( let i = 0; i < locations.size(); i++ )
   {
      if ( coins.size() >= count )
         break

      let location = locations[i]
      let spawn = min + RandomInt( delta )

      if ( spawn + coins.size() >= count )
         spawn = count - coins.size()

      for ( let p = 0; p < spawn; p++ )
      {
         coins.push( CreateCoin( location ) )
      }
   }

   return coins
}

function CreateCoin( location: Vector3 ): Coin
{
   //print( "Spawn coin at " + location )
   let coin = new Coin( location )
   coin.model.Size = coin.model.Size.mul( RandomFloatRange( 0.5, 1.5 ) )
   return coin
}