import { Players, Workspace } from "@rbxts/services"
import { ROLE, Game, NETVAR_JSON_GAMESTATE, USETYPES } from "shared/sh_gamestate"
import { AddNetVarChangedCallback } from "shared/sh_player_netvars"
import { GetUsableByType } from "shared/sh_use"
import { Assert, GetFirstChildWithName, RandomFloatRange, RecursiveOnChildren, SetPlayerTransparencyAndColor, UserIDToPlayer } from "shared/sh_utils"


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
   if ( file.clientGame.HasPlayer( Players.LocalPlayer ) )
      return file.clientGame.GetPlayerRole( Players.LocalPlayer )
   return ROLE.ROLE_CAMPER
}

function GetAllPlayersInMyGame(): Array<Player>
{
   return file.clientGame.GetAllPlayers()
}

function GetOtherPlayersInMyGame(): Array<Player>
{
   let localPlayer = Players.LocalPlayer
   return file.clientGame.GetAllPlayers().filter( function ( player: Player )
   {
      return player !== localPlayer
   } )
}

export function CL_GameStateSetup()
{
   GetUsableByType( USETYPES.USETYPE_KILL ).DefineGetter(
      function ( player: Player ): Array<Player>
      {
         if ( GetLocalRole() === ROLE.ROLE_POSSESSED )
            return GetOtherPlayersInMyGame()

         return []
      } )



   GetUsableByType( USETYPES.USETYPE_REPORT ).DefineGetter(
      function ( player: Player ): Array<Vector3>
      {
         let positions: Array<Vector3> = []
         for ( let corpse of file.clientGame.corpses )
         {
            positions.push( corpse.pos )
         }
         return positions
      } )

   AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE, function ()
   {
      file.clientGame.NetvarToGamestate()

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
         SetPlayerTransparencyAndColor( pair[1], 1, new Color3( 1, 1, 1 ) )
      }


      /*
      AddNetVarChangedCallback( NETVAR_ROLE, function ()
      {
         let player = Players.LocalPlayer
         let role = GetNetVar_Number( player, NETVAR_ROLE )
         if ( role === ROLE.ROLE_SPECTATOR )
         {
            SetPlayerTransparencyAndColor( player, 0.4, new Color3( 1, 1, 1 ) )
         }
         else
         {
            SetPlayerTransparencyAndColor( player, 1.0, new Color3( 1, 1, 1 ) )
         }
      } )
      */
   } )
}

function CreateCorpse( player: Player, pos: Vector3 ): Model | undefined
{
   const PUSH = 15
   const ROTVEL = 360

   if ( player.Character === undefined )
      return undefined

   let character = player.Character as Model
   character.Archivable = true
   let corpseCharacter = character.Clone()

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

/*
let corpseModel = new Instance( "Model" )
corpseModel.Name = "Corpse"
corpseModel.Parent = Workspace
corpseModel.ChildAdded.Connect( function ( child: Instance )
{
   print( "Child added: " + child.Name + " classname " + child.ClassName )
   switch ( child.ClassName )
   {
      case 'Motor6D':
      case 'Humanoid':
         child.Destroy()
         break
   }

} )

Thread( function ()
{
   for ( ; ; )
   {
      print( "corpsemodel children: " + corpseModel.GetChildren().size() )
      wait( 1 )
   }
} )
*/

//corpse.model = corpseModel


//RecursiveOnChildren( corpseModel, 'Motor6D' )

/*
for ( let child of model.GetChildren() )
{
   Assert( pos !== undefined, "2 Pos is undefined?" )
   let handle = child.FindFirstChild( "Handle" )
   if ( handle !== undefined )
      child = handle

   if ( child.IsA( 'BasePart' ) )
   {
      let clone = child.Clone()
      if ( child === model.PrimaryPart )
      {
         corpseModel.PrimaryPart = clone
         clone.Position = pos
      }
      else
      {
         clone.Position = child.Position
         clone.Parent = corpseModel
      }

      clone.CanCollide = true
      clone.Rotation = child.Rotation
      clone.Velocity = child.Velocity
      clone.Anchored = false
      clone.Transparency = child.Transparency
      clone.Material = child.Material
      clone.Color = child.Color
      clone.CFrame = child.CFrame
   }
}
*/


