import * as sh_rpc from "shared/sh_rpc"
import * as u from "shared/sh_utils"

export function SendRPC( name: string, ...args: Array<unknown> ): void
{
   let remoteEvent = sh_rpc.GetRPCRemoteEvent( name )
   if ( args.size() === 0 )
      remoteEvent.FireServer( args )
   else if ( args.size() === 1 )
      remoteEvent.FireServer( args[0] )
   else if ( args.size() === 2 )
      remoteEvent.FireServer( args[0], args[1] )
   else if ( args.size() === 3 )
      remoteEvent.FireServer( args[0], args[1], args[2] )
   else
      u.Assert( false, "Need more parameters" )
}
