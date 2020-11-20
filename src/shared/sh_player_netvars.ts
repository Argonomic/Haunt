import * as u from "shared/sh_utils"
import { Players, Workspace, ReplicatedStorage, RunService } from "@rbxts/services"
import { AddCallback_OnPlayerConnected } from "./sh_player"

const RESEND_HEARTBEAT_TIME = 2.0

const VARTYPE_TO_RPC: Record<string, string> =
{
   "number": "RPC_NetVar_Number",
   "string": "RPC_NetVar_String",
   "Vector3": "RPC_NetVar_Vector3",
}

class NVNumber
{
   value = 0
   changeTime = 0
}

class NVString
{
   value = ""
   changeTime = 0
}

class NVVector
{
   value = new Vector3( 0, 0, 0 )
   changeTime = 0
}

class Resends
{
   player: Player
   name: string

   constructor( player: Player, name: string )
   {
      this.player = player
      this.name = name
   }
}

class File
{
   resendHeartbeatConnection: RBXScriptConnection | undefined
   resendHeartbeatTimer = 0.0

   remoteFunctions: Record<string, Callback> = {}
   remoteEvents: Record<string, RemoteEvent> = {}

   NVsDefined = false
   nvNumbers = new Map<Player, Record<string, NVNumber>>()
   nvStrings = new Map<Player, Record<string, NVString>>()
   nvVectors = new Map<Player, Record<string, NVVector>>()
   nvChangedVars = new Map<Player, Map<string, boolean>>()

   defaultNVs = new DefaultNVs()

   nameToType: Record<string, string> = {}
}

class DefaultNVs
{
   nvNumbers = new Map<string, NVNumber>()
   nvStrings = new Map<string, NVString>()
   nvVectors = new Map<string, NVVector>()
}

let file = new File()

export function AssignDefaultNVs( player: Player )
{
   u.Assert( file.NVsDefined, "NVs should be defined by now" )

   let changedVars = new Map<string, boolean>()
   file.nvChangedVars.set( player, changedVars )

   {
      let playersNVs: Record<string, NVNumber> = {}
      for ( let defaults of file.defaultNVs.nvNumbers )
      {
         let nvName = defaults[0]
         let nvValue = defaults[1].value

         let playerNV = new NVNumber()
         playerNV.value = nvValue

         playersNVs[nvName] = playerNV
      }
      file.nvNumbers.set( player, playersNVs )
   }

   {
      let playersNVs: Record<string, NVString> = {}
      for ( let defaults of file.defaultNVs.nvStrings )
      {
         let nvName = defaults[0]
         let nvValue = defaults[1].value

         let playerNV = new NVString()
         playerNV.value = nvValue

         playersNVs[nvName] = playerNV
      }
      file.nvStrings.set( player, playersNVs )
   }

   {
      let playersNVs: Record<string, NVVector> = {}
      for ( let defaults of file.defaultNVs.nvVectors )
      {
         let nvName = defaults[0]
         let nvValue = defaults[1].value

         let playerNV = new NVVector()
         playerNV.value = nvValue

         playersNVs[nvName] = playerNV
      }
      file.nvVectors.set( player, playersNVs )
   }

}


export function AddNetVar_Number( name: string, preset: number )
{
   u.Assert( !file.NVsDefined, "Can't define NVs after this period" )
   u.Assert( file.defaultNVs.nvNumbers.get( name ) === undefined, "Tried to create the same netvar twice" )
   u.Assert( file.nameToType[name] === undefined, "Tried to reuse netvar name " + name )

   file.nameToType[name] = "number"
   let nvNumber = new NVNumber()
   nvNumber.value = preset
   file.defaultNVs.nvNumbers.set( name, nvNumber )
}

export function AddNetVar_String( name: string, preset: string )
{
   u.Assert( !file.NVsDefined, "Can't define NVs after this period" )
   u.Assert( file.defaultNVs.nvStrings.get( name ) === undefined, "Tried to create the same netvar twice" )
   u.Assert( file.nameToType[name] === undefined, "Tried to reuse netvar name " + name )

   file.nameToType[name] = "string"
   let nvString = new NVString()
   nvString.value = preset
   file.defaultNVs.nvStrings.set( name, nvString )
}

