import { Players, SocialService, Workspace } from "@rbxts/services"
import { AddCallback_OnPlayerConnected } from "./sh_onPlayerConnect"
import { GetServerTime } from "./sh_time"
import { HttpService, TeleportService } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { ArrayFind, ArrayRandomize, GetLocalPlayer, IsClient, IsServer, Thread, UserIDToPlayer } from "shared/sh_utils"
import { AddNetVar, AddNetVarChangedCallback, GetNetVar_Number, GetNetVar_String, SetNetVar } from "./sh_player_netvars"
import { NETVAR_MATCHMAKING_PLACE_IN_LINE, MATCHMAKING_STATUS, NETVAR_MATCHMAKING_STATUS, NETVAR_JSON_TELEPORTDATA } from "./sh_gamestate"
import { AddRPC, SendRPC_Client } from "./sh_rpc"
import { DEV_SKIP, DEV_SKIP_MMTIME } from "./sh_settings"
import { IsReservedServer } from "./sh_reservedServer"

const LOCAL_PLAYER = GetLocalPlayer()

export class NameAndUserID
{
   name: string
   userId: number

   constructor( name: string, userId: number )
   {
      this.name = name
      this.userId = userId
   }
}

class TELEPORT_PlayerData
{
   fromReservedServer: boolean | undefined
   sendMeBackToLobby: boolean | undefined
   reservedServerPlayersByUserID: Array<NameAndUserID> = []

   amWaitingFor: Array<NameAndUserID> = []
   notWaitingFor: Array<number> = []
}

class File
{
   placesInLine: Array<Array<Player>> = []
   timeJoinedServer = new Map<Player, number>()
   sv_playerWroteTeleportData = new Map<Player, boolean>()
}
let file = new File()

export function SH_MatchmakingSetup()
{
   let blankTeleportData = new TELEPORT_PlayerData()
   AddNetVar( "string", NETVAR_JSON_TELEPORTDATA, HttpService.JSONEncode( blankTeleportData ) )

   if ( IsServer() )
   {
      SocialService.GameInvitePromptClosed.Connect(
         function ( player: Player, userIds: Array<number> ) 
         {
            Thread(
               function ()
               {
                  pcall(
                     function ()
                     {
                        let teleportData = GetTeleportData( player )

                        {
                           let amWaitingFor = teleportData.amWaitingFor
                           let userIdToPlayer = UserIDToPlayer()
                           for ( let userId of userIds )
                           {
                              let user = userIdToPlayer.get( userId )
                              let name
                              if ( user !== undefined )
                                 name = user.Name
                              else
                                 name = Players.GetNameFromUserIdAsync( userId )

                              let hasUser = false
                              for ( let i = 0; i < amWaitingFor.size(); i++ )
                              {
                                 if ( amWaitingFor[i].userId === userId )
                                 {
                                    hasUser = true
                                    break
                                 }
                              }
                              if ( !hasUser )
                                 amWaitingFor.push( new NameAndUserID( name, userId ) )
                           }
                        }

                        WriteTeleportData( player, teleportData )
                     } )
               } )
         } )

      AddRPC( "RPC_FromClient_NotWaitingFor",
         function ( player: Player, userId: number )
         {
            let teleportData = GetTeleportData( player )
            if ( ArrayFind( teleportData.notWaitingFor, userId ) === undefined )
            {
               teleportData.notWaitingFor.push( userId )
               WriteTeleportData( player, teleportData )
            }
         } )

      AddRPC( "RPC_FromClient_UpdateTeleportData",
         function ( player: Player, jsonStr: string )
         {
            // can only write this once
            if ( file.sv_playerWroteTeleportData.has( player ) )
               return
            file.sv_playerWroteTeleportData.set( player, true )
            if ( jsonStr !== "" )
               SetNetVar( player, NETVAR_JSON_TELEPORTDATA, jsonStr )
         } )


      {
         let playerIsInLine = new Map<Player, boolean>()
         AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS,
            function ( player: Player )
            {
               if ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_LFG )
               {
                  if ( !playerIsInLine.has( player ) )
                  {
                     AddPlayerToPlacesInLine( player )
                     playerIsInLine.set( player, true )
                  }
               }
               else
               {
                  if ( playerIsInLine.has( player ) )
                  {
                     RemovePlayerFromPlacesInLine( player )
                     playerIsInLine.delete( player )
                  }
               }
            } )

         Players.PlayerRemoving.Connect(
            function ( player: Player )
            {
               if ( playerIsInLine.has( player ) )
               {
                  RemovePlayerFromPlacesInLine( player )
                  playerIsInLine.delete( player )
               }
            } )
      }

      AddNetVarChangedCallback( NETVAR_JSON_TELEPORTDATA,
         function ( player: Player )
         {
            let teleportData = GetTeleportData( player )
            if ( teleportData.sendMeBackToLobby === true )
            {
               Thread(
                  function ()
                  {
                     for ( ; ; )
                     {
                        // click your heels three times
                        SendPlayersToLobby( [player] )
                        wait( 3 )
                     }
                  } )
            }

         } )

      Players.PlayerRemoving.Connect(
         function ( player: Player )
         {
            if ( file.sv_playerWroteTeleportData.has( player ) )
               file.sv_playerWroteTeleportData.delete( player )
         } )

   }
   else if ( IsClient() )
   {
      // data packaged with our teleport from previous server
      let playerData = TeleportService.GetLocalPlayerTeleportData()
      if ( playerData === undefined )
         SendRPC_Client( "RPC_FromClient_UpdateTeleportData", "" )
      else
         ClientUpdatesTeleportDataString( playerData as string )
   }

   // shared
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      file.timeJoinedServer.set( player, Workspace.DistributedGameTime )
   } )
}

