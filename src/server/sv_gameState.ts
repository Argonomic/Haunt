import { AddRPC } from "shared/sh_rpc"
import { ArrayRandomize, Assert, GetHumanoid, GetPosition, IsAlive, IsServer, RemoveQuitPlayers, Thread } from "shared/sh_utils"
import { Assignment, GAME_STATE, AddGameStateNetVars, NETVAR_JSON_TASKLIST, ClientVisibleGamePlayerInfo, ROLE, NETVAR_ROLE, IsPracticing, NETVAR_JSON_PLAYERINFO } from "shared/sh_gamestate"
import { GetAllRoomsAndTasks, GetCurrentRoom, GetRoomByName, GetRoomSpawnLocations, PutPlayerCameraInRoom, PutPlayerInStartRoom, PutPlayersInRoom, SetPlayerCurrentRoom } from "./sv_rooms"
import { Debris, HttpService, Players, Workspace } from "@rbxts/services"
import { MAX_TASKLIST_SIZE, MAX_PLAYERS, MIN_PLAYERS, SPAWN_ROOM, USETYPE_KILL, USETYPE_TASK } from "shared/sh_settings"
import { SendRPC } from "./sv_utils"
import { SetNetVar } from "shared/sh_player_netvars"
import { AddCallback_OnPlayerCharacterAdded, SetPlayerWalkSpeed } from "shared/sh_onPlayerConnect"
import { Task } from "shared/sh_rooms"
import { AddOnUse, Usable } from "shared/sh_use"

export class Game
{
   assignments = new Map<Player, Array<Assignment>>()
   gameState: GAME_STATE = GAME_STATE.GAME_STATE_PREMATCH
   campers: Array<Player> = []
   possessed: Array<Player> = []
   allPlayers: Array<Player> = []
}

class File
{
   games: Array<Game> = []
   playerToGame = new Map<Player, Game>()

   playerToSpawnLocation = new Map<Player, Vector3>()
}
let file = new File()

