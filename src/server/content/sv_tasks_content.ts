import { HttpService, Players } from "@rbxts/services";
import { GetMatch, PlayerHasAssignments, RemoveAssignment } from "server/sv_gameState";
import { SV_SendRPC } from "shared/sh_rpc"
import { ABILITIES, COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content";
import { HasAbility } from "shared/sh_ability";
import { ResetCooldownTime } from "shared/sh_cooldown";
import { TASK_RESTORE_LIGHTS } from "shared/sh_gamestate";
import { AddRPC } from "shared/sh_rpc";
import { ArrayRandomize, RandomInt } from "shared/sh_utils";

class Fuses
{
   fuses: Array<boolean> = [false, false, false, false, false, false, false]
}

class File
{
   fuses = new Fuses()
}
let file = new File()


export function SV_TasksContentSetup()
{
   AddRPC( "RPC_FromClient_RestoreLighting_Fuse", function ( player: Player, fuse: number, status: boolean )
   {
      let match = GetMatch()
      if ( match.IsSpectator( player ) )
         return

      let fuses = file.fuses

      if ( fuse < 0 || fuse >= fuses.fuses.size() )
         return
      fuses.fuses[fuse] = status
      SendFusePositionsToClients()

      for ( let fuse of fuses.fuses )
      {
         if ( !fuse )
            return
      }

      for ( let aplayer of match.GetAllPlayers() )
      {
         if ( PlayerHasAssignments( aplayer, match ) )
            RemoveAssignment( aplayer, match, 'Garage', TASK_RESTORE_LIGHTS )

         if ( HasAbility( aplayer, ABILITIES.ABILITY_SABOTAGE_LIGHTS ) )
            ResetCooldownTime( aplayer, COOLDOWN_SABOTAGE_LIGHTS )
      }
   } )
}

function SendFusePositionsToClients()
{
   let fuses = file.fuses
   let fuseArrayJson = HttpService.JSONEncode( fuses.fuses )
   for ( let player of Players.GetPlayers() )
   {
      SV_SendRPC( "RPC_FromServer_RestoreLighting_Fuse", player, fuseArrayJson )
   }
}


export function ResetFuses()
{
   let fuses = file.fuses

   let positions: Array<number> = []
   for ( let i = 0; i < fuses.fuses.size(); i++ )
   {
      positions.push( i )
   }
   ArrayRandomize( positions )

   let switchedFuses = 4 + RandomInt( 2 )
   for ( let i = 0; i < switchedFuses; i++ )
   {
      let fuse = positions[i]
      fuses.fuses[fuse] = false
   }
   for ( let i = switchedFuses; i < fuses.fuses.size(); i++ )
   {
      let fuse = positions[i]
      fuses.fuses[fuse] = true
   }
   SendFusePositionsToClients()
}