import { TASK_RESTORE_LIGHTS } from "shared/sh_gamestate"
import { ABILITIES } from "shared/content/sh_ability_content"
import { SetAbilityCanUseFunc, SetAbilityClientFunc } from "shared/sh_ability"
import { Assert } from "shared/sh_assert"
import { GetLocalPlayer, LoadSound } from "shared/sh_utils"
import { AddGainedTaskCallback, ClientHasAssignment } from "client/cl_gamestate"
import { GetLocalMatch } from "client/cl_localMatch"

let LIGHTS_OUT_SOUND = LoadSound( 2028346649 )
const LOCAL_PLAYER = GetLocalPlayer()

export function CL_AbilityContentSetup()
{
   SetAbilityCanUseFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ( player: Player ): boolean
      {
         Assert( player === GetLocalPlayer(), "player === GetLocalPlayer()" )
         let hasAssign = ClientHasAssignment( 'Garage', TASK_RESTORE_LIGHTS )
         return !hasAssign
      } )

   function PlayLightsOutSound()
   {
      LIGHTS_OUT_SOUND.Volume = 0.8
      LIGHTS_OUT_SOUND.Play()
   }

   AddGainedTaskCallback( TASK_RESTORE_LIGHTS, PlayLightsOutSound )

   SetAbilityClientFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ()
      {
         // dead player doesn't get the task so doesn't hear the sound
         let match = GetLocalMatch()
         if ( match.IsSpectator( LOCAL_PLAYER ) )
            PlayLightsOutSound()
      } )

}
