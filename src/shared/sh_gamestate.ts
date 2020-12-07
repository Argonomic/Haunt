import { HttpService, Players, Workspace } from "@rbxts/services"
import { AddNetVar, GetNetVar_Number, GetNetVar_String, SetNetVar } from "shared/sh_player_netvars"
import { MEETING_DISCUSS_TIME, MEETING_RESULTS_TIME, MEETING_VOTE_TIME, SPECTATOR_TRANS } from "./sh_settings"
import { Assert, IsServer, IsClient, UserIDToPlayer, IsAlive, SetPlayerTransparencyAndColor } from "./sh_utils"

export const NETVAR_JSON_TASKLIST = "JS_TL"
export const NETVAR_MATCHMAKING_STATUS = "MMS"
export const NETVAR_MATCHMAKING_NUMWITHYOU = "N_WY"
export const NETVAR_JSON_GAMESTATE = "E_GS"

export enum USETYPES 
{
   USETYPE_TASK = 0,
   USETYPE_KILL,
   USETYPE_REPORT,
}

export enum GAMERESULTS
{
   RESULTS_IN_PROGRESS = 0,
   RESULTS_NO_WINNER,
   RESULTS_POSSESSED_WIN,
   RESULTS_CAMPERS_WIN,
}

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
   GAME_STATE_MEETING_DISCUSS,
   GAME_STATE_MEETING_VOTE,
   GAME_STATE_MEETING_RESULTS,
   GAME_STATE_COMPLETE,
   GAME_STATE_DEAD,
}

export const MEETING_TYPE_EMERGENCY = 0
export const MEETING_TYPE_REPORT = 1

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

class NETVAR_Vote
{
   voterUserId: number
   targetUserId: number | undefined