export function GetPlayerJoinedServerTime( player: Player ): number
{
   let serverJoinTime = file.timeJoinedServer.get( player )
   if ( serverJoinTime === undefined )
   {
      Assert( false, "serverJoinTime === undefined" )
      throw undefined
   }

   return serverJoinTime
}

export function GetPlayerTimeOnServer( player: Player ): number
{
   return GetServerTime() - GetPlayerJoinedServerTime( player )
}


export function TeleportPlayers_ToNewReservedServer( players: Array<Player> )
{
   Assert( IsServer(), "Server only" )
   let code = TeleportService.ReserveServer( game.PlaceId )

   let data = new TELEPORT_PlayerData()
   let json = HttpService.JSONEncode( data )
   TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none", json )
}

export function TeleportPlayers_ToLobbyUpdate( players: Array<Player> )
{
   Assert( IsServer(), "Server only" )
   let code = TeleportService.ReserveServer( game.PlaceId )
   let data = new TELEPORT_PlayerData()
   data.sendMeBackToLobby = true

   let json = HttpService.JSONEncode( data )
   TeleportService.TeleportToPrivateServer( game.PlaceId, code[0], players, "none", json )
}

export function TeleportPlayers_BackToLobby( players: Array<Player> )
{
   Assert( IsServer(), "Server only" )
   let data = new TELEPORT_PlayerData()
   data.fromReservedServer = true

   let userIDs: Array<NameAndUserID> = []
   for ( let player of players )
   {
      let data = new NameAndUserID( player.Name, player.UserId )
      userIDs.push( data )
   }
   data.reservedServerPlayersByUserID = userIDs

   let json = HttpService.JSONEncode( data )
   TeleportService.TeleportPartyAsync( game.PlaceId, players, json )
}

export function WriteTeleportData( player: Player, data: TELEPORT_PlayerData )
{
   Assert( IsServer(), "IsServer()" )
   let jsonStr = HttpService.JSONEncode( data )
   SetNetVar( player, NETVAR_JSON_TELEPORTDATA, jsonStr )
}

export function GetTeleportData( player: Player ): TELEPORT_PlayerData
{
   let jsonStr = GetNetVar_String( player, NETVAR_JSON_TELEPORTDATA )
   let data = HttpService.JSONDecode( jsonStr ) as TELEPORT_PlayerData
   return data
}

export function IsFromReservedServer( player: Player ): boolean
{
   let teleportData = GetTeleportData( player )
   if ( teleportData === undefined )
      return false
   return teleportData.fromReservedServer === true
}

