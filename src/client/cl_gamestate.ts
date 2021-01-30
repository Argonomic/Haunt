import { HttpService, Workspace } from "@rbxts/services"
import { ROLE, Match, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE, GetVoteResults, MEETING_TYPE, AddRoleChangeCallback, Assignment, AssignmentIsSame, NETVAR_JSON_ASSIGNMENTS, PlayerInfo, USERID, NS_SharedMatchState, ExecRoleChangeCallbacks } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected, ClonePlayerModel, GetPlayerFromUserID } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { GetUsableByType } from "shared/sh_use"
import { ArrayRandom, GetFirstChildWithName, GetLocalPlayer, LoadSound, RandomFloatRange, RecursiveOnChildren, Resume, SetCharacterTransparency, SetPlayerTransparency, Thread, UserIDToPlayer, WaitThread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { UpdateMeeting } from "./cl_meeting"
import { DrawMatchScreen_EmergencyMeeting, DrawMatchScreen_Escaped, DrawMatchScreen_VoteResults } from "./content/cl_matchScreen_content"
import { GetLastStashed } from "shared/sh_score"
import { DEV_SKIP_INTRO, SPECTATOR_TRANS } from "shared/sh_settings"
import { SetLocalViewToRoom, GetRoom } from "./cl_rooms"
import { GetDeltaTime } from "shared/sh_time"
import { CanKill, CanReportBody, SharedKillGetter } from "shared/content/sh_use_content"
import { CoinFloatsAway, COIN_TYPE, GetCoinDataFromType, GetCoinFolder, HasCoinFolder } from "shared/sh_coins"
import { DrawRisingNumberFromWorldPos } from "./cl_coins"
import { AddRPC } from "shared/sh_rpc"
import { GetGameModeConsts } from "shared/sh_gameModeConsts"

const LOCAL_PLAYER = GetLocalPlayer()

class ClientCorpseModel
{
   model: Model
   pos: Vector3

   constructor( model: Model, pos: Vector3 )
   {
      this.model = model
      this.pos = pos
   }
}

class File
{
   readonly clientMatch = new Match()

   corpseToCorpseModel = new Map<USERID, ClientCorpseModel>()

   localAssignments: Array<Assignment> = []
   gainedAssignmentTime = new Map<string, number>()

   currentDynamicArt: Array<BasePart> = []

   onGainedTaskCallback = new Map<string, Array<() => void>>()

   gemSound = LoadSound( 3147769418 ) // 1369094465 )
   coinSounds: Array<Sound> = [
      //LoadSound( 4612374937 ),
      //LoadSound( 4612375051 ),
      //LoadSound( 4612374807 ),
      LoadSound( 607665037 ),
      LoadSound( 607662191 ),
      LoadSound( 359628148 ),
      LoadSound( 4612376715 ),
   ]
}

let file = new File()
{
   let playerInfo = new PlayerInfo( LOCAL_PLAYER.UserId )
   file.clientMatch.shState.playerToInfo.set( LOCAL_PLAYER.UserId + "", playerInfo )
}

export function GetLocalMatch(): Match
{
   return file.clientMatch
}

export function GetLocalRole(): ROLE 
{
   if ( file.clientMatch.HasPlayer( GetLocalPlayer() ) )
      return file.clientMatch.GetPlayerRole( GetLocalPlayer() )
   return ROLE.ROLE_CAMPER
}

export function GetLocalIsSpectator(): boolean
{
   return file.clientMatch.IsSpectator( GetLocalPlayer() )
}

function ClientGameThread( match: Match )
{
   let lastGameState = match.GetGameState()
   let playersToLastKnownRole = new Map<Player, ROLE>()

   let gameStateFuncs = GetGameModeConsts()
   if ( gameStateFuncs === undefined )
   {
      Assert( false, "No game mode" )
      throw undefined
   }


   for ( ; ; )
   {
      let gameState = match.GetGameState()

      let lastGameStateForMeeting = lastGameState
      if ( gameState !== lastGameState )
      {
         CLGameStateChanged( match, lastGameState )
         gameStateFuncs.gameStateChanged( match, lastGameState )

         lastGameState = gameState
      }

      gameStateFuncs.gameStateThink( match )

      UpdateMeeting( match, lastGameStateForMeeting )

      for ( let player of match.GetAllPlayers() )
      {
         let role = match.GetPlayerRole( player )
         if ( !playersToLastKnownRole.has( player ) )
            playersToLastKnownRole.set( player, role )

         let lastRole = playersToLastKnownRole.get( player ) as ROLE
         if ( lastRole !== role )
            ExecRoleChangeCallbacks( player, match )
         playersToLastKnownRole.set( player, role )
      }

      coroutine.yield() // wait until something says update again
   }
}

export function AddGainedTaskCallback( taskName: string, func: () => void )
{
   if ( file.onGainedTaskCallback.get( taskName ) === undefined )
      file.onGainedTaskCallback.set( taskName, [] )
   let callbacks = file.onGainedTaskCallback.get( taskName ) as Array<() => void>
   callbacks.push( func )
}

export function CL_GameStateSetup()
{
   /*
   Thread(
      function ()
      {
         wait( 3 )
         let corpseModel = CreateCorpse( LOCAL_PLAYER, GetPosition( LOCAL_PLAYER ) )
         if ( corpseModel !== undefined )
         {
            let pos = GetPosition( corpseModel )
            let d = 3
         }

      } )
   */

   let match = file.clientMatch
   let gameThread = coroutine.create(
      function ()
      {
         ClientGameThread( match as Match )
      } )
   match.gameThread = gameThread
   Resume( match.gameThread )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      //file.clientMatch.AddPlayer( player )
   } )

   let lastAssignments: Array<Assignment> = []

   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_ASSIGNMENTS )
         let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
         for ( let assignment of assignments )
         {
            if ( assignment.status !== 0 )
               continue

            let foundAssignment = false
            for ( let lastAssignment of lastAssignments )
            {
               if ( AssignmentIsSame( lastAssignment, assignment.roomName, assignment.taskName ) )
                  continue
               foundAssignment = true
               break
            }

            if ( !foundAssignment )
            {
               let callbacks = file.onGainedTaskCallback.get( assignment.taskName )
               if ( callbacks === undefined )
                  continue

               for ( let callback of callbacks )
               {
                  Thread(
                     function ()
                     {
                        callback()
                     } )
               }
            }
         }

         file.localAssignments = assignments

         let lostAssignments = new Map<string, boolean>()
         for ( let pair of file.gainedAssignmentTime )
         {
            lostAssignments.set( pair[0], true )
         }

         for ( let assignment of assignments )
         {
            let compoundName = GetCompoundName( assignment )
            if ( lostAssignments.has( compoundName ) )
               lostAssignments.delete( compoundName )

            if ( !file.gainedAssignmentTime.has( compoundName ) )
               file.gainedAssignmentTime.set( compoundName, Workspace.DistributedGameTime )
         }

         for ( let pair of lostAssignments )
         {
            // remove assignments we don't have anymore
            file.gainedAssignmentTime.delete( pair[0] )
         }

         file.localAssignments.sort( SortAssignments )
         /*
         print( "\nUpdated Assignments:" )
         for ( let assignment of file.localAssignments )
         {
            let compoundName = GetCompoundName( assignment )
            let time = Workspace.DistributedGameTime - ( file.gainedAssignmentTime.get( compoundName ) as number )
            print( assignment.taskName + " for " + time )
         }         
         */
      } )

   AddRoleChangeCallback(
      function ( player: Player, match: Match )
      {
         Thread(
            function ()
            {
               if ( player !== LOCAL_PLAYER )
                  return

               let role = match.GetPlayerRole( player )
               if ( role !== ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
                  return

               let score = GetLastStashed( LOCAL_PLAYER )
               DrawMatchScreen_Escaped( match.GetPlayerInfo( LOCAL_PLAYER ), score )
            } )

      } )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let match = GetLocalMatch()
      if ( match.HasPlayer( player ) )
         match.Shared_OnGameStateChanged_PerPlayer( player, match )
   } )

   {
      let usable = GetUsableByType( USETYPES.USETYPE_KILL )
      usable.forceVisibleTest =
         function ()
         {
            return CanKill( GetLocalMatch(), LOCAL_PLAYER )
         }

      usable.DefineGetter(
         function ( player: Player ): Array<Player>
         {
            return SharedKillGetter( GetLocalMatch(), player )
         } )
   }

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         let match = GetLocalMatch()

         if ( !CanReportBody( match, player ) )
            return []

         let positions: Array<Vector3> = []
         for ( let corpse of match.shState.corpses )
         {
            let corpseModel = GetCorpseClientModel( corpse.userId )
            if ( corpseModel !== undefined )
               positions.push( corpseModel.pos )
         }
         return positions
      } )



   AddRPC( "RPC_FromServer_PickupCoin",
      function ( userId: number, pickupName: string, coinType: COIN_TYPE )
      {
         let userIdToPlayer = UserIDToPlayer()
         let _player = userIdToPlayer.get( userId )
         if ( _player === undefined )
            return
         let player = _player as Player

         let _pos: Vector3 | undefined

         {
            let match = GetLocalMatch()
            if ( !HasCoinFolder( match ) )
               return

            let folder = GetCoinFolder( match )
            let _pickup = GetFirstChildWithName( folder, pickupName )
            if ( _pickup === undefined )
               return
            let pickup = _pickup as BasePart
            _pos = pickup.Position.add( new Vector3( 0, 3.5, 0 ) )

            Thread(
               function ()
               {
                  let clone = pickup.Clone()
                  clone.Parent = Workspace
                  clone.Name = "clone"
                  pickup.Destroy()
                  CoinFloatsAway( player, clone )
               } )
         }

         if ( player !== LOCAL_PLAYER )
            return

         let coinData = GetCoinDataFromType( coinType )

         let pos = _pos as Vector3
         DrawRisingNumberFromWorldPos( pos, coinData.value, coinData.color )

         Thread( function ()
         {
            let waittime = RandomFloatRange( 0, 0.25 )
            if ( waittime > 0 )
               wait( waittime )

            switch ( coinType )
            {
               case COIN_TYPE.TYPE_GEM:
                  {
                     let sound = file.gemSound
                     sound.Volume = 0.75
                     sound.Play()
                  }
                  break

               case COIN_TYPE.TYPE_GOLD:
                  {
                     let sound = ArrayRandom( file.coinSounds ) as Sound
                     sound.Volume = 0.5
                     sound.Play()
                  }
                  break

               case COIN_TYPE.TYPE_SILVER:
                  {
                     let sound = ArrayRandom( file.coinSounds ) as Sound
                     sound.Volume = 0.25
                     sound.Play()
                  }
                  break
            }
         } )
      } )


   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      let match = GetLocalMatch()

      {
         let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_GAMESTATE )
         if ( !json.size() )
            return
         Assert( json.size() > 0 )

         let oldCorpses = match.shState.corpses
         match.shState = HttpService.JSONDecode( json ) as NS_SharedMatchState
         match.shState._gameStateChangedTime += GetDeltaTime() // modify times for latency

         // update LOCAL TRANSPARENCY
         {
            let localSpectator = match.IsSpectator( LOCAL_PLAYER )

            for ( let player of match.GetAllPlayers() )
            {
               if ( match.IsSpectator( player ) )
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

         // update CLIENT SIDE CORPSE MODELS
         {
            let leftOverCorpses = new Map<USERID, boolean>()
            for ( let corpse of oldCorpses )
            {
               leftOverCorpses.set( corpse.userId, true )
            }

            // remove corpse models that are no longer sent
            for ( let corpse of match.shState.corpses )
            {
               if ( leftOverCorpses.has( corpse.userId ) )
                  leftOverCorpses.delete( corpse.userId )

               if ( GetCorpseClientModel( corpse.userId ) === undefined )
               {
                  let corpsePos = new Vector3( corpse.x, corpse.y, corpse.z )
                  let corpseModel = CreateCorpse( GetPlayerFromUserID( corpse.userId ), corpsePos )
                  if ( corpseModel !== undefined )
                     file.corpseToCorpseModel.set( corpse.userId, corpseModel )
               }
            }

            for ( let pair of leftOverCorpses )
            {
               let corpseModel = GetCorpseClientModel( pair[0] )
               if ( corpseModel !== undefined )
               {
                  corpseModel.model.Destroy()
                  file.corpseToCorpseModel.delete( pair[0] )
               }
            }
         }
      }

      if ( match.gameThread === undefined )
      {
         Assert( false, "match.gameThread is undefined" )
         throw undefined
      }

      if ( coroutine.status( match.gameThread ) === "suspended" )
         Resume( match.gameThread )
   } )
}


