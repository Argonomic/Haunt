import { DataStoreService } from "@rbxts/services";
import { IsReservedServer, LOCAL } from "shared/sh_gamestate";
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect";
import { SetScore } from "shared/sh_score";
import { MATCHMAKE_SERVER_VERSION } from "shared/sh_settings";
import { Thread } from "shared/sh_utils";

const META_PERSISTENCE = "PERSISTENCE"
const COINS = "_COINS"

const GLOBAL_PERSISTENCE = "GLOBAL_PERSISTENCE"
const GP_SERVER_VERSION = "GP_SERVER_VERSION"

class File
{
   playerToDS = new Map<Player, GlobalDataStore>()
   globalPersistence: GlobalDataStore | undefined
   serverVersion = -1
}
let file = new File()

export function SV_PersistenceSetup()
{
   if ( LOCAL )
      return

   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         pcall(
            function ()
            {
               let pkey = GetPlayerKey( player )
               let ds = DataStoreService.GetDataStore( META_PERSISTENCE, pkey )
               file.playerToDS.set( player, ds )
               let value = ds.GetAsync( COINS )
               if ( typeOf( value ) === 'number' )
               {
                  if ( !IsReservedServer() )
                     SetScore( player, value as number ) // see your score in the lobby
               }
               else
               {
                  ds.SetAsync( COINS, 0 )
               }
            } )
      } )

   pcall(
      function ()
      {
         file.globalPersistence = DataStoreService.GetDataStore( GLOBAL_PERSISTENCE )
         let serverVersion = file.globalPersistence.GetAsync( GP_SERVER_VERSION )
         if ( typeOf( serverVersion ) === 'number' )
         {
            file.serverVersion = serverVersion as number
            if ( file.serverVersion < MATCHMAKE_SERVER_VERSION ) 
            {
               file.serverVersion = MATCHMAKE_SERVER_VERSION
               file.globalPersistence.SetAsync( GP_SERVER_VERSION, MATCHMAKE_SERVER_VERSION )
            }
         }
         else
         {
            file.globalPersistence.SetAsync( GP_SERVER_VERSION, MATCHMAKE_SERVER_VERSION )
         }
      } )
}

export function LobbyUpToDate(): boolean
{
   if ( LOCAL )
      return true
   if ( file.globalPersistence === undefined )
      return true
   if ( file.serverVersion === undefined )
      return true
   if ( IsReservedServer() )
      return true

   let serverVersion = file.globalPersistence.GetAsync( GP_SERVER_VERSION )
   if ( typeOf( serverVersion ) !== 'number' )
      return true

   return ( serverVersion as number ) === file.serverVersion
}

function GetPlayerKey( player: Player )
{
   return "PL" + player.UserId
}

export function GivePersistentPoints( player: Player, score: number )
{
   if ( LOCAL )
      return

   Thread(
      function ()
      {
         pcall(
            function ()
            {
               let ds = file.playerToDS.get( player ) as GlobalDataStore
               let value = ds.GetAsync( COINS )
               if ( typeOf( value ) === 'number' )
                  ds.IncrementAsync( COINS, score )
               else
                  ds.SetAsync( COINS, score )

               print( "Points: " + ds.GetAsync( COINS ) )
            } )
      } )
}
