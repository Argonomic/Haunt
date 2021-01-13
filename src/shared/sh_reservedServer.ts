import { Workspace } from "@rbxts/services"
import { ExecOnChildWhenItExists, IsServer } from "./sh_utils"

class File
{
   isReservedServer = false
}
let file = new File()

export function IsReservedServer(): boolean 
{
   return file.isReservedServer
}

export function SH_ReservedServerSetup()
{
   if ( IsServer() )
   {
      file.isReservedServer = game.PrivateServerId !== "" && game.PrivateServerOwnerId === 0
      if ( file.isReservedServer )
      {
         let number = new Instance( 'NumberValue' )
         number.Name = "ReservedServer"
         number.Parent = Workspace
      }
      print( "SH_ReservedServerSetup: " + file.isReservedServer )
   }
   else
   {
      ExecOnChildWhenItExists( Workspace, 'ReservedServer',
         function ( child: Instance )
         {
            file.isReservedServer = true
            print( "SH_ReservedServerSetup: TRUE" )
         } )
   }

}