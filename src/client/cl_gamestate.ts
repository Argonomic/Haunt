import { HttpService, TeleportService, Workspace } from "@rbxts/services"
import { ROLE, Game, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE, GetVoteResults, GAMERESULTS, MEETING_TYPE, TELEPORT_PlayerData, IsCamperRole, IsImpostorRole, AddRoleChangeCallback, Assignment, AssignmentIsSame, NETVAR_JSON_ASSIGNMENTS } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { SetTimeDelta } from "shared/sh_time"
import { GetUsableByType } from "shared/sh_use"
import { GetFirstChildWithName, GetLocalPlayer, RandomFloatRange, RecursiveOnChildren, Resume, SetCharacterTransparency, Thread, WaitThread } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { UpdateMeeting } from "./cl_meeting"
import { CancelAnyOpenTask } from "./cl_tasks"
import { AddPlayerUseDisabledCallback } from "./cl_use"
import { SendRPC } from "./cl_utils"
import { DrawMatchScreen_EmergencyMeeting, DrawMatchScreen_Escaped, DrawMatchScreen_GameOver, DrawMatchScreen_Intro, DrawMatchScreen_Victory, DrawMatchScreen_VoteResults } from "./content/cl_matchScreen_content"
import { GetScore } from "shared/sh_score"

const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   clientGame = new Game()
   fromReservedServer = false

   localAssignments: Array<Assignment> = []
   gainedAssignmentTime = new Map<Assignment, number>()
}

let file = new File()

export function GetLocalGame(): Game
{
   return file.clientGame
}

export function GetLocalRole(): ROLE
{
   if ( file.clientGame.HasPlayer( GetLocalPlayer() ) )
      return file.clientGame.GetPlayerRole( GetLocalPlayer() )
   return ROLE.ROLE_CAMPER
}

export function GetLocalIsSpectator(): boolean
{
   return file.clientGame.IsSpectator( GetLocalPlayer() )
}

function GameThread( game: Game )
{
   let lastGameState = game.GetGameState()
   for ( ; ; )
   {
      let gameState = game.GetGameState()

      let lastGameStateForMeeting = lastGameState
      if ( gameState !== lastGameState )
      {
         CLGameStateChanged( lastGameState, gameState )
         lastGameState = gameState
      }

      if ( gameState !== GAME_STATE.GAME_STATE_PREMATCH )
         UpdateMeeting( file.clientGame, lastGameStateForMeeting )

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
         if ( player !== LOCAL_PLAYER )
            return

         if ( role !== ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
            return

         Thread(
            function ()
            {
               let score = GetScore( LOCAL_PLAYER )
               DrawMatchScreen_Escaped( file.clientGame.GetPlayerInfo( LOCAL_PLAYER ), score )
            } )

      } )

   AddPlayerUseDisabledCallback( function ()
   {
      let gameState = GetLocalGame().GetGameState()
      switch ( gameState )
      {
         case GAME_STATE.GAME_STATE_PREMATCH:
         case GAME_STATE.GAME_STATE_PLAYING:
         case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
            return false
      }
      return true
   } )

   let playerData = TeleportService.GetLocalPlayerTeleportData()
   if ( playerData !== undefined )
   {
      // data packaged with our teleport from previous server
      Assert( typeOf( playerData ) === 'string', "typeOf( playerData ) === 'string'" )
      let jsonString = playerData as string
      let data = HttpService.JSONDecode( jsonString ) as TELEPORT_PlayerData
      if ( data.playerCount !== undefined )
         SendRPC( 'RPC_FromClient_SetPlayerCount', data.playerCount )

      if ( data.sendMeBackToLobby === true )
      {
         Thread(
            function ()
            {
               for ( ; ; )
               {
                  wait( 3 )

                  // click the heels
                  SendRPC( 'RPC_FromClient_RequestLobby' )
               }
            } )
      }

      file.fromReservedServer = data.fromReservedServer === true
   }

   file.clientGame.gameThread = coroutine.create(
      function ()
      {
         GameThread( file.clientGame )
      } )
   Resume( file.clientGame.gameThread )


   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.clientGame.HasPlayer( player ) )
         file.clientGame.Shared_OnGameStateChanged_PerPlayer( player, file.clientGame.GetGameState() )
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
            switch ( file.clientGame.GetPlayerRole( player ) )
            {
               case ROLE.ROLE_POSSESSED:
                  return file.clientGame.GetLivingCampers()
            }

            return []
         } )
   }

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         if ( file.clientGame.IsSpectator( player ) )
            return []

         if ( file.clientGame.GetGameState() === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            return []

         let positions: Array<Vector3> = []
         for ( let corpse of file.clientGame.corpses )
         {
            positions.push( corpse.pos )
         }
         return positions
      } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      /*let pastRoles = new Map<Player, ROLE>()
      for ( let player of file.clientGame.GetAllPlayers() )
      {
         pastRoles.set( player, file.clientGame.GetPlayerRole( player ) )
      }*/

      let deltaTime = file.clientGame.NetvarToGamestate_ReturnServerTimeDelta()
      SetTimeDelta( deltaTime )

      for ( let corpse of file.clientGame.corpses )
      {
         if ( corpse.clientModel === undefined )
            corpse.clientModel = CreateCorpse( corpse.player, corpse.pos )
      }

      /*
      let userIDToPlayer = UserIDToPlayer()

      let gamePlayers = file.clientGame.GetAllPlayers()
      for ( let player of gamePlayers )
      {
         Assert( userIDToPlayer.has( player.UserId ), "Should have player.." )
         userIDToPlayer.delete( player.UserId )
      }

      for ( let pair of userIDToPlayer )
      {
         SetPlayerTransparency( pair[1], 1 )
      }
      */

      let gameThread = file.clientGame.gameThread
      if ( gameThread !== undefined )
         Resume( gameThread )
   } )
}

