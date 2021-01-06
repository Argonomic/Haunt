import { Assert } from "shared/sh_assert"
import { GetPlayerCooldownTimeRemaining } from "shared/sh_cooldown"
import { USE_COOLDOWNS } from "shared/sh_gamestate"
import { AddRPC } from "shared/sh_rpc"
import { DisableDebug, EnableDebug, GetDebugBuffer, GetUseResultsForAttempt } from "shared/sh_use"
import { Thread } from "shared/sh_utils"
import { ReportEvent } from "./sv_analytics"

class File
{
}
let file = new File()

export function SV_UseSetup()
{
   AddRPC( "RPC_FromClient_OnUse", RPC_FromClient_OnUse )
}

function RPC_FromClient_OnUse( player: Player )
{
   print( "RPC_FromClient_OnUse " + player.Name )

   let useResults = GetUseResultsForAttempt( player )
   if ( useResults === undefined )
   {
      EnableDebug()
      GetUseResultsForAttempt( player )
      ReportEvent( "USE_FAILED", GetDebugBuffer() )
      DisableDebug()

      print( "no useResults" )
      return
   }
   if ( useResults.usedThing === undefined )
      return

   if ( GetPlayerCooldownTimeRemaining( player, USE_COOLDOWNS + useResults.usable.useType ) > 0 )
   {
      print( "On cooldown" )
      return
   }

   let successFunc = useResults.usable.successFunc
   if ( successFunc === undefined )
   {
      print( "no success func" )
      return
   }
   successFunc( player, useResults.usedThing )
}