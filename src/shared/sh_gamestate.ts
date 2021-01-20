import { HttpService, RunService, Teams, Workspace } from "@rbxts/services"
import { AddNetVar, GetNetVar_String, SetNetVar } from "shared/sh_player_netvars"
import { AddCooldown } from "./sh_cooldown"
import { SetPlayerWalkSpeed, TryFillWithFakeModels } from "./sh_onPlayerConnect"
import { COOLDOWNTIME_MEETING, COOLDOWNTIME_KILL, MEETING_DISCUSS_TIME, MEETING_VOTE_TIME, PLAYER_WALKSPEED_SPECTATOR, PLAYER_WALKSPEED, SPECTATOR_TRANS, SUDDEN_DEATH_TIME, DEV_SKIP_INTRO, RESERVEDSERVER_WAITS_FOR_PLAYERS, START_COUNTDOWN, INTRO_TIME, SKIP_INTRO_TIME } from "./sh_settings"
import { IsServer, IsClient, UserIDToPlayer, IsAlive, SetPlayerTransparency, GetLocalPlayer, Resume, Thread, GetExistingFirstChildWithNameAndClassName } from "./sh_utils"
import { Assert } from "shared/sh_assert"
import { GiveAbility, TakeAbility } from "./sh_ability"
import { ABILITIES } from "./content/sh_ability_content"
import { PlayerPickupsDisabled, PlayerPickupsEnabled } from "./sh_pickups"
import { GetMatchScore, NETVAR_LAST_STASHED, NETVAR_SCORE, NETVAR_STASH } from "./sh_score"
import { GetDeltaTime } from "./sh_time"

const LOCAL = RunService.IsStudio()
const LOCAL_PLAYER = GetLocalPlayer()

export const NETVAR_JSON_ASSIGNMENTS = "JS_TL"
export const NETVAR_JSON_GAMESTATE = "JS_GS"
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
   RESULTS_SUDDEN_DEATH,
   RESULTS_IMPOSTORS_WIN,
   RESULTS_CAMPERS_WIN,
}

export enum ROLE
{
   ROLE_UNASSIGNED = 0,
   ROLE_CAMPER, // 1
   ROLE_IMPOSTOR, // 2
   ROLE_SPECTATOR_CAMPER, // 3
   ROLE_SPECTATOR_IMPOSTOR, // 4
   ROLE_SPECTATOR_CAMPER_ESCAPED, // 5
   ROLE_SPECTATOR_LATE_JOINER, // 6
}

export enum GAME_STATE
{
   GAME_STATE_INIT = 0,
   GAME_STATE_WAITING_FOR_PLAYERS, // 1
   GAME_STATE_COUNTDOWN, // 2
   GAME_STATE_RESERVED_SERVER_WAITING, // 3
   GAME_STATE_INTRO, // 4
   GAME_STATE_PLAYING, // 5
   GAME_STATE_MEETING_DISCUSS, // 6
   GAME_STATE_MEETING_VOTE,// 7
   GAME_STATE_MEETING_RESULTS,// 8
   GAME_STATE_SUDDEN_DEATH, // 9
   GAME_STATE_COMPLETE, // 10
}

export enum MEETING_TYPE
{
   MEETING_EMERGENCY = 0,
   MEETING_REPORT = 1
}

export type EDITOR_GameplayFolder = Folder &
{
   Coins: Folder
   Rooms: Folder &
   {
      BaseFolderObject: Folder
   }
   DynamicArt: Folder &
   {
      scr_real_matches_only: Folder
   }
}

export let TASK_EXIT = "task_exit"
export let TASK_RESTORE_LIGHTS = "task_restore_lights"

class File
{
   onRoleChangeCallback: Array<( ( player: Player, role: ROLE, lastRole: ROLE ) => void )> = []
   gameStateChangedCallbacks: Array<( ( match: Match ) => void )> = []
   gameCreatedCallbacks: Array<( ( match: Match ) => void )> = []
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
   gameState: GAME_STATE
   gsChangedTime: number
   corpses: Array<NETVAR_Corpse>
   votes: Array<NETVAR_Vote>
   voteTargetScore = 0
   meetingCallerUserId: number | undefined
   meetingType: MEETING_TYPE | undefined
   meetingBodyUserId: number | undefined
   startingImpostorCount: number

