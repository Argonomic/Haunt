import { REMOTESOUNDS } from "shared/sh_gamestate"
import { AddCallback_OnRoomSetup, EDITOR_Vent, Room } from "shared/sh_rooms"
import { AddRPC } from "shared/sh_rpc"
import { Tween } from "shared/sh_tween"
import { GetHumanoidRootPart, Thread } from "shared/sh_utils"
import { GetPosition } from "shared/sh_utils_geometry"
import { BroadcastSound, PlayerToMatch, TellOtherPlayersInMatchThatPlayersPutInRoom } from "./sv_gameState"
import { GetRoomByName } from "./sv_rooms"

export function SV_VentSetup()
{
   let ventsByRoom = new Map<string, EDITOR_Vent>()
   let ventsToPosition = new Map<EDITOR_Vent, CFrame>()

   AddCallback_OnRoomSetup( "scr_vent", function ( vent: EDITOR_Vent, room: Room )
   {
      ventsByRoom.set( room.name, vent )
      ventsToPosition.set( vent, vent.Top.CFrame.add( new Vector3( 0, 0, 0 ) ) )
      /*
      vent.scr_vent_trigger.Touched.Connect( function ( toucher )
      {
         let player = GetPlayerFromDescendant( toucher )
         if ( player === undefined )
            return
      } )

      Thread(
         function ()
         {
            for ( ; ; )
            {
               RotateVent( vent )
               Wait( 3 )
            }
         } )
      */
   } )

   function RotateVent( vent: EDITOR_Vent )
   {
      Thread(
         function ()
         {
            let cframe = ventsToPosition.get( vent )
            if ( cframe === undefined )
               return

            let cframeRotated = cframe.mul( CFrame.Angles( math.rad( 270 ), math.rad( 0 ), math.rad( 0 ) ) )

            cframeRotated = cframeRotated.add( new Vector3( vent.Top.Size.X * -0.5, vent.Top.Size.X * 0.5, 0 ) )

            Tween( vent.Top, { CFrame: cframeRotated }, 0.1 )
            wait( 0.5 )
            Tween( vent.Top, { CFrame: cframe }, 0.3 )
         } )
   }

   AddRPC( "RPC_FromClient_VentTeleport",
      function ( player: Player, fromRoomName: string, toRoomName: string )
      {
         Thread(
            function ()
            {
               print( player.Name + " vent to " + toRoomName )
               let toVent = ventsByRoom.get( toRoomName )
               if ( toVent === undefined )
                  return
               let fromVent = ventsByRoom.get( fromRoomName )
               if ( fromVent === undefined )
                  return

               let part = GetHumanoidRootPart( player )
               if ( part === undefined )
                  return

               RotateVent( fromVent )
               RotateVent( toVent )

               let pos = GetPosition( toVent.Union ).add( new Vector3( 0, 3, 0 ) )
               part.CFrame = new CFrame( pos )
               let room = GetRoomByName( toRoomName )

               let match = PlayerToMatch( player )
               TellOtherPlayersInMatchThatPlayersPutInRoom( match, [player], room )

               BroadcastSound( match, REMOTESOUNDS.REMOTESOUND_VENT, fromRoomName, toRoomName )
            } )
      } )
}


