import { Game, AddGameStateChangedCallback, GAME_STATE, AddGameCreatedCallback } from "./sh_gamestate"
import { RunService } from "@rbxts/services"
import { GetAllRooms } from "./sh_rooms"
import { IsServer, Thread } from "./sh_utils"
import { Assert } from "./sh_assert"

type PICKUPS = number

class File
{
   gameToPickupConnection = new Map<Game, RBXScriptConnection>()
   gameToPickupPartsByTypeAndRoom = new Map<Game, Map<PICKUPS, Array<Part>>>()
   pickupTypeToPickup = new Map<PICKUPS, Pickup>()
   doneCreatingPickupTypes = false
}
let file = new File()

class Pickup
{
   readonly pickupType: PICKUPS
   canPickupFunc: ( player: Player, game: Game ) => boolean = function ( player: Player, game: Game ) { return true }
   onPickupFunc: ( player: Player, game: Game ) => void = function ( player: Player, game: Game ) { }

   constructor( pickupType: PICKUPS )
   {
      this.pickupType = pickupType
   }
}

export function SH_PickupsSetup()
{
   if ( IsServer() )
   {
      let rooms = GetAllRooms()

      AddGameStateChangedCallback(
         function ( game: Game )
         {
            if ( file.gameToPickupConnection.has( game ) )
            {
               let connection = file.gameToPickupConnection.get( game ) as RBXScriptConnection
               connection.Disconnect()
            }

            if ( game.GetGameState() !== GAME_STATE.GAME_STATE_PLAYING )
               return

            let connection = RunService.RenderStepped.Connect(
               function ()
               {

               } )

            file.gameToPickupConnection.set( game, connection )
         } )

      AddGameCreatedCallback(

         // fill the pickups for the game
         function ( game: Game )
         {
            let mapping = new Map<PICKUPS, Array<Part>>()
            file.gameToPickupPartsByTypeAndRoom.set( game, mapping )
            for ( let pair of file.pickupTypeToPickup )
            {
               mapping.set( pair[0], [] )
            }
         } )
   }

   Thread(
      function ()
      {
         wait() // would be a waittill end of frame
         file.doneCreatingPickupTypes = true
      } )
}

export function AddPickupToGame( pickup: Part, pickupType: PICKUPS, game: Game )
{
   Assert( file.pickupTypeToPickup.has( pickupType ), "file.pickupTypeToPickup.has( pickupType )" )
   Assert( file.gameToPickupPartsByTypeAndRoom.has( game ), "file.gameToPickupPartsByTypeAndRoom.has( game )" )
   let mapping = file.gameToPickupPartsByTypeAndRoom.get( game )
   if ( mapping === undefined ) throw undefined
   Assert( mapping.has( pickupType ), "mapping.has( pickupType )" )
   let pickupArray = mapping.get( pickupType )
   if ( pickupArray === undefined ) throw undefined
   pickupArray.push( pickup )
}

export function CreatePickupType( pickupType: PICKUPS ): Pickup
{
   Assert( !file.doneCreatingPickupTypes, "!file.doneCreatingPickupTypes" )
   Assert( !file.pickupTypeToPickup.has( pickupType ), "!file.pickupTypeToPickup.has( pickupType )" )
   let pickup = new Pickup( pickupType )
   file.pickupTypeToPickup.set( pickupType, pickup )
   return pickup
}