export function AddNetVar_Vector( name: string, preset: Vector3 )
{
   u.Assert( !file.NVsDefined, "Can't define NVs after this period" )
   u.Assert( file.defaultNVs.nvVectors.get( name ) === undefined, "Tried to create the same netvar twice" )
   u.Assert( file.nameToType[name] === undefined, "Tried to reuse netvar name " + name )

   file.nameToType[name] = "Vector3"
   let nvVector = new NVVector()
   nvVector.value = preset
   file.defaultNVs.nvVectors.set( name, nvVector )
}

function ClientConfirmsChange( name: string, changeTime: number )
{
   let varType = file.nameToType[name]
   let rpcName = VARTYPE_TO_RPC[varType]
   let remoteEvent = GetRemoteEvent( rpcName )
   remoteEvent.FireServer( name, changeTime )
}

function SendVarChange( player: Player, name: string )
{
   let changeVars = file.nvChangedVars.get( player )
   u.Assert( changeVars !== undefined, "No change vars for player" )
   if ( changeVars === undefined )
      return
   changeVars.set( name, true )

   SendVarChangeRemoteEvent( player, name )
}

export function SetNetVar_Number( player: Player, name: string, value: number )
{
   u.Assert( u.IsServer(), "Can't set a netvar from the client" )
   u.Assert( file.nvNumbers.has( player ), "tried to set netvar of player that doesn't have netvars" )
   let nvNumbers = file.nvNumbers.get( player )
   if ( nvNumbers === undefined )
      return
   let nvNumber = nvNumbers[name]
   nvNumber.changeTime = Workspace.DistributedGameTime
   nvNumber.value = value
   SendVarChange( player, name )
}

export function SetNetVar_String( player: Player, name: string, value: string )
{
   u.Assert( u.IsServer(), "Can't set a netvar from the client" )
   u.Assert( file.nvStrings.has( player ), "tried to set netvar of player that doesn't have netvars" )
   let nvStrings = file.nvStrings.get( player )
   if ( nvStrings === undefined )
      return
   let nvString = nvStrings[name]
   nvString.changeTime = Workspace.DistributedGameTime
   nvString.value = value
   SendVarChange( player, name )
}

export function SetNetVar_Vector3( player: Player, name: string, value: Vector3 )
{
   u.Assert( u.IsServer(), "Can't set a netvar from the client" )
   u.Assert( file.nvVectors.has( player ), "tried to set netvar of player that doesn't have netvars" )
   let nvVectors = file.nvVectors.get( player )
   if ( nvVectors === undefined )
      return
   let nvVector = nvVectors[name]
   nvVector.changeTime = Workspace.DistributedGameTime
   nvVector.value = value
   SendVarChange( player, name )
}

export function GetNetVar_Number( player: Player, name: string ): number
{
   u.Assert( file.nvNumbers.has( player ), "tried to get netvar of player that doesn't have netvars" )
   let nvNumbers = file.nvNumbers.get( player )
   if ( nvNumbers === undefined )
      throw undefined

   return nvNumbers[name].value
}

export function GetNetVar_NVNumber( player: Player, name: string ): NVNumber
{
   u.Assert( file.nvNumbers.has( player ), "tried to get netvar of player that doesn't have netvars" )
   let nvNumbers = file.nvNumbers.get( player )
   if ( nvNumbers === undefined )
      throw undefined

   return nvNumbers[name]
}


export function GetNetVar_String( player: Player, name: string ): string
{
   u.Assert( file.nvStrings.has( player ), "tried to get netvar of player that doesn't have netvars" )
   let nvStrings = file.nvStrings.get( player )
   if ( nvStrings === undefined )
      throw undefined

   return nvStrings[name].value
}

export function GetNetVar_NVString( player: Player, name: string ): NVString
{
   u.Assert( file.nvStrings.get( player ) !== undefined, "tried to get netvar of player that doesn't have netvars" )
   let nvStrings = file.nvStrings.get( player )
   if ( nvStrings === undefined )
      throw undefined

   return nvStrings[name]
}


