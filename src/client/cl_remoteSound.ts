import { Assert } from "shared/sh_assert"
import { REMOTESOUNDS } from "shared/sh_gamestate"
import { AddRPC } from "shared/sh_rpc"
import { ArrayRandom, GetLocalPlayer, LoadSound, Thread } from "shared/sh_utils"
import { GetCurrentRoom } from "./cl_rooms"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
}
let file = new File()

function GetRemoteSoundFromID( id: REMOTESOUNDS ): Array<number>
{
   switch ( id )
   {
      case REMOTESOUNDS.REMOTESOUND_VENT:
         return [5771441412]

      case REMOTESOUNDS.REMOTESOUND_SPLAT:
         return [ArrayRandom( [150315649, 3781479909, 517040733] ) as number]

      case REMOTESOUNDS.REMOTESOUND_IMPOSTORHIT:
         return [491296320, 260430117]

      default:
         Assert( false, "Unknown REMOTESOUNDS " + id )
   }

   throw undefined
}

export function CL_RemoteSoundSetup()
{
   LoadSound( 5771441412 )
   LoadSound( 150315649 )
   LoadSound( 3781479909 )
   LoadSound( 517040733 )
   LoadSound( 491296320 )
   LoadSound( 260430117 )

   AddRPC( "RPC_FromServer_PlaySound",
      function ( remoteId: number )
      {
         PlayRemoteSound( remoteId )
      } )

}

export function PlayRemoteSound( remoteId: number )
{
   let sounds = GetRemoteSoundFromID( remoteId )
   for ( let soundID of sounds )
   {
      Thread(
         function ()
         {
            /*
            let part = new Instance( 'Part' )
            part.Anchored = true
            part.CanCollide = false
            part.Size = new Vector3( 5, 5, 5 )
            part.Transparency = 1
            part.Position = position
            part.Parent = Workspace
            part.Name = "SoundParent"
            */

            let sound = LoadSound( soundID )
            sound.RollOffMaxDistance = 45
            sound.Play()
            sound.Volume = 0.15
            //print( "length: " + sound.TimeLength )
            wait( sound.TimeLength )
            sound.Destroy()
         } )
   }
} 
