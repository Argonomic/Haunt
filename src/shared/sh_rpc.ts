import { ReplicatedStorage } from "@rbxts/services"
import { CreateRemoteEvent, ExecOnChildWhenItExists, IsServer } from "./sh_utils"
import { Assert } from "shared/sh_assert"

class File
{
   remoteFunctions: Record<string, Callback> = {}
   remoteEvents: Record<string, RemoteEvent> = {}
}

let file = new File()

function AddRemoteEvent( name: string )
{
   ExecOnChildWhenItExists( ReplicatedStorage, name, function ( remoteEvent: RemoteEvent )
   {
      file.remoteEvents[name] = remoteEvent
   } )
}

export function AddRPC( name: string, func: Callback )
{
   Assert( file.remoteEvents[name] !== undefined, "RPC " + name + " has not been added to remote events yet" );
   Assert( file.remoteFunctions[name] === undefined, "Already added rpc for " + name );

   ExecOnChildWhenItExists( ReplicatedStorage, name, function ( remoteEvent: RemoteEvent )
   {
      if ( IsServer() )
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
         "RPC_FromServer_ConfirmReadyUp",
         "RPC_FromClient_OnPlayerUseFromRoom",
         "RPC_FromClient_OnPlayerFinishTask",
         "RPC_FromClient_RequestChange_MatchmakingStatus",
         "RPC_FromClient_Vote",
         "RPC_FromClient_Skipvote",
         "RPC_FromClient_SetPlayerCount",
         "RPC_FromClient_OnUse",
      ]

   for ( let rpc of rpcs )
   {
      if ( IsServer() )
         CreateRemoteEvent( rpc )
      AddRemoteEvent( rpc )
   }
}

export function GetRPCRemoteEvent( name: string ): RemoteEvent
{
   Assert( file.remoteEvents[name] !== undefined, "Missing remote event " + name )
   return file.remoteEvents[name]
}