export function GetNetVar_Vector( player: Player, name: string ): Vector3
{
   u.Assert( file.nvVectors.get( player ) !== undefined, "tried to get netvar of player that doesn't have netvars" )
   let nvVectors = file.nvVectors.get( player )
   if ( nvVectors === undefined )
      throw undefined

   return nvVectors[name].value
}

export function GetNetVar_NVVector( player: Player, name: string ): NVVector
{
   u.Assert( file.nvVectors.get( player ) !== undefined, "tried to get netvar of player that doesn't have netvars" )
   let nvVectors = file.nvVectors.get( player )
   if ( nvVectors === undefined )
      throw undefined

   return nvVectors[name]
}






function AddRPC( name: string, func: Callback )
{
   u.Assert( file.remoteEvents[name] !== undefined, "RPC " + name + " has not been added to remote events yet" );
   u.Assert( file.remoteFunctions[name] === undefined, "Already added rpc for " + name );

   if ( u.IsServer() )
      ( ReplicatedStorage.WaitForChild( name ) as RemoteEvent ).OnServerEvent.Connect( func )
   else
      ( ReplicatedStorage.WaitForChild( name ) as RemoteEvent ).OnClientEvent.Connect( func )

   file.remoteFunctions[name] = func
}

export function SH_PlayerNetVarsSetup()
{
   CreateOrWaitForRemoteEvent( "RPC_NetVar_Number" )
   CreateOrWaitForRemoteEvent( "RPC_NetVar_String" )
   CreateOrWaitForRemoteEvent( "RPC_NetVar_Vector" )

   if ( u.IsServer() )
   {
      AddRPC( "RPC_NetVar_Number", RPC_NetVar_ServerReceivesConfirmation )
      AddRPC( "RPC_NetVar_String", RPC_NetVar_ServerReceivesConfirmation )
      AddRPC( "RPC_NetVar_Vector", RPC_NetVar_ServerReceivesConfirmation )
   }
   else
   {
      AddRPC( "RPC_NetVar_Number", RPC_NetVar_Number_ClientAcceptsChange )
      AddRPC( "RPC_NetVar_String", RPC_NetVar_String_ClientAcceptsChange )
      AddRPC( "RPC_NetVar_Vector", RPC_NetVar_Vector_ClientAcceptsChange )
   }
}

export function DoneCreatingNVs()
{
   file.NVsDefined = true
   if ( !u.IsServer() )
   {
      let player = Players.LocalPlayer
      AssignDefaultNVs( player )
   }
}

function RPC_NetVar_Number_ClientAcceptsChange( name: string, value: number, changeTime: number )
{
   let player = Players.LocalPlayer
   let netVars = file.nvNumbers.get( player )
   if ( netVars === undefined )
   {
      u.Assert( false, "tried to receive netvar of player that doesn't have netvars" )
      return
   }

   u.Assert( netVars[name] !== undefined, "Missing netvar " + name )
   let nvNumber = netVars[name]
   nvNumber.changeTime = changeTime
   nvNumber.value = value
   print( "Netvar " + name + " changed to " + value )
   ClientConfirmsChange( name, changeTime )
}

function RPC_NetVar_String_ClientAcceptsChange( name: string, value: string, changeTime: number )
{
   let player = Players.LocalPlayer
   let netVars = file.nvStrings.get( player )
   if ( netVars === undefined )
   {
      u.Assert( false, "tried to receive netvar of player that doesn't have netvars" )
      return
   }

   u.Assert( netVars[name] !== undefined, "Missing netvar " + name )
   let nvString = netVars[name]
   nvString.changeTime = changeTime
   nvString.value = value
   print( "Netvar " + name + " changed to " + value )
   ClientConfirmsChange( name, changeTime )
}

function RPC_NetVar_Vector_ClientAcceptsChange( name: string, value: Vector3, changeTime: number )
{
   let player = Players.LocalPlayer
   let netVars = file.nvVectors.get( player )
   if ( netVars === undefined )
   {
      u.Assert( false, "tried to receive netvar of player that doesn't have netvars" )
      return
   }

   u.Assert( netVars[name] !== undefined, "Missing netvar " + name )
   let nvVector = netVars[name]
   nvVector.changeTime = changeTime
   nvVector.value = value
   print( "Netvar " + name + " changed to " + value )
   ClientConfirmsChange( name, changeTime )
}

