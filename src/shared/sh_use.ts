import { GetPlayerCooldownTimeRemaining } from "./sh_cooldown"
import { USE_COOLDOWNS } from "./sh_gamestate"
import { AddRPC } from "./sh_rpc"
import { GetPosition, IsServer, Thread } from "./sh_utils"
import { Assert } from "shared/sh_assert"

type USETYPES = number

export enum USETARGETS
{
   USETARGET_MODEL = 0,
   USETARGET_BASEPART,
   USETARGET_PLAYER,
   USETARGET_USEPOSITION,
}

class File
{
   usablesByType = new Map<USETYPES, Usable>()
   debug = false
}

export class UseResults
{
   usable: Usable
   usedThing: USABLETYPES | undefined

   constructor( usable: Usable, usedThing?: USABLETYPES )
   {
      this.usable = usable
      if ( usedThing )
         this.usedThing = usedThing
   }
}

export type USABLETYPES = Vector3 | Player | Instance | BasePart | Model
export type PlayerBasePart_Boolean = ( player: Player, basePart: BasePart ) => boolean
export type Vector3Instance_Boolean = ( pos: Vector3, target: Instance ) => boolean
export type Vector3Vector3_Boolean = ( pos: Vector3, target: Vector3 ) => boolean
export type USE_GETTER = ( player: Player ) => Array<USABLETYPES>

export class Usable
{
   image: string
   text: string
   useType: number

   forceVisibleTest: () => boolean = function () { return false }

   testPlayerToBasePart: PlayerBasePart_Boolean | undefined
   testPlayerPosToInstance: Vector3Instance_Boolean | undefined
   testPlayerPosToPos: Vector3Vector3_Boolean | undefined
   successFunc: ( ( player: Player, usedThing: USABLETYPES ) => void ) | undefined

   private getter: USE_GETTER = function ( player: Player ): Array<USABLETYPES>
   {
      return []
   }

   public ExecuteGetter( player: Player ): Array<USABLETYPES>
   {
      return this.getter( player )
   }

   public DefineGetter( getter: USE_GETTER )
   {
      this.getter = getter
   }

   public HasGetter()
   {
      return this.getter !== undefined
   }

   constructor( useType: USETYPES, image: string, text: string )
   {
      this.useType = useType
      this.image = image
      this.text = text
   }
}

let file = new File()

export function SH_UseSetup()
{
   if ( IsServer() )
   {
      AddRPC( "RPC_FromClient_OnUse", RPC_FromClient_OnUse )

      Thread(
         function ()
         {
            wait()
            for ( let pair of file.usablesByType )
            {
               let usable = pair[1]
               Assert( usable.successFunc !== undefined, "usable.successFunc !== undefined" )
               Assert( usable.HasGetter(), "usable.HasGetter()" )
            }
         } )
   }
   else
   {
      Thread(
         function ()
         {
            wait()
            for ( let pair of file.usablesByType )
            {
               let usable = pair[1]
               Assert( usable.HasGetter(), "usable.HasGetter()" )
            }
         } )
   }
}

function RPC_FromClient_OnUse( player: Player )
{
   print( "RPC_FromClient_OnUse " + player.Name )

   let useResults = GetUseResultsForAttempt( player )
   if ( useResults === undefined )
   {
      file.debug = true
      GetUseResultsForAttempt( player )
      file.debug = false

      print( "no useResults" )
      return
   }
   if ( useResults.usedThing === undefined )
      return

   if ( GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
   {
      print( "On cooldown" )
      return
   }

   let successFunc = useResults.usable.successFunc
   if ( successFunc === undefined )
   {
      print( "no success func" )
      return
   }
   successFunc( player, useResults.usedThing )
}

export function AddUseType( useType: USETYPES, image: string, text: string )
{
   let usable = new Usable( useType, image, text )
   file.usablesByType.set( useType, usable )
   return usable
}

export function GetUsableByType( useType: USETYPES ): Usable
{
   Assert( file.usablesByType.has( useType ), "Usetype not setup" )
   return file.usablesByType.get( useType ) as Usable
}

export function GetUsables(): Array<Usable>
{
   let usables: Array<Usable> = []
   for ( let pair of file.usablesByType )
   {
      usables.push( pair[1] )
   }
   return usables
}

class BuildUseResults
{
   dist: number
   useResults: UseResults

   constructor( useResults: UseResults, position1: Vector3, position2: Vector3 )
   {
      if ( useResults.usedThing !== undefined )
         this.dist = position1.sub( position2 ).Magnitude
      else
         this.dist = -1

      this.useResults = useResults
   }
}


export function GetUseResultsForAttempt( player: Player ): UseResults | undefined
{
   if ( file.debug )
      print( "GetUseResultsForAttempt " + player.Name )
   let pos = GetPosition( player )

   let buildUseResults: Array<BuildUseResults> = []
   let usables = GetUsables()
   for ( let usable of usables )
   {
      if ( file.debug )
         print( "test " + usable.useType + " " + usable.text )

      if ( usable.testPlayerPosToInstance !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<Instance>
         if ( file.debug )
            print( "1 Targets: " + targets.size() )

         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( !usable.testPlayerPosToInstance( pos, target ) )
               continue

            buildUseResults.push( new BuildUseResults( new UseResults( usable, target ), pos, GetPosition( target ) ) )
         }

         if ( file.debug )
            print( "1 buildUseResults: " + buildUseResults.size() )
      }
      else if ( usable.testPlayerToBasePart !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<BasePart>
         if ( file.debug )
            print( "2 Targets: " + targets.size() )

         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( !usable.testPlayerToBasePart( player, target ) )
               continue

            buildUseResults.push( new BuildUseResults( new UseResults( usable, target ), pos, ( target as BasePart ).Position ) )
         }

         if ( file.debug )
            print( "2 buildUseResults: " + buildUseResults.size() )
      }
      else if ( usable.testPlayerPosToPos !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<Vector3>
         if ( file.debug )
            print( "3 Targets: " + targets.size() )

         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( !usable.testPlayerPosToPos( pos, target ) )
               continue

            buildUseResults.push( new BuildUseResults( new UseResults( usable, target ), pos, target as Vector3 ) )
         }

         if ( file.debug )
            print( "3 buildUseResults: " + buildUseResults.size() )
      }
      else
      {
         Assert( false, "No usable test defined" )
      }

      if ( usable.forceVisibleTest() )
      {
         if ( file.debug )
            print( "4 forcevis" )
         buildUseResults.push( new BuildUseResults( new UseResults( usable ), pos, pos ) )
      }
   }
   if ( file.debug )
      print( "5 buildUseResults: " + buildUseResults.size() )

   if ( buildUseResults.size() )
   {
      buildUseResults.sort( SortBuildUseResults )
      return buildUseResults[0].useResults
   }

   return undefined
}

function SortBuildUseResults( a: BuildUseResults, b: BuildUseResults ): boolean
{
   if ( ( a.useResults.usedThing !== undefined ) !== ( b.useResults.usedThing !== undefined ) )
      return a.useResults.usedThing !== undefined

   return a.dist < b.dist
}