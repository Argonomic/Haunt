import { HttpService, TeleportService } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { IsServer, Thread } from "shared/sh_utils"
import { CL_SendRPC } from "./sh_rpc"

export class TELEPORT_PlayerData
{
   playerCount: number | undefined
   fromReservedServer: boolean | undefined
   sendMeBackToLobby: boolean | undefined
}

class File
{
   sendMeBackToLobby = false
   fromReservedServer = false
}
let file = new File()

export function SH_TeleportSetup()
{
   if ( !IsServer() )
   {
      let playerData = TeleportService.GetLocalPlayerTeleportData()
      if ( playerData !== undefined )
      {
         // data packaged with our teleport from previous server
         Assert( typeOf( playerData ) === 'string', "typeOf( playerData ) === 'string'" )
         let jsonString = playerData as string
         let data = HttpService.JSONDecode( jsonString ) as TELEPORT_PlayerData
         if ( data.playerCount !== undefined )
            CL_SendRPC( 'RPC_FromClient_SetPlayerCount', data.playerCount )

         if ( data.sendMeBackToLobby === true )
         {
            file.sendMeBackToLobby = true
            Thread(
               function ()
               {
                  for ( ; ; )
                  {
                     wait( 3 )

                     // click your heels three times
                     CL_SendRPC( 'RPC_FromClient_RequestLobby' )
                  }
               } )
         }

         file.fromReservedServer = data.fromReservedServer === true
      }
   }
}

export function IsFromReservedServer(): boolean
{
   return file.fromReservedServer
}

export function SendMeBackToLobby(): boolean
{
   return file.sendMeBackToLobby
}
