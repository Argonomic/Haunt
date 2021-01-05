import { HttpService, RunService, Workspace } from "@rbxts/services"
import { AddNetVar, GetNetVar_Number, GetNetVar_String, SetNetVar } from "shared/sh_player_netvars"
import { AddCooldown } from "./sh_cooldown"
import { SetPlayerWalkSpeed } from "./sh_onPlayerConnect"
import { COOLDOWNTIME_MEETING, COOLDOWNTIME_KILL, MEETING_DISCUSS_TIME, MEETING_VOTE_TIME, PLAYER_WALKSPEED_SPECTATOR, PLAYER_WALKSPEED, SPECTATOR_TRANS } from "./sh_settings"
import { IsServer, IsClient, UserIDToPlayer, IsAlive, SetPlayerTransparency, GetLocalPlayer, Resume, Thread, ExecOnChildWhenItExists } from "./sh_utils"
import { Assert } from "shared/sh_assert"
import { GiveAbility, TakeAbility } from "./sh_ability"
import { ABILITIES } from "./content/sh_ability_content"
import { PlayerPickupsDisabled, PlayerPickupsEnabled } from "./sh_pickups"
import { GetScore, NETVAR_SCORE } from "./sh_score"

export const LOCAL = RunService.IsStudio()

export const NETVAR_JSON_TASKLIST = "JS_TL"
export const NETVAR_MATCHMAKING_STATUS = "MMS"
export const NETVAR_MATCHMAKING_NUMWITHYOU = "N_WY"
export const NETVAR_JSON_GAMESTATE = "E_GS"
export const NETVAR_MEETINGS_CALLED = "N_MC"

export enum PICKUPS
{
   PICKUP_COIN = 0,
}

export enum USETYPES 
{
   USETYPE_TASK = 0,
   USETYPE_KILL,
   USETYPE_REPORT,
   USETYPE_MEETING,
}

export const USE_COOLDOWNS = "USE_COOLDOWNS" // USE searches for these strings at runtime to identify if cooldown should happen
export const COOLDOWN_NAME_KILL = USE_COOLDOWNS + USETYPES.USETYPE_KILL
export const COOLDOWN_NAME_MEETING = USE_COOLDOWNS + USETYPES.USETYPE_MEETING

export enum GAMERESULTS
{
   RESULTS_STILL_PLAYING = 0,
   RESULTS_NO_WINNER,
   RESULTS_POSSESSED_WIN,
   RESULTS_CAMPERS_WIN,
}

export enum MATCHMAKING_STATUS
{
   MATCHMAKING_UNDECIDED = 0,
   MATCHMAKING_PRACTICE,
   MATCHMAKING_LFG,
   MATCHMAKING_LFG_WITH_FRIENDS,
   MATCHMAKING_WAITING_TO_PLAY,
   MATCHMAKING_PLAYING,
   MATCHMAKING_SEND_TO_RESERVEDSERVER,
   MATCHMAKING_SEND_TO_LOBBY,
}

export enum ROLE
{
   ROLE_CAMPER = 0,
   ROLE_POSSESSED,
   ROLE_SPECTATOR_CAMPER,
   ROLE_SPECTATOR_IMPOSTER,
   ROLE_SPECTATOR_CAMPER_ESCAPED,
}

export enum GAME_STATE
{
   GAME_STATE_UNKNOWN = 0,
   GAME_STATE_PREMATCH, // 1
   GAME_STATE_PLAYING, //2
   GAME_STATE_MEETING_DISCUSS, //3 
   GAME_STATE_MEETING_VOTE,//4
   GAME_STATE_MEETING_RESULTS,//5
   GAME_STATE_COMPLETE, //6
   GAME_STATE_DEAD, //7
}

export enum MEETING_TYPE
{
   MEETING_EMERGENCY = 0,
   MEETING_REPORT = 1
}

export let TASK_EXIT = "task_exit"
export let TASK_RESTORE_LIGHTS = "task_restore_lights"

class File
{
   onRoleChangeCallback: Array<( ( player: Player, role: ROLE, lastRole: ROLE ) => void )> = []
   gameStateChangedCallbacks: Array<( ( game: Game ) => void )> = []
   gameCreatedCallbacks: Array<( ( game: Game ) => void )> = []
   isReservedServer = false
}
let file = new File()


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

export class TELEPORT_PlayerData
{
   playerCount: number | undefined
   matchmaking: MATCHMAKING_STATUS | undefined
}

