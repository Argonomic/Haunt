import * as u from "shared/sh_utils"
import { Players, Workspace, ReplicatedStorage, RunService } from "@rbxts/services"

const RESEND_HEARTBEAT_TIME = 2.0
const RPC_NETVAR = "RPC_NetVar"

type NVTypeNames = ( "number" | "string" | "Vector3" )

class NV
{
   value: ( number | string | Vector3 ) = 0
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

   netvars = new Map<Player, Record<string, NV>>()
   nvChangedVars = new Map<Player, Map<string, boolean>>()

   defaultNVs = new Map<string, NV>()

   nameToType: Record<string, string> = {}
   nameToCallback: Record<string, Function> = {}
}

let file = new File()

export function AssignDefaultNVs( player: Player )
{
   u.Assert( file.NVsDefined, "NVs should be defined by now" )

   let changedVars = new Map<string, boolean>()
   file.nvChangedVars.set( player, changedVars )

   let playersNVs: Record<string, NV> = {}
   for ( let defaults of file.defaultNVs )
   {
      let nvName = defaults[0]
      let nvValue = defaults[1].value

      let playerNV = new NV()
      playerNV.value = nvValue
      playersNVs[nvName] = playerNV
   }

   file.netvars.set( player, playersNVs )
}


export function AddNetVar( nvType: NVTypeNames, name: string, value: ( number | string | Vector3 ) )
{
   u.Assert( !file.NVsDefined, "Can't define NVs after this period" )
   u.Assert( file.defaultNVs.get( name ) === undefined, "Tried to create the same netvar twice" )
   u.Assert( file.nameToType[name] === undefined, "Tried to reuse netvar name " + name )

   file.nameToType[name] = nvType
   let nvNumber = new NV()
   nvNumber.value = value
   file.defaultNVs.set( name, nvNumber )
}

export function AddNetVarChangedCallback( name: string, func: Function )
{
   u.Assert( file.nameToType[name] !== undefined, "No netvar named " + name )
   file.nameToCallback[name] = func
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

export function SetNetVar( player: Player, name: string, value: ( number | string | Vector3 ) )
{
   u.Assert( u.IsServer(), "Can't set a netvar from the client" )
   u.Assert( file.netvars.has( player ), "tried to set netvar of player that doesn't have netvars" )
   let netvars = file.netvars.get( player )
   if ( netvars === undefined )
      return

   let netvar = netvars[name]
   netvar.changeTime = Workspace.DistributedGameTime
   netvar.value = value
   SendVarChange( player, name )
}

export function GetNetVarValue( player: Player, name: string ): ( number | string | Vector3 )
{
   u.Assert( file.netvars.has( player ), "tried to get netvar of player that doesn't have netvars" )
   let netvars = file.netvars.get( player )
   if ( netvars === undefined )
      throw undefined

   return netvars[name].value
}

export function GetNetVarNV( player: Player, name: string ): NV
{
   u.Assert( file.netvars.has( player ), "tried to get netvar of player that doesn't have netvars" )
   let netvars = file.netvars.get( player )
   if ( netvars === undefined )
      throw undefined

   return netvars[name]
}

export function GetNetVar_Number( player: Player, name: string ): number
{
   u.Assert( file.nameToType[name] === "number", "Expected type number" )
   return GetNetVarValue( player, name ) as number
}

export function GetNetVar_String( player: Player, name: string ): string
{
   u.Assert( file.nameToType[name] === "string", "Expected type string" )
   return GetNetVarValue( player, name ) as string
}

export function GetNetVar_Vector3( player: Player, name: string ): Vector3
{
   u.Assert( file.nameToType[name] === "Vector3", "Expected type Vector3" )
   return GetNetVarValue( player, name ) as Vector3
}

function AddRPC( name: string, func: Callback )
{
   u.Assert( file.remoteEvents[name] !== undefined, "RPC " + name + " has not been added to remote events yet" );
   u.Assert( file.remoteFunctions[name] === undefined, "Already added rpc for " + name );

   u.ExecOnChildWhenItExists( ReplicatedStorage, name, function ( remoteEvent: RemoteEvent )
   {
      if ( u.IsServer() )
         remoteEvent.OnServerEvent.Connect( func )
      else
         remoteEvent.OnClientEvent.Connect( func )
   } )

   file.remoteFunctions[name] = func
}

export function SH_PlayerNetVarsSetup()
{
   CreateOrWaitForRemoteEvent( RPC_NETVAR )

   if ( u.IsServer() )
   {
      AddRPC( RPC_NETVAR, RPC_NetVar_ServerReceivesConfirmation )
   }
   else
   {
      AddRPC( RPC_NETVAR, RPC_NetVar_ClientAcceptsChange )
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

function RPC_NetVar_ClientAcceptsChange( name: string, value: ( number | string | Vector3 ), changeTime: number )
{
   let player = Players.LocalPlayer
   let netVars = file.netvars.get( player )
   if ( netVars === undefined )
   {
      u.Assert( false, "tried to receive netvar of player that doesn't have netvars" )
      return
   }

   u.Assert( netVars[name] !== undefined, "Missing netvar " + name )
   let netvar = netVars[name]
   netvar.changeTime = changeTime
   netvar.value = value as number

   // client confirms change
   let remoteEvent = GetRemoteEvent( RPC_NETVAR )
   remoteEvent.FireServer( name, changeTime )

   // any onchange functions?
   let callback = file.nameToCallback[name]
   if ( callback !== undefined )
      callback()
}

function RPC_NetVar_ServerReceivesConfirmation( player: Player, name: string, changeTime: number )
{
   u.Assert( file.netvars.get( player ) !== undefined, "tried to confirm netvar of player that doesn't have netvars" )
   let netvars = file.netvars.get( player )
   if ( netvars === undefined )
      return

   u.Assert( netvars[name] !== undefined, "No variable " + name + " created for player " + player.Name )
   let nvNumber = netvars[name]
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

   let myVal = GetNetVarNV( player, name )
   let value = myVal.value
   let changeTime = myVal.changeTime

   let remoteEvent = GetRemoteEvent( RPC_NETVAR )
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

   if ( u.IsServer() )
   {
      file.remoteEvents[name] = u.CreateRemoteEvent( name )
   }
   else
   {
      u.ExecOnChildWhenItExists( ReplicatedStorage, name, function ( remoteEvent: RemoteEvent )
      {
         file.remoteEvents[name] = remoteEvent
      } )
   }
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
