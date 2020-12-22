import { GetRPCRemoteEvent } from "shared/sh_rpc"
import { Assert } from "shared/sh_assert"

export function SendRPC( name: string, ...args: Array<unknown> ): void
{
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