export function SendMeBackToLobby( player: Player ): boolean
{
   let teleportData = GetTeleportData( player )
   if ( teleportData === undefined )
      return false
   return teleportData.sendMeBackToLobby === true
}

export function GetOtherReservedServerUserIDs( player: Player ): Array<NameAndUserID>
{
   let teleportData = GetTeleportData( player )
   if ( teleportData === undefined )
      return []
   return teleportData.reservedServerPlayersByUserID
}

export function SendPlayersToLobby( players: Array<Player> )
{
   print( "SendPlayersToLobby " + players.size() + " count" )
   Assert( IsServer(), "IsServer()" )
   Assert( IsReservedServer(), "IsReservedServer()" )
   Thread( function ()
   {
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY )
      }

      wait( 1 ) // fade to black

      TeleportPlayers_BackToLobby( players )
   } )
}

export function GetAmWaitingFor( player: Player, teleportData: TELEPORT_PlayerData ): Map<number, NameAndUserID>
{
   let amWaitingFor = new Map<number, NameAndUserID>()
   for ( let data of teleportData.amWaitingFor )
   {
      amWaitingFor.set( data.userId, data )
   }

   for ( let data of teleportData.reservedServerPlayersByUserID )
   {
      if ( data.userId === player.UserId )
         continue
      if ( player.IsFriendsWith( data.userId ) )
         amWaitingFor.set( data.userId, data )
   }

   for ( let userId of teleportData.notWaitingFor )
   {
      if ( amWaitingFor.has( userId ) )
         amWaitingFor.delete( userId )
   }

   return amWaitingFor
}

export function ClientUpdatesTeleportData( playerData: TELEPORT_PlayerData )
{
   Assert( IsClient(), "IsClient()" )
   let jsonStr = HttpService.JSONEncode( playerData )
   ClientUpdatesTeleportDataString( jsonStr )
}

function ClientUpdatesTeleportDataString( teleportDataJSON: string )
{
   Assert( IsClient(), "IsClient()" )
   Assert( typeOf( teleportDataJSON ) === 'string', "typeOf( playerData ) === 'string'" )
   SendRPC_Client( "RPC_FromClient_UpdateTeleportData", teleportDataJSON )
}

function ArrayHas_NameAndUserID( arr: Array<NameAndUserID>, userId: number ): boolean
{
   for ( let data of arr )
   {
      if ( data.userId === userId )
         return true
   }
   return false
}


function _SortPlayersByServerTime( a: Player, b: Player )
{
   return ( file.timeJoinedServer.get( a ) as number ) < ( file.timeJoinedServer.get( b ) as number )
}


export function SortPlayersByServerTime( players: Array<Player> )
{
   players.sort( _SortPlayersByServerTime )
}

class Party
{
   //lowestJoinedServerTime: number
   placeInLine: number
   players: Array<Player>
   constructor( players: Array<Player> )
   {
      Assert( players.size() > 0, "players.size() > 0" )
      this.placeInLine = GetNetVar_Number( players[0], NETVAR_MATCHMAKING_PLACE_IN_LINE )
      this.players = players
      players.sort( _SortPlayersByServerTime )
      //this.lowestJoinedServerTime = ( file.timeJoinedServer.get( players[0] ) as number )
   }
}

