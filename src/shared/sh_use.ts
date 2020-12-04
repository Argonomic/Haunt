import { AddRPC } from "./sh_rpc"
import { Assert, IsServer } from "./sh_utils"

export type USETYPES = number

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
   serverOnUseTest = new Map<USETYPES, Function>()
   serverOnUseFunc = new Map<USETYPES, Function>()
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

export type PlayerBasePart_Boolean = ( player: Player, basePart: BasePart ) => boolean
export type Vector3Instance_Boolean = ( pos: Vector3, target: Instance ) => boolean
export type Vector3Vector3_Boolean = ( pos: Vector3, target: Vector3 ) => boolean

export class Usable
{
   image: string
   text: string
   useType: number

   testPlayerToBasePart: PlayerBasePart_Boolean | undefined
   testPlayerPosToInstance: Vector3Instance_Boolean | undefined
   testPlayerPosToPos: Vector3Vector3_Boolean | undefined

   //getter_Vec3: ( () => Array<Vector3> ) | undefined
   //getter_Player: ( () => Array<Player> ) | undefined
   //getter_BasePart: ( () => Array<BasePart> ) | undefined
   //getter_Instance: ( () => Array<Instance> ) | undefined
   //getter_Model: ( () => Array<Model> ) | undefined
   //getter: ( () => Array<Vector3 | Player | Instance | BasePart | Model> ) | undefined
   getter = function (): Array<Vector3 | Player | Instance | BasePart | Model>
   {
      return []
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

function RPC_FromClient_OnUse( player: Player, useType: USETYPES )
{
   print( "player " + player.Name + " used usetype " + useType )
   if ( !file.serverOnUseTest.has( useType ) )
      return
   if ( !file.serverOnUseFunc.has( useType ) )
      return

   let usable = GetUsableByType( useType )
   let func = file.serverOnUseTest.get( useType ) as Function
   let useResult = func( player, usable ) as unknown
   if ( useResult !== undefined )
   {
      let successFunc = file.serverOnUseFunc.get( useType ) as Function
      successFunc( player, useResult )
   }
}

export function AddOnUse( usetype: USETYPES, testFunc: Function, successFunc: Function )
{
   file.serverOnUseTest.set( usetype, testFunc )
   file.serverOnUseFunc.set( usetype, successFunc )
}

export function AddUseType( useType: USETYPES, image: string, text: string )
{
   print( "Adding Use Type: " + useType )
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