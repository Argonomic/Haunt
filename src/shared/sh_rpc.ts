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
         "RPC_FromClient_AdminClick",
         "RPC_FromClient_NotWaitingFor",
         "RPC_FromClient_OnPlayerFinishTask",
         "RPC_FromClient_OnPlayerUseFromRoom",
         "RPC_FromClient_OnUse",
         "RPC_FromClient_OpenedFriendInvite",
         "RPC_FromClient_RequestLobby",
         "RPC_FromClient_RestoreLighting_Fuse",
         "RPC_FromClient_Skipvote",
         "RPC_FromClient_UseAbility",
         "RPC_FromClient_Vote",
         "RPC_FromServer_CancelTask",
         "RPC_FromServer_GavePoints",
         "RPC_FromServer_OnPlayerUseTask",
         "RPC_FromServer_PickupCoin",
         "RPC_FromServer_PutPlayersInRoom",
         "RPC_FromServer_RestoreLighting_Fuse",
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


export function SV_SendRPC( name: string, player: Player, ...args: Array<unknown> ): void
{
   Assert( IsServer(), "SV_SendRPC from client" )
   let remoteEvent = GetRPCRemoteEvent( name )
   if ( args.size() === 0 )
      remoteEvent.FireClient( player, args )
   else if ( args.size() === 1 )
      remoteEvent.FireClient( player, args[0] )
   else if ( args.size() === 2 )
      remoteEvent.FireClient( player, args[0], args[1] )
   else if ( args.size() === 3 )
      remoteEvent.FireClient( player, args[0], args[1], args[2] )
   else
      Assert( false, "Need more parameters" )
}

export function SendRPC_Client( name: string, ...args: Array<unknown> ): void
{
   Assert( !IsServer(), "SendRPC_Client from server" )
   print( "Client SendPRC " + name + " " + args )
   let remoteEvent = GetRPCRemoteEvent( name )
   if ( args.size() === 0 )
      remoteEvent.FireServer( args )
   else if ( args.size() === 1 )
      remoteEvent.FireServer( args[0] )
   else if ( args.size() === 2 )
      remoteEvent.FireServer( args[0], args[1] )
   else if ( args.size() === 3 )
      remoteEvent.FireServer( args[0], args[1], args[2] )
   else
      Assert( false, "Need more parameters" )
}