function CLGameStateChanged( oldGameState: number, newGameState: number )
{
   print( "\nGAME STATE CHANGED FROM " + oldGameState + " TO " + newGameState )

   for ( let player of file.clientGame.GetAllPlayers() )
   {
      Assert( file.clientGame.HasPlayer( player ), "Game doesn't have player??" )
      if ( player.Character !== undefined )
         file.clientGame.Shared_OnGameStateChanged_PerPlayer( player, file.clientGame.GetGameState() )
   }

   print( "Leaving game state " + oldGameState )
   // leaving this game state
   switch ( oldGameState )
   {
      case GAME_STATE.GAME_STATE_PREMATCH:
         {
            CancelAnyOpenTask()
            WaitThread( function ()
            {
               DrawMatchScreen_Intro( file.clientGame.GetLivingPossessed(), file.clientGame.GetLivingCampers(), file.clientGame.startingPossessedCount )
            } )
         }
         break

      case GAME_STATE.GAME_STATE_MEETING_VOTE:
         print( "LEAVING GAME STATE GAME_STATE_MEETING_VOTE" )
         let voteResults = GetVoteResults( file.clientGame.GetVotes() )
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
               file.clientGame.startingPossessedCount,
               file.clientGame.highestVotedScore
            )
         } )

         break

      case GAME_STATE.GAME_STATE_PLAYING:
      case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
         if ( newGameState !== GAME_STATE.GAME_STATE_SUDDEN_DEATH )
            CancelAnyOpenTask()
         break
   }

   print( "Game State from  " + oldGameState + " to " + newGameState )
   // entering this game state
   switch ( newGameState )
   {
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         file.clientGame.ClearVotes()
         WaitThread( function ()
         {
            if ( file.clientGame.meetingType !== undefined && file.clientGame.meetingCaller !== undefined )
            {
               let body: Player | undefined = file.clientGame.meetingBody
               if ( file.clientGame.meetingType === MEETING_TYPE.MEETING_EMERGENCY )
                  body = undefined

               DrawMatchScreen_EmergencyMeeting( file.clientGame.meetingType, file.clientGame.meetingCaller, body )
            }
         } )
         break

      case GAME_STATE.GAME_STATE_COMPLETE:

         let game = file.clientGame
         let playerInfos = game.GetAllPlayerInfo()
         let gameResults = game.GetGameResults_NoParityAllowed()

         let score = GetScore( GetLocalPlayer() )
         let mySurvived = false
         switch ( GetLocalRole() )
         {
            case ROLE.ROLE_CAMPER:
            case ROLE.ROLE_POSSESSED:
            case ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED:
               mySurvived = true
               break
         }

         switch ( gameResults )
         {
            case GAMERESULTS.RESULTS_CAMPERS_WIN:
               WaitThread( function ()
               {
                  let impostersWin = false
                  let myWinningTeam = IsCamperRole( GetLocalRole() )
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break

            case GAMERESULTS.RESULTS_POSSESSED_WIN:
               WaitThread( function ()
               {
                  let impostersWin = true
                  let myWinningTeam = IsImpostorRole( GetLocalRole() )
                  DrawMatchScreen_Victory( playerInfos, impostersWin, myWinningTeam, mySurvived, score )
               } )
               break
         }

      case GAME_STATE.GAME_STATE_DEAD:
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

export function IsFromReservedServer()
{
   return file.fromReservedServer
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