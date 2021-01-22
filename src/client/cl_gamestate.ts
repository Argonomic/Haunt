import { HttpService, Workspace } from "@rbxts/services"
import { ROLE, Match, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE, GetVoteResults, GAMERESULTS, MEETING_TYPE, IsCamperRole, IsImpostorRole, AddRoleChangeCallback, Assignment, AssignmentIsSame, NETVAR_JSON_ASSIGNMENTS, UsableGameState, PlayerInfo } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerConnected, ClonePlayerModel, ClonePlayerModels, PlayerHasClone } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { GetUsableByType } from "shared/sh_use"
import { GetFirstChildWithName, GetLocalPlayer, RandomFloatRange, RecursiveOnChildren, Resume, SetCharacterTransparency, Thread, WaitThread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { UpdateMeeting } from "./cl_meeting"
import { AddPlayerUseDisabledCallback } from "./cl_use"
import { DrawMatchScreen_EmergencyMeeting, DrawMatchScreen_Escaped, DrawMatchScreen_Intro, DrawMatchScreen_Victory, DrawMatchScreen_VoteResults } from "./content/cl_matchScreen_content"
import { GetLastStashed } from "shared/sh_score"
import { DEV_SKIP_INTRO, SKIP_INTRO_TIME } from "shared/sh_settings"
import { ReservedServerRelease } from "./cl_matchScreen"
import { SetLocalViewToRoom, GetCurrentRoom, GetRoom } from "./cl_rooms"
import { Room } from "shared/sh_rooms"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   readonly clientMatch = new Match()

   localAssignments: Array<Assignment> = []
   gainedAssignmentTime = new Map<string, number>()

   currentDynamicArt: Array<BasePart> = []
}

let file = new File()

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

function SortLocalPlayer( a: Player, b: Player ): boolean
{
   return a === LOCAL_PLAYER && b !== LOCAL_PLAYER
}

function ClientGameThread( match: Match )
{
   let lastGameState = match.GetGameState()

   for ( ; ; )
   {
      let gameState = match.GetGameState()

      let lastGameStateForMeeting = lastGameState
      if ( gameState !== lastGameState )
      {
         CLGameStateChanged( match, lastGameState, gameState )
         lastGameState = gameState
      }

      UpdateMeeting( match, lastGameStateForMeeting )

      coroutine.yield() // wait until something says update again
   }
}