   constructor( voterUserId: number, targetUserId: number | undefined )
   {
      this.voterUserId = voterUserId
      this.targetUserId = targetUserId
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

class NETVAR_GameState
{
   playerInfos: Array<NETVAR_GamePlayerInfo>
   gameState: GAME_STATE
   gsChangedTime: number
   corpses: Array<NETVAR_Corpse>
   votes: Array<NETVAR_Vote>
   meetingCallerUserId: number | undefined
   meetingType: number | undefined
   serverTime: number

   constructor( game: Game, playerInfos: Array<NETVAR_GamePlayerInfo>, corpses: Array<NETVAR_Corpse>, votes: Array<NETVAR_Vote> )
   {
      this.gameState = game.GetGameState()
      this.gsChangedTime = game.GetGameStateChangedTime()
      this.playerInfos = playerInfos
      this.corpses = corpses
      this.votes = votes
      this.serverTime = Workspace.DistributedGameTime
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


export class PlayerVote
{
   voter: Player
   target: Player | undefined

   constructor( voter: Player, target: Player | undefined )
   {
      this.voter = voter
      this.target = target
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

   meetingCaller: Player | undefined
   meetingType: number | undefined

   gameThread: thread | undefined
   playerToSpawnLocation = new Map<Player, Vector3>()

   public UpdateGame()
   {
      if ( this.gameThread === undefined )
         return

      coroutine.resume( this.gameThread )
   }

   public ClearVotes()
   {
      Assert( IsServer(), "Server expected" )
      this.votes = []
   }

   public GetGameResults()
   {
      let game = this
      let possessed = game.GetPossessed().size()
      let campers = game.GetCampers().size()
      if ( possessed === 0 )
      {
         if ( campers === 0 )
            return GAMERESULTS.RESULTS_NO_WINNER
         return GAMERESULTS.RESULTS_CAMPERS_WIN
      }

      if ( campers === 0 )
         return GAMERESULTS.RESULTS_POSSESSED_WIN

      if ( possessed >= campers )
         return GAMERESULTS.RESULTS_POSSESSED_WIN

      return GAMERESULTS.RESULTS_IN_PROGRESS
   }

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
      /*print( "\nBroadcastGamestate " + this.creationTime )
      for ( let pair of this.playerToInfo )
      {
         print( "Role check: player " + pair[0].Name + " has role: " + pair[1].role )
      }*/

      Assert( IsServer(), "Server only" )
      let corpses: Array<NETVAR_Corpse> = []
      for ( let corpse of this.corpses )
      {
         corpses.push( new NETVAR_Corpse( corpse.player, corpse.pos ) )
      }

      let votes: Array<NETVAR_Vote> = []
      for ( let vote of this.votes )
      {
         let result = vote.target
         if ( result === undefined )
            votes.push( new NETVAR_Vote( vote.voter.UserId, undefined ) )
         else
            votes.push( new NETVAR_Vote( vote.voter.UserId, result.UserId ) )
      }

      let gameStateToRole = new Map<ROLE, NETVAR_GameState>()

      {
         // tell the campers about everyone, but mask the possessed
         let infos: Array<NETVAR_GamePlayerInfo> = []
         for ( let pair of this.playerToInfo )
         {
            let role = pair[1].role
            if ( role === ROLE.ROLE_POSSESSED )
               role = ROLE.ROLE_CAMPER

            infos.push( new NETVAR_GamePlayerInfo( pair[0], -1, role ) )
         }

         let gs = new NETVAR_GameState( this, infos, corpses, votes )
         gameStateToRole.set( ROLE.ROLE_CAMPER, gs )
      }

      {
         let infos: Array<NETVAR_GamePlayerInfo> = []
         for ( let pair of this.playerToInfo )
         {
            infos.push( new NETVAR_GamePlayerInfo( pair[0], -1, pair[1].role ) )
         }

         let gs = new NETVAR_GameState( this, infos, corpses, votes )
         gameStateToRole.set( ROLE.ROLE_POSSESSED, gs )
         gameStateToRole.set( ROLE.ROLE_SPECTATOR, gs )
      }

      if ( this.meetingCaller )
      {
         for ( let pair of gameStateToRole )
         {
            let gs = pair[1]
            gs.meetingCallerUserId = this.meetingCaller.UserId
            gs.meetingType = this.meetingType
         }
      }

      for ( let pair of gameStateToRole )
      {
         let players = this.GetPlayersOfRole( pair[0] )
         this.SendGamestateToPlayers( players, pair[1] )
      }
   }

   private GameStateChanged()
   {
      Assert( IsServer(), "Server only" )
      let thread = this.gameThread
      Assert( thread !== undefined, "No game thread!" )
      let status = coroutine.status( thread as thread )
      switch ( status )
      {
         case "dead":
            Assert( false, "game thread is dead!" )
            break

         case "normal":
            print( "Game thread was Normal?" )

         case "suspended":
            coroutine.resume( thread as thread )
            break

         case "running":
            break
      }
   }

   public SetGameState( state: GAME_STATE )
   {
      Assert( IsServer(), "Server only" )
      this.gameStateChangedTime = Workspace.DistributedGameTime
      this.gameState = state

      switch ( state )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            Assert( this.votes.size() === 0, "Expected zero votes" )
            break
      }

      this.GameStateChanged()
   }

   public GetInGameState(): number
   {
      return Workspace.DistributedGameTime - this.gameStateChangedTime
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
   private gameStateChangedTime = 0
   private playerToInfo = new Map<Player, PlayerInfo>()
   private votes: Array<PlayerVote> = []
   corpses: Array<Corpse> = []

   public GetTimeRemainingForState(): number
   {
      let timeRemaining = 0
      switch ( this.gameState )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            timeRemaining = MEETING_DISCUSS_TIME
            break

         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            timeRemaining = MEETING_VOTE_TIME
            break

         case GAME_STATE.GAME_STATE_MEETING_RESULTS:
            timeRemaining = MEETING_RESULTS_TIME
            break
      }

      return math.max( 0, timeRemaining - this.GetInGameState() )
   }

   public GetGameStateChangedTime(): number
   {
      return this.gameStateChangedTime
   }

   public HasPlayer( player: Player ): boolean
   {
      for ( let pair of this.playerToInfo )
      {
         if ( pair[0] === player )
            return true
      }
      return false
   }

   public SetVote( player: Player, voteUserID: number | undefined )
   {
      if ( this.gameState !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         return

      Assert( voteUserID === undefined || typeOf( voteUserID ) === 'number', "Expected voteUserID to be number or undefined, but was " + typeOf( voteUserID ) + ", " + voteUserID )

      for ( let vote of this.votes )
      {
         // already voted?
         if ( vote.voter === player )
            return
      }

      let voteTarget: Player | undefined

      if ( voteUserID !== undefined )
      {
         let userIdToPlayer = UserIDToPlayer()
         Assert( userIdToPlayer.has( voteUserID ), "VoteuserID " + voteUserID + "  does not exist in game, userIdToPlayer size " + userIdToPlayer.size() )
         let target = userIdToPlayer.get( voteUserID ) as Player
         voteTarget = target
      }

      this.votes.push( new PlayerVote( player, voteTarget ) )
      this.UpdateGame()
   }

   public SetPlayerRole( player: Player, role: ROLE )
   {
      //print( "Set player " + player.UserId + " role to " + role )
      Assert( this.playerToInfo.has( player ), "Game does not have " + player.Name )
      let playerInfo = this.playerToInfo.get( player ) as PlayerInfo
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

   public GetVotes()
   {
      return this.votes
   }

   public DidVote( player: Player ): boolean
   {
      for ( let vote of this.votes )
      {
         if ( vote.voter === player )
            return true
      }
      return false
   }



   //////////////////////////////////////////////////////
   // 
   //    CLIENT   ONLY
   // 
   //////////////////////////////////////////////////////
   public NetvarToGamestate()
   {
      print( "\nNetvarToGamestate()" )
      Assert( IsClient(), "Client only" )
      let localPlayer = Players.LocalPlayer
      let json = GetNetVar_String( localPlayer, NETVAR_JSON_GAMESTATE )
      let gs = HttpService.JSONDecode( json ) as NETVAR_GameState
      print( "Game state is " + gs.gameState )
      let userIdToPlayer = UserIDToPlayer()
      this.gameState = gs.gameState
      this.gameStateChangedTime = gs.gsChangedTime + ( Workspace.DistributedGameTime - gs.serverTime ) // DistributedGameTime varies from player to player

      // update PLAYERS
      {
         let sentPlayers = new Map<Player, boolean>()

         for ( let playerInfo of gs.playerInfos )
         {
            let player = userIdToPlayer.get( playerInfo.id )
            if ( player === undefined )
               continue
            sentPlayers.set( player, true )

            let role = playerInfo.role
            if ( this.HasPlayer( player ) )
               this.SetPlayerRole( player, role )
            else
               this.AddPlayer( player, role )
         }

         let localSpectator = this.GetPlayerRole( localPlayer ) === ROLE.ROLE_SPECTATOR

         for ( let player of this.GetAllPlayers() )
         {
            let role = this.GetPlayerRole( player )
            if ( role === ROLE.ROLE_SPECTATOR )
            {
               if ( player === localPlayer )
                  SetPlayerTransparencyAndColor( player, SPECTATOR_TRANS, new Color3( 1, 0, 0 ) )
               else if ( localSpectator ) // spectators see spectators
                  SetPlayerTransparencyAndColor( player, SPECTATOR_TRANS, new Color3( 0, 0, 1 ) )
               else
                  SetPlayerTransparencyAndColor( player, 1, new Color3( 0, 0, 1 ) )
            }
         }


         /*
         // remove players that were not sent
         for ( let pair of this.playerToInfo )
         {
            if ( sentPlayers.has( pair[0] ) )
               continue
            this.playerToInfo.delete( pair[0] )
            SetPlayerTransparencyAndColor( pair[0], 1, new Color3( 1, 0, 0 ) )
         }
         */
      }

      // update CORPSES
      {
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
      }

      // update VOTES
      this.votes = []

      for ( let vote of gs.votes )
      {
         let userIdToPlayer = UserIDToPlayer()
         let player = userIdToPlayer.get( vote.voterUserId )
         if ( player === undefined )
            continue

         let targetUserId = vote.targetUserId
         if ( targetUserId === undefined )
         {
            this.votes.push( new PlayerVote( player, undefined ) )
         }
         else
         {
            let target = userIdToPlayer.get( targetUserId )
            this.votes.push( new PlayerVote( player, target ) )
         }
      }

      this.meetingType = gs.meetingType

      if ( gs.meetingCallerUserId === undefined )
      {
         this.meetingCaller = undefined
      }
      else
      {
         let meetingCaller = userIdToPlayer.get( gs.meetingCallerUserId )
         this.meetingCaller = meetingCaller
      }
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
   switch ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) )
   {
      case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
      case MATCHMAKING_STATUS.MATCHMAKING_LFG:
         return true
   }

   return false
}
