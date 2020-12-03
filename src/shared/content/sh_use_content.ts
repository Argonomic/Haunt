import { KILL_DIST, USETYPE_TASK, USETYPE_KILL, USETYPE_REPORT } from "shared/sh_settings";
import { SetGetUseTypeFunction, AddUseType, UsePosition } from "shared/sh_use";
import { GetPosition, IsAlive, PlayerTouchesPart } from "shared/sh_utils";

const ICON_CORPSE = 'rbxassetid://982410018'
const TEXT_CORPSE = "REPORT"

const ICON_HAND = 'rbxassetid://982410018'
const TEXT_HAND = "USE"

const ICON_SKULL = 'rbxassetid://5841740664'
const TEXT_SKULL = "KILL"

export function SH_UseContentSetup()
{
   function KillTest( _: Player | undefined, target: Instance, pos: Vector3 )
   {
      return pos.sub( GetPosition( target ) ).Magnitude <= KILL_DIST
   }

   function TaskTest( player: Player, target: BasePart, _: Vector3 | undefined )
   {
      return PlayerTouchesPart( player, target )
   }

   function ReportTest( _: Player | undefined, target: Instance, pos: Vector3 )
   {
      return pos.sub( GetPosition( target ) ).Magnitude <= KILL_DIST
   }

   AddUseType( USETYPE_KILL, ICON_SKULL, TEXT_SKULL, KillTest )
   AddUseType( USETYPE_TASK, ICON_HAND, TEXT_HAND, TaskTest )
   AddUseType( USETYPE_REPORT, ICON_CORPSE, TEXT_CORPSE, ReportTest )

   SetGetUseTypeFunction( function ( player: Player, useTargets: Array<Instance>, usePositions: Array<UsePosition> ): number | undefined
   {
      if ( !IsAlive( player ) )
         return undefined

      let pos = GetPosition( player )

      for ( let usePosition of usePositions )
      {
         if ( pos.sub( usePosition.pos ).Magnitude < usePosition.dist )
            return usePosition.userType
      }

      for ( let target of useTargets )
      {
         if ( target.IsA( 'Model' ) )
         {
            if ( ReportTest( undefined, target, pos ) )
               return USETYPE_REPORT
         }
         else if ( target.IsA( 'BasePart' ) )
         {
            if ( TaskTest( player, target, undefined ) )
               return USETYPE_TASK
         }
         else if ( target.IsA( 'Player' ) )
         {
            //if ( GetNetVar_Number( player, NETVAR_ROLE ) == ROLE.ROLE_POSSESSED )
            if ( IsAlive( target ) )
            {
               if ( KillTest( undefined, target, pos ) )
                  return USETYPE_KILL
            }
         }
      }

      return undefined
   } )
}