export class Assignment
{
   roomName: string
   taskName: string
   status = 0

   constructor( roomName: string, taskName: string )
   {
      this.roomName = roomName
      this.taskName = taskName
   }
}

class NETVAR_GameState
{
   playerInfos: Array<NETVAR_GamePlayerInfo>
   currentGameState: GAME_STATE
   gsChangedTime: number
   corpses: Array<NETVAR_Corpse>
   votes: Array<NETVAR_Vote>
   voteTargetScore = 0
   meetingCallerUserId: number | undefined
   meetingType: MEETING_TYPE | undefined
   meetingBodyUserId: number | undefined
   serverTime: number
   startingPossessedCount: number

   constructor( game: Game, playerInfos: Array<NETVAR_GamePlayerInfo>, corpses: Array<NETVAR_Corpse>, votes: Array<NETVAR_Vote> )
   {
      this.currentGameState = game.GetGameState()
      this.gsChangedTime = game.GetGameStateChangedTime()
      this.playerInfos = playerInfos
      this.corpses = corpses
      this.votes = votes
      this.serverTime = Workspace.DistributedGameTime
      this.startingPossessedCount = game.startingPossessedCount
   }
}

// sent to the client and updated on change, even if a player is no longer on the server
class NETVAR_GamePlayerInfo
{
   userId: number
   name: string
   role: ROLE
   playernum: number

