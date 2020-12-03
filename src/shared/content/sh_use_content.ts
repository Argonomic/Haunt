import { KILL_DIST, USETYPE_TASK, USETYPE_KILL } from "shared/sh_settings";
import { SetGetUseTypeFunction, AddUseType } from "shared/sh_use";
import { GetPosition, IsAlive, PlayerTouchesPart } from "shared/sh_utils";

const ICON_HAND = 'rbxassetid://982410018'
const ICON_SKULL = 'rbxassetid://5841740664'
const TEXT_HAND = "USE"
const TEXT_SKULL = "KILL"

export function SH_UseContentSetup()
{
   AddUseType( USETYPE_KILL, ICON_SKULL, TEXT_SKULL,
      function ( _: Player, target: Instance, pos: Vector3 )
      {
         return pos.sub( GetPosition( target ) ).Magnitude <= KILL_DIST
      } )

   AddUseType( USETYPE_TASK, ICON_HAND, TEXT_HAND,
      function ( player: Player, target: BasePart, _: Vector3 )
      {
         return PlayerTouchesPart( player, target )
      } )

   SetGetUseTypeFunction( function ( player: Player, useTargets: Array<Instance> ): number | undefined
   {
      if ( !IsAlive( player ) )
         return undefined

      let pos = GetPosition( player )

      for ( let target of useTargets )
      {
         if ( target.IsA( 'BasePart' ) )
         {
            if ( PlayerTouchesPart( player, target ) )
               return USETYPE_TASK
         }
         else if ( target.IsA( 'Player' ) )
         {
            if ( IsAlive( target ) )
            {
               if ( pos.sub( GetPosition( target ) ).Magnitude < KILL_DIST )
                  return USETYPE_KILL
            }
         }
      }

      return undefined
   } )
}
