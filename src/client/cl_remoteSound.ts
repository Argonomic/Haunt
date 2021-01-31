import { AddRPC } from "shared/sh_rpc"
import { GetLocalPlayer, LoadSound, Thread } from "shared/sh_utils"
import { GetCurrentRoom } from "./cl_rooms"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
}
let file = new File()

export function CL_RemoteSoundSetup()
{
   AddRPC( "RPC_FromServer_PlaySound",
      function ( id: number, room: string, room2?: string )
      {
         let rooms: Array<string> = [room]
         if ( room2 !== undefined )
            rooms.push( room2 )

         let myRoom = GetCurrentRoom( LOCAL_PLAYER )
         for ( let room of rooms )
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

                  let sound = LoadSound( id )
                  sound.RollOffMaxDistance = 45
                  sound.Play()
                  sound.Volume = 0.1
                  wait( sound.TimeLength )
                  sound.Destroy()
               } )
         }
      } )

}

