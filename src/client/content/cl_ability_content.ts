import { TASK_RESTORE_LIGHTS } from "shared/sh_gamestate"
import { ABILITIES } from "shared/content/sh_ability_content"
import { SetAbilityCanUseFunc } from "shared/sh_ability"
import { Assert } from "shared/sh_assert"
import { GetLocalPlayer } from "shared/sh_utils"
import { ClientHasAssignment } from "client/cl_gamestate"

export function CL_AbilityContentSetup()
{
   SetAbilityCanUseFunc( ABILITIES.ABILITY_SABOTAGE_LIGHTS,
      function ( player: Player ): boolean
      {
         Assert( player === GetLocalPlayer(), "player === GetLocalPlayer()" )
         let hasAssign = ClientHasAssignment( 'Garage', TASK_RESTORE_LIGHTS )
         return !hasAssign
      } )
}
