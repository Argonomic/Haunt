import { Workspace } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { ExecOnChildWhenItExists, IsServer } from "./sh_utils"

class File
{
   isReservedServer: BoolValue | undefined
}
let file = new File()

export function IsReservedServer(): boolean 
{
   if ( file.isReservedServer === undefined ) 
   {
      Assert( false, "file.isReservedServer === undefined" )
      throw undefined
   }

   return file.isReservedServer.Value
}

export function SH_ReservedServerSetup()
{
   if ( IsServer() )
   {
      let number = new Instance( 'BoolValue' )
      number.Name = "ReservedServer"
      number.Parent = Workspace
      number.Value = game.PrivateServerId !== "" && game.PrivateServerOwnerId === 0
      file.isReservedServer = number
      IsReservedServer()
   }
   else
   {
      ExecOnChildWhenItExists( Workspace, 'ReservedServer',
         function ( child: BoolValue )
         {
            file.isReservedServer = child
         } )
   }

}