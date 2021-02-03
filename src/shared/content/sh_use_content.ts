import { GAME_STATE, Match, NETVAR_MEETINGS_CALLED, USETYPES } from "shared/sh_gamestate";
import { GetPosition, PlayerTouchesPart } from "shared/sh_utils_geometry";
import { GetNetVar_Number } from "shared/sh_player_netvars";
import { KILL_DIST, REPORT_DIST } from "shared/sh_settings";
import { AddUseType, GetUseResultsForAttempt } from "shared/sh_use";
import { GetGameModeConsts } from "shared/sh_gameModeConsts";
import { GetHumanoid, IsAlive } from "shared/sh_utils";

const ICON_CORPSE = 'rbxassetid://6080134682'
const TEXT_CORPSE = "REPORT"

const ICON_MEETING = 'rbxassetid://6080134682' // 1307242951'
const TEXT_MEETING = "CALL MEETING"

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

   AddUseType( USETYPES.USETYPE_MEETING, ICON_MEETING, TEXT_MEETING ).testPlayerToBasePart =
      function ( player: Player, target: BasePart )
      {
         return PlayerTouchesPart( player, target )
      }
}

export function CanCallMeeting( match: Match, player: Player ): boolean
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
         break

      default:
         return false
   }

   let meetingCount = 0
   if ( match.IsDetective( player ) )
      meetingCount = match.shState.startingImpostorCount

   if ( GetNetVar_Number( player, NETVAR_MEETINGS_CALLED ) > meetingCount )
      return false

   return !match.IsSpectator( player )
}

export function CanKill( match: Match, player: Player ): boolean
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         break

      default:
         return false
   }

   if ( match.IsSpectator( player ) )
      return false

   return match.IsImpostor( player )
}

export function CanReportBody( match: Match, player: Player ): boolean
{
   if ( match.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
      return false

   return !match.IsSpectator( player )
}

export function SharedKillGetter( match: Match, player: Player ): Array<Player>
{
   if ( !CanKill( match, player ) )
      return []

   let results: Array<Player>
   if ( GetGameModeConsts().canKillImpostors )
      results = match.GetLivingPlayers()
   else
      results = match.GetLivingCampers()

   results = results.filter( function ( result )
   {
      if ( result === player )
         return false
      return IsAlive( result )
   } )

   return results
}