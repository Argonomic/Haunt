import { GetAllConnectedPlayersInMatch, GiveAssignment, PlayerToMatch, ServerPlayeyHasAssignment } from "server/sv_gameState";
import { ABILITIES } from "shared/content/sh_ability_content";
import { SetAbilityCanUseFunc, SetAbilityServerFunc } from "shared/sh_ability";
import { TASK_RESTORE_LIGHTS, Assignment } from "shared/sh_gamestate";
import { LoadSound } from "shared/sh_utils";
import { ResetFuses } from "./sv_tasks_content";

let LIGHTS_OUT_SOUND = LoadSound( 2028346649 )

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

         print( "Give restore lights task" )
         LIGHTS_OUT_SOUND.Volume = 0.8
         LIGHTS_OUT_SOUND.Play()
      } )

   SetAbilityCanUseFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ( player: Player ): boolean
      {
         print( "test server has lights" )
         let match = PlayerToMatch( player )
         return !ServerPlayeyHasAssignment( player, match, 'Garage', TASK_RESTORE_LIGHTS )
      } )
}
