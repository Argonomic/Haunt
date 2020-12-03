import { AddRPC } from "./sh_rpc"
import { Assert, IsServer } from "./sh_utils"

export type USETYPES = number

class File
{
   getUseTypeFunction: Function | undefined
   usablesByType = new Map<USETYPES, Usable>()
   serverOnUseForType = new Map<USETYPES, Array<Function>>()
}

export class UsePosition
{
   pos: Vector3
   userType: USETYPES
   dist: number
   constructor( userType: USETYPES, pos: Vector3, dist: number )
   {
      this.pos = pos
      this.userType = userType
      this.dist = dist
   }
}

export class Usable
{
   image: string
   text: string
   useTest: Function
   useType: number
   constructor( useType: USETYPES, image: string, text: string, useTest: Function )
   {
      this.useType = useType
      this.image = image
      this.text = text
      this.useTest = useTest
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

function RPC_FromClient_OnUse( player: Player, useType: USETYPES )
{
   print( "player " + player.Name + " used usetype " + useType )
   if ( !file.serverOnUseForType.has( useType ) )
      return

   let usable = GetUsableByType( useType )
   let funcs = file.serverOnUseForType.get( useType ) as Array<Function>
   for ( let func of funcs )
   {
      func( player, usable )
   }
}

export function AddOnUse( usetype: USETYPES, func: Function )
{
   if ( !file.serverOnUseForType.has( usetype ) )
      file.serverOnUseForType.set( usetype, [] )

   let funcs = file.serverOnUseForType.get( usetype ) as Array<Function>
   funcs.push( func )
   file.serverOnUseForType.set( usetype, funcs )
}

export function AddUseType( useType: USETYPES, image: string, text: string, testFunc: Function )
{
   file.usablesByType.set( useType, new Usable( useType, image, text, testFunc ) )
}

export function SetGetUseTypeFunction( func: Function )
{
   file.getUseTypeFunction = func
}

export function GetUsableForUseAttempt( player: Player, useTargets: Array<Instance>, usePositions: Array<UsePosition> ): Usable | undefined
{
   let getter = file.getUseTypeFunction
   if ( getter === undefined )
      return undefined
   let useType = getter( player, useTargets, usePositions ) as ( USETYPES | undefined )
   if ( useType === undefined )
      return undefined

   return file.usablesByType.get( useType )
}

export function GetUsableByType( useType: USETYPES ): Usable
{
   Assert( file.usablesByType.has( useType ), "Usetype not setup" )
   return file.usablesByType.get( useType ) as Usable
}