   constructor( match: Match, playerInfos: Array<NETVAR_GamePlayerInfo>, corpses: Array<NETVAR_Corpse>, votes: Array<NETVAR_Vote> )
   {
      this.gameState = match.GetGameState()
      this.gsChangedTime = match.GetGameStateChangedTime()
      this.playerInfos = playerInfos
      this.corpses = corpses
      this.votes = votes
      this.startingImpostorCount = match.startingImpostorCount
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
   role: ROLE = ROLE.ROLE_UNASSIGNED
   playernum = -1
   _userid: number

   constructor( player: Player )
   {
      this.player = player
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

export class Match
{
   constructor()
   {
      let match = this
      for ( let func of file.gameCreatedCallbacks )
      {
         Thread(
            function ()
            {
               func( match )
            } )
      }
   }

   updateTracker = 0
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
   startingImpostorCount = 0
   highestVotedScore = 0

   //   coins: Array<Coin> = []

   public UpdateGame() 
   {
      if ( IsServer() )
      {
         this.updateTracker++
         return
      }

      //print( "UpdateGame(): " + debug.traceback() )
      // if the server or client has a gamethread that yields until match update, this resumes it
      if ( this.gameThread === undefined )
         return

      if ( coroutine.status( this.gameThread ) === "suspended" )
         Resume( this.gameThread )
   }

   public GetGameResults_ParityAllowed(): GAMERESULTS
   {
      let match = this

      function func(): GAMERESULTS
      {
         let campers = match.GetLivingCampers().size()
         let impostors = match.GetLivingImpostors().size()

         if ( impostors === 0 )
         {
            if ( campers === 0 )
               return GAMERESULTS.RESULTS_NO_WINNER
            return GAMERESULTS.RESULTS_CAMPERS_WIN
         }

         if ( campers === 0 )
            return GAMERESULTS.RESULTS_IMPOSTORS_WIN

         if ( impostors >= campers )
            return GAMERESULTS.RESULTS_SUDDEN_DEATH

         return GAMERESULTS.RESULTS_STILL_PLAYING
      }

      let results = func()
      //print( "GetGameResults_ParityAllowed:" + results + ", isserver: " + IsServer() )
      return results
   }

   public GetGameResults_NoParityAllowed(): GAMERESULTS
   {
      let match = this
      function func(): GAMERESULTS
      {
         let results = match.GetGameResults_ParityAllowed()
         if ( results === GAMERESULTS.RESULTS_SUDDEN_DEATH )
            return GAMERESULTS.RESULTS_IMPOSTORS_WIN
         return results
      }

      let results = func()
      //print( "GetGameResults_NoParityAllowed:" + results + ", isserver: " + IsServer() )
      return results
   }

   public BroadcastGamestate()
   {
      Assert( IsServer(), "Server only" )
      //print( "\nBroadcastGamestate " + this.GetGameState() + " at " + Workspace.DistributedGameTime )

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

      function RevealImpostors( match: Match, player: Player ): boolean
      {
         if ( match.GetGameState() >= GAME_STATE.GAME_STATE_COMPLETE )
            return true
         if ( match.IsImpostor( player ) )
            return true

         return false
      }

      let revealedImpostor = false
      for ( let player of this.GetAllPlayers() )
      {
         // tell the campers about everyone, but mask the impostors
         let infos: Array<NETVAR_GamePlayerInfo> = []

         if ( RevealImpostors( this, player ) )
         {
            revealedImpostor = true
            // full match info
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
                  case ROLE.ROLE_IMPOSTOR:
                     role = ROLE.ROLE_CAMPER
                     break

                  case ROLE.ROLE_SPECTATOR_IMPOSTOR:
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
               gs.voteTargetScore = GetMatchScore( results.highestRecipients[0] )
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

         let json = HttpService.JSONEncode( gs )
         SetNetVar( player, NETVAR_JSON_GAMESTATE, json )
      }

      //print( "revealedImpostor: " + revealedImpostor )
      //print( "this.winOnlybyEscaping: " + this.winOnlybyEscaping )
      //print( "Bool: " + ( revealedImpostor || this.winOnlybyEscaping ) )

      Assert( this.GetGameState() < GAME_STATE.GAME_STATE_PLAYING || revealedImpostor, "Didn't reveal imposter" )
   }

   public SetGameState( state: GAME_STATE )
   {
      let match = this
      Assert( IsServer(), "Server only" )

      print( "\nSet Match State " + state + ", Time since last change: " + math.floor( ( Workspace.DistributedGameTime - this._gameStateChangedTime ) ) )
      //print( "Stack: " + debug.traceback() )

      Assert( state >= GAME_STATE.GAME_STATE_COMPLETE || this.gameState < GAME_STATE.GAME_STATE_COMPLETE, "Illegal match state setting. Tried to set state " + state + ", but match state was " + this.gameState )

      this._gameStateChangedTime = Workspace.DistributedGameTime
      this.gameState = state

      let thread = this.gameThread
      Assert( thread !== undefined, "No match thread!" )
      if ( thread === coroutine.running() )
         return

      this.UpdateGame()

      for ( let func of file.gameStateChangedCallbacks )
      {
         Thread(
            function ()
            {
               func( match )
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
            case ROLE.ROLE_IMPOSTOR:
               players.push( player )
               break
         }
      }
      return players
   }

   public GetAllPlayerInfo(): Array<PlayerInfo>
   {
      let playerInfos: Array<PlayerInfo> = []
      for ( let pair of this.playerToInfo )
      {
         playerInfos.push( pair[1] )
      }
      return playerInfos
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
      Assert( this.playerToInfo.has( player ), "Player is not in match" )
      this.playerToInfo.delete( player )
   }



   //////////////////////////////////////////////////////
   // 
   //    SHARED
   // 
   //////////////////////////////////////////////////////
   private gameState: GAME_STATE = GAME_STATE.GAME_STATE_INIT
   private _gameStateChangedTime = 0
   private playerToInfo = new Map<Player, PlayerInfo>()
   private votes: Array<PlayerVote> = []
   corpses: Array<Corpse> = []


   public GameStateHasTimeLimit(): boolean
   {
      let timeRemaining = this._GetTimeRemainingForState()
      return timeRemaining !== undefined
   }

   public GetTimeRemainingForState(): number
   {
      Assert( this.GameStateHasTimeLimit(), "Expected time limited gamestate" )
      return this._GetTimeRemainingForState() as number
   }

   public PollingGameState(): boolean
   {
      switch ( this.gameState )
      {
         case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
         case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
         case GAME_STATE.GAME_STATE_COUNTDOWN:
            return true
      }

      return false
   }

   private _GetTimeRemainingForState(): number | undefined
   {
      let timeRemaining = 0
      switch ( this.gameState )
      {
         case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
            timeRemaining = RESERVEDSERVER_WAITS_FOR_PLAYERS
            break

         case GAME_STATE.GAME_STATE_INTRO:
            if ( DEV_SKIP_INTRO )
               timeRemaining = SKIP_INTRO_TIME
            else
               timeRemaining = INTRO_TIME
            break

         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            timeRemaining = MEETING_DISCUSS_TIME
            break

         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            timeRemaining = MEETING_VOTE_TIME
            break

         case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
            timeRemaining = SUDDEN_DEATH_TIME
            break

         case GAME_STATE.GAME_STATE_COUNTDOWN:
            timeRemaining = START_COUNTDOWN
            break

         default:
            return undefined
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
         Assert( userIdToPlayer.has( voteUserID ), "VoteuserID " + voteUserID + "  does not exist in match, userIdToPlayer size " + userIdToPlayer.size() )
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
         else if ( role === ROLE.ROLE_SPECTATOR_IMPOSTOR )
            Assert( this.GetPlayerRole( player ) === ROLE.ROLE_IMPOSTOR, "Bad role assignment" )
      }

      Assert( this.playerToInfo.has( player ), "SetPlayerRole: Match does not have " + player.Name )
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

   public GetAllPlayersWithCharacters(): Array<Player>
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

   public GetLivingImpostors(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_IMPOSTOR ).filter( function ( player )
      {
         return player.Character !== undefined
      } )
   }

   public GetImpostors(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_IMPOSTOR ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_IMPOSTOR ) )
   }

   public GetSpectators(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_CAMPER ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_IMPOSTOR ) )
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

   public AddPlayer( player: Player ): PlayerInfo
   {
      Assert( !this.playerToInfo.has( player ), "Match already has " + player.Name )
      let playerInfo = new PlayerInfo( player )
      this.playerToInfo.set( player, playerInfo )

      let character = player.Character
      if ( character !== undefined )
         this.Shared_OnGameStateChanged_PerPlayer( player, this.GetGameState() )

      return playerInfo
   }

   public IsSpectator( player: Player ): boolean
   {
      return IsSpectatorRole( this.GetPlayerRole( player ) )
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

   public IsImpostor( player: Player ): boolean
   {
      return IsImpostorRole( this.GetPlayerRole( player ) )
   }

   public GetPlayerRole( player: Player ): ROLE
   {
      Assert( this.playerToInfo.has( player ), "GetPlayerRole: Match does not have " + player.Name )
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
   public NetvarToGamestate()
   {
      //print( "\nNetvarToGamestate_ReturnServerTimeDelta()" )
      Assert( IsClient(), "Client only" )
      let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_GAMESTATE )
      Assert( json.size() > 0 )

      let gs = HttpService.JSONDecode( json ) as NETVAR_GameState
      let userIdToPlayer = UserIDToPlayer()
      this.gameState = gs.gameState

      this._gameStateChangedTime = gs.gsChangedTime + GetDeltaTime()
      this.startingImpostorCount = gs.startingImpostorCount

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
            let playerInfo = this.SetPlayerRole( player, role )

            Assert( playerInfo !== undefined, "playerInfo !== undefined" )
            playerInfo.playernum = gsPlayerInfo.playernum
         }

         let localSpectator = this.IsSpectator( LOCAL_PLAYER )

        for ( let player of this.GetAllPlayers() )
         {
            if ( this.IsSpectator( player ) )
            {
               if ( player === LOCAL_PLAYER )
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
         let currentCorpses = new Map<number, boolean>()
         for ( let corpse of this.corpses )
         {
            currentCorpses.set( corpse.player.UserId, true )
         }

         let sentCorpse = new Map<number, boolean>()
         for ( let corpseInfo of gs.corpses )
         {
            sentCorpse.set( corpseInfo.userId, true )
            if ( currentCorpses.has( corpseInfo.userId ) )
               continue

            // can't draw the player if the got off the server too fast
            let player = userIdToPlayer.get( corpseInfo.userId )
            if ( player !== undefined )
               this.corpses.push( new Corpse( player, new Vector3( corpseInfo.X, corpseInfo.Y, corpseInfo.Z ) ) )
         }

         // remove corpses that are no longer sent
         for ( let i = 0; i < this.corpses.size(); i++ )
         {
            let corpse = this.corpses[i]
            if ( sentCorpse.has( corpse.player.UserId ) )
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
   }
}

export function SH_GameStateSetup()
{
   AddNetVar( "string", NETVAR_JSON_ASSIGNMENTS, "{}" )
   AddNetVar( "string", NETVAR_JSON_GAMESTATE, "" )
   AddNetVar( "number", NETVAR_MEETINGS_CALLED, 0 )
   AddNetVar( "number", NETVAR_SCORE, 0 )
   AddNetVar( "number", NETVAR_STASH, 0 )
   AddNetVar( "number", NETVAR_LAST_STASHED, 0 )

   AddCooldown( COOLDOWN_NAME_KILL, COOLDOWNTIME_KILL )
   AddCooldown( COOLDOWN_NAME_MEETING, COOLDOWNTIME_MEETING )

   AddRoleChangeCallback(
      function ( player: Player, role: ROLE, lastRole: ROLE )
      {
         if ( IsImpostorRole( role ) )
         {
            if ( !IsImpostorRole( lastRole ) )
            {
               // became an imposter
               GiveAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
            }
         }
         else if ( IsImpostorRole( lastRole ) )
         {
            // became not an imposter
            TakeAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
         }
      } )

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

export function IsImpostorRole( role: ROLE ): boolean
{
   switch ( role )
   {
      case ROLE.ROLE_SPECTATOR_IMPOSTOR:
      case ROLE.ROLE_IMPOSTOR:
         return true
   }

   return false
}

export function IsCamperRole( role: ROLE ): boolean
{
   switch ( role )
   {
      case ROLE.ROLE_CAMPER:
      case ROLE.ROLE_SPECTATOR_CAMPER:
      case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
         return true
   }

   return false
}

export function AddGameStateChangedCallback( func: ( match: Match ) => void )
{
   file.gameStateChangedCallbacks.push( func )
}

export function AddGameCreatedCallback( func: ( match: Match ) => void )
{
   file.gameCreatedCallbacks.push( func )
}

export function IsSpectatorRole( role: ROLE ): boolean
{
   switch ( role )
   {
      case ROLE.ROLE_SPECTATOR_CAMPER:
      case ROLE.ROLE_SPECTATOR_IMPOSTOR:
      case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
      case ROLE.ROLE_SPECTATOR_LATE_JOINER:
         return true
   }

   return false
}
