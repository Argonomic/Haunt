import { HttpService } from "@rbxts/services";
import { GetAllConnectedPlayersInMatch, AddMatchDestroyedCallback, PlayerHasAssignments, PlayerToMatch, RemoveAssignment, SV_SendRPC } from "server/sv_gameState";
import { ABILITIES, COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content";
import { HasAbility } from "shared/sh_ability";
import { ResetCooldownTime } from "shared/sh_cooldown";
import { AddMatchCreatedCallback, Match, TASK_RESTORE_LIGHTS } from "shared/sh_gamestate";
import { AddRPC } from "shared/sh_rpc";
import { ArrayRandomize, RandomInt } from "shared/sh_utils";
import { Assert } from "shared/sh_assert";

class Fuses
{
   fuses: Array<boolean> = [false, false, false, false, false, false, false]
}

class File
{
   matchToFuses = new Map<Match, Fuses>()
}
let file = new File()

function GetFuses( match: Match ): Fuses
{
   let fuses = file.matchToFuses.get( match )
   if ( fuses === undefined )
   {
      Assert( false, "No fuses for match " + match )
      throw undefined
   }
   return fuses
}

export function SV_TasksContentSetup()
{
   AddMatchCreatedCallback( function ( match: Match )
   {
      file.matchToFuses.set( match, new Fuses() )
   } )

   AddMatchDestroyedCallback( function ( match: Match )
   {
      file.matchToFuses.delete( match )
   } )

   AddRPC( "RPC_FromClient_RestoreLighting_Fuse", function ( player: Player, fuse: number, status: boolean )
   {
      let match = PlayerToMatch( player )
      if ( match.IsSpectator( player ) )
         return

      let fuses = GetFuses( match )

      if ( fuse < 0 || fuse >= fuses.fuses.size() )
         return
      fuses.fuses[fuse] = status
      SendFusePositionsToClients( match )

      for ( let fuse of fuses.fuses )
      {
         if ( !fuse )
            return
      }

      for ( let aplayer of GetAllConnectedPlayersInMatch( match ) )
      {
         if ( PlayerHasAssignments( aplayer, match ) )
            RemoveAssignment( aplayer, match, 'Garage', TASK_RESTORE_LIGHTS )

         if ( HasAbility( aplayer, ABILITIES.ABILITY_SABOTAGE_LIGHTS ) )
            ResetCooldownTime( aplayer, COOLDOWN_SABOTAGE_LIGHTS )
      }
   } )
}

function SendFusePositionsToClients( match: Match )
{
   let fuses = GetFuses( match )
   let fuseArrayJson = HttpService.JSONEncode( fuses.fuses )
   for ( let player of GetAllConnectedPlayersInMatch( match ) )
   {
      SV_SendRPC( "RPC_FromServer_RestoreLighting_Fuse", match, player, fuseArrayJson )
   }
}


export function ResetFuses( match: Match )
{
   let fuses = GetFuses( match )

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
   SendFusePositionsToClients( match )
}