export function SV_GameStateSetup()
{
   AddGameStateNetVars()
   AddRPC( "RPC_FromClient_OnPlayerFinishTask", RPC_FromClient_OnPlayerFinishTask )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( file.playerToGame.has( player ) && file.playerToSpawnLocation.has( player ) )
      {
         let spawnPos = file.playerToSpawnLocation.get( player ) as Vector3
         let character = player.Character as Model
         let part = character.PrimaryPart as BasePart
         Thread( function ()
         {
            for ( let i = 0; i < 5; i++ ) 
            {
               part.CFrame = new CFrame( spawnPos )
               let room = GetCurrentRoom( player )
               PutPlayerCameraInRoom( player, room )
               wait()
            }
         } )
      }
   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         if ( IsPracticing( player ) )
            return

         let game = PlayerToGame( player )
         UpdateGame( game )
      } )

   AddOnUse( USETYPE_KILL,
      function ( player: Player, usable: Usable )
      {
         Assert( !IsPracticing( player ), "Praticing player tried to kill?" )
         let game = PlayerToGame( player )
         Assert( GetRole( player, game ) === ROLE.ROLE_POSSESSED, "Camper tried to kill?" )

         let pos = GetPosition( player )
         for ( let camper of game.campers )
         {
            if ( !IsAlive( camper ) )
               continue

            if ( usable.useTest( player, camper, pos ) )
            {
               let human = GetHumanoid( camper )
               if ( human !== undefined )
               {
                  /*
                  Thread( function ()
                  {
                     for ( ; ; )
                     {
                        print( "Camper " + camper.Name + " character: " + camper.Character )
                        wait()
                     }
                  } )
                  */

                  //let spawnLocation = new Instance( "SpawnLocation" )
                  //spawnLocation.Position = GetPosition( camper )
                  //spawnLocation.Parent = Workspace
                  //spawnLocation.Name = "respawn " + camper.Name
                  //camper.RespawnLocation = spawnLocation


                  let clones: Array<BasePart> = []
                  if ( camper.Character )
                  {


                     /*
   local model = Instance.new("Model", game.Workspace.Effects)
   model.Name = "EffectsModel"
   for i = 0, 25, 1 do
      for _, v in pairs(player.Character:GetChildren()) do
         print(v)
         if v:IsA("Part") or v:IsA("MeshPart") and v.Name ~= "HumanoidRootPart" then
            local part = v:Clone()
            part.CanCollide = false
            part.Anchored = true
            part:ClearAllChildren()
            part.Transparency = 0.1
            part.Material = Enum.Material.SmoothPlastic
            part.Parent = model
            local tween = tweenService:Create(part, tweenInfo, {Transparency = 1;})
            tween:Play()
            game.Debris:AddItem(part,1)
         end
      end
      wait()
   end
   wait(3)
                     */

                     let effectModel = new Instance( "Model" ) // , Workspace.effec game.Workspace.Effects )
                     effectModel.Name = "EffectsModel"
                     effectModel.Parent = Workspace

                     let camperPos = GetPosition( camper )
                     let model = camper.Character as Model

                     for ( let child of model.GetChildren() )
                     {
                        let handle = child.FindFirstChild( "Handle" )
                        if ( handle !== undefined )
                           child = handle

                        if ( child.IsA( 'BasePart' ) )
                        {
                           let clone = child.Clone()
                           clone.Position = child.Position // camperPos
                           //clone.Rotation = child.Rotation
                           //clone.Velocity = child.Velocity
                           clone.Anchored = false
                           clone.Transparency = 0
                           clone.Material = Enum.Material.SmoothPlastic
                           clone.Parent = effectModel
                           clones.push( clone )
                           //Debris.AddItem( clone )

                           //clone.Parent = Workspace
                           //clone.Name = "CLONE"
                        }
                     }
                  }
                  print( "Clones: " + clones.size() )

                  file.playerToSpawnLocation.set( camper, GetPosition( camper ) )
                  human.TakeDamage( human.Health )
                  SendRPC( "RPC_FromServer_CancelTask", camper )

                  /*
                  Thread( function ()
                  {
                     wait( 1 )
                     spawnLocation.Destroy()
                  } )
                  */
               }
               return
            }
         }
      }
   )

   AddOnUse( USETYPE_TASK,

      function ( player: Player, usable: Usable )
      {
         let room = GetCurrentRoom( player )
         let usedTask: Function | undefined

         function UsedTaskSucceeded( task: Task )
         {
            SetPlayerWalkSpeed( player, 0 )
            SendRPC( "RPC_FromServer_OnPlayerUseTask", player, room.name, task.name )
         }

         if ( IsPracticing( player ) )
         {
            usedTask = function ( task: Task ): boolean
            {
               if ( IsServer() )
                  print( "Use Test from SERVER" )
               return usable.useTest( player, task.volume, undefined )
            }
         }
         else
         {
            let game = PlayerToGame( player )
            usedTask = function ( task: Task ): boolean
            {
               if ( !PlayerHasUnfinishedAssignment( player, game, room.name, task.name ) )
                  return false

               return usable.useTest( player, task.volume, undefined )
            }
         }

         Assert( usedTask !== undefined, "No usedtask func" )
         if ( usedTask === undefined )
            return

         for ( let taskPair of room.tasks )
         {
            let task = taskPair[1]
            if ( !( usedTask( task ) as boolean ) )
               continue

            UsedTaskSucceeded( task )
            return
         }
      } )
}


export function PlayerToGame( player: Player ): Game
{
   Assert( file.playerToGame.has( player ), "Player not in a game" )
   return file.playerToGame.get( player ) as Game
}

export function AddPlayersToGame( players: Array<Player>, game: Game )
{

}

function UpdateClientVisibleData( game: Game )
{
   {
      // tell the campers about everyone
      let infos: Array<ClientVisibleGamePlayerInfo> = []
      for ( let player of game.allPlayers )
      {
         infos.push( new ClientVisibleGamePlayerInfo( player ) )
      }
      let json = HttpService.JSONEncode( infos )
      for ( let player of game.campers )
      {
         SetNetVar( player, NETVAR_JSON_PLAYERINFO, json )
      }
   }

   {
      // tell the possessed about everyone, and who else is possessed
      let infos: Array<ClientVisibleGamePlayerInfo> = []
      for ( let player of game.campers )
      {
         infos.push( new ClientVisibleGamePlayerInfo( player ) )
      }
      for ( let player of game.possessed )
      {
         let data = new ClientVisibleGamePlayerInfo( player )
         data.evil = true
         infos.push( data )
      }
      let json = HttpService.JSONEncode( infos )
      for ( let player of game.possessed )
      {
         SetNetVar( player, NETVAR_JSON_PLAYERINFO, json )
      }
   }

}

export function CreateGame( players: Array<Player> )
{
   Assert( players.size() >= MIN_PLAYERS, "Not enough players" )
   Assert( players.size() <= MAX_PLAYERS, "Too many players" )
   let game = new Game()
   file.games.push( game )
   for ( let player of players )
   {
      file.playerToGame.set( player, game )
   }

   game.allPlayers = players

   UpdateGame( game )
}

