import { HttpService, Players, Workspace } from "@rbxts/services"
import { AddNetVar, GetNetVar_Number, GetNetVar_String, SetNetVar } from "shared/sh_player_netvars"
import { Assert, IsServer, IsClient, UserIDToPlayer, IsAlive } from "./sh_utils"

export const NETVAR_JSON_TASKLIST = "JS_TL"
export const NETVAR_MATCHMAKING_STATUS = "MMS"
export const NETVAR_MATCHMAKING_NUMWITHYOU = "N_WY"
export const NETVAR_JSON_GAMESTATE = "E_GS"

export type COSTUME_INDEX = number

export enum MATCHMAKING_STATUS
{
   MATCHMAKING_PRACTICE = 0,
   MATCHMAKING_LFG,
   MATCHMAKING_PLAYING
}

export enum ROLE
{
   ROLE_CAMPER = 0,
   ROLE_POSSESSED,
   ROLE_SPECTATOR
}

export enum GAME_STATE
{
   GAME_STATE_UNKNOWN = 0,
   GAME_STATE_PREMATCH,
   GAME_STATE_PLAYING,
   GAME_STATE_VOTING,
   GAME_STATE_COMPLETE,
}

class NETVAR_Corpse
{
   userId: number
   X: number
   Y: number
   Z: number

   constructor( player: Player, pos: Vector3 )
   {
      this.userId = player.UserId
      this.X = pos.X
      this.Y = pos.Y
      this.Z = pos.Z
   }
}


export class Assignment
{
   roomName: string
   taskName: string
   status: number

   constructor( roomName: string, taskName: string, status: number )
   {
      this.roomName = roomName
      this.taskName = taskName
      this.status = status
   }
}

export class NETVAR_GameState
{
   playerInfos: Array<NETVAR_GamePlayerInfo>
   state: GAME_STATE
   corpses: Array<NETVAR_Corpse>

   constructor( state: GAME_STATE, playerInfos: Array<NETVAR_GamePlayerInfo>, corpses: Array<NETVAR_Corpse> )
   {
      this.state = state
      this.playerInfos = playerInfos
      this.corpses = corpses
   }
}


// sent to the client and updated on change, even if a player is no longer on the server
class NETVAR_GamePlayerInfo
{
   id: number
   costume: COSTUME_INDEX
   name: string
   role: ROLE

   constructor( player: Player, costume: COSTUME_INDEX, role: ROLE )
   {
      this.id = player.UserId
      this.name = player.Name
      this.costume = costume
      this.role = role
   }
}

export class Corpse
{
   player: Player
   pos: Vector3
   clientModel: Model | undefined

   constructor( player: Player, pos: Vector3 )
   {
      this.player = player
      this.pos = pos
   }
}

export class PlayerInfo
{
   costume: COSTUME_INDEX
   player: Player
   role: ROLE

   constructor( player: Player, costume: COSTUME_INDEX, role: ROLE )
   {
      this.player = player
      this.costume = costume
      this.role = role
   }
}


export class Game
{
   creationTime = Workspace.DistributedGameTime

   //////////////////////////////////////////////////////
   // 
   //    SERVER   ONLY
   // 
   //////////////////////////////////////////////////////
   assignments = new Map<Player, Array<Assignment>>()

   private SendGamestateToPlayers( players: Array<Player>, gs: NETVAR_GameState )
   {
      let json = HttpService.JSONEncode( gs )
      for ( let player of players )
      {
         SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
      }
   }

   public BroadcastGamestate()
   {
      print( "\nBroadcastGamestate " + this.creationTime )
      for ( let pair of this.playerToInfo )
      {
         print( "Role check: player " + pair[0].Name + " has role: " + pair[1].role )
      }

      Assert( IsServer(), "Server only" )
      let corpses: Array<NETVAR_Corpse> = []
      for ( let corpse of this.corpses )
      {
         corpses.push( new NETVAR_Corpse( corpse.player, corpse.pos ) )
      }

      {
         // tell the campers about everyone, but mask the possessed
         let infos: Array<NETVAR_GamePlayerInfo> = []
         for ( let pair of this.playerToInfo )
         {
            let role = pair[1].role
            if ( role === ROLE.ROLE_POSSESSED )
            {
               role = ROLE.ROLE_CAMPER
               Assert( pair[1].role === ROLE.ROLE_POSSESSED, "Role changed!!" )
            }
            infos.push( new NETVAR_GamePlayerInfo( pair[0], -1, role ) )
         }

         let gs = new NETVAR_GameState( this.gameState, infos, corpses )
         this.SendGamestateToPlayers( this.GetCampers(), gs )
      }

      {
         let infos: Array<NETVAR_GamePlayerInfo> = []
         for ( let pair of this.playerToInfo )
         {
            print( "Sending player " + pair[0].Name + " info with role: " + pair[1].role )

            let role = pair[1].role
            infos.push( new NETVAR_GamePlayerInfo( pair[0], -1, role ) )
         }

         let gs = new NETVAR_GameState( this.gameState, infos, corpses )
         this.SendGamestateToPlayers( this.GetPossessed(), gs )
         this.SendGamestateToPlayers( this.GetSpectators(), gs )
      }
   }

   private GameStateChanged()
   {
      Assert( IsServer(), "Server only" )
      this.BroadcastGamestate()
   }

   public SetGameState( state: GAME_STATE )
   {
      Assert( IsServer(), "Server only" )
      this.gameState = state
      this.GameStateChanged()
   }

   public IncrementGameState()
   {
      Assert( IsServer(), "Server only" )
      this.gameState++
      this.GameStateChanged()
   }

