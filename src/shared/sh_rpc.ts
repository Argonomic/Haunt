import { ReplicatedStorage } from "@rbxts/services"
import * as u from "shared/sh_utils"

class File
{
   remoteFunctions: Record<string, Callback> = {}
   remoteEvents: Record<string, RemoteEvent> = {}
}

let file = new File()

function AddRemoteEvent( name: string )
{
   file.remoteEvents[name] = ReplicatedStorage.WaitForChild( name ) as RemoteEvent
}

export function AddRPC( name: string, func: Callback )
{
   u.Assert( file.remoteEvents[name] !== undefined, "RPC " + name + " has not been added to remote events yet" );
   u.Assert( file.remoteFunctions[name] === undefined, "Already added rpc for " + name );

   if ( u.IsServer() )
      ( ReplicatedStorage.WaitForChild( name ) as RemoteEvent ).OnServerEvent.Connect( func )
   else
      ( ReplicatedStorage.WaitForChild( name ) as RemoteEvent ).OnClientEvent.Connect( func )

   file.remoteFunctions[name] = func
}

export function SH_RPCSetup()
{
   AddRemoteEvent( "RPC_FromServer_SetPlayerRoom" )
   AddRemoteEvent( "RPC_FromServer_OnPlayerUseTask" )
   AddRemoteEvent( "RPC_FromClient_OnPlayerUseFromRoom" )
}

export function GetRPCRemoteEvent( name: string ): RemoteEvent
{
   u.Assert( file.remoteEvents[name] !== undefined, "Missing remote event " + name )
   return file.remoteEvents[name]
}