export function ServerAttemptToMatchPlayers( players: Array<Player>, matchCount: number )
{
   print( "\nTry Matchmake " + players.size() + " players" )
   Assert( IsServer(), "IsServer()" )
   Assert( players.size() >= matchCount, "players.size() >= matchCount" )

   let playerToTeleportData = new Map<Player, TELEPORT_PlayerData>()
   let playerToAmWaitingFor = new Map<Player, Map<number, NameAndUserID>>()
   for ( let player of players )
   {
      let teleportData = GetTeleportData( player )
      playerToTeleportData.set( player, teleportData )
      playerToAmWaitingFor.set( player, GetAmWaitingFor( player, teleportData ) )
   }

   let readyPlayersByID = new Map<number, Player>()

   function AddPlayersThatHaveBeenOnServerLongEnough()
   {
      const MATCHMAKING_MIN_TIME_ON_SERVER_FROMRESERVED = 10
      const MATCHMAKING_MIN_TIME_ON_SERVER_FRESH = 15

      // get all the players that have been on the server long enough
      for ( let player of players )
      {
         let teleportData = playerToTeleportData.get( player ) as TELEPORT_PlayerData
         let timeOnServer = Workspace.DistributedGameTime - ( file.timeJoinedServer.get( player ) as number )
         print( "timeOnServer " + player.Name + ": " + timeOnServer )

         if ( !DEV_SKIP_MMTIME )
         {
            if ( teleportData.fromReservedServer === true )
            {
               if ( timeOnServer < MATCHMAKING_MIN_TIME_ON_SERVER_FROMRESERVED )
                  continue
            }
            else
            {
               if ( timeOnServer < MATCHMAKING_MIN_TIME_ON_SERVER_FRESH )
                  continue
            }
         }

         print( "Added " + player.Name )
         readyPlayersByID.set( player.UserId, player )
      }
   }

   function RemovePlayersThatAreWaitingForUnavailablePlayers()
   {
      // delete all the players that are waiting for people that are not ready
      for ( ; ; )
      {
         let deletedUserId = false
         for ( let pair of readyPlayersByID )
         {
            let player = pair[1]
            let amWaitingFor = playerToAmWaitingFor.get( player )
            if ( amWaitingFor === undefined )
            {
               Assert( false, "playerToAmWaitingFor.get( player ) undefined" )
               throw undefined
            }

            if ( !amWaitingFor.size() )
               continue

            let waitingForOfflinePlayer = false
            for ( let pair of amWaitingFor )
            {
               if ( !readyPlayersByID.has( pair[1].userId ) )
               {
                  waitingForOfflinePlayer = true
                  break
               }
            }

            if ( waitingForOfflinePlayer && readyPlayersByID.has( player.UserId ) )
            {
               readyPlayersByID.delete( player.UserId )
               deletedUserId = true
            }
         }

         if ( !deletedUserId )
            break
      }
   }

   function BuildParties(): Array<Party>
   {
      let playerToParty = new Map<Player, Party>()
      let parties: Array<Party> = []
      for ( let pair of readyPlayersByID )
      {
         let player = pair[1]
         if ( playerToParty.has( player ) )
            continue

         let amWaitingFor = playerToAmWaitingFor.get( player )
         if ( amWaitingFor === undefined )
         {
            Assert( false, "playerToAmWaitingFor.get( player ) undefined" )
            throw undefined
         }

         let partiers: Array<Player> = []
         {
            partiers.push( player )
            for ( let awaitingPair of amWaitingFor )
            {
               let otherPartier = readyPlayersByID.get( awaitingPair[0] )
               if ( otherPartier === undefined )
               {
                  Assert( false, "let otherPartier = readyPlayersByID.get( awaitingPair[0] )" )
                  throw undefined
               }
               partiers.push( otherPartier )
            }
         }

         let party = new Party( partiers )
         parties.push( party )
         for ( let partier of partiers )
         {
            Assert( !playerToParty.has( partier ), "!playerToParty.has( partier )" )
            playerToParty.set( partier, party )
         }
      }

      return parties
   }

   AddPlayersThatHaveBeenOnServerLongEnough()
   print( "AddPlayersThatHaveBeenOnServerLongEnough: " + readyPlayersByID.size() )

   RemovePlayersThatAreWaitingForUnavailablePlayers()
   print( "RemovePlayersThatAreWaitingForUnavailablePlayers: " + readyPlayersByID.size() )

   let parties = BuildParties() // includes parties of 1
   print( "BuildParties: " + parties.size() )
   let matchingParties = TryToMatchmakeParties( parties, matchCount )
   print( "TryToMatchmakeParties: " + matchingParties )
   if ( matchingParties === undefined )
      return undefined
   let matchedPlayers: Array<Player> = []
   for ( let party of matchingParties )
   {
      matchedPlayers = matchedPlayers.concat( party.players )
   }

   Assert( matchedPlayers.size() === matchCount, "matchedPlayers.size() === matchCount" )
   print( "matchedPlayers: " + matchedPlayers.size() )
   return matchedPlayers
}

