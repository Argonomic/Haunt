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
   u.ExecOnChildWhenItExists( ReplicatedStorage, name, function ( remoteEvent: RemoteEvent )
   {
      file.remoteEvents[name] = remoteEvent
   } )
}

export function AddRPC( name: string, func: Callback )
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

export function SH_RPCSetup()
{
   let rpcs =
      [
         "RPC_FromServer_SetPlayerRoom",
         "RPC_FromServer_OnPlayerUseTask",
         "RPC_FromServer_CancelTask",
         "RPC_FromClient_OnPlayerUseFromRoom",
         "RPC_FromClient_OnPlayerFinishTask",
      ]

   for ( let rpc of rpcs )
   {
      if ( u.IsServer() )
         u.CreateRemoteEvent( rpc )
      AddRemoteEvent( rpc )
   }
}

export function GetRPCRemoteEvent( name: string ): RemoteEvent
{
   u.Assert( file.remoteEvents[name] !== undefined, "Missing remote event " + name )
   return file.remoteEvents[name]
}