export function GetCorpseClientModel( userId: USERID ): ClientCorpseModel | undefined
{
   return file.corpseToCorpseModel.get( userId )
}

function CLGameStateChanged( match: Match, oldGameState: number )
{
   let newGameState = match.GetGameState()
   print( "\nGAME STATE CHANGED FROM " + oldGameState + " TO " + newGameState )

   for ( let player of match.GetAllPlayers() )
   {
      Assert( match.HasPlayer( player ), "Match doesn't have player??" )
      if ( player.Character !== undefined )
         match.Shared_OnGameStateChanged_PerPlayer( player, match )
   }

   // leaving this match state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INIT:
         for ( let model of file.currentDynamicArt )
         {
            model.Destroy()
         }

         break


      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         print( "LEAVING GAME STATE GAME_STATE_MEETING_VOTE" )
         let voteResults = GetVoteResults( match.GetVotes() )
         let voted = voteResults.voted
         let votedAndReceivedNoVotesMap = new Map<Player, boolean>()
         for ( let voter of voted )
         {
            votedAndReceivedNoVotesMap.set( voter, true )
         }

         for ( let receiver of voteResults.receivedAnyVotes )
         {
            if ( votedAndReceivedNoVotesMap.has( receiver ) )
               votedAndReceivedNoVotesMap.delete( receiver )
         }

         let votedAndReceivedNoVotes: Array<Player> = []
         for ( let pair of votedAndReceivedNoVotesMap )
         {
            votedAndReceivedNoVotes.push( pair[0] )
         }

         let wasImpostor = false
         if ( voteResults.highestRecipients.size() === 1 )
            wasImpostor = match.IsImpostor( voteResults.highestRecipients[0] )

         let impostorsRemaining = match.shState.startingImpostorCount
         for ( let player of match.GetAllPlayers() )
         {
            if ( match.IsImpostor( player ) && match.IsSpectator( player ) )
               impostorsRemaining--
         }

         print( "\N STARTING PLAYER COUNT " + match.shState.dbg_spc )
         print( "Impostors remaining " + impostorsRemaining )
         print( "Players remaining: " + match.GetAllPlayers().size() )
         for ( let player of match.GetAllPlayers() )
         {
            print( player.Name + " role " + match.GetPlayerRole( player ) )
         }

         Thread( function ()
         {
            DrawMatchScreen_VoteResults(
               voteResults.skipTie,
               voteResults.highestRecipients,
               voteResults.receivedAnyVotes,
               votedAndReceivedNoVotes,
               match.shState.highestVotedScore,
               wasImpostor,
               impostorsRemaining
            )
         } )

         break
   }

   // entering this match state
   switch ( newGameState )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         match.ClearVotes()
         WaitThread( function ()
         {
            let meetingDetails = match.GetMeetingDetails()
            if ( meetingDetails === undefined )
            {
               Assert( false, "No meeting details" )
               throw undefined
            }

            let meetingType = meetingDetails.meetingType
            let meetingCaller = meetingDetails.meetingCaller

            let report = false
            let body = meetingDetails.meetingBody
            let meetingCallerRoomName = meetingDetails.meetingCallerRoomName
            switch ( meetingType )
            {
               case MEETING_TYPE.MEETING_EMERGENCY:
                  body = undefined
                  break

               case MEETING_TYPE.MEETING_REPORT:
                  let room = GetRoom( meetingCallerRoomName )

                  report = true
                  Thread(
                     function ()
                     {
                        wait( 2 ) // wait for match screen to fade out
                        SetLocalViewToRoom( room )
                     } )
                  break

               default:
                  Assert( false, "Unhandled meeting type " + meetingType )
                  break
            }

            DrawMatchScreen_EmergencyMeeting( meetingType, meetingCaller, body )

            if ( report && !DEV_SKIP_INTRO )
               wait( 4 ) // time to look at crime scene
         } )
         break

   }
}

