import { DataStoreService } from "@rbxts/services";
import { LOCAL } from "shared/sh_gamestate";
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect";
import { SetScore } from "shared/sh_score";
import { IsReservedServer, Thread } from "shared/sh_utils";

const PERSISTENCE = "PERSISTENCE"
const COINS = "_COINS"

class File
{
   playerToDS = new Map<Player, GlobalDataStore>()
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
               let ds = DataStoreService.GetDataStore( PERSISTENCE, pkey )
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
