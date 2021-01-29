import { IsServer, Thread, GraphCapped, RandomFloatRange } from "./sh_utils"
import { Assert } from "./sh_assert"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected } from "./sh_onPlayerConnect"
import { Workspace, Players } from "@rbxts/services"
import { Tween } from "./sh_tween"
import { ArrayDistSorted, GetPosition } from "./sh_utils_geometry"

type PICKUPS = number
const PICKUP_DIST = 6

class File
{
   pickupsByIndex = new Map<PICKUPS, Array<Part>>()
   pickupTypesByIndex = new Map<PICKUPS, PickupType>()
   partToType = new Map<Part, PICKUPS>()

   playerPickupEnabled = new Map<Player, boolean>()

   filterPlayerPickupsCallbacks = new Map<Player, Map<unknown, ( part: Part ) => boolean>>()
   filterPickupIndex = 0

   doneCreatingPickupTypes = false
}
let file = new File()

class PickupType
{
   readonly pickupType: PICKUPS
   didPickupFunc: ( player: Player, model: Part ) => boolean = function ( player: Player ) { return true }

   constructor( pickupType: PICKUPS )
   {
      this.pickupType = pickupType
   }
}

export function AddFilterPlayerPickupsCallback( filterIndex: unknown, player: Player, func: ( part: Part ) => boolean )
{
   let callbacks = file.filterPlayerPickupsCallbacks.get( player )
   if ( callbacks === undefined )
   {
      Assert( false, "No file.filterPlayerPickupsCallbacks for " + player.Name )
      throw undefined
   }
   callbacks.set( filterIndex, func )
}

export function DeleteFilterPlayerPickupsCallback( filterIndex: unknown )
{
   for ( let pair of file.filterPlayerPickupsCallbacks )
   {
      if ( pair[1].has( filterIndex ) )
         pair[1].delete( filterIndex )
   }
}

export function DeleteFilterPickupsForPlayer( filterIndex: unknown, player: Player )
{
   let callbacksMapByFilterIndex = file.filterPlayerPickupsCallbacks.get( player )
   if ( callbacksMapByFilterIndex === undefined )
   {
      Assert( false, "No file.filterPlayerPickupsCallbacks for " + player.Name )
      throw undefined
   }

   for ( let pair of callbacksMapByFilterIndex )
   {
      if ( pair[0] === filterIndex )
         callbacksMapByFilterIndex.delete( pair[0] )
   }
}

export function SH_PickupsSetup()
{
   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         let callbacks = new Map<unknown, ( part: Part ) => boolean>()
         file.filterPlayerPickupsCallbacks.set( player, callbacks )
         PlayerPickupsEnabled( player )
      } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         file.filterPlayerPickupsCallbacks.delete( player )
      } )

   if ( IsServer() )
   {
      AddCallback_OnPlayerCharacterAdded(
         function ( player: Player )
         {
            Thread(
               function ()
               {
                  PlayerPickupCheck( player, player.Character as Model )
               } )
         } )
   }

   Thread(
      function ()
      {
         wait() // would be a waittill end of frame
         file.doneCreatingPickupTypes = true
      } )
}

export function MakePartIntoPickup( part: Part, index: PICKUPS )
{
   Assert( file.pickupsByIndex.has( index ), "file.pickupsByIndex.has( index )" )
   Assert( file.pickupTypesByIndex.has( index ), "file.pickupTypesByIndex.has( index )" )

   let parts = file.pickupsByIndex.get( index )
   if ( parts === undefined )
   {
      Assert( false, "MakePartIntoPickup" )
      throw undefined
   }
   file.partToType.set( part, index )
   parts.push( part )
}

export function CreatePickupType( index: PICKUPS ): PickupType
{
   Assert( !file.doneCreatingPickupTypes, "!file.doneCreatingPickupTypes" )
   Assert( !file.pickupTypesByIndex.has( index ), "!file.pickupTypesByIndex.has( index )" )
   let pickupType = new PickupType( index )
   file.pickupTypesByIndex.set( index, pickupType )
   file.pickupsByIndex.set( index, [] )
   return pickupType
}

function PlayerCanPickup( player: Player ): boolean
{
   if ( !file.playerPickupEnabled.has( player ) )
      return false
   if ( player.Character === undefined ) // disconnected?
      return false
   return true
}

function PlayerPickupCheck( player: Player, character: Model )
{
   for ( ; ; )
   {
      wait()
      if ( player.Character === undefined ) // disconnected?
         return
      if ( player.Character !== character )
         return

      if ( PlayerCanPickup( player ) )
         PlayerTriesToPickup_Ammortized( player )
   }
}

function PlayerTriesToPickup_Ammortized( player: Player )
{
   let pickups: Array<Part> = []
   for ( let pair of file.pickupsByIndex )
   {
      pickups = pickups.concat( pair[1] )
   }
   //print( "Count " + pickups.size() )
   let callbacks = file.filterPlayerPickupsCallbacks.get( player )
   if ( callbacks === undefined )
   {
      Assert( false, "No callbacks for " + player.Name )
      throw undefined
   }

   if ( callbacks.size() > 1 )
      print( "WARNING: " + player.Name + " has " + callbacks.size() + " callbacks" )

   for ( let pair of callbacks )
   {
      pickups = pickups.filter( function ( pickup )
      {
         return pair[1]( pickup )
      } )
   }

   pickups = ArrayDistSorted( GetPosition( player ), pickups, 75 ) as Array<Part>

   let searchTime = Workspace.DistributedGameTime + 2
   for ( ; ; )
   {
      _TryToPickup( player, pickups.concat( [] ) )
      if ( Workspace.DistributedGameTime >= searchTime )
         return

      wait( 0.25 )
      if ( !PlayerCanPickup( player ) )
         return
   }
}

function _TryToPickup( player: Player, withinDist: Array<Part> )
{
   withinDist = ArrayDistSorted( GetPosition( player ), withinDist, PICKUP_DIST ) as Array<Part>

   for ( let pickup of withinDist )
   {
      // someone else might have picked this up since it was added to the list
      if ( !file.partToType.has( pickup ) )
         continue

      // try to pick them up
      let index = file.partToType.get( pickup ) as PICKUPS
      let pickupType = file.pickupTypesByIndex.get( index ) as PickupType
      if ( !pickupType.didPickupFunc( player, pickup ) )
         continue

      // pickup success
      file.partToType.delete( pickup )
      let pickups = file.pickupsByIndex.get( index ) as Array<Part>
      for ( let i = 0; i < pickups.size(); i++ )
      {
         let pick = pickups[i]
         if ( pick === pickup )
         {
            pickups.remove( i )
            i--
         }
      }

      Thread(
         function ()
         {
            wait( 2 )

            pickup.Destroy()
         } )
   }
}

/*
export function PickupsDisable()
{
   print( "PICKUPS GLOBALLY DISABLED (serv" + IsServer() + ")" )
   file.playersCanPickup = false
}

export function PickupsEnable()
{
   print( "PICKUPS GLOBALLY ENABLED (serv" + IsServer() + ")" )
   file.playersCanPickup = true
}
*/

export function PlayerPickupsDisabled( player: Player )
{
   //print( "PICKUPS DISABLED FOR " + player.Name + " serv" + IsServer() + " )" )
   if ( file.playerPickupEnabled.has( player ) )
      file.playerPickupEnabled.delete( player )
}

export function PlayerPickupsEnabled( player: Player )
{
   //print( "PICKUPS ENABLED FOR " + player.Name + " serv" + IsServer() + " )" )
   file.playerPickupEnabled.set( player, true )
}
