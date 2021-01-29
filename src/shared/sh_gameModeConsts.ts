import { Players } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { Match } from "./sh_gamestate"
import { TEST } from "./sh_settings"
import { GraphCapped } from "./sh_utils"

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
   MATCHMAKE_PLAYERCOUNT_MINPLAYERS = 4
   gameStateChanged: ( ( match: Match, lastGameState: number ) => void )
   gameStateThink: ( ( match: Match ) => void )
   svFindMatchForPlayer: ( player: Player ) => void = function ( player: Player ) { }

   constructor( gameStateChanged: ( ( match: Match, lastGameState: number ) => void ),
      gameStateThink: ( ( match: Match ) => void ) )
   {
      this.gameStateChanged = gameStateChanged
      this.gameStateThink = gameStateThink
   }
}

export function GetMinPlayersForGame(): number
{
   let gameModeData = GetGameModeConsts()
   let MATCHMAKE_PLAYERCOUNT_MINPLAYERS = gameModeData.MATCHMAKE_PLAYERCOUNT_MINPLAYERS
   if ( TEST )
      return MATCHMAKE_PLAYERCOUNT_MINPLAYERS

   return math.floor( GraphCapped( Players.GetPlayers().size(), MATCHMAKE_PLAYERCOUNT_MINPLAYERS, 7, MATCHMAKE_PLAYERCOUNT_MINPLAYERS, 7 ) )
}

export function SetGameModeConsts( gameStateFuncs: GameModeConsts )
{
   file.gameStateFuncs = gameStateFuncs
}
