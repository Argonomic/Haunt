import { Workspace } from "@rbxts/services"
import { AddNetVar } from "shared/sh_player_netvars"
import { AddCooldown } from "./sh_cooldown"
import { SetPlayerWalkSpeed, GetPlayerFromUserID, GetPlayerFromUserIDString } from "./sh_onPlayerConnect"
import { MEETING_DISCUSS_TIME, MEETING_VOTE_TIME, PLAYER_WALKSPEED_SPECTATOR, PLAYER_WALKSPEED, SUDDEN_DEATH_TIME, DEV_SKIP_INTRO, INTRO_TIME, SKIP_INTRO_TIME, MEETING_VOTE_RESULTS, START_COUNTDOWN } from "./sh_settings"
import { IsServer, Thread } from "./sh_utils"
import { Assert } from "shared/sh_assert"
import { GiveAbility, TakeAbility } from "./sh_ability"
import { ABILITIES } from "./content/sh_ability_content"
import { NETVAR_LAST_STASHED, NETVAR_SCORE, NETVAR_STASH } from "./sh_score"
import { CreateSharedInt } from "./sh_sharedVar"
import { GameModeConsts, GetGameModeConsts } from "./sh_gameModeConsts"

export const NETVAR_JSON_ASSIGNMENTS = "JS_TL"
export const NETVAR_JSON_GAMESTATE = "JS_GS"
export const NETVAR_MEETINGS_CALLED = "N_MC"
export const NETVAR_PURCHASED_IMPOSTOR = "N_PI"
export const SHAREDVAR_GAMEMODE_CANREQLOBBY = "SHAREDVAR_GAMEMODE_CANREQLOBBY"

export type USERID = number
export type USERIDSTRING = string
export type MATCHINDEX = number

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
   GAME_STATE_INTRO, // 3
   GAME_STATE_PLAYING, // 4
   GAME_STATE_MEETING_DISCUSS, // 5
   GAME_STATE_MEETING_VOTE,// 6
   GAME_STATE_MEETING_RESULTS,// 7
   GAME_STATE_SUDDEN_DEATH, // 8
   GAME_STATE_COMPLETE, // 9
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
   onRoleChangeCallback: Array<( ( player: Player, match: Match ) => void )> = []
   gameCreatedCallbacks: Array<( ( match: Match ) => void )> = []
   gameIndex: MATCHINDEX = -1
}
let file = new File()

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

export class NS_Corpse
{
   userId: USERID
   x: number
   y: number
   z: number

   constructor( player: Player, pos: Vector3 )
   {
      this.userId = player.UserId
      this.x = pos.X
      this.y = pos.Y
      this.z = pos.Z
   }
}

export class PlayerInfo
{
   role: ROLE = ROLE.ROLE_UNASSIGNED
   playernum = -1
   _userid: number
   killed = false

   constructor( id: number )
   {
      this._userid = id
   }
}

export class PlayerVote
{
   voter: number
   target: number | undefined

   constructor( voter: number, target: number | undefined )
   {
      this.voter = voter
      this.target = target
   }
}

class NS_MeetingDetails
{
   readonly meetingCaller: USERID
   readonly meetingType: MEETING_TYPE
   readonly meetingCallerRoomName: string
   readonly meetingBody: USERID | undefined

   constructor( meetingCaller: USERID, meetingType: MEETING_TYPE, meetingCallerRoomName: string, meetingBody: USERID | undefined )
   {
      this.meetingCaller = meetingCaller
      this.meetingType = meetingType
      this.meetingCallerRoomName = meetingCallerRoomName
      this.meetingBody = meetingBody
   }
}

// transferrable, no entities
export class NS_SharedMatchState
{
   playerToInfo = new Map<USERIDSTRING, PlayerInfo>()
   votes: Array<PlayerVote> = []
   gameState: GAME_STATE = GAME_STATE.GAME_STATE_INIT

   meetingDetails: NS_MeetingDetails | undefined
   startingImpostorCount = 0
   dbg_spc = 0
   highestVotedScore = 0
   gameIndex: MATCHINDEX = -999

   _gameStateChangedTime = 0
   corpses: Array<NS_Corpse> = []
}

class ServerOnlyState
{
   timeNextWaitingCoins = 0
   roundsPassed = 0 // whenever a meeting is called and there is a new kill, a round passes
   previouslyLivingCampers = 0
   assignments = new Map<Player, Array<Assignment>>()
   updateTracker = 0
}

export class Match
{
   constructor()
   {
      file.gameIndex++

      let match = this
      match.shState.gameIndex = file.gameIndex

      for ( let func of file.gameCreatedCallbacks )
      {
         Thread(
            function ()
            {
               func( match )
            } )
      }
   }

   //////////////////////////////////////////////////////
   // 
   //    SERVER   ONLY
   // 
   //////////////////////////////////////////////////////