function RPC_NetVar_ServerReceivesConfirmation( player: Player, name: string, changeTime: number )
{
   let netVars = file.nvNumbers

   u.Assert( netVars.get( player ) !== undefined, "tried to confirm netvar of player that doesn't have netvars" )
   let nvNumbers = file.nvNumbers.get( player )
   if ( nvNumbers === undefined )
      return

   u.Assert( nvNumbers[name] !== undefined, "No variable " + name + " created for player " + player.Name )
   let nvNumber = nvNumbers[name]
   if ( changeTime < nvNumber.changeTime )
      return

   let changeVars = file.nvChangedVars.get( player )
   u.Assert( changeVars !== undefined, "No change vars for player" )
   if ( changeVars === undefined )
      return

   if ( changeVars.get( name ) !== undefined )
      changeVars.delete( name )

   if ( GetResends().size() )
      return
   if ( file.resendHeartbeatConnection === undefined )
      return

   // stop resending
   file.resendHeartbeatConnection.Disconnect()
   file.resendHeartbeatConnection = undefined
}

function SendVarChangeRemoteEvent( player: Player, name: string )
{
   u.Assert( u.IsServer(), "Can't send a netvar from the client" )
   type varTypes = ( "number" | "string" | "Vector3" );
   let varType = file.nameToType[name] as varTypes

   u.Assert( varType !== undefined, "netvar " + name + " has no type defined" )

   let rpcName = VARTYPE_TO_RPC[varType]
   let value: number | string | Vector3 | undefined
   let changeTime: number | undefined
   switch ( varType )
   {
      case "number":
         {
            let myVal = GetNetVar_NVNumber( player, name )
            value = myVal.value
            changeTime = myVal.changeTime
         }
         break

      case "string":
         {
            let myVal = GetNetVar_NVString( player, name )
            value = myVal.value
            changeTime = myVal.changeTime
         }
         break

      case "Vector3":
         {
            let myVal = GetNetVar_NVVector( player, name )
            value = myVal.value
            changeTime = myVal.changeTime
         }
         break

      default:
         u.Assert( false, "Unknown var type " + varType )
         return
   }

   let remoteEvent = GetRemoteEvent( rpcName )
   remoteEvent.FireClient( player, name, value, changeTime )

   if ( file.resendHeartbeatConnection === undefined )
   {
      file.resendHeartbeatTimer = RESEND_HEARTBEAT_TIME
      file.resendHeartbeatConnection = RunService.Heartbeat.Connect( Heartbeat_ResendChanges )
   }
}

function GetRemoteEvent( name: string ): RemoteEvent
{
   u.Assert( file.remoteEvents[name] !== undefined, "Unknown remote event " + name )
   return file.remoteEvents[name]
}

function CreateOrWaitForRemoteEvent( name: string )
{
   u.Assert( file.remoteEvents[name] === undefined, "Already added remote event " + name )
   let remoteEvent: RemoteEvent | undefined

   if ( u.IsServer() )
      remoteEvent = u.CreateRemoteEvent( name )
   else
      remoteEvent = ReplicatedStorage.WaitForChild( name ) as RemoteEvent

   file.remoteEvents[name] = remoteEvent
}


function GetResends(): Array<Resends>
{
   let resends: Array<Resends> = []
   for ( let playerChangeVars of file.nvChangedVars )
   {
      let player = playerChangeVars[0]
      let changeVars: Map<string, boolean> = playerChangeVars[1]
      for ( let changeVar of changeVars )
      {
         let resend = new Resends( player, changeVar[0] )
         resends.push( resend )
      }
   }
   return resends
}

function Heartbeat_ResendChanges( timePassed: number )
{
   file.resendHeartbeatTimer -= timePassed
   if ( file.resendHeartbeatTimer > 0 )
      return

   file.resendHeartbeatTimer += RESEND_HEARTBEAT_TIME

   let resends = GetResends()

   if ( resends.size() === 0 )
   {
      if ( file.resendHeartbeatConnection !== undefined )
         file.resendHeartbeatConnection.Disconnect()
      file.resendHeartbeatConnection = undefined
      return
   }

   for ( let resend of resends )
   {
      SendVarChangeRemoteEvent( resend.player, resend.name )
   }
}
