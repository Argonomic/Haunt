import { GetPlayerCooldownTimeRemaining } from "./sh_cooldown"
import { USE_COOLDOWNS } from "./sh_gamestate"
import { AddRPC } from "./sh_rpc"
import { Assert, GetPosition, IsServer } from "./sh_utils"

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
}

export class UseResults
{
   usable: Usable
   usedThing: USABLETYPES

   constructor( usable: Usable, usedThing: USABLETYPES )
   {
      this.usable = usable
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
   }
}

function RPC_FromClient_OnUse( player: Player )
{
   print( "RPC_FromClient_OnUse " + player.Name )
   let useResults = GetUseResultsForAttempt( player )
   if ( useResults === undefined )
      return

   if ( GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
      return

   let successFunc = useResults.usable.successFunc
   if ( successFunc === undefined )
      return
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


export function GetUseResultsForAttempt( player: Player ): UseResults | undefined
{
   let pos = GetPosition( player )

   let usables = GetUsables()
   for ( let usable of usables )
   {
      if ( usable.testPlayerPosToInstance !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<Instance>

         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerPosToInstance( pos, target ) )
               return new UseResults( usable, target )
         }
      }
      else if ( usable.testPlayerToBasePart !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<BasePart>
         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerToBasePart( player, target ) )
               return new UseResults( usable, target )
         }
      }
      else if ( usable.testPlayerPosToPos !== undefined )
      {
         let targets = usable.ExecuteGetter( player ) as Array<Vector3>
         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerPosToPos( pos, target ) )
               return new UseResults( usable, target )
         }
      }
      else
      {
         Assert( false, "No usable test defined" )
      }
   }

   return undefined
}