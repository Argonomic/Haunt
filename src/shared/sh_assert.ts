import { RunService } from "@rbxts/services"
import { IsServer } from "./sh_utils"

const LOCAL = RunService.IsStudio()

class File
{
   serverAssertCallbacks: Array<( stack: string ) => void> = []
}
let file = new File()

export function Assert( bool: boolean, msg: string )
{
   if ( bool )
      return

   let stack = debug.traceback()
   print( "\n\n\n" )
   print( "\rASSERT FAILED: " + msg )
   print( stack )
   print( "\n\n\n" )

   //ReportEvent( "ScriptError", stack )
   if ( IsServer() )
   {
      for ( let callback of file.serverAssertCallbacks )
      {
         callback( stack )
      }
   }

   if ( LOCAL )
      assert( false, msg )
}

export function SH_AssertSetup()
{
}

export function AddAssertServerCallback( func: ( stack: string ) => void )
{
   file.serverAssertCallbacks.push( func )
}