export function CL_GameStateSetup()
{
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
      file.clientMatch.AddPlayer( player )
   } )

   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_ASSIGNMENTS )
         let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
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

   AddPlayerUseDisabledCallback( function ()
   {
      let match = GetLocalMatch()
      return !UsableGameState( match )
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
            return GetLocalRole() === ROLE.ROLE_IMPOSTOR
         }

      usable.DefineGetter(
         function ( player: Player ): Array<Player>
         {
            let match = GetLocalMatch()

            switch ( match.GetPlayerRole( player ) )
            {
               case ROLE.ROLE_IMPOSTOR:
                  return match.GetLivingCampers()
            }

            return []
         } )
   }

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         let match = GetLocalMatch()

         if ( match.IsSpectator( player ) )
            return []

         if ( match.GetGameState() === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            return []

         let positions: Array<Vector3> = []
         for ( let corpse of match.corpses )
         {
            positions.push( corpse.pos )
         }
         return positions
      } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_GAMESTATE )
      if ( !json.size() )
         return

      let match = file.clientMatch
      match.NetvarToGamestate()

      for ( let corpse of match.corpses )
      {
         if ( corpse.clientModel === undefined )
            corpse.clientModel = CreateCorpse( corpse.player, corpse.pos )
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

function CLGameStateChanged( match: Match, oldGameState: number, newGameState: number )
{
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

         Thread( function ()
         {
            DrawMatchScreen_VoteResults(
               voteResults.skipTie,
               voteResults.highestRecipients,
               voteResults.receivedAnyVotes,
               votedAndReceivedNoVotes,
               match.startingImpostorCount,
               match.highestVotedScore
            )
         } )

         break
   }

   // entering this match state
   switch ( newGameState )
   {
      case GAME_STATE.GAME_STATE_INTRO:

         print( "" )
         print( "Entering INTRO at " + Workspace.DistributedGameTime )

         if ( DEV_SKIP_INTRO )
         {
            wait( SKIP_INTRO_TIME )
            ReservedServerRelease()
         }
         else
         {
            let impostors = match.GetImpostors()
            let impostorCount = impostors.size()

            let campers = match.GetCampers()
            Assert( campers.size() > 0, "campers.size() > 0" )

            let foundLocalImpostor = false
            if ( impostors.size() )
            {
               for ( let player of impostors )
               {
                  if ( LOCAL_PLAYER === player )
                  {
                     foundLocalImpostor = true
                     break
                  }
               }
               Assert( foundLocalImpostor, "DrawMatchScreen_Intro had impostors players but local player is not impostors" )
            }

            print( "wait for all players loaded at " + Workspace.DistributedGameTime )

            let timeOut = Workspace.DistributedGameTime + 5
            for ( ; ; )
            {
               let allPlayersLoaded = true
               if ( Workspace.DistributedGameTime > timeOut )
                  break

               for ( let player of match.GetAllPlayers() )
               {
                  if ( !PlayerHasClone( player ) )
                  {
                     allPlayersLoaded = false
                     break
                  }
               }
               if ( allPlayersLoaded )
                  break

               wait()
            }

            ReservedServerRelease()

            WaitThread(
               function ()
               {
                  let playerInfos = match.GetAllPlayerInfo()
                  playerInfos = playerInfos.filter( function ( playerInfo )
                  {
                     return PlayerHasClone( playerInfo.player )
                  } )

                  playerInfos.sort( SortPlayerInfosByLocalAndImpostor )
                  let all: Array<Player> = []
                  for ( let playerInfo of playerInfos )
                  {
                     all.push( playerInfo.player )
                  }

                  let lineup = ClonePlayerModels( all )
                  DrawMatchScreen_Intro( foundLocalImpostor, impostorCount, lineup )
               } )
         }

         break

      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         match.ClearVotes()
         WaitThread( function ()
         {
            if ( match.meetingType !== undefined && match.meetingCaller !== undefined )
            {
               let report = false
               let body: Player | undefined = match.meetingBody
               switch ( match.meetingType )
               {
                  case MEETING_TYPE.MEETING_EMERGENCY:
                     body = undefined
                     break

                  case MEETING_TYPE.MEETING_REPORT:
                     let room: Room
                     if ( match.meetingCallerRoomName !== undefined )
                        room = GetRoom( match.meetingCallerRoomName )
                     else
                        room = GetCurrentRoom( match.meetingCaller )

                     report = true
                     Thread(
                        function ()
                        {
                           wait( 2 ) // wait for match screen to fade out
                           SetLocalViewToRoom( room )
                        } )
                     break

                  default:
                     Assert( false, "Unhandled meeting type " + match.meetingType )
                     break
               }

               DrawMatchScreen_EmergencyMeeting( match.meetingType, match.meetingCaller, body )

               if ( report )
                  wait( 4 ) // time to look at crime scene
            }
         } )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:

         let playerInfos = match.GetAllPlayerInfo()
         let gameResults = match.GetGameResults_NoParityAllowed()

         let score = GetLastStashed( LOCAL_PLAYER )
         let mySurvived = false
         switch ( GetLocalRole() )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_IMPOSTOR:
            case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
               mySurvived = true
               break
         }

         let role = match.GetPlayerRole( LOCAL_PLAYER )
         switch ( gameResults )
         {
            case GAMERESULTS.RESULTS_CAMPERS_WIN:
               WaitThread( function ()
               {
                  let impostersWin = false
                  let myWinningTeam = IsCamperRole( role ) || role === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break

            case GAMERESULTS.RESULTS_IMPOSTORS_WIN:
               WaitThread( function ()
               {
                  let impostersWin = true
                  let myWinningTeam = IsImpostorRole( role ) || role === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break
         }
   }
}

function CreateCorpse( player: Player, pos: Vector3 ): Model | undefined
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

   return corpseCharacter
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

function SortPlayerInfosByLocalAndImpostor( a: PlayerInfo, b: PlayerInfo )
{
   if ( a.player === LOCAL_PLAYER && b.player !== LOCAL_PLAYER )
      return true
   if ( b.player === LOCAL_PLAYER && a.player !== LOCAL_PLAYER )
      return false

   let aImp = file.clientMatch.IsImpostor( a.player )
   let bImp = file.clientMatch.IsImpostor( b.player )
   return aImp && !bImp
}