function TryToMatchmakeParties( parties: Array<Party>, desiredPlayerCount: number ): Array<Party> | undefined
{
   // enough players to even bother?
   let playerCount = 0
   for ( let party of parties )
   {
      playerCount += party.players.size()
   }
   if ( playerCount < desiredPlayerCount )
      return undefined

   parties.sort( SortParties )

   // try sorted first
   let mmTry = GetPartiesThatFitPlayerCount( parties, desiredPlayerCount )
   if ( mmTry !== undefined )
      return mmTry

   // try random configurations then
   for ( let i = 0; i < 10; i++ )
   {
      ArrayRandomize( parties )
      let mmTry = GetPartiesThatFitPlayerCount( parties, desiredPlayerCount )
      if ( mmTry !== undefined )
         return mmTry
   }

   return undefined
}


function GetPartiesThatFitPlayerCount( parties: Array<Party>, playerCount: number ): Array<Party> | undefined
{
   let count = 0
   let matchmadeParties = parties.filter( function ( party )
   {
      if ( count + party.players.size() <= playerCount )
      {
         count += party.players.size()
         return true
      }

      return false
   } )

   if ( count === playerCount )
      return matchmadeParties

   return undefined
}

function SortParties( a: Party, b: Party )
{
   // bigger parties served faster
   if ( a.players.size() < b.players.size() )
      return true
   if ( a.players.size() > b.players.size() )
      return false
   return a.placeInLine < b.placeInLine
}

function UpdatePlacesInLine()
{
   print( "PIL UpdatePlacesInLine" )
   let updated = new Map<Player, boolean>()
   let count = 1
   for ( let players of file.placesInLine )
   {
      for ( let player of players )
      {
         print( "PIL " + player.Name + " place in line:" + count )
         SetNetVar( player, NETVAR_MATCHMAKING_PLACE_IN_LINE, count )
         updated.set( player, true )
      }

      count += players.size()
   }

   for ( let player of Players.GetPlayers() )
   {
      if ( !updated.has( player ) )
      {
         print( "PIL " + player.Name + " is not in line" )
         SetNetVar( player, NETVAR_MATCHMAKING_PLACE_IN_LINE, -1 )
      }
   }
}

function GetTotalPlayersInLine(): number 
{
   let total = 0
   for ( let players of file.placesInLine )
   {
      total += players.size()
   }
   print( "PIL: GetTotalPlayersInLine " + total )
   return total
}

function RemovePlayerFromPlacesInLine( player: Player )
{
   print( "PIL: RemovePlayerFromPlacesInLine: " + player.Name )

   function _()
   {
      for ( let i = 0; i < file.placesInLine.size(); i++ )
      {
         file.placesInLine[i] = file.placesInLine[i].filter( function ( otherPlayer )
         {
            return otherPlayer !== player
         } )
      }

      file.placesInLine = file.placesInLine.filter( function ( players )
      {
         return players.size() > 0
      } )

      UpdatePlacesInLine()
   }


   let oldTotal = GetTotalPlayersInLine()
   _()
   let newTotal = GetTotalPlayersInLine()
   Assert( newTotal === oldTotal - 1, "newTotal (" + newTotal + ") === oldTotal (" + oldTotal + ") - 1" )
}

function AddPlayerToPlacesInLine( player: Player )
{
   print( "PIL: AddPlayerToPlacesInLine: " + player.Name )

   function _()
   {
      // cut in line if a friend is in line
      for ( let players of file.placesInLine )
      {
         for ( let other of players )
         {
            if ( other !== player && player.IsFriendsWith( other.UserId ) )
            {
               players.push( player )
               UpdatePlacesInLine()
               return
            }
         }
      }

      file.placesInLine.push( [player] ) // add a new places-in-line
      UpdatePlacesInLine()
   }

   let oldTotal = GetTotalPlayersInLine()
   _()
   let newTotal = GetTotalPlayersInLine()
   Assert( newTotal === oldTotal + 1, "newTotal (" + newTotal + ") === oldTotal (" + oldTotal + ") - 1" )
}