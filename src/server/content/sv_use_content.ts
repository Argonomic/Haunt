import { GetHumanoid, IsAlive, KillPlayer } from "shared/sh_utils"
import { GAME_STATE, ROLE, Corpse, USETYPES, COOLDOWN_NAME_KILL, MEETING_TYPE, NETVAR_MEETINGS_CALLED, UsableGameState } from "shared/sh_gamestate"
import { GetUsableByType, USABLETYPES } from "shared/sh_use"
import { PlayerHasUnfinishedAssignment, ClearAssignments, PlayerHasAssignments, PlayerToMatch } from "server/sv_gameState"
import { SV_SendRPC } from "shared/sh_rpc"
import { GetCurrentRoom } from "server/sv_rooms"
import { ResetCooldownTime } from "shared/sh_cooldown"
import { SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { GetNetVar_Number, SetNetVar } from "shared/sh_player_netvars"
import { PlayerDropsCoinsWithTrajectory } from "server/sv_coins"
import { CanCallMeeting } from "shared/content/sh_use_content"
import { GetPosition } from "shared/sh_utils_geometry"

export function SV_UseContentSetup()
{
   let usableReport = GetUsableByType( USETYPES.USETYPE_REPORT )
   usableReport.DefineGetter(
      function ( player: Player ): Array<USABLETYPES>
      {
         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
            return []

         if ( match.GetGameState() === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            return []

         // are we near a corpse?
         let corpseUsables: Array<Vector3> = []
         for ( let corpse of match.corpses )
         {
            corpseUsables.push( corpse.pos )
         }

         return corpseUsables
      } )

   usableReport.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
            return

         let pos = usedThing as Vector3
         for ( let corpse of match.corpses )
         {
            if ( corpse.pos.sub( pos ).Magnitude < 1 ) // dunno if we can just compare vectors directly and I dunno if it drops any precision
            {
               //print( "Set meeting caller to " + player.Name )
               match.meetingCaller = player
               match.meetingBody = corpse.player
               match.meetingType = MEETING_TYPE.MEETING_REPORT
               match.SetGameState( GAME_STATE.GAME_STATE_MEETING_DISCUSS )
               return
            }
         }
      }

   let usableKill = GetUsableByType( USETYPES.USETYPE_KILL )
   usableKill.DefineGetter(
      function ( player: Player ): Array<Player>
      {
         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
            return []

         if ( match.IsSpectator( player ) )
            return []

         if ( !match.IsImpostor( player ) )
            return []

         let campers = match.GetLivingCampers()
         let results: Array<Player> = []
         for ( let camper of campers )
         {
            if ( !IsAlive( camper ) )
               continue

            let human = GetHumanoid( camper )
            if ( human !== undefined )
               results.push( camper )
         }
         return results
      } )

   usableKill.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
            return

         let camper = usedThing as Player

         match.corpses.push( new Corpse( camper, GetPosition( camper ) ) )
         match.playerToSpawnLocation.set( camper, GetPosition( camper ) )
         PlayerDropsCoinsWithTrajectory( camper, GetPosition( player ) )
         match.SetPlayerRole( camper, ROLE.ROLE_SPECTATOR_CAMPER )
         match.SetPlayerKilled( camper )
         KillPlayer( camper )
         SV_SendRPC( "RPC_FromServer_CancelTask", player )

         ClearAssignments( match, camper )

         match.UpdateGame()
         ResetCooldownTime( player, COOLDOWN_NAME_KILL )
      }

   let usableTask = GetUsableByType( USETYPES.USETYPE_TASK )
   usableTask.DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let room = GetCurrentRoom( player )
         // print( "Room for " + player.Name + " is " + room.name )
         let results: Array<BasePart> = []

         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
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

   usableTask.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let match = PlayerToMatch( player )
         if ( !UsableGameState( match ) )
            return
         let volume = usedThing as BasePart
         let room = GetCurrentRoom( player )
         for ( let pair of room.tasks )
         {
            if ( pair[1].volume !== volume )
               continue

            SetPlayerWalkSpeed( player, 0 )
            SV_SendRPC( "RPC_FromServer_OnPlayerUseTask", player, room.name, pair[0] )
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

      usable.successFunc =
         function ( player: Player, usedThing: USABLETYPES )
         {
            let match = PlayerToMatch( player )
            if ( !UsableGameState( match ) )
               return
            print( "Meeting called by " + player.Name )
            let volume = usedThing as BasePart
            let room = GetCurrentRoom( player )
            if ( room.meetingTrigger !== volume )
               return

            let meetingsCalled = GetNetVar_Number( player, NETVAR_MEETINGS_CALLED )
            SetNetVar( player, NETVAR_MEETINGS_CALLED, meetingsCalled + 1 )
            match.meetingCaller = player
            match.meetingType = MEETING_TYPE.MEETING_EMERGENCY
            match.SetGameState( GAME_STATE.GAME_STATE_MEETING_DISCUSS )
         }
   }
}
