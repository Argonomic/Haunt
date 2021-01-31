import { GetCoinSpawnLocations, CreateCoin, COIN_TYPE, GetCoinDataFromType, CoinData, GetCoinBreakdownForScore, GetCoinFolder } from "shared/sh_coins"
import { Match } from "shared/sh_gamestate"
import { GetMatchScore } from "shared/sh_score"
import { ArrayRandomize, RandomFloatRange, RandomInt, Thread, VectorNormalize, Wait } from "shared/sh_utils"
import { COL_GROUP_GEO_ONLY, SetCollisionGroup } from "./sv_collisionGroups"
import { RunService } from "@rbxts/services"
import { ClearMatchScore } from "./sv_score"
import { GetPosition } from "shared/sh_utils_geometry"

const LOCAL = RunService.IsStudio()
const ROTVEL = 50
const SPAWN_PUSH = 10
const PUSH_Z = 40

export function SV_CoinsSetup()
{
}

export function SpawnRandomCoins( match: Match, count: number ): Array<Part>
{
   let folder = GetCoinFolder( match )

   let locations = GetCoinSpawnLocations()
   ArrayRandomize( locations )
   let fraction = math.floor( locations.size() * 0.40 )
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
   let goldCount = count * 0.025
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

         let coin = _CreateCoin( folder, location, coinData )
         coins.push( coin )
         curCount++

         coin.Velocity = new Vector3( RandomFloatRange( -SPAWN_PUSH, SPAWN_PUSH ), RandomFloatRange( PUSH_Z, PUSH_Z * 1.25 ), RandomFloatRange( -SPAWN_PUSH, SPAWN_PUSH ) )
         coin.RotVelocity = new Vector3( RandomFloatRange( -ROTVEL, ROTVEL ), RandomFloatRange( -ROTVEL, ROTVEL ), RandomFloatRange( -ROTVEL, ROTVEL ) )
      }
   }

   return coins
}

const PUSH = 25

export function PlayerDropsCoinsWithTrajectory( match: Match, player: Player, trajectoryPos: Vector3 )
{
   let playerPos = GetPosition( player )
   let score = GetMatchScore( player )
   ClearMatchScore( player )
   CreateCoinExplosion( match, score, playerPos, trajectoryPos )
}

export function CreateCoinExplosion( match: Match, score: number, playerPos: Vector3, offsetPos: Vector3 ): Array<Part>
{
   let coins: Array<Part> = []
   let vec = playerPos.sub( offsetPos )
   vec = new Vector3( vec.X, 0, vec.Z )
   vec = VectorNormalize( vec )
   vec = vec.add( new Vector3( 0, 1.8, 0 ) )
   vec = VectorNormalize( vec )
   vec = vec.mul( 50 )

   let breakdown = GetCoinBreakdownForScore( score )

   let folder = GetCoinFolder( match )

   for ( let pair of breakdown )
   {
      let coinData = GetCoinDataFromType( pair[0] )
      for ( let i = 0; i < pair[1]; i++ )
      {
         let vec2 = vec.add( new Vector3( RandomFloatRange( -15, 15 ), 0, RandomFloatRange( -15, 15 ) ) )
         vec2 = vec2.mul( RandomFloatRange( 1, 2 ) )

         let coin = _CreateCoin( folder, playerPos, coinData )
         coin.Velocity = vec2
         coins.push( coin )
      }
   }
   return coins
}

function _CreateCoin( folder: Folder, location: Vector3, coinData: CoinData ): Part
{
   let coin = CreateCoin( folder, location, coinData )
   SetCollisionGroup( coin, COL_GROUP_GEO_ONLY )
   return coin
}
