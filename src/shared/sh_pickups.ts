import { IsServer, Thread, Distance, GetPosition, GraphCapped, RandomFloatRange, ArrayDistSorted } from "./sh_utils"
import { Assert } from "./sh_assert"
import { AddCallback_OnPlayerCharacterAdded } from "./sh_onPlayerConnect"
import { Workspace } from "@rbxts/services"
import { Tween } from "./sh_tween"

type PICKUPS = number
const PICKUP_DIST = 6

class File
{
   pickupsByIndex = new Map<PICKUPS, Array<Part>>()
   pickupTypesByIndex = new Map<PICKUPS, PickupType>()
   partToType = new Map<Part, PICKUPS>()

   //playerPickedUpFunc: ( player: Player, part: Part, index: PICKUPS ) => boolean = function ( player: Player, part: Part, index: PICKUPS ) { return true }

   playersCanPickup = true
   playerPickupDisabled = new Map<Player, boolean>()

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

export function SH_PickupsSetup()
{
   if ( IsServer() )
   {
      AddCallback_OnPlayerCharacterAdded(
         function ( player: Player )
         {
            Thread(
               function ()
               {
                  PlayerPickupCheck( player )
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
   if ( parts === undefined ) throw undefined
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

/*
export function SetplayerPickedUpFunc( func: ( player: Player, part: Part, index: PICKUPS ) => boolean )
{
   file.playerPickedUpFunc = func
}
*/

function PlayerCanPickup( player: Player ): boolean
{
   if ( file.playerPickupDisabled.has( player ) )
      return false
   if ( !file.playersCanPickup )
      return false
   if ( player.Character === undefined ) // disconnected?
      return false
   return true
}

function PlayerPickupCheck( player: Player )
{
   for ( ; ; )
   {
      wait()
      if ( player.Character === undefined ) // disconnected?
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

   pickups = ArrayDistSorted( GetPosition( player ), pickups, 75 ) as Array<Part>

   let searchTime = Workspace.DistributedGameTime + 2
   for ( ; ; )
   {
      TryToPickup( player, pickups.concat( [] ) )
      if ( Workspace.DistributedGameTime >= searchTime )
         return

      wait( 0.25 )
      if ( !PlayerCanPickup( player ) )
         return
   }
}

function TryToPickup( player: Player, withinDist: Array<Part> )
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

      let dist = Distance( player, pickup )

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
            let playerOrg = GetPosition( player )
            pickup.CanCollide = false
            pickup.Anchored = true
            //pickup.RotVelocity = new Vector3( RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ) )

            let pos = pickup.Position.add( new Vector3( 0, 3.5, 0 ) )
            let floatTime = 0.5
            Tween( pickup, { Position: pos, Orientation: new Vector3( RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ) ) }, floatTime, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
            wait( floatTime * 1.1 )

            let moveTime = 0.35
            let startTime = Workspace.DistributedGameTime
            let endTime = Workspace.DistributedGameTime + moveTime
            let startPos = pickup.Position

            Tween( pickup, { Size: pickup.Size.mul( new Vector3( 0.5, 0.5, 0.5 ) ), Orientation: new Vector3( RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ), RandomFloatRange( -300, 300 ) ) }, moveTime )

            for ( ; ; )
            {
               wait()

               if ( player.Character !== undefined )
                  playerOrg = GetPosition( player )

               let blend = GraphCapped( Workspace.DistributedGameTime, startTime, endTime, 0, 1 )
               pickup.Position = startPos.Lerp( playerOrg, blend )

               if ( Workspace.DistributedGameTime >= endTime )
                  break
            }

            pickup.Destroy()
         } )
   }
}

export function PickupsDisable()
{
   file.playersCanPickup = false
}

export function PickupsEnable()
{
   file.playersCanPickup = true
}

export function PlayerPickupsEnabled( player: Player )
{
   if ( file.playerPickupDisabled.has( player ) )
      file.playerPickupDisabled.delete( player )
}

export function PlayerPickupsDisabled( player: Player )
{
   file.playerPickupDisabled.set( player, true )
}