function RPC_FromClient_OnPlayerFinishTask( player: Player, roomName: string, taskName: string )
{
   SetPlayerWalkSpeed( player, 16 )
   if ( IsPracticing( player ) )
      return

   let game = PlayerToGame( player )

   let assignments = game.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      return
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
      {
         assignment.status = 1
      }
   }
   UpdateTasklistNetvar( player, assignments )
}


function GetRole( player: Player, game: Game ): ROLE
{
   Assert( !IsPracticing( player ), "Tried to check role on a player that is practicing" )
   for ( let possessed of game.possessed )
   {
      if ( possessed === player )
         return ROLE.ROLE_POSSESSED
   }

   return ROLE.ROLE_CAMPER
}

function SetRole( game: Game, player: Player, role: ROLE )
{
   switch ( role )
   {
      case ROLE.ROLE_CAMPER:
         game.campers.push( player )
         break

      case ROLE.ROLE_POSSESSED:
         game.possessed.push( player )
         break

      default:
         Assert( false, "Unknown role" )
         break
   }

   SetNetVar( player, NETVAR_ROLE, role )
}

function RemoveQuitPlayersFromGame( game: Game )
{
   RemoveQuitPlayers( game.allPlayers )
   RemoveQuitPlayers( game.campers )
   RemoveQuitPlayers( game.possessed )
}

export function UpdateGame( game: Game )
{
   // runs whenever there is an event that might change the game state

   RemoveQuitPlayersFromGame( game )

   switch ( game.gameState )
   {
      case GAME_STATE.GAME_STATE_PREMATCH:

         let players = game.allPlayers.concat( [] )
         let possessedCount = 1
         let size = players.size()
         if ( size > 11 )
            possessedCount = 3
         else if ( size > 6 )
            possessedCount = 2

         ArrayRandomize( players )
         let possessedPlayers = players.slice( 0, possessedCount )
         let campers = players.slice( possessedCount, size )

         for ( let player of possessedPlayers )
         {
            SetRole( game, player, ROLE.ROLE_POSSESSED )
         }

         for ( let player of campers )
         {
            SetRole( game, player, ROLE.ROLE_CAMPER )
         }

         for ( let player of game.campers )
         {
            AssignTasks( player, game )
         }

         let room = GetRoomByName( SPAWN_ROOM )
         let spawnLocations = GetRoomSpawnLocations( room, game.allPlayers.size() )
         //PutPlayersInRoom( players, room )
         for ( let i = 0; i < game.allPlayers.size(); i++ )
         {
            let player = game.allPlayers[i]
            SetPlayerCurrentRoom( player, room )

            let human = GetHumanoid( player )
            if ( human )
            {
               file.playerToSpawnLocation.set( player, spawnLocations[i] )
               human.TakeDamage( human.Health )
               SendRPC( "RPC_FromServer_CancelTask", player )
            }
         }

         game.gameState++

         break
   }

   UpdateClientVisibleData( game )
}

export function PlayerHasUnfinishedAssignment( player: Player, game: Game, roomName: string, taskName: string ): boolean
{
   let assignments = game.assignments.get( player )
   if ( assignments === undefined )
   {
      Assert( false, "Player has no assignments" )
      throw undefined
   }

   for ( let assignment of assignments )
   {
      if ( assignment.roomName === roomName && assignment.taskName === taskName )
         return assignment.status === 0
   }

   return false
}


function AssignTasks( player: Player, game: Game )
{
   let assignments: Array<Assignment> = []
   // create a list of random tasks for player to do
   let roomsAndTasks = GetAllRoomsAndTasks()
   ArrayRandomize( roomsAndTasks )
   roomsAndTasks = roomsAndTasks.slice( 0, MAX_TASKLIST_SIZE )
   for ( let roomAndTask of roomsAndTasks )
   {
      let assignment = new Assignment( roomAndTask.room.name, roomAndTask.task.name, 0 )
      assignments.push( assignment )
   }

   game.assignments.set( player, assignments )
   UpdateTasklistNetvar( player, assignments )
}

function UpdateTasklistNetvar( player: Player, assignments: Array<Assignment> )
{
   Assert( assignments !== undefined, "Player does not have tasklist" )
   if ( assignments === undefined )
      return

   let encode = HttpService.JSONEncode( assignments )
   SetNetVar( player, NETVAR_JSON_TASKLIST, encode )
}

