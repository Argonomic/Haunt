import { Workspace } from "@rbxts/services"
import { ROLE, Game, NETVAR_JSON_GAMESTATE, USETYPES, GAME_STATE } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded } from "shared/sh_onPlayerConnect"
import { AddNetVarChangedCallback } from "shared/sh_player_netvars"
import { SetTimeDelta } from "shared/sh_time"
import { GetUsableByType } from "shared/sh_use"
import { Assert, GetFirstChildWithName, GetLocalPlayer, RandomFloatRange, RecursiveOnChildren, SetCharacterTransparency, SetPlayerTransparency, UserIDToPlayer } from "shared/sh_utils"
import { UpdateMeeting } from "./cl_meeting"
import { MatchIntro } from "./content/cl_matchScreen_content"


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

export function CL_GameStateSetup()
{
   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      file.clientGame.Shared_OnGameStateChanged_PerPlayer( player )
   } )

   GetUsableByType( USETYPES.USETYPE_KILL ).DefineGetter(
      function ( player: Player ): Array<Player>
      {
         switch ( file.clientGame.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_POSSESSED:
               return file.clientGame.GetCampers()
         }

         return []
      } )

   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         switch ( file.clientGame.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_SPECTATOR:
               return []
         }

         let positions: Array<Vector3> = []
         for ( let corpse of file.clientGame.corpses )
         {
            positions.push( corpse.pos )
         }
         return positions
      } )


   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      let oldGameState = file.clientGame.GetGameState()
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

      // update meeting
      UpdateMeeting( file.clientGame )


      if ( oldGameState !== file.clientGame.GetGameState() )
      {
         print( "GAME STATE CHANGED FROM " + oldGameState + " TO " + file.clientGame.GetGameState() )
         // game state changed!
         switch ( file.clientGame.GetGameState() )
         {
            case GAME_STATE.GAME_STATE_PLAYING:
               MatchIntro( file.clientGame.GetPossessed(), file.clientGame.GetCampers(), file.clientGame.startingPossessedCount )
               break
         }
      }

   } )
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
