import { HttpService, Workspace } from "@rbxts/services"
import { ROLE, Match, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE, GetVoteResults, GAMERESULTS, MEETING_TYPE, IsCamperRole, IsImpostorRole, AddRoleChangeCallback, Assignment, AssignmentIsSame, NETVAR_JSON_ASSIGNMENTS, EDITOR_GameplayFolder } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, ClonePlayerModels, TryFillWithFakeModels } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { GetUsableByType } from "shared/sh_use"
import { ExecOnChildWhenItExists, GetFirstChildWithName, GetLocalPlayer, RandomFloatRange, RecursiveOnChildren, Resume, SetCharacterTransparency, Thread, WaitThread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { UpdateMeeting } from "./cl_meeting"
import { CancelAnyOpenTask } from "./cl_tasks"
import { AddPlayerUseDisabledCallback } from "./cl_use"
import { DrawMatchScreen_EmergencyMeeting, DrawMatchScreen_Escaped, DrawMatchScreen_GameOver, DrawMatchScreen_Intro, DrawMatchScreen_Victory, DrawMatchScreen_VoteResults } from "./content/cl_matchScreen_content"
import { GetLastStashed } from "shared/sh_score"
import { DEV_SKIP, MATCHMAKE_PLAYERCOUNT_MAX } from "shared/sh_settings"

const LOCAL_PLAYER = GetLocalPlayer()
const REAL_GEO_OFFSET = new Vector3( 0, -500, 0 )

class File
{
   clientMatch: Match | undefined

   localAssignments: Array<Assignment> = []
   gainedAssignmentTime = new Map<Assignment, number>()

   //realMatchDynamicArtInfos: Array<DynamicArtInfo> = []
   realMatchOffsetGeo: Array<BasePart> = []
   currentDynamicArt: Array<BasePart> = []
}

let file = new File()

export function GetLocalGame(): Match | undefined
{
   return file.clientMatch
}

export function GetLocalRole(): ROLE | undefined
{
   if ( file.clientMatch === undefined )
      return undefined

   if ( file.clientMatch.HasPlayer( GetLocalPlayer() ) )
      return file.clientMatch.GetPlayerRole( GetLocalPlayer() )
   return ROLE.ROLE_CAMPER
}

export function GetLocalIsSpectator(): boolean
{
   if ( file.clientMatch === undefined )
      return false

   return file.clientMatch.IsSpectator( GetLocalPlayer() )
}

function SortLocalPlayer( a: Player, b: Player ): boolean
{
   return a === LOCAL_PLAYER && b !== LOCAL_PLAYER
}

function ClientGameThread( match: Match )
{
   print( "ClientGameThread, draw intro" )
   let lastGameState = match.GetGameState()

   CancelAnyOpenTask()
   WaitThread( function ()
   {
      if ( DEV_SKIP )
      {
         wait( 2 )
      }
      else
      {
         let possessed = match.GetPossessed()
         let possessedCount = possessed.size()

         let campers = match.GetCampers()
         Assert( campers.size() > 0, "campers.size() > 0" )

         let all = possessed.concat( campers )
         all.sort( SortLocalPlayer ) // possessed always end up in the middle if they are known

         let lineup = ClonePlayerModels( all )
         if ( match.winOnlybyEscaping )
         {
            // add fake players
            TryFillWithFakeModels( lineup, MATCHMAKE_PLAYERCOUNT_MAX )

            if ( possessedCount < 1 && lineup.size() > 1 )
               possessedCount = 1 // pretend one of the fake players is an impostor
         }

         let foundLocalPossessed = false
         if ( possessed.size() )
         {
            for ( let player of possessed )
            {
               if ( LOCAL_PLAYER === player )
               {
                  foundLocalPossessed = true
                  break
               }
            }
            Assert( foundLocalPossessed, "DrawMatchScreen_Intro had possessed players but local player is not possessed" )
         }

         DrawMatchScreen_Intro( foundLocalPossessed, possessedCount, lineup )
      }
   } )

   for ( ; ; )
   {
      if ( file.clientMatch !== match )
         return

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
   AddNetVarChangedCallback( NETVAR_JSON_ASSIGNMENTS,
      function ()
      {
         let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_ASSIGNMENTS )
         let assignments = HttpService.JSONDecode( json ) as Array<Assignment>
         file.localAssignments = assignments
         let lostAssignments = new Map<Assignment, boolean>()
         for ( let pair of file.gainedAssignmentTime )
         {
            lostAssignments.set( pair[0], true )
         }

         for ( let assignment of assignments )
         {
            if ( lostAssignments.has( assignment ) )
               lostAssignments.delete( assignment )

            if ( !file.gainedAssignmentTime.has( assignment ) )
               file.gainedAssignmentTime.set( assignment, Workspace.DistributedGameTime )
         }

         for ( let pair of lostAssignments )
         {
            // remove assignments we don't have anymore
            file.gainedAssignmentTime.delete( pair[0] )
         }
      } )


   AddRoleChangeCallback(
      function ( player: Player, role: ROLE, lastRole: ROLE )
      {
         Thread(
            function ()
            {
               let match = GetLocalGame()
               if ( match === undefined )
                  return

               if ( player !== LOCAL_PLAYER )
                  return

               if ( role !== ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
                  return

               let score = GetLastStashed( LOCAL_PLAYER )
               DrawMatchScreen_Escaped( match.GetPlayerInfo( LOCAL_PLAYER ), score )
            } )

      } )

   AddPlayerUseDisabledCallback( function ()
   {
      let match = GetLocalGame()
      if ( match === undefined )
         return true

      switch ( match.GetGameState() )
      {
         case GAME_STATE.GAME_STATE_PLAYING:
         case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
            return false
      }
      return true
   } )


   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let match = GetLocalGame()
      if ( match === undefined )
         return

      if ( match.HasPlayer( player ) )
         match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
   } )

   {
      let usable = GetUsableByType( USETYPES.USETYPE_KILL )
      usable.forceVisibleTest =
         function ()
         {
            return GetLocalRole() === ROLE.ROLE_POSSESSED
         }

      usable.DefineGetter(
         function ( player: Player ): Array<Player>
         {
            let match = GetLocalGame()
            if ( match === undefined )
               return []

            switch ( match.GetPlayerRole( player ) )
            {
               case ROLE.ROLE_POSSESSED:
                  return match.GetLivingCampers()
            }

            return []
         } )
   }

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         let match = GetLocalGame()
         if ( match === undefined )
            return []

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

   ExecOnChildWhenItExists( Workspace, "Gameplay",
      function ( folder: EDITOR_GameplayFolder )
      {
         //wtf
         let children = folder.DynamicArt.scr_real_matches_only.GetChildren() as Array<BasePart>
         for ( let child of children )
         {
            child.Position = child.Position.add( REAL_GEO_OFFSET )
         }

         file.realMatchOffsetGeo = file.realMatchOffsetGeo.concat( children )
         //file.realMatchDynamicArtInfos = ConvertToDynamicArtInfos( children )
      } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      let json = GetNetVar_String( LOCAL_PLAYER, NETVAR_JSON_GAMESTATE )
      if ( !json.size() )
      {
         if ( file.clientMatch !== undefined ) 
         {
            // close game
            file.clientMatch = undefined
         }

         return
      }

      let match = file.clientMatch
      if ( match === undefined )
      {
         match = new Match()
         file.clientMatch = match
      }

      match.NetvarToGamestate()

      if ( match.gameThread === undefined )
      {
         // below depends on player having their character, which may not be true when a netvar changes
         for ( ; ; )
         {
            if ( LOCAL_PLAYER.Character !== undefined )
               break
            wait()
         }
         //match.AddPlayer( LOCAL_PLAYER, ROLE.ROLE_CAMPER )

         match.gameThread = coroutine.create(
            function ()
            {
               ClientGameThread( match as Match )
            } )
      }

      for ( let corpse of match.corpses )
      {
         if ( corpse.clientModel === undefined )
            corpse.clientModel = CreateCorpse( corpse.player, corpse.pos )
      }

      let gameThread = match.gameThread
      if ( gameThread === undefined )
      {
         Assert( false, "gameThread === undefined" )
         throw undefined
      }

      Resume( gameThread )
   } )
}

