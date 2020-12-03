import { HttpService, Players } from "@rbxts/services"
import { ClientVisibleGamePlayerInfo, NETVAR_JSON_PLAYERINFO, ROLE } from "shared/sh_gamestate"
import { AddNetVarChangedCallback, GetNetVar_String } from "shared/sh_player_netvars"
import { GetFirstChildWithName, IsAlive, SetPlayerTransparencyAndColor } from "shared/sh_utils"
import { AddUseTargetGetter, PLAYER_OR_PART, ResetUseTargets } from "./cl_use"

class File
{
   playerInfos: Array<ClientVisibleGamePlayerInfo> = []
   playersInMyGame: Array<Player> = []
   role: ROLE = ROLE.ROLE_CAMPER
}

let file = new File()

export function GetLocalRole(): ROLE
{
   return file.role
}

export function CL_GameStateSetup()
{
   AddUseTargetGetter( function (): Array<PLAYER_OR_PART>
   {
      if ( GetLocalRole() === ROLE.ROLE_POSSESSED )
      {
         return file.playersInMyGame
      }

      return []
   } )

   AddNetVarChangedCallback( NETVAR_JSON_PLAYERINFO, function ()
   {
      //print( "Updated NETVAR_JSON_PLAYERINFO" )

      let json = GetNetVar_String( Players.LocalPlayer, NETVAR_JSON_PLAYERINFO )
      let playerInfos = HttpService.JSONDecode( json ) as Array<ClientVisibleGamePlayerInfo>
      file.playerInfos = playerInfos
      file.playersInMyGame = []

      let visiblePlayerIds: Record<number, ClientVisibleGamePlayerInfo> = {}

      for ( let playerInfo of playerInfos )
      {
         visiblePlayerIds[playerInfo.id] = playerInfo
      }

      let localPlayer = Players.LocalPlayer
      let players = Players.GetPlayers()
      for ( let player of players )
      {
         let info = visiblePlayerIds[player.UserId]
         if ( info === undefined )
         {
            // not in our game
            SetPlayerTransparencyAndColor( player, 1, new Color3( 0, 0, 0 ) )
            continue
         }

         if ( player === localPlayer )
         {
            if ( info.evil )
               file.role = ROLE.ROLE_POSSESSED
            else
               file.role = ROLE.ROLE_CAMPER
         }
         else
         {
            file.playersInMyGame.push( player )
            //print( "Added " + player + " to my game" )
         }
      }

      ResetUseTargets()
   } )
}

let num = -1

export function GetLivingPlayersInMyGame(): Array<Player>
{
   let living: Array<Player> = []

   for ( let player of file.playersInMyGame )
   {
      if ( IsAlive( player ) )
         living.push( player )
   }

   if ( num !== file.playersInMyGame.size() )
   {
      //print( "** file.playersInMyGame:" + file.playersInMyGame.size() + ", living:" + living.size() )
      num = file.playersInMyGame.size()
   }

   return living
}