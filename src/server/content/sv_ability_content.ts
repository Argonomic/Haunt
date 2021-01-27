import { GetAllConnectedPlayersInMatch, GiveAssignment, PlayerToMatch, ServerPlayeyHasAssignment } from "server/sv_gameState";
import { ABILITIES, COOLDOWN_SABOTAGE_LIGHTS } from "shared/content/sh_ability_content";
import { SetAbilityCanUseFunc, SetAbilityServerFunc } from "shared/sh_ability";
import { ResetCooldownTime } from "shared/sh_cooldown";
import { TASK_RESTORE_LIGHTS, Assignment } from "shared/sh_gamestate";
import { ResetFuses } from "./sv_tasks_content";


export function SV_AbilityContentSetup()
{
   SetAbilityServerFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ( player: Player )
      {
         print( "ABILITY_SABOTAGE_LIGHTS" )

         let match = PlayerToMatch( player )
         ResetFuses( match )
         let players = GetAllConnectedPlayersInMatch( match )
         for ( let aplayer of players )
         {
            if ( match.IsSpectator( aplayer ) )
               continue
            if ( ServerPlayeyHasAssignment( aplayer, match, 'Garage', TASK_RESTORE_LIGHTS ) )
               continue
            let assignment = new Assignment( 'Garage', TASK_RESTORE_LIGHTS )
            GiveAssignment( aplayer, match, assignment )
         }

         ResetCooldownTime( player, COOLDOWN_SABOTAGE_LIGHTS )
      } )

   SetAbilityCanUseFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ( player: Player ): boolean
      {
         print( "test server has lights" )
         let match = PlayerToMatch( player )
         return !ServerPlayeyHasAssignment( player, match, 'Garage', TASK_RESTORE_LIGHTS )
      } )
}
