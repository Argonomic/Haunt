import { Workspace } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { PICKUPS } from "./sh_gamestate"
import { MakePartIntoPickup } from "./sh_pickups"
import { COIN_VALUE_GEM, COIN_VALUE_GOLD, COIN_VALUE_SILVER } from "./sh_settings"
import { GetPosition, ExecOnChildWhenItExists, RandomFloatRange, Thread } from "./sh_utils"

export enum COIN_TYPE
{
   TYPE_SILVER = 0,
   TYPE_GOLD,
   TYPE_GEM,
}

export class CoinData
{
   model: Part | undefined
   value = 0
   scale = 1
   color = new Color3( 0, 0, 0 )
   coinType: COIN_TYPE
   constructor( coinType: COIN_TYPE )
   {
      this.coinType = coinType
   }
}

type EDITOR_GameplayFolder = Folder &
{
   Coins: Folder
}

class File
{
   coinTypeToData = new Map<COIN_TYPE, CoinData>()
   coinToCoinType = new Map<Part, COIN_TYPE>()
   allCoins: Array<Part> = []
   coinSpawnLocations: Array<Vector3> = []
   folder: Folder | undefined
   coinCreatedCallbacks: Array<( coin: Part ) => void> = []
}
let file = new File()

export function SH_CoinsSetup()
{
   Thread(
      function ()
      {
         wait( 1 )
         GetCoinBreakdownForScore( 2343 )
      }
   )
   CreateCoinType( COIN_TYPE.TYPE_SILVER, COIN_VALUE_SILVER, 0.85, new Color3( 1, 1, 1 ) )
   CreateCoinType( COIN_TYPE.TYPE_GOLD, COIN_VALUE_GOLD, 1.25, new Color3( 1, 1, 0 ) )
   CreateCoinType( COIN_TYPE.TYPE_GEM, COIN_VALUE_GEM, 1.0, new Color3( 256 / 170, 0, 256 / 170 ) )


   ExecOnChildWhenItExists( Workspace, 'Coin',
      function ( child: Instance )
      {
         let template = child as Part
         template.CanCollide = false
         template.Transparency = 1

         GetCoinDataFromType( COIN_TYPE.TYPE_SILVER ).model = template
         GetCoinDataFromType( COIN_TYPE.TYPE_GOLD ).model = template
      } )

   ExecOnChildWhenItExists( Workspace, 'Gem',
      function ( child: Instance )
      {
         let template = child as Part
         template.CanCollide = false
         template.Transparency = 1

         GetCoinDataFromType( COIN_TYPE.TYPE_GEM ).model = template
      } )

   ExecOnChildWhenItExists( Workspace, 'Gameplay',
      function ( child: Instance )
      {
         let gameplayFolder = child as EDITOR_GameplayFolder
         file.folder = gameplayFolder.Coins
         let children = gameplayFolder.Coins.GetChildren()

         for ( let child of children )
         {
            file.coinSpawnLocations.push( GetPosition( child ).add( new Vector3( 0, 2, 0 ) ) )
            child.Destroy()
         }
      } )
}

export function CreateCoinModel( coinData: CoinData, coinModel: Part ): Part
{
   let model = coinModel.Clone()
   model.Transparency = 0
   model.CanCollide = true
   model.Anchored = false
   model.Size = model.Size.mul( coinData.scale )
   model.Color = coinData.color
   return model
}

export function CreateCoin( location: Vector3, coinData: CoinData ): Part
{
   //print( "Spawn coin at " + location )
   let folder = file.folder
   if ( folder === undefined )
   {
      Assert( false, "CreateCoin" )
      throw undefined
   }

   let coinModel = coinData.model
   if ( coinModel === undefined )
   {
      Assert( false, "CreateCoin" )
      throw undefined
   }

   let model = CreateCoinModel( coinData, coinModel )
   model.Position = location
   model.Parent = folder

   file.coinToCoinType.set( model, coinData.coinType )
   //print( "coins: " + file.allCoins.size() )
   for ( let func of file.coinCreatedCallbacks )
   {
      func( model )
   }

   Thread( function ()
   {
      wait( 0.6 ) // delay before you can pickup
      if ( model !== undefined )
         MakePartIntoPickup( model, PICKUPS.PICKUP_COIN )
   } )

   return model
}

export function GetCoins(): Array<Part>
{
   if ( file.folder === undefined )
      return []
   return file.folder.GetChildren() as Array<Part>
}

export function GetTotalValueOfWorldCoins(): number
{
   let total = 0
   for ( let pair of file.coinToCoinType )
   {
      let coinData = file.coinTypeToData.get( pair[1] ) as CoinData
      total += coinData.value
   }

   return total
}

export function GetCoinType( pickup: Part ): COIN_TYPE
{
   Assert( file.coinToCoinType.has( pickup ), "file.coinToCoinType.has( pickup )" )
   return file.coinToCoinType.get( pickup ) as COIN_TYPE
}

export function GetCoinSpawnLocations(): Array<Vector3>
{
   return file.coinSpawnLocations.concat( [] )
}

function CreateCoinType( coinType: COIN_TYPE, value: number, scale: number, color: Color3 )
{
   let coinData = new CoinData( coinType )
   coinData.value = value
   coinData.scale = scale
   coinData.color = color
   file.coinTypeToData.set( coinType, coinData )
}

export function GetCoinDataFromType( coinTypeIndex: COIN_TYPE ): CoinData
{
   Assert( file.coinTypeToData.has( coinTypeIndex ), "file.coinTypeToData.has( coinTypeIndex )" )
   return file.coinTypeToData.get( coinTypeIndex ) as CoinData
}

export function AddCoinCreatedCallback( func: ( coin: Part ) => void )
{
   file.coinCreatedCallbacks.push( func )
}

export function GetCoinModelsForScore( score: number ): Array<Part>
{
   let breakdown = GetCoinBreakdownForScore( score )
   let coins: Array<Part> = []

   for ( let pair of breakdown )
   {
      let coinData = GetCoinDataFromType( pair[0] )
      let model = coinData.model as Part
      for ( let i = 0; i < pair[1]; i++ )
      {
         coins.push( CreateCoinModel( coinData, model ) )
      }
   }

   return coins
}

export function GetCoinBreakdownForScore( score: number ): Map<COIN_TYPE, number>
{
   const START_SCORE = score
   let mapping = new Map<COIN_TYPE, number>()

   let count = 0
   let coinScore = 0

   function MakeCoinsForType( coinData: CoinData )
   {
      for ( ; ; )
      {
         if ( coinScore < coinData.value )
            break

         count++
         coinScore -= coinData.value
      }
   }

   let silver = GetCoinDataFromType( COIN_TYPE.TYPE_SILVER )
   let gold = GetCoinDataFromType( COIN_TYPE.TYPE_GOLD )
   let gem = GetCoinDataFromType( COIN_TYPE.TYPE_GEM )
   let coinTypes = [gem, gold]

   for ( let coinData of coinTypes )
   {
      coinScore = math.floor( score * 0.80 )
      score -= coinScore
      count = 0
      MakeCoinsForType( coinData )
      mapping.set( coinData.coinType, count )
      score += coinScore
   }

   mapping.set( silver.coinType, score )
   return mapping
}