function CreateCorpse( player: Player, pos: Vector3 ): ClientCorpseModel | undefined
{
   const PUSH = 10
   const ROTVEL = 36

   let corpseCharacter = ClonePlayerModel( player )
   if ( corpseCharacter === undefined )
      return undefined
   SetCharacterTransparency( corpseCharacter, 0 )

   corpseCharacter.Name = "corspseClone"
   corpseCharacter.Parent = Workspace

      ; ( GetFirstChildWithName( corpseCharacter, "Humanoid" ) as Humanoid ).Destroy()

   RecursiveOnChildren( corpseCharacter, function ( child: Instance )
   {
      if ( child.ClassName === 'Motor6D' )
      {
         child.Destroy()
         return true // stop recursion
      }

      if ( child.IsA( 'BasePart' ) )
      {
         child.CanCollide = true
         child.Position = pos

         if ( child.Name === 'UpperTorso' )
         {
            child.Velocity = new Vector3( 0, 0, 0 )
         }
         else
         {
            child.Velocity = new Vector3( RandomFloatRange( -PUSH, PUSH ), RandomFloatRange( PUSH, PUSH * 2 ), RandomFloatRange( -PUSH, PUSH ) )
            child.RotVelocity = new Vector3( RandomFloatRange( 0, ROTVEL ), RandomFloatRange( 0, ROTVEL ), RandomFloatRange( 0, ROTVEL ) )
         }

      }

      return false // continue recursion
   } )

   return new ClientCorpseModel( corpseCharacter, pos )
}

export function GetLocalAssignments(): Array<Assignment>
{
   return file.localAssignments
}

export function ClientHasAssignment( roomName: string, taskName: string ): boolean
{
   for ( let assignment of GetLocalAssignments() )
   {
      if ( AssignmentIsSame( assignment, roomName, taskName ) )
         return true
   }
   return false
}

export function ClientGetAssignmentAssignedTime( roomName: string, taskName: string ): number
{
   for ( let pair of file.gainedAssignmentTime )
   {
      if ( GetCompoundNameFromNames( roomName, taskName ) === pair[0] )
         return pair[1]
   }

   Assert( false, "ClientGetAssignmentAssignedTime" )
   throw undefined
}

function SortAssignments( a: Assignment, b: Assignment )
{
   return ( file.gainedAssignmentTime.get( GetCompoundName( a ) ) ) as number > ( file.gainedAssignmentTime.get( GetCompoundName( b ) ) as number )
   //   return a.taskName === TASK_RESTORE_LIGHTS && b.taskName !== TASK_RESTORE_LIGHTS
}

function GetCompoundName( assignment: Assignment ): string
{
   return assignment.roomName + assignment.taskName
}

function GetCompoundNameFromNames( roomName: string, taskName: string ): string
{
   return roomName + taskName
}
