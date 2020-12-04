import { USETYPES } from "shared/sh_gamestate";
import { KILL_DIST, REPORT_DIST } from "shared/sh_settings";
import { AddUseType } from "shared/sh_use";
import { GetPosition, PlayerTouchesPart } from "shared/sh_utils";

const ICON_CORPSE = 'rbxassetid://982410018'
const TEXT_CORPSE = "REPORT"

const ICON_HAND = 'rbxassetid://982410018'
const TEXT_HAND = "USE"

const ICON_SKULL = 'rbxassetid://5841740664'
const TEXT_SKULL = "KILL"

export function SH_UseContentSetup()
{
   AddUseType( USETYPES.USETYPE_KILL, ICON_SKULL, TEXT_SKULL ).testPlayerPosToInstance =
      function ( userPos: Vector3, target: Instance )
      {
         return userPos.sub( GetPosition( target ) ).Magnitude <= KILL_DIST
      }

   AddUseType( USETYPES.USETYPE_TASK, ICON_HAND, TEXT_HAND ).testPlayerToBasePart =
      function ( player: Player, target: BasePart )
      {
         return PlayerTouchesPart( player, target )
      }

   AddUseType( USETYPES.USETYPE_REPORT, ICON_CORPSE, TEXT_CORPSE ).testPlayerPosToPos =
      function ( userPos: Vector3, target: Vector3 )
      {
         return userPos.sub( target ).Magnitude <= REPORT_DIST
      }
}
