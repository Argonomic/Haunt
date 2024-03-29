import { RunService } from "@rbxts/services"
import { IsServer } from "./sh_utils"

const LOCAL = RunService.IsStudio()

class File
{
   serverAssertCallbacks: Array<( stack: string ) => void> = []
   asserted = false
}
let file = new File()

export function Assert( bool: boolean, msg?: string )
{
   if ( bool )
      return

   if ( msg === undefined )
      msg = ""

   if ( file.asserted ) // first assert is only one that matters
      return
   file.asserted = true

   let stack = debug.traceback()
   let output = ""
   output += "\n\n\n"
   output += "\rASSERT FAILED: " + msg + "\n"
   output += stack + "\n"
   output += "\n\n\n"

   print( output )

   //ReportEvent( "ScriptError", stack )
   if ( IsServer() )
   {
      for ( let callback of file.serverAssertCallbacks )
      {
         callback( output )
      }
   }

   if ( LOCAL )
   {
      assert( false, msg )
      throw undefined
   }
}

export function SH_AssertSetup()
{
}

export function AddAssertServerCallback( func: ( stack: string ) => void )
{
   file.serverAssertCallbacks.push( func )
}