   constructor( player: Player, role: ROLE, playernum: number )
   {
      this.userId = player.UserId
      this.name = player.Name
      this.role = role
      this.playernum = playernum
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
   player: Player
   role: ROLE
   playernum = -1
   _userid: number

   constructor( player: Player, role: ROLE )
   {
      this.player = player
      this.role = role
      this._userid = player.UserId
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
   constructor()
   {
      let game = this
      for ( let func of file.gameCreatedCallbacks )
      {
         Thread(
            function ()
            {
               func( game )
            } )
      }
   }

   creationTime = Workspace.DistributedGameTime

   //////////////////////////////////////////////////////
   // 
   //    SERVER   ONLY
   // 
   //////////////////////////////////////////////////////
   assignments = new Map<Player, Array<Assignment>>()

   meetingCaller: Player | undefined
   meetingType: MEETING_TYPE | undefined
   meetingBody: Player | undefined
   roundsPassed = 0 // whenever a meeting is called and there is a new kill, a round passes
   previouslyLivingCampers = 0

   gameThread: thread | undefined
   playerToSpawnLocation = new Map<Player, Vector3>()
   startingPossessedCount = 0
   highestVotedScore = 0

   //   coins: Array<Coin> = []

   public UpdateGame() 
   {
      // if the server or client has a gamethread that yields until game update, this resumes it
      if ( this.gameThread === undefined )
         return

      Resume( this.gameThread )
   }

   public GetGameResults_ParityAllowed(): GAMERESULTS
   {
      let game = this
      function func(): GAMERESULTS
      {
         let possessed = game.GetLivingPossessed().size()
         let campers = game.GetLivingCampers().size()
         if ( possessed === 0 )
         {
            if ( campers === 0 )
               return GAMERESULTS.RESULTS_NO_WINNER
            return GAMERESULTS.RESULTS_CAMPERS_WIN
         }

         if ( campers === 0 )
            return GAMERESULTS.RESULTS_POSSESSED_WIN

         return GAMERESULTS.RESULTS_STILL_PLAYING
      }
      let results = func()
      print( "GetGameResults_ParityAllowed:" + results + ", isserver: " + IsServer() )
      return results
   }

   public GetGameResults_NoParityAllowed(): GAMERESULTS
   {
      let game = this
      function func(): GAMERESULTS
      {
         let results = game.GetGameResults_ParityAllowed()
         if ( results !== GAMERESULTS.RESULTS_STILL_PLAYING )
            return results

         let possessed = game.GetLivingPossessed().size()
         let campers = game.GetLivingCampers().size()
         if ( possessed >= campers )
            return GAMERESULTS.RESULTS_POSSESSED_WIN

         return GAMERESULTS.RESULTS_STILL_PLAYING
      }

      let results = func()
      print( "GetGameResults_NoParityAllowed:" + results + ", isserver: " + IsServer() )
      return results
   }


   public BroadcastGamestate()
   {
      Assert( IsServer(), "Server only" )
      print( "\nBroadcasting game state: " + this.GetGameState() )

      // these things are common/consistent to all players
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

      function RevealImposters( game: Game, player: Player ): boolean
      {
         if ( game.GetGameState() === GAME_STATE.GAME_STATE_COMPLETE )
            return true
         if ( game.IsImposter( player ) )
            return true

         return false
      }

      let revealedImposter = false
      for ( let player of this.GetAllPlayers() )
      {
         // tell the campers about everyone, but mask the possessed
         let infos: Array<NETVAR_GamePlayerInfo> = []
         let exitedGame = this.CompletedExitTask( player )

         if ( RevealImposters( this, player ) || exitedGame )
         {
            revealedImposter = true
            // full game info
            for ( let pair of this.playerToInfo )
            {
               infos.push( new NETVAR_GamePlayerInfo( pair[0], pair[1].role, pair[1].playernum ) )
            }
         }
         else
         {
            for ( let pair of this.playerToInfo )
            {
               let role = pair[1].role
               switch ( role )
               {
                  case ROLE.ROLE_POSSESSED:
                     role = ROLE.ROLE_CAMPER
                     break

                  case ROLE.ROLE_SPECTATOR_IMPOSTER:
                     role = ROLE.ROLE_SPECTATOR_CAMPER
                     break
               }

               infos.push( new NETVAR_GamePlayerInfo( pair[0], role, pair[1].playernum ) )
            }
         }

         let gs = new NETVAR_GameState( this, infos, corpses, votes )
         if ( this.votes.size() )
         {
            let results = GetVoteResults( this.votes )
            if ( results.highestRecipients.size() === 1 )
               gs.voteTargetScore = GetScore( results.highestRecipients[0] )
         }

         gs.meetingType = this.meetingType

         if ( this.meetingCaller )
            gs.meetingCallerUserId = this.meetingCaller.UserId
         else
            gs.meetingCallerUserId = undefined

         if ( this.meetingBody )
            gs.meetingBodyUserId = this.meetingBody.UserId
         else
            gs.meetingBodyUserId = undefined

         if ( exitedGame )
         {
            print( player.Name + " exited the game" )
            gs.currentGameState = GAME_STATE.GAME_STATE_COMPLETE
            gs.gsChangedTime = Workspace.DistributedGameTime
         }

         let json = HttpService.JSONEncode( gs )
         SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
      }
      Assert( revealedImposter || this.GetGameState() === GAME_STATE.GAME_STATE_PREMATCH, "Didn't reveal imposter" )
   }

   public SetGameState( state: GAME_STATE )
   {
      let game = this
      Assert( IsServer(), "Server only" )
      print( "Set Game State " + state + ", Time since last change: " + math.floor( ( Workspace.DistributedGameTime - this._gameStateChangedTime ) ) )

      Assert( state >= GAME_STATE.GAME_STATE_COMPLETE || this.currentGameState < GAME_STATE.GAME_STATE_COMPLETE, "Illegal game state setting. Tried to set state " + state + ", but game state was " + this.currentGameState )

      this._gameStateChangedTime = Workspace.DistributedGameTime
      this.currentGameState = state

      let thread = this.gameThread
      Assert( thread !== undefined, "No game thread!" )
      if ( thread === coroutine.running() )
         return

      let status = coroutine.status( thread as thread )
      switch ( status )
      {
         case "dead":
         case "normal":
         case "running":
            Assert( false, "Unexpected gameThread status " + status )
            break

         case "suspended":
            Resume( thread as thread )
            break
      }

      for ( let func of file.gameStateChangedCallbacks )
      {
         Thread(
            function ()
            {
               func( game )
            } )
      }
   }

   public GetTimeInGameState(): number
   {
      return Workspace.DistributedGameTime - this._gameStateChangedTime
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

   public GetPlayerInfo( player: Player ): PlayerInfo
   {
      Assert( this.playerToInfo.has( player ), "Unknown player " + player.Name )
      let playerInfo = this.playerToInfo.get( player ) as PlayerInfo
      Assert( playerInfo.player === player, "WRONG PLAYER" )
      Assert( playerInfo._userid === player.UserId, "WRONG PLAYER ID" )

      return this.playerToInfo.get( player ) as PlayerInfo
   }

   public RemovePlayer( player: Player )
   {
      Assert( this.playerToInfo.has( player ), "Player is not in game" )
      this.playerToInfo.delete( player )
   }



   //////////////////////////////////////////////////////
   // 
   //    SHARED
   // 
   //////////////////////////////////////////////////////
   private currentGameState: GAME_STATE = GAME_STATE.GAME_STATE_PREMATCH
   private _gameStateChangedTime = 0
   private playerToInfo = new Map<Player, PlayerInfo>()
   private votes: Array<PlayerVote> = []
   corpses: Array<Corpse> = []

   public GetTimeRemainingForState(): number
   {
      let timeRemaining = 0
      switch ( this.currentGameState )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            timeRemaining = MEETING_DISCUSS_TIME
            break

         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            timeRemaining = MEETING_VOTE_TIME
            break
      }

      return math.max( 0, timeRemaining - this.GetTimeInGameState() )
   }

   public ClearVotes()
   {
      this.votes = []
   }

   public GetGameStateChangedTime(): number
   {
      return this._gameStateChangedTime
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

   public CompletedExitTask( player: Player ): boolean
   {
      if ( !this.assignments.has( player ) )
         return false

      let assignments = this.assignments.get( player ) as Array<Assignment>
      for ( let assignment of assignments )
      {
         if ( assignment.taskName === TASK_EXIT )
            return assignment.status === 1
      }
      return false
   }

   public SetVote( player: Player, voteUserID: number | undefined )
   {
      if ( this.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
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

   public SetPlayerRole( player: Player, role: ROLE ): PlayerInfo
   {
      let lastRole = this.GetPlayerRole( player )
      //print( "Set player " + player.UserId + " role to " + role )
      if ( IsServer() )
      {
         if ( role === ROLE.ROLE_SPECTATOR_CAMPER )
            Assert( this.GetPlayerRole( player ) === ROLE.ROLE_CAMPER, "Bad role assignment" )
         else if ( role === ROLE.ROLE_SPECTATOR_IMPOSTER )
            Assert( this.GetPlayerRole( player ) === ROLE.ROLE_POSSESSED, "Bad role assignment" )
      }


      Assert( this.playerToInfo.has( player ), "SetPlayerRole: Game does not have " + player.Name )
      let playerInfo = this.playerToInfo.get( player ) as PlayerInfo
      playerInfo.role = role
      this.playerToInfo.set( player, playerInfo )

      if ( lastRole !== role )
      {
         for ( let func of file.onRoleChangeCallback )
         {
            func( player, role, lastRole )
         }
      }

      if ( this.IsSpectator( player ) )
         PlayerPickupsDisabled( player )
      else
         PlayerPickupsEnabled( player )

      return playerInfo
   }

   public GetAllConnectedPlayers(): Array<Player>
   {
      let players = this.GetAllPlayers()
      return players.filter( function ( player )
      {
         return player.Character !== undefined
      } )
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

   public GetLivingCampers(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_CAMPER ).filter( function ( player )
      {
         return player.Character !== undefined
      } )
   }

   public GetCampers(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_CAMPER ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_CAMPER ) )
   }

   public GetLivingPossessed(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_POSSESSED ).filter( function ( player )
      {
         return player.Character !== undefined
      } )
   }

   public GetPossessed(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_POSSESSED ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_IMPOSTER ) )
   }

