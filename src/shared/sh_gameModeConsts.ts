import { Players } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { Match } from "./sh_gamestate"
import { TEST } from "./sh_settings"
import { Graph, GraphCapped } from "./sh_utils"

class File
{
   gameStateFuncs: GameModeConsts | undefined
}
let file = new File()

export function GetGameModeConsts(): GameModeConsts
{
   let gameStateFuncs = file.gameStateFuncs
   if ( gameStateFuncs === undefined )
   {
      Assert( false, "Unknown game mode" )
      throw undefined
   }
   return gameStateFuncs
}

export class GameModeConsts
{
   minPlayersToStartGame = 4
   gameStateChanged: ( ( match: Match, lastGameState: number ) => void ) = function ( match: Match, lastGameState: number ) { }
   gameStateThink: ( ( match: Match ) => void ) = function ( match: Match ) { }
   svFindMatchForPlayer: ( player: Player ) => void = function ( player: Player )
   { Assert( false, "Game modes must have svFindMatchForPlayer" ) }

   gameTitle: string | undefined
   canPurchaseImpostor = false
   completeTasksBecomeImpostor = false
   hasPlayerNumber = false
   hasCorpses = false
   corpseTimeout: number | undefined
   canKillImpostors = true
   spectatorDeathRun = false
   meetingCooldown = 20
   cooldownKill = 45
   revealOtherImpostors = false
   suddenDeath = false
   impostorBattle = true
   lastImpostorStanding = false
   canReturnToLobby = true
}

const IDEAL_PLAYERS = 15
export function GetMinPlayersToStartGame(): number
{
   let gameModeData = GetGameModeConsts()
   let minPlayersToStartGame = gameModeData.minPlayersToStartGame

   let range = math.floor( Players.GetPlayers().size() * 0.825 )
   if ( range < minPlayersToStartGame )
      return minPlayersToStartGame
   if ( range > IDEAL_PLAYERS )
      return IDEAL_PLAYERS
   return range
}

export function SetGameModeConsts( gameStateFuncs: GameModeConsts )
{
   file.gameStateFuncs = gameStateFuncs
}
