import { DamagePlayer, GetHealth, KillPlayer, Thread, Wait, } from "shared/sh_utils"
import { GAME_STATE, NS_Corpse, USETYPES, COOLDOWN_NAME_KILL, MEETING_TYPE, NETVAR_MEETINGS_CALLED, CanUseTask, REMOTESOUNDS } from "shared/sh_gamestate"
import { GetUsableByType, USABLETYPES } from "shared/sh_use"
import { SetGameState, UpdateGame, PlayerHasUnfinishedAssignment, PlayerHasAssignments, PlayerToMatch, SV_SendRPC, SetPlayerKilled, BroadcastSound, TellOtherPlayersInMatchThatPlayersPutInRoom } from "server/sv_gameState"
import { GetCurrentRoom } from "server/sv_rooms"
import { DoCooldown, GetPlayerCooldownTimeRemaining, ResetCooldownTime } from "shared/sh_cooldown"
import { SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { CanCallMeeting, CanReportBody, SharedKillGetter } from "shared/content/sh_use_content"
import { GetPosition, PushPlayersApart } from "shared/sh_utils_geometry"
import { SetPlayerSpawnLocation } from "server/sv_playerSpawnLocation"
import { GetGameModeConsts } from "shared/sh_gameModeConsts"
import { COOLDOWNTIME_IMPOSTOR_HIT_KILL } from "shared/sh_settings"

export function SV_UseContentSetup()
{
   let usableReport = GetUsableByType( USETYPES.USETYPE_REPORT )
   usableReport.DefineGetter(
      function ( player: Player ): Array<USABLETYPES>
      {
         let match = PlayerToMatch( player )
         if ( !CanReportBody( match, player ) )
            return []

         if ( match.GetGameState() === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            return []

         // are we near a corpse?
         let corpseUsables: Array<Vector3> = []
         for ( let corpse of match.shState.corpses )
         {
            let pos = new Vector3( corpse.x, corpse.y, corpse.z )
            corpseUsables.push( pos )
         }

         return corpseUsables
      } )
   usableReport.svUseSuccessFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )

         let pos = usedThing as Vector3
         for ( let corpse of match.shState.corpses )
         {
            let corpsePos = new Vector3( corpse.x, corpse.y, corpse.z )
            if ( corpsePos.sub( pos ).Magnitude < 1 ) // dunno if we can just compare vectors directly and I dunno if it drops any precision
            {
               let room = GetCurrentRoom( player )
               let meetingCallerRoomName = room.name
               match.SetMeetingDetails( player, MEETING_TYPE.MEETING_REPORT, meetingCallerRoomName, corpse.userId )

               TellOtherPlayersInMatchThatPlayersPutInRoom( match, [player], room )
               SetGameState( match, GAME_STATE.GAME_STATE_MEETING_DISCUSS )
               return
            }
         }
      }


   let usableKill = GetUsableByType( USETYPES.USETYPE_KILL )
   usableKill.DefineGetter(
      function ( player: Player ): Array<Player>
      {
         let match = PlayerToMatch( player )
         return SharedKillGetter( match, player )
      } )
   usableKill.svUseSuccessFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )
         let target = usedThing as Player

         if ( match.IsCamper( target ) )
         {
            KillPlayer( target )
         }
         else
         {
            // impostor push, red screen
            DamagePlayer( target, 66 ) // just hurt impostors
            //if ( GetHealth( target ) > 0 )
            PushPlayersApart( target, player )
            DoCooldown( player, COOLDOWN_NAME_KILL, COOLDOWNTIME_IMPOSTOR_HIT_KILL )
            //if ( GetPlayerCooldownTimeRemaining( target, COOLDOWN_NAME_KILL ) > COOLDOWNTIME_IMPOSTOR_HIT_KILL )
            DoCooldown( target, COOLDOWN_NAME_KILL, COOLDOWNTIME_IMPOSTOR_HIT_KILL )
            BroadcastSound( match, REMOTESOUNDS.REMOTESOUND_IMPOSTORHIT, GetCurrentRoom( player ).name )
         }

         if ( GetHealth( target ) <= 0 )
         {
            BroadcastSound( match, REMOTESOUNDS.REMOTESOUND_SPLAT, GetCurrentRoom( player ).name )
            SetPlayerSpawnLocation( target, GetPosition( target ) )
            SetPlayerKilled( match, target, player )
            ResetCooldownTime( player, COOLDOWN_NAME_KILL )

            let gmc = GetGameModeConsts()
            if ( gmc.hasCorpses )
            {
               let corpse = new NS_Corpse( target, GetPosition( target ) )
               match.shState.corpses.push( corpse )
               if ( gmc.corpseTimeout !== undefined )
               {
                  Thread(
                     function ()
                     {
                        Wait( gmc.corpseTimeout as number )
                        match.shState.corpses = match.shState.corpses.filter( function ( otherCorpse )
                        {
                           return otherCorpse !== corpse
                        } )
                        UpdateGame( match )
                     } )
               }
            }
            UpdateGame( match )
         }
      }


   let usableTask = GetUsableByType( USETYPES.USETYPE_TASK )
   usableTask.DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let room = GetCurrentRoom( player )
         // print( "Room for " + player.Name + " is " + room.name )
         let results: Array<BasePart> = []

         let match = PlayerToMatch( player )
         if ( !CanUseTask( match, player ) )
            return []

         if ( !PlayerHasAssignments( player, match ) )
            return []

         for ( let taskPair of room.tasks )
         {
            let task = taskPair[1]

            if ( PlayerHasUnfinishedAssignment( player, match, room.name, task.name ) )
               results.push( task.volume )
         }

         return results
      } )
   usableTask.svUseSuccessFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )

         let volume = usedThing as BasePart
         let room = GetCurrentRoom( player )
         for ( let pair of room.tasks )
         {
            if ( pair[1].volume !== volume )
               continue

            SetPlayerWalkSpeed( player, 0 )
            SV_SendRPC( "RPC_FromServer_OnPlayerUseTask", match, player, room.name, pair[0] )
            break
         }
      }


   {
      let usable = GetUsableByType( USETYPES.USETYPE_MEETING )
      usable.DefineGetter(
         function ( player: Player ): Array<BasePart>
         {
            let match = PlayerToMatch( player )
            if ( !CanCallMeeting( match, player ) )
               return []

            let room = GetCurrentRoom( player )
            if ( room.meetingTrigger !== undefined )
               return [room.meetingTrigger]
            return []
         } )
      usable.svUseSuccessFunc =
         function ( player: Player, usedThing: USABLETYPES )
         {
            let match = PlayerToMatch( player )

            print( "Meeting called by " + player.Name )
            let volume = usedThing as BasePart
            let room = GetCurrentRoom( player )
            if ( room.meetingTrigger !== volume )
               return

            let meetingsCalled = GetNetVar_Number( player, NETVAR_MEETINGS_CALLED )
            SetNetVar( player, NETVAR_MEETINGS_CALLED, meetingsCalled + 1 )

            let meetingCallerRoomName = GetCurrentRoom( player ).name
            match.SetMeetingDetails( player, MEETING_TYPE.MEETING_EMERGENCY, meetingCallerRoomName, undefined )
            SetGameState( match, GAME_STATE.GAME_STATE_MEETING_DISCUSS )
         }
   }
}