   public GetLivingPlayers(): Array<Player>
   {
      let players: Array<Player> = []
      for ( let pair of this.playerToInfo )
      {
         let player = pair[0]
         let playerInfo = pair[1]
         if ( !IsAlive( player ) )
            continue

         switch ( playerInfo.role )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_POSSESSED:
               players.push( player )
               break
         }
      }
      return players
   }

   public RemovePlayer( player: Player )
   {
      Assert( this.playerToInfo.has( player ), "Player is not in game" )
      print( "Removed player " + player.Name )
      this.playerToInfo.delete( player )
   }



   //////////////////////////////////////////////////////
   // 
   //    SHARED
   // 
   //////////////////////////////////////////////////////
   private gameState: GAME_STATE = GAME_STATE.GAME_STATE_PREMATCH
   private playerToInfo = new Map<Player, PlayerInfo>()
   corpses: Array<Corpse> = []

   public HasPlayer( player: Player ): boolean
   {
      for ( let pair of this.playerToInfo )
      {
         if ( pair[0] === player )
            return true
      }
      return false
   }

   public SetPlayerRole( player: Player, role: ROLE )
   {
      Assert( this.playerToInfo.has( player ), "Game does not have " + player.Name )
      let playerInfo = this.playerToInfo.get( player ) as PlayerInfo
      print( this.creationTime + ": Set player " + player.Name + " role from " + playerInfo.role + " to " + role )
      playerInfo.role = role
      this.playerToInfo.set( player, playerInfo )
   }

   public GetAllPlayers(): Array<Player>
   {
      let players: Array<Player> = []
      for ( let pair of this.playerToInfo )
      {
         players.push( pair[0] )
      }
      print( "GetAllPlayers found " + players.size() )
      return players
   }

   public GetCampers(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_CAMPER )
   }

   public GetPossessed(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_POSSESSED )
   }

   public GetSpectators(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR )
   }

   public GetPlayersOfRole( role: ROLE ): Array<Player>
   {
      let players: Array<Player> = []
      for ( let pair of this.playerToInfo )
      {
         if ( pair[1].role === role )
            players.push( pair[0] )
      }
      return players
   }

   public AddPlayer( player: Player, role: ROLE )
   {
      Assert( !this.playerToInfo.has( player ), "Game already has " + player.Name )
      let playerInfo = new PlayerInfo( player, -1, role )
      print( "AddPlayer with role " + role )
      this.playerToInfo.set( player, playerInfo )
   }

   public GetPlayerRole( player: Player ): ROLE
   {
      Assert( this.playerToInfo.has( player ), "Game does not have " + player.Name )
      return ( this.playerToInfo.get( player ) as PlayerInfo ).role
   }

   public GetGameState()
   {
      return this.gameState
   }



   //////////////////////////////////////////////////////
   // 
   //    CLIENT   ONLY
   // 
   //////////////////////////////////////////////////////
   public NetvarToGamestate()
   {
      //print( "\nNetvarToGamestate" )
      //print( "1 Players currently in my game: " + this.playerToInfo.size() )

      Assert( IsClient(), "Client only" )
      let json = GetNetVar_String( Players.LocalPlayer, NETVAR_JSON_GAMESTATE )
      let gs = HttpService.JSONDecode( json ) as NETVAR_GameState
      //print( "\njson: " + json + "\n" )

      let userIdToPlayer = UserIDToPlayer()

      let sentPlayers = new Map<Player, boolean>()

      for ( let playerInfo of gs.playerInfos )
      {
         let player = userIdToPlayer.get( playerInfo.id )
         if ( player === undefined )
            continue
         sentPlayers.set( player, true )

         if ( this.HasPlayer( player ) )
            this.SetPlayerRole( player, playerInfo.role )
         else
            this.AddPlayer( player, playerInfo.role )

         //this.playerToInfo.set( player, new PlayerInfo( player, playerInfo.costume, playerInfo.role ) )
         //print( "Set " + player.Name + " role to " + playerInfo.role )
      }

      // remove players that were not sent
      for ( let pair of this.playerToInfo )
      {
         if ( sentPlayers.has( pair[0] ) )
            continue
         this.playerToInfo.delete( pair[0] )
      }

      let hasCorpse = new Map<Player, boolean>()
      for ( let corpse of this.corpses )
      {
         hasCorpse.set( corpse.player, true )
      }

      let sentCorpse = new Map<Player, boolean>()
      for ( let corpseInfo of gs.corpses )
      {
         let player = userIdToPlayer.get( corpseInfo.userId )
         if ( player === undefined )
            continue
         sentCorpse.set( player, true )

         if ( hasCorpse.has( player ) )
            continue

         this.corpses.push( new Corpse( player, new Vector3( corpseInfo.X, corpseInfo.Y, corpseInfo.Z ) ) )
      }

      // remove corpses that are no longer sent
      for ( let i = 0; i < this.corpses.size(); i++ )
      {
         let corpse = this.corpses[i]
         if ( sentCorpse.has( corpse.player ) )
            continue

         let clientModel = corpse.clientModel
         if ( clientModel !== undefined )
            clientModel.Destroy()

         this.corpses.remove( i )
         i--
      }

      //print( "2 Players currently in my game: " + this.playerToInfo.size() )
   }
}


export function AddGameStateNetVars()
{
   AddNetVar( "string", NETVAR_JSON_TASKLIST, "{}" )
   AddNetVar( "number", NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_PRACTICE )
   AddNetVar( "number", NETVAR_MATCHMAKING_NUMWITHYOU, 0 )
   AddNetVar( "string", NETVAR_JSON_GAMESTATE, "{}" )
}

export function IsPracticing( player: Player ): boolean
{
   return GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) === MATCHMAKING_STATUS.MATCHMAKING_PRACTICE
}