   public GetSpectators(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_CAMPER ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_IMPOSTER ) )
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

   public AddPlayer( player: Player, role: ROLE ): PlayerInfo
   {
      Assert( !this.playerToInfo.has( player ), "Game already has " + player.Name )
      let playerInfo = new PlayerInfo( player, role )
      //print( "AddPlayer " + player.UserId + " with role " + role )
      this.playerToInfo.set( player, playerInfo )

      let character = player.Character
      if ( character !== undefined )
         this.Shared_OnGameStateChanged_PerPlayer( player, this.GetGameState() )

      return playerInfo
   }

   public IsSpectator( player: Player ): boolean
   {
      switch ( this.GetPlayerRole( player ) )
      {
         case ROLE.ROLE_SPECTATOR_CAMPER:
         case ROLE.ROLE_SPECTATOR_IMPOSTER:
         case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
            return true
      }

      return false
   }

   public IsCamper( player: Player ): boolean
   {
      switch ( this.GetPlayerRole( player ) )
      {
         case ROLE.ROLE_SPECTATOR_CAMPER:
         case ROLE.ROLE_CAMPER:
            return true
      }

      return false
   }

   public IsImposter( player: Player ): boolean
   {
      return IsImposterRole( this.GetPlayerRole( player ) )
   }

   public GetPlayerRole( player: Player ): ROLE
   {
      Assert( this.playerToInfo.has( player ), "GetPlayerRole: Game does not have " + player.Name )
      return ( this.playerToInfo.get( player ) as PlayerInfo ).role
   }

   public GetGameState()
   {
      return this.currentGameState
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


   public Shared_OnGameStateChanged_PerPlayer( player: Player, state: GAME_STATE )
   {
      /*
      if ( player.Character !== undefined )
      {
         ExecOnChildWhenItExists( player.Character, "Humanoid", function ( instance: Instance )
         {
            let human = instance as Humanoid
            human.NameDisplayDistance = 1000
            human.NameOcclusion = Enum.NameOcclusion.NoOcclusion
         } )
      }
      */

      switch ( state )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            SetPlayerWalkSpeed( player, 0 )
            break

         default:
            if ( this.IsSpectator( player ) )
               SetPlayerWalkSpeed( player, PLAYER_WALKSPEED_SPECTATOR )
            else
               SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )
            break
      }
   }

   //////////////////////////////////////////////////////
   // 
   //    CLIENT   ONLY
   // 
   //////////////////////////////////////////////////////
   public NetvarToGamestate_ReturnServerTimeDelta(): number
   {
      //print( "\nNetvarToGamestate_ReturnServerTimeDelta()" )
      Assert( IsClient(), "Client only" )
      let localPlayer = GetLocalPlayer()
      let json = GetNetVar_String( localPlayer, NETVAR_JSON_GAMESTATE )
      let gs = HttpService.JSONDecode( json ) as NETVAR_GameState
      let userIdToPlayer = UserIDToPlayer()
      this.currentGameState = gs.currentGameState

      let deltaTime = Workspace.DistributedGameTime - gs.serverTime
      this._gameStateChangedTime = gs.gsChangedTime + deltaTime // DistributedGameTime varies from player to player
      this.startingPossessedCount = gs.startingPossessedCount

      // update PLAYERS
      {
         let sentPlayers = new Map<Player, boolean>()

         for ( let gsPlayerInfo of gs.playerInfos )
         {
            let player = userIdToPlayer.get( gsPlayerInfo.userId )
            if ( player === undefined )
               continue
            sentPlayers.set( player, true )

            let role = gsPlayerInfo.role
            let playerInfo: PlayerInfo | undefined
            if ( this.HasPlayer( player ) )
               playerInfo = this.SetPlayerRole( player, role )
            else
               playerInfo = this.AddPlayer( player, role )

            Assert( playerInfo !== undefined, "playerInfo !== undefined" )

            if ( playerInfo !== undefined )
               playerInfo.playernum = gsPlayerInfo.playernum
            Assert( ( ( this.playerToInfo.get( player ) as PlayerInfo ).playernum === playerInfo.playernum ) && playerInfo.playernum >= 0, "( this.playerToInfo.get( player ) as PlayerInfo ).playernum === playerInfo.playernum ) && playerInfo.playernum >= 0" )
         }

         let localSpectator = this.IsSpectator( localPlayer )

         for ( let player of this.GetAllPlayers() )
         {
            if ( this.IsSpectator( player ) )
            {
               if ( player === localPlayer )
                  SetPlayerTransparency( player, SPECTATOR_TRANS )
               else if ( localSpectator ) // spectators see spectators
                  SetPlayerTransparency( player, SPECTATOR_TRANS )
               else
                  SetPlayerTransparency( player, 1 )
            }
         }

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
      this.highestVotedScore = gs.voteTargetScore

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

      if ( gs.meetingBodyUserId === undefined )
      {
         this.meetingBody = undefined
      }
      else
      {
         let meetingBody = userIdToPlayer.get( gs.meetingBodyUserId )
         this.meetingBody = meetingBody
      }

      return deltaTime
   }
}

