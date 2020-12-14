import { GetHumanoid, GetPosition, IsAlive, KillPlayer } from "shared/sh_utils"
import { GAME_STATE, ROLE, IsPracticing, Corpse, USETYPES, COOLDOWN_NAME_KILL, MEETING_TYPE } from "shared/sh_gamestate"
import { GetUsableByType, USABLETYPES } from "shared/sh_use"
import { PlayerHasUnfinishedAssignment, PlayerToGame, ClearAssignments } from "server/sv_gameState"
import { SendRPC } from "server/sv_utils"
import { GetCurrentRoom } from "server/sv_rooms"
import { ResetPlayerCooldownTime } from "shared/sh_cooldown"

export function SV_UseContentSetup()
{
   let usableReport = GetUsableByType( USETYPES.USETYPE_REPORT )
   usableReport.DefineGetter(
      function ( player: Player ): Array<USABLETYPES>
      {
         let game = PlayerToGame( player )
         if ( game.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
            return []

         // are we near a corpse?
         let corpseUsables: Array<Vector3> = []
         for ( let corpse of game.corpses )
         {
            corpseUsables.push( corpse.pos )
         }

         return corpseUsables
      } )

   usableReport.successFunc =
      function ( player: Player, usedThing: USABLETYPES )
      {
         let game = PlayerToGame( player )
         if ( game.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
            return

         let pos = usedThing as Vector3
         for ( let corpse of game.corpses )
         {
            if ( corpse.pos.sub( pos ).Magnitude < 1 ) // dunno if we can just compare vectors directly and I dunno if it drops any precision
            {
               print( "Set meeting caller to " + player.Name )
               game.meetingCaller = player
               game.meetingBody = corpse.player
               game.meetingType = MEETING_TYPE.MEETING_REPORT
               game.SetGameState( GAME_STATE.GAME_STATE_MEETING_DISCUSS )
               return
            }
         }
      }

   let usableKill = GetUsableByType( USETYPES.USETYPE_KILL )
   usableKill.DefineGetter(
      function ( player: Player ): Array<Player>
      {
         if ( IsPracticing( player ) )
            return []

         let game = PlayerToGame( player )
         switch ( game.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_SPECTATOR_CAMPER:
            case ROLE.ROLE_SPECTATOR_IMPOSTER:
               return []
         }

         let campers = game.GetLivingCampers()
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
         let camper = usedThing as Player

         let game = PlayerToGame( player )
         game.corpses.push( new Corpse( camper, GetPosition( camper ) ) )
         game.playerToSpawnLocation.set( camper, GetPosition( camper ) )
         KillPlayer( camper )
         game.SetPlayerRole( camper, ROLE.ROLE_SPECTATOR_CAMPER )
         SendRPC( "RPC_FromServer_CancelTask", camper )
         ClearAssignments( game, player )
         game.UpdateGame()
         ResetPlayerCooldownTime( player, COOLDOWN_NAME_KILL )
      }

   let usableTask = GetUsableByType( USETYPES.USETYPE_TASK )
   usableTask.DefineGetter(
      function ( player: Player ): Array<BasePart>
      {
         let room = GetCurrentRoom( player )
         let results: Array<BasePart> = []

         if ( IsPracticing( player ) )
         {
            for ( let taskPair of room.tasks )
            {
               let task = taskPair[1]
               results.push( task.volume )
            }
         }
         else
         {
            let game = PlayerToGame( player )
            for ( let taskPair of room.tasks )
            {
               let task = taskPair[1]
               if ( PlayerHasUnfinishedAssignment( player, game, room.name, task.name ) )
                  results.push( task.volume )
            }
         }

         return results
      } )

   {
      let usable = GetUsableByType( USETYPES.USETYPE_MEETING )

      usable.DefineGetter(
         function ( player: Player ): Array<BasePart>
         {
            if ( IsPracticing( player ) )
               return []

            let room = GetCurrentRoom( player )
            if ( room.meetingTrigger !== undefined )
               return [room.meetingTrigger]
            return []
         } )

      usable.successFunc =
         function ( player: Player, usedThing: USABLETYPES )
         {
            let volume = usedThing as BasePart
            let room = GetCurrentRoom( player )
            if ( room.meetingTrigger !== volume )
               return

            let game = PlayerToGame( player )
            game.meetingCaller = player
            game.meetingType = MEETING_TYPE.MEETING_EMERGENCY
            game.SetGameState( GAME_STATE.GAME_STATE_MEETING_DISCUSS )
         }
   }
}
