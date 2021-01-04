import { GetCoinSpawnLocations, GetCoinType, CreateCoin, COIN_TYPE, GetCoinDataFromType, CoinData, GetCoinBreakdownForScore } from "shared/sh_coins"
import { LOCAL, PICKUPS } from "shared/sh_gamestate"
import { CreatePickupType } from "shared/sh_pickups"
import { ClearScore, GetScore, IncrementScore } from "shared/sh_score"
import { ArrayRandomize, GetPosition, RandomFloatRange, RandomInt, Thread, VectorNormalize } from "shared/sh_utils"
import { COL_GROUP_GEO_ONLY, SetCollisionGroup } from "./sv_collisionGroups"
import { SendRPC } from "./sv_utils"

const ROTVEL = 50
const SPAWN_PUSH = 10
const PUSH_Z = 40

export function SV_CoinsSetup()
{
   let pickupType = CreatePickupType( PICKUPS.PICKUP_COIN )
   pickupType.didPickupFunc =
      function ( player: Player, pickup: Part ): boolean
      {
         let coinType = GetCoinType( pickup )
         SendRPC( "RPC_FromServer_PickupCoin", player, pickup.Position, coinType )
         let coinData = GetCoinDataFromType( coinType )
         IncrementScore( player, coinData.value )
         return true
      }

   if ( LOCAL && 0 )
   {
      Thread(
         function ()
         {
            wait( 4 )
            CreateCoinExplosion( 1500, new Vector3( 56.277, 15.823, 53.974 ), new Vector3( 0, 0, 0 ) )
            SpawnRandomCoins( 2000 )
         } )
   }
}

export function SpawnRandomCoins( count: number ): Array<Part>
{
   let locations = GetCoinSpawnLocations()
   ArrayRandomize( locations )
   let fraction = math.floor( locations.size() * 0.30 )
   let coinsPerspot = count / fraction
   let min = math.floor( coinsPerspot * 0.6 )
   let max = math.floor( coinsPerspot * 1.4 )
   if ( min < 1 )
      min = 1
   if ( max < 2 )
      max = 2

   let delta = max - min

   let coins: Array<Part> = []

   let silver = GetCoinDataFromType( COIN_TYPE.TYPE_SILVER )
   let gold = GetCoinDataFromType( COIN_TYPE.TYPE_GOLD )

   let goldIndices = new Map<number, boolean>()
   let goldCount = count * 0.05
   for ( let i = 0; i < goldCount; i++ )
   {
      for ( ; ; )
      {
         let randGold = RandomInt( count )
         if ( !goldIndices.has( randGold ) )
         {
            goldIndices.set( randGold, true )
            break
         }
      }
   }

   let curCount = 0

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
         let coinData: CoinData
         if ( goldIndices.has( curCount ) )
            coinData = gold
         else
            coinData = silver

         let coin = _CreateCoin( location, coinData )
         coins.push( coin )
         curCount++

         coin.Velocity = new Vector3( RandomFloatRange( -SPAWN_PUSH, SPAWN_PUSH ), RandomFloatRange( PUSH_Z, PUSH_Z * 1.25 ), RandomFloatRange( -SPAWN_PUSH, SPAWN_PUSH ) )
         coin.RotVelocity = new Vector3( RandomFloatRange( -ROTVEL, ROTVEL ), RandomFloatRange( -ROTVEL, ROTVEL ), RandomFloatRange( -ROTVEL, ROTVEL ) )
      }
   }

   return coins
}

const PUSH = 25

export function PlayerDropsCoins( player: Player, offsetPos: Vector3 )
{
   let playerPos = GetPosition( player )
   let score = GetScore( player )
   ClearScore( player )
   CreateCoinExplosion( score, playerPos, offsetPos )
}

export function CreateCoinExplosion( score: number, playerPos: Vector3, offsetPos: Vector3 ): Array<Part>
{
   let coins: Array<Part> = []
   let vec = playerPos.sub( offsetPos )
   vec = new Vector3( vec.X, 0, vec.Z )
   vec = VectorNormalize( vec )
   vec = vec.add( new Vector3( 0, 1.8, 0 ) )
   vec = VectorNormalize( vec )
   vec = vec.mul( 50 )

   let breakdown = GetCoinBreakdownForScore( score )

   for ( let pair of breakdown )
   {
      let coinData = GetCoinDataFromType( pair[0] )
      for ( let i = 0; i < pair[1]; i++ )
      {
         let coin = _CreateCoin( playerPos, coinData )
         coin.Velocity = vec.mul( RandomFloatRange( 1, 2 ) )
         coins.push( coin )
      }
   }
   return coins
}

function _CreateCoin( location: Vector3, coinData: CoinData ): Part
{
   let coin = CreateCoin( location, coinData )
   SetCollisionGroup( coin, COL_GROUP_GEO_ONLY )
   return coin
}
