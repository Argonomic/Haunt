import { Workspace } from "@rbxts/services"
import { ExecOnChildWhenItExists, IsServer, Thread } from "./sh_utils"
import { Assert } from "shared/sh_assert"

class File
{
   numValue: NumberValue = new Instance( 'NumberValue' )
}

let file = new File()

export function GetServerTime(): number
{
   if ( IsServer() )
      return Workspace.DistributedGameTime

   return file.numValue.Value
}

export function GetDeltaTime(): number
{
   return Workspace.DistributedGameTime - GetServerTime()
}

export function SH_TimeSetup()
{
   const SERVER_TIME = "ServerTime"
   if ( IsServer() )
   {
      let numValue = new Instance( 'NumberValue' )
      numValue.Parent = Workspace
      numValue.Name = SERVER_TIME
      Thread( function ()
      {
         for ( ; ; )
         {
            numValue.Value = Workspace.DistributedGameTime
            wait()
         }
      } )
   }
   else
   {
      ExecOnChildWhenItExists( Workspace, SERVER_TIME,
         function ( serverTime: NumberValue )
         {
            file.numValue.Destroy()
            file.numValue = serverTime
         } )
   }
}