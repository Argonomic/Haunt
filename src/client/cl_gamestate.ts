import { Workspace } from "@rbxts/services"
import { ROLE, Game, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE, GetVoteResults, GAMERESULTS, MEETING_TYPE } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback } from "shared/sh_player_netvars"
import { SetTimeDelta } from "shared/sh_time"
import { GetUsableByType } from "shared/sh_use"
import { Assert, GetFirstChildWithName, GetLocalPlayer, RandomFloatRange, RecursiveOnChildren, SetCharacterTransparency, SetPlayerTransparency, UserIDToPlayer, WaitThread } from "shared/sh_utils"
import { UpdateMeeting } from "./cl_meeting"
import { CancelAnyOpenTask } from "./cl_tasks"
import { DrawMatchScreen_EmergencyMeeting, DrawMatchScreen_Intro, DrawMatchScreen_VoteResults, DrawMatchScreen_Winners } from "./content/cl_matchScreen_content"


class File
{
   clientGame = new Game()
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

      UpdateMeeting( file.clientGame, lastGameStateForMeeting )

      coroutine.yield() // wait until something says update again
   }
}

export function CL_GameStateSetup()
{
   file.clientGame.gameThread = coroutine.create(
      function ()
      {
         GameThread( file.clientGame )
      } )
   coroutine.resume( file.clientGame.gameThread )


   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.clientGame.HasPlayer( player ) )
         file.clientGame.Shared_OnGameStateChanged_PerPlayer( player, file.clientGame.GetGameState() )
   } )

   GetUsableByType( USETYPES.USETYPE_KILL ).DefineGetter(
      function ( player: Player ): Array<Player>
      {
         switch ( file.clientGame.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_POSSESSED:
               return file.clientGame.GetLivingCampers()
         }

         return []
      } )

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         if ( file.clientGame.IsSpectator( player ) )
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

      let gameThread = file.clientGame.gameThread
      if ( gameThread !== undefined )
         coroutine.resume( gameThread )
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

         WaitThread( function ()
         {
            DrawMatchScreen_VoteResults(
               voteResults.skipTie,
               voteResults.highestRecipients,
               voteResults.receivedAnyVotes,
               votedAndReceivedNoVotes,
               file.clientGame.startingPossessedCount
            )
         } )

         break

      case GAME_STATE.GAME_STATE_PLAYING:
         CancelAnyOpenTask()
         break
   }

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

         print( "Game is over, local role is " + GetLocalRole() )
         if ( GetLocalRole() === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
         {
            let possessed = file.clientGame.GetPossessed()
            DrawMatchScreen_Winners( possessed, GetLocalRole(), file.clientGame.startingPossessedCount )
            return
         }
         let gameResults = file.clientGame.GetGameResults()

         switch ( gameResults )
         {
            case GAMERESULTS.RESULTS_CAMPERS_WIN:

               WaitThread( function ()
               {
                  let campers = file.clientGame.GetCampers()
                  DrawMatchScreen_Winners( campers, GetLocalRole(), file.clientGame.startingPossessedCount )
               } )
               break

            case GAMERESULTS.RESULTS_POSSESSED_WIN:
               WaitThread( function ()
               {
                  let possessed = file.clientGame.GetPossessed()
                  DrawMatchScreen_Winners( possessed, GetLocalRole(), file.clientGame.startingPossessedCount )
               } )
               break

         }
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