export function IsReservedServer(): boolean 
{
   return file.isReservedServer
}

export function SharedGameStateInit()
{
   if ( IsServer() )
   {
      file.isReservedServer = game.PrivateServerId !== "" && game.PrivateServerOwnerId === 0
      if ( file.isReservedServer )
      {
         let number = new Instance( 'NumberValue' )
         number.Name = "ReservedServer"
         number.Parent = Workspace
      }
   }
   else
   {
      ExecOnChildWhenItExists( Workspace, 'ReservedServer',
         function ( child: Instance )
         {
            file.isReservedServer = true
         } )
   }

   AddNetVar( "string", NETVAR_JSON_TASKLIST, "{}" )
   AddNetVar( "number", NETVAR_MATCHMAKING_NUMWITHYOU, 0 )
   AddNetVar( "string", NETVAR_JSON_GAMESTATE, "{}" )
   AddNetVar( "number", NETVAR_MEETINGS_CALLED, 0 )
   AddNetVar( "number", NETVAR_SCORE, 0 ) //RandomInt( 750 ) + 250 )
   AddNetVar( "number", NETVAR_MATCHMAKING_STATUS, MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED )

   AddCooldown( COOLDOWN_NAME_KILL, COOLDOWNTIME_KILL )
   AddCooldown( COOLDOWN_NAME_MEETING, COOLDOWNTIME_MEETING )

   AddRoleChangeCallback(
      function ( player: Player, role: ROLE, lastRole: ROLE )
      {
         if ( IsImposterRole( role ) )
         {
            if ( !IsImposterRole( lastRole ) )
            {
               // became an imposter
               GiveAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
            }
         }
         else if ( IsImposterRole( lastRole ) )
         {
            // became not an imposter
            TakeAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
         }
      } )

   /*
   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         Thread(
            function ()
            {
               wait( 3 )
               GiveAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
            }
         )
      } )
   */

}