   gameThread: thread | undefined

   private svState = new ServerOnlyState()
   shState = new NS_SharedMatchState

   public GetSVState(): ServerOnlyState
   {
      Assert( IsServer(), "Server only" )
      return this.svState
   }

   public ClearMeetingDetails()
   {
      this.shState.meetingDetails = undefined
   }

   public GetMeetingDetails(): NS_MeetingDetails | undefined
   {
      return this.shState.meetingDetails
   }

   public SetMeetingDetails( caller: Player, meetingType: MEETING_TYPE, meetingCallerRoomName: string, body: USERID | undefined )
   {
      this.shState.meetingDetails = new NS_MeetingDetails( caller.UserId, meetingType, meetingCallerRoomName, body )
   }

   public GetGameResults_ParityAllowed(): GAMERESULTS
   {
      let match = this
      let gmc = GetGameModeConsts()

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
         {
            if ( gmc.impostorBattle )
            {
               if ( impostors === 1 )
                  return GAMERESULTS.RESULTS_IMPOSTORS_WIN
            }
            else
            {
               return GAMERESULTS.RESULTS_IMPOSTORS_WIN
            }
         }

         if ( gmc.suddenDeathEnabled )
         {
            if ( impostors >= campers )
               return GAMERESULTS.RESULTS_SUDDEN_DEATH
         }

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

   public GetTimeInGameState(): number
   {
      return Workspace.DistributedGameTime - this.shState._gameStateChangedTime
   }

   public GetLivingPlayers(): Array<Player>
   {
      let players: Array<Player> = []
      for ( let pair of this.shState.playerToInfo )
      {
         let player = GetPlayerFromUserIDString( pair[0] )
         let playerInfo = pair[1]

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
      for ( let pair of this.shState.playerToInfo )
      {
         playerInfos.push( pair[1] )
      }
      return playerInfos
   }

   public GetPlayerInfo( player: Player ): PlayerInfo
   {
      let id = player.UserId + ""
      Assert( this.shState.playerToInfo.has( id ), "Unknown player " + player.Name )
      let playerInfo = this.shState.playerToInfo.get( id ) as PlayerInfo
      Assert( playerInfo._userid === player.UserId, "WRONG PLAYER ID" )

      return this.shState.playerToInfo.get( id ) as PlayerInfo
   }

   public RemovePlayersNotInList( players: Array<Player> )
   {
      let userids = new Map<USERIDSTRING, boolean>()
      for ( let player of players )
      {
         userids.set( player.UserId + "", true )
      }

      for ( let pair of this.shState.playerToInfo )
      {
         if ( !userids.has( pair[0] ) )
            this.shState.playerToInfo.delete( pair[0] )
      }
   }

   public GetPlayerKilled( player: Player ): boolean
   {
      let playerInfo = this.GetPlayerInfo( player )
      return playerInfo.killed
   }

   public GetPlayerInfoFromUserID( userId: number ): PlayerInfo | undefined
   {
      for ( let pair of this.shState.playerToInfo )
      {
         if ( pair[1]._userid === userId )
            return pair[1]
      }
      return undefined
   }

   //////////////////////////////////////////////////////
   // 
   //    SHARED
   // 
   //////////////////////////////////////////////////////

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
      switch ( this.GetGameState() )
      {
         case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
         case GAME_STATE.GAME_STATE_COUNTDOWN:
            return true
      }

      return false
   }

   private _GetTimeRemainingForState(): number | undefined
   {
      let timeRemaining = 0
      switch ( this.GetGameState() )
      {
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

         case GAME_STATE.GAME_STATE_MEETING_RESULTS:
            timeRemaining = MEETING_VOTE_RESULTS
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
      this.shState.votes = []
   }

   public GetGameStateChangedTime(): number
   {
      return this.shState._gameStateChangedTime
   }

   public CompletedExitTask( player: Player ): boolean
   {
      if ( !this.svState.assignments.has( player ) )
         return false

      let assignments = this.svState.assignments.get( player ) as Array<Assignment>
      for ( let assignment of assignments )
      {
         if ( assignment.taskName === TASK_EXIT )
            return assignment.status === 1
      }
      return false
   }

   public GetAllPlayers(): Array<Player>
   {
      let players: Array<Player> = []
      for ( let pair of this.shState.playerToInfo )
      {
         let player = GetPlayerFromUserIDString( pair[0] )
         players.push( player )
      }
      return players
   }

   public GetCampers(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_CAMPER ).concat( this.GetPlayersOfRole( ROLE.ROLE_SPECTATOR_CAMPER ) )
   }

   public GetLivingCampers(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_CAMPER )
   }

   public GetLivingCampersCount(): number
   {
      return this.GetLivingCampers().size()
   }

   public GetLivingImpostorsCount(): number
   {
      return this.GetLivingImpostors().size()
   }

