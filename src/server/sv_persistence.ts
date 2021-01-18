import { DataStoreService, RunService, Workspace } from "@rbxts/services";
import { Assert } from "shared/sh_assert";
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect";
import { MATCHMAKE_SERVER_VERSION } from "shared/sh_settings";
import { Thread } from "shared/sh_utils";

const LOCAL = RunService.IsStudio()
const PPRSTYPE_META = "PERSISTENCE"
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
         Thread(
            function ()
            {
               pcall(
                  function ()
                  {
                     let pkey = GetPlayerKey( player )
                     let ds = DataStoreService.GetDataStore( PPRSTYPE_META, pkey )
                     file.playerToDS.set( player, ds )
                  } )
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

   Assert( !LOCAL, "!LOCAL" )
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


export function GetPlayerPersistence_Number( player: Player, field: string, _default: number ): number
{
   if ( LOCAL )
      return _default

   pcall(
      function ()
      {
         let ds = file.playerToDS.get( player )
         if ( ds === undefined )
            return

         let value = ds.GetAsync( field )
         if ( typeOf( value ) === 'number' )
            _default = value as number
      } )

   return _default
}

export function GetPlayerPersistence_Boolean( player: Player, field: string, _default: boolean ): boolean
{
   if ( LOCAL )
      return _default

   pcall(
      function ()
      {
         let ds = file.playerToDS.get( player )
         if ( ds === undefined )
            return

         let value = ds.GetAsync( field )
         if ( typeOf( value ) === 'boolean' )
            _default = value as boolean
      } )

   return _default
}

export function IncrementPlayerPersistence( player: Player, field: string, amount: number )
{
   if ( LOCAL )
      return

   Thread(
      function ()
      {
         pcall(
            function ()
            {
               let ds = file.playerToDS.get( player )
               if ( ds === undefined )
                  return

               if ( typeOf( ds.GetAsync( field ) ) === 'number' )
                  ds.IncrementAsync( field, amount )
               else
                  ds.SetAsync( field, amount )
            } )
      } )
}

export function SetPlayerPersistence( player: Player, field: string, value: unknown )
{
   if ( LOCAL )
      return

   Thread(
      function ()
      {
         pcall(
            function ()
            {
               let ds = file.playerToDS.get( player )
               if ( ds !== undefined )
                  ds.SetAsync( field, value )
            } )
      } )
}