import { Workspace } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { AddMatchCreatedCallback, EDITOR_GameplayFolder, Match, PICKUPS } from "./sh_gamestate"
import { GetPosition } from "./sh_utils_geometry"
import { MakePartIntoPickup } from "./sh_pickups"
import { COIN_VALUE_GEM, COIN_VALUE_GOLD, COIN_VALUE_SILVER } from "./sh_settings"
import { ExecOnChildWhenItExists, Thread, IsServer, RandomFloatRange, GraphCapped } from "./sh_utils"
import { Tween } from "./sh_tween"

const RUNTIME_COINS = "Runtime Coins"

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

class File
{
   coinTypeToData = new Map<COIN_TYPE, CoinData>()
   coinToCoinType = new Map<Part, COIN_TYPE>()
   coinSpawnLocations: Array<Vector3> = []
   coinBaseFolder: Folder | undefined
   coinCreatedCallbacks: Array<( coin: Part ) => void> = []
   matchToFolder = new Map<string, Folder>()
}
let file = new File()

export function SH_CoinsSetup()
{
   CreateCoinType( COIN_TYPE.TYPE_SILVER, COIN_VALUE_SILVER, 0.85, new Color3( 1, 1, 1 ) )
   CreateCoinType( COIN_TYPE.TYPE_GOLD, COIN_VALUE_GOLD, 1.25, new Color3( 1, 1, 0 ) )
   CreateCoinType( COIN_TYPE.TYPE_GEM, COIN_VALUE_GEM, 1.0, new Color3( 256 / 170, 0, 256 / 170 ) )

   if ( IsServer() )
   {
      let folder = new Instance( 'Folder' )
      folder.Parent = Workspace
      folder.Name = RUNTIME_COINS
      SetCoinBaseRootFolder( folder )

      AddMatchCreatedCallback(
         function ( match: Match )
         {
            let folder = new Instance( 'Folder' )
            Assert( file.coinBaseFolder !== undefined )
            folder.Name = RUNTIME_COINS + match.shState.gameIndex
            folder.Parent = file.coinBaseFolder as Folder
         } )
   }
   else
   {
      ExecOnChildWhenItExists( Workspace, RUNTIME_COINS,
         function ( folder: Folder )
         {
            SetCoinBaseRootFolder( folder )
         } )
   }

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
         let children = gameplayFolder.Coins.GetChildren()

         for ( let child of children )
         {
            file.coinSpawnLocations.push( GetPosition( child ).add( new Vector3( 0, 2, 0 ) ) )
            child.Destroy()
         }
      } )
}

export function HasCoinFolder( match: Match ): boolean
{
   return file.matchToFolder.has( RUNTIME_COINS + match.shState.gameIndex )
}

export function GetCoinFolder( match: Match ): Folder
{
   let folder = file.matchToFolder.get( RUNTIME_COINS + match.shState.gameIndex )
   if ( folder === undefined )
   {
      Assert( false, "No coin folder " + ( RUNTIME_COINS + match.shState.gameIndex ) )
      throw undefined
   }
   return folder
}


export function CreateCoinModel( coinData: CoinData, coinModel: Part ): Part
{
   let model = coinModel.Clone()
   model.Transparency = 1 // visibility is handled on client
   model.CanCollide = true
   model.Anchored = false
   model.Size = model.Size.mul( coinData.scale )
   model.Color = coinData.color
   return model
}

export function CreateCoin( folder: Folder, location: Vector3, coinData: CoinData ): Part
{
   let coinModel = coinData.model
   if ( coinModel === undefined )
   {
      Assert( false, "CreateCoin" )
      throw undefined
   }

   let model = CreateCoinModel( coinData, coinModel )
   model.Position = location
   model.Parent = folder
   model.Name = "Coin" + folder.GetChildren().size()

   file.coinToCoinType.set( model, coinData.coinType )
   for ( let func of file.coinCreatedCallbacks )
   {
      func( model )
   }


   Thread( function ()
   {
      wait( 0.4 ) // delay before you can pickup
      if ( model !== undefined )
         MakePartIntoPickup( model, PICKUPS.PICKUP_COIN )
   } )

   return model
}

export function GetCoins( match: Match ): Array<Part>
{
   if ( !HasCoinFolder( match ) )
      return []
   let folder = GetCoinFolder( match )
   return folder.GetChildren() as Array<Part>
}

export function GetAllCoins(): Array<Part>
{
   if ( file.coinBaseFolder === undefined )
   {
      print( "no coin base folder" )
      return []
   }

   let coins: Array<Part> = []
   for ( let folder of file.coinBaseFolder.GetChildren() )
   {
      coins = coins.concat( folder.GetChildren() as Array<Part> )
   }
   return coins
}

export function GetTotalValueOfWorldCoins( match: Match ): number
{
   let folder = GetCoinFolder( match )

   let total = 0
   for ( let pair of file.coinToCoinType )
   {
      if ( pair[0].Parent === folder )
      {
         let coinData = file.coinTypeToData.get( pair[1] ) as CoinData
         total += coinData.value
      }
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

export function DeleteCoin( coin: Part )
{
   file.coinToCoinType.delete( coin )
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

function SetCoinBaseRootFolder( folder: Folder )
{
   file.coinBaseFolder = folder

   function AddChild( _child: Instance )
   {
      let child = _child as Folder
      file.matchToFolder.set( child.Name, child )
   }

   for ( let child of folder.GetChildren() )
   {
      AddChild( child )
   }

   folder.ChildAdded.Connect( AddChild )
}

export function DestroyCoinFolder( match: Match )
{
   let folder = GetCoinFolder( match )
   for ( let child of folder.GetChildren() )
   {
      child.Destroy()
   }
   folder.Destroy()
}

export function CoinFloatsAway( player: Player, pickup: BasePart )
{
   let pos = pickup.Position.add( new Vector3( 0, 3.5, 0 ) )
   let playerOrg = GetPosition( player )
   pickup.CanCollide = false
   pickup.Anchored = true
   let floatTime = 0.5
   Tween( pickup, { Position: pos, Orientation: new Vector3( RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ) ) }, floatTime, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
   wait( floatTime * 1.1 )

   let moveTime = 0.35
   let startTime = Workspace.DistributedGameTime
   let endTime = Workspace.DistributedGameTime + moveTime
   let startPos = pickup.Position

   Tween( pickup, { Size: pickup.Size.mul( new Vector3( 0.5, 0.5, 0.5 ) ), Orientation: new Vector3( RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ) ) }, moveTime )

   for ( ; ; )
   {
      wait()
      if ( player.Character !== undefined )
         playerOrg = GetPosition( player )

      let blend = GraphCapped( Workspace.DistributedGameTime, startTime, endTime, 0, 1 )
      pickup.Position = startPos.Lerp( playerOrg, blend )

      if ( Workspace.DistributedGameTime >= endTime )
         break
   }
   pickup.Destroy()
}