   public GetLivingImpostors(): Array<Player>
   {
      return this.GetPlayersOfRole( ROLE.ROLE_IMPOSTOR )
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
      for ( let pair of this.shState.playerToInfo )
      {
         if ( pair[1].role === role )
         {
            let player = GetPlayerFromUserIDString( pair[0] )
            players.push( player )
         }
      }
      return players
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
      Assert( this.shState.playerToInfo.has( player.UserId + "" ), "GetPlayerRole: Match does not have " + player.Name )
      return ( this.shState.playerToInfo.get( player.UserId + "" ) as PlayerInfo ).role
   }

   public HasPlayer( player: Player ): boolean
   {
      return this.shState.playerToInfo.has( player.UserId + "" )
   }

   public InActiveGameState()
   {
      switch ( this.GetGameState() )
      {
         case GAME_STATE.GAME_STATE_PLAYING:
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         case GAME_STATE.GAME_STATE_MEETING_VOTE:
         case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
            return true
      }
      return false
   }

   public GetGameState()
   {
      return this.shState.gameState
   }

   public GetVotes()
   {
      return this.shState.votes
   }

   public DidVote( player: Player ): boolean
   {
      for ( let vote of this.shState.votes )
      {
         if ( vote.voter === player.UserId )
            return true
      }
      return false
   }

   public Shared_OnGameStateChanged_PerPlayer( player: Player, match: Match )
   {
      SetPlayerWalkspeedForGameState( player, match )

      UpdatePlayerAbilities( player, match )
   }
}

export function SH_GameStateSetup()
{
   AddNetVar( "string", NETVAR_JSON_ASSIGNMENTS, "{}" )
   AddNetVar( "string", NETVAR_JSON_GAMESTATE, "" )
   AddNetVar( "number", NETVAR_MEETINGS_CALLED, 0 )
   AddNetVar( "number", NETVAR_SCORE, 0 )
   AddNetVar( "number", NETVAR_STASH, 0 )
   AddNetVar( "number", NETVAR_PURCHASED_IMPOSTOR, 0 )
   AddNetVar( "number", NETVAR_LAST_STASHED, 0 )

   let gmc = GetGameModeConsts()
   AddCooldown( COOLDOWN_NAME_KILL, gmc.cooldownKill )
   AddCooldown( COOLDOWN_NAME_MEETING, gmc.meetingCooldown )

   CreateSharedInt( SHAREDVAR_GAMEMODE_CANREQLOBBY, 0 )

   AddRoleChangeCallback( UpdatePlayerAbilities )
}

function UpdatePlayerAbilities( player: Player, match: Match )
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( match.IsImpostor( player ) )
            GiveAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
         else
            TakeAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
         break

      default:
         TakeAbility( player, ABILITIES.ABILITY_SABOTAGE_LIGHTS )
         break
   }
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
   let voteCount = new Map<USERID, number>()
   let voted: Array<Player> = []

   for ( let vote of votes )
   {
      voted.push( GetPlayerFromUserID( vote.voter ) )
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
      let player = GetPlayerFromUserID( pair[0] )
      if ( pair[1] > 0 )
         receivedAnyVotes.push( player )

      if ( pair[1] === highestCount )
         highestRecipients.push( player )
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

export function AddRoleChangeCallback( func: ( player: Player, match: Match ) => void )
{
   file.onRoleChangeCallback.push( func )
}

export function ExecRoleChangeCallbacks( player: Player, match: Match )
{
   for ( let func of file.onRoleChangeCallback )
   {
      Thread(
         function ()
         {
            func( player, match )
         } )
   }
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


export function AddMatchCreatedCallback( func: ( match: Match ) => void )
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

export function SetPlayerWalkspeedForGameState( player: Player, match: Match )
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
      case GAME_STATE.GAME_STATE_COUNTDOWN:
      //case GAME_STATE.GAME_STATE_RESERVED_SERVER_WAITING:
      //case GAME_STATE.GAME_STATE_INTRO:
      case GAME_STATE.GAME_STATE_PLAYING:
      //case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      //case GAME_STATE.GAME_STATE_MEETING_VOTE:
      //case GAME_STATE.GAME_STATE_MEETING_RESULTS:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         //case GAME_STATE.GAME_STATE_COMPLETE:

         if ( match.IsSpectator( player ) )
            SetPlayerWalkSpeed( player, PLAYER_WALKSPEED_SPECTATOR )
         else
            SetPlayerWalkSpeed( player, PLAYER_WALKSPEED )
         break

      default:
         SetPlayerWalkSpeed( player, 0 )
         break
   }
}


export function CanUseTask( match: Match, player: Player ): boolean
{
   switch ( match.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_INIT:
      case GAME_STATE.GAME_STATE_WAITING_FOR_PLAYERS:
      case GAME_STATE.GAME_STATE_COUNTDOWN:
      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         return true
   }
   return false
}

