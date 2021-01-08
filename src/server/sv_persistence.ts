import { DataStoreService, Workspace } from "@rbxts/services";
import { IsReservedServer, LOCAL } from "shared/sh_gamestate";
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect";
import { SetScore } from "shared/sh_score";
import { MATCHMAKE_SERVER_VERSION } from "shared/sh_settings";
import { Thread } from "shared/sh_utils";

const META_PERSISTENCE = "PERSISTENCE"
const COINS = "_COINS"

const GLOBAL_PERSISTENCE = "GLOBAL_PERSISTENCE"
const GP_SERVER_VERSION = "GP_SERVER_VERSION"
const CHECK_UPTODATE_TIME = 60

class File
{
   playerToDS = new Map<Player, GlobalDataStore>()
   globalPersistence: GlobalDataStore | undefined
   serverVersion = -1
   cachedServerVersion = -1

   nextServerVersionCheckTime = Workspace.DistributedGameTime + CHECK_UPTODATE_TIME
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

   Thread(
      function ()
      {
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
                  file.cachedServerVersion = file.serverVersion
                  print( "SERVER VERSION IS " + file.serverVersion )
               }
               else
               {
                  file.globalPersistence.SetAsync( GP_SERVER_VERSION, MATCHMAKE_SERVER_VERSION )
               }
            } )
      } )
}

export function IncrementServerVersion()
{
   if ( LOCAL )
      return

   file.nextServerVersionCheckTime = 0
   print( "\nIncrementServerVersion" )

   Thread(
      function ()
      {
         if ( !LobbyUpToDate() )
            return

         if ( file.serverVersion === -1 )
            return

         if ( file.globalPersistence === undefined )
            return

         print( "Incrementing server version" )
         file.globalPersistence.UpdateAsync( GP_SERVER_VERSION,
            function ( oldValue: unknown | undefined )
            {
               print( "Old value was " + oldValue )
               if ( typeOf( oldValue ) === 'number' )
                  return ( oldValue as number ) + 1

               return file.serverVersion + 1
            } )

         print( "...done!\n" )
         file.nextServerVersionCheckTime = 0
      } )
}

export function LobbyUpToDate(): boolean
{
   if ( LOCAL )
      return true
   if ( file.globalPersistence === undefined )
      return true
   if ( file.serverVersion === -1 )
      return true
   if ( IsReservedServer() )
      return true

   if ( Workspace.DistributedGameTime >= file.nextServerVersionCheckTime )
   {
      file.nextServerVersionCheckTime = Workspace.DistributedGameTime + CHECK_UPTODATE_TIME

      let serverVersion = file.globalPersistence.GetAsync( GP_SERVER_VERSION )
      if ( typeOf( serverVersion ) === 'number' )
         file.cachedServerVersion = ( serverVersion as number )
   }

   return file.cachedServerVersion === file.serverVersion
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