function CLGameStateChanged( match: Match, oldGameState: number, newGameState: number )
{
   print( "\nGAME STATE CHANGED FROM " + oldGameState + " TO " + newGameState )

   for ( let player of match.GetAllPlayers() )
   {
      Assert( match.HasPlayer( player ), "Match doesn't have player??" )
      if ( player.Character !== undefined )
         match.Shared_OnGameStateChanged_PerPlayer( player, match.GetGameState() )
   }

   print( "Leaving match state " + oldGameState )
   // leaving this match state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_INIT:
         for ( let model of file.currentDynamicArt )
         {
            model.Destroy()
         }

         if ( !match.winOnlybyEscaping )
         {
            //wtf file.currentDynamicArt = CreateDynamicArt( file.realMatchDynamicArtInfos )
            for ( let geo of file.realMatchOffsetGeo )
            {
               let clone = geo.Clone()
               clone.Name = geo.Name + " CLONE"
               clone.Parent = geo.Parent
               clone.Position = geo.Position.sub( REAL_GEO_OFFSET )
            }
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
               match.startingPossessedCount,
               match.highestVotedScore
            )
         } )

         break

      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( newGameState !== GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            CancelAnyOpenTask()
         break
   }

   print( "Match State from  " + oldGameState + " to " + newGameState )
   // entering this match state
   switch ( newGameState )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         match.ClearVotes()
         WaitThread( function ()
         {
            if ( match.meetingType !== undefined && match.meetingCaller !== undefined )
            {
               let body: Player | undefined = match.meetingBody
               if ( match.meetingType === MEETING_TYPE.MEETING_EMERGENCY )
                  body = undefined

               DrawMatchScreen_EmergencyMeeting( match.meetingType, match.meetingCaller, body )
            }
         } )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:

         if ( match.winOnlybyEscaping )
            return

         let playerInfos = match.GetAllPlayerInfo()
         let gameResults = match.GetGameResults_NoParityAllowed()

         let score = GetLastStashed( LOCAL_PLAYER )
         let mySurvived = false
         switch ( GetLocalRole() )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_POSSESSED:
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
                  let myWinningTeam = IsCamperRole( role )
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break

            case GAMERESULTS.RESULTS_POSSESSED_WIN:
               WaitThread( function ()
               {
                  let impostersWin = true
                  let myWinningTeam = IsImpostorRole( role )
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break
         }

      case GAME_STATE.GAME_STATE_DEAD:

         file.clientMatch = undefined

         if ( match.winOnlybyEscaping )
            return

         DrawMatchScreen_GameOver()
         break
   }
}

function CreateCorpse( player: Player, pos: Vector3 ): Model | undefined
{
   const PUSH = 10
   const ROTVEL = 36

   if ( player.Character === undefined )
      return undefined

   let character = player.Character as Model
   character.Archivable = true
   let corpseCharacter = character.Clone()
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
      if ( AssignmentIsSame( pair[0], roomName, taskName ) )
         return pair[1]
   }

   Assert( false, "ClientGetAssignmentAssignedTime" )
   throw undefined
}
