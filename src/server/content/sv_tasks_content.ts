import { HttpService } from "@rbxts/services";
import { PlayerHasAssignments, PlayerToGame, RemoveAssignment } from "server/sv_gameState";
import { SV_SendRPC } from "shared/sh_rpc"
import { ABILITIES, COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content";
import { HasAbility } from "shared/sh_ability";
import { ResetCooldownTime } from "shared/sh_cooldown";
import { Game, TASK_RESTORE_LIGHTS } from "shared/sh_gamestate";
import { AddRPC } from "shared/sh_rpc";
import { ArrayRandomize, RandomInt } from "shared/sh_utils";

class Fuses
{
   fuses: Array<boolean> = [false, false, false, false, false, false, false]
}

class File
{
   gameToFuses = new Map<Game, Fuses>()
}
let file = new File()


export function SV_TasksContentSetup()
{
   AddRPC( "RPC_FromClient_RestoreLighting_Fuse", function ( player: Player, fuse: number, status: boolean )
   {
      let game = PlayerToGame( player )
      if ( game.IsSpectator( player ) )
         return

      let fuses = file.gameToFuses.get( game ) as Fuses

      if ( fuse < 0 || fuse >= fuses.fuses.size() )
         return
      fuses.fuses[fuse] = status
      SendFusePositionsToClients( game )

      for ( let fuse of fuses.fuses )
      {
         if ( !fuse )
            return
      }

      for ( let aplayer of game.GetAllPlayers() )
      {
         if ( PlayerHasAssignments( aplayer, game ) )
            RemoveAssignment( aplayer, game, 'Garage', TASK_RESTORE_LIGHTS )

         if ( HasAbility( aplayer, ABILITIES.ABILITY_SABOTAGE_LIGHTS ) )
            ResetCooldownTime( aplayer, COOLDOWN_SABOTAGE_LIGHTS )
      }
   } )
}

function SendFusePositionsToClients( game: Game )
{
   let fuses = file.gameToFuses.get( game ) as Fuses
   let fuseArrayJson = HttpService.JSONEncode( fuses.fuses )
   for ( let player of game.GetAllPlayers() )
   {
      SV_SendRPC( "RPC_FromServer_RestoreLighting_Fuse", player, fuseArrayJson )
   }
}


export function ResetFuses( game: Game )
{
   let fuses
   if ( !file.gameToFuses.has( game ) )
   {
      fuses = new Fuses()
      file.gameToFuses.set( game, fuses )
   }
   else
   {
      fuses = file.gameToFuses.get( game ) as Fuses
   }

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
   SendFusePositionsToClients( game )
}