export function IsPracticing( player: Player ): boolean
{
   switch ( GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS ) )
   {
      case MATCHMAKING_STATUS.MATCHMAKING_UNDECIDED:
      case MATCHMAKING_STATUS.MATCHMAKING_PRACTICE:
      case MATCHMAKING_STATUS.MATCHMAKING_LFG:
      case MATCHMAKING_STATUS.MATCHMAKING_LFG_WITH_FRIENDS:
      case MATCHMAKING_STATUS.MATCHMAKING_WAITING_TO_PLAY:
      case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER:
      case MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_LOBBY:
         return true
   }

   return false
}

export function PlayerNumToGameViewable( playerNum: number ): string
{
   return playerNum + 1 + ""
}

class VoteResults
{
   skipTie: boolean
   highestRecipients: Array<Player>
   receivedAnyVotes: Array<Player>
   voted: Array<Player>

   constructor( skipTie: boolean, highestRecipients: Array<Player>, receivedAnyVotes: Array<Player>, voted: Array<Player> )
   {
      this.skipTie = skipTie
      this.highestRecipients = highestRecipients
      this.receivedAnyVotes = receivedAnyVotes
      this.voted = voted
   }
}

export function GetVoteResults( votes: Array<PlayerVote> ): VoteResults
{
   //print( "The results are in!" )
   let skipCount = 0
   let voteCount = new Map<Player, number>()
   let voted: Array<Player> = []

   for ( let vote of votes )
   {
      voted.push( vote.voter )
      voteCount.set( vote.voter, 0 )
      if ( vote.target !== undefined )
         voteCount.set( vote.target, 0 )
   }

   for ( let vote of votes )
   {
      if ( vote.target === undefined )
      {
         skipCount++
         continue
      }

      Assert( voteCount.has( vote.target ), "Not a voter! " + vote.target )
      let count = voteCount.get( vote.target ) as number
      count++
      voteCount.set( vote.target, count )
   }

   let highestCount = skipCount
   for ( let pair of voteCount )
   {
      //print( "Vote for " + pair[0].Name + ": " + pair[1] )
      if ( pair[1] > highestCount )
         highestCount = pair[1]
   }

   let receivedAnyVotes: Array<Player> = []
   let highestRecipients: Array<Player> = []
   for ( let pair of voteCount )
   {
      if ( pair[1] > 0 )
         receivedAnyVotes.push( pair[0] )

      if ( pair[1] === highestCount )
         highestRecipients.push( pair[0] )
   }

   let voteResults = new VoteResults( skipCount === highestCount, highestRecipients, receivedAnyVotes, voted )
   return voteResults
}

export function AssignmentIsSame( assignment: Assignment, roomName: string, taskName: string ): boolean
{
   if ( assignment.roomName !== roomName )
      return false
   return assignment.taskName === taskName
}

export function AddRoleChangeCallback( func: ( player: Player, role: ROLE, lastRole: ROLE ) => void )
{
   file.onRoleChangeCallback.push( func )
}

export function IsImposterRole( role: ROLE ): boolean
{
   switch ( role )
   {
      case ROLE.ROLE_SPECTATOR_IMPOSTER:
      case ROLE.ROLE_POSSESSED:
         return true
   }

   return false
}

export function AddGameStateChangedCallback( func: ( game: Game ) => void )
{
   file.gameStateChangedCallbacks.push( func )
}

export function AddGameCreatedCallback( func: ( game: Game ) => void )
{
   file.gameCreatedCallbacks.push( func )
}