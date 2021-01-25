import { Players, RunService, Workspace } from "@rbxts/services"
import { NS_Corpse, TASK_RESTORE_LIGHTS, PlayerNumToGameViewable, ROLE, Match, GAME_STATE } from "shared/sh_gamestate"
import { AddCallback_OnPlayerCharacterAdded, AddCallback_OnPlayerCharacterAncestryChanged, GetPlayerFromUserID } from "shared/sh_onPlayerConnect"
import { PLAYER_COLORS, SPECTATOR_TRANS } from "shared/sh_settings"
import { TweenPlayerParts } from "shared/sh_tween"
import { GetFirstChildWithNameAndClassName, GetLocalPlayer, GraphCapped, IsAlive, SetCharacterTransparency, SetPlayerTransparency, UserIDToPlayer } from "shared/sh_utils"
import { Assert } from "shared/sh_assert"
import { GetCorpseClientModel, ClientGetAssignmentAssignedTime, ClientHasAssignment, GetLocalMatch, GetLocalIsSpectator, GetLocalRole } from "./cl_gamestate"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui"
import { GetAllCoins, GetCoins } from "shared/sh_coins"
import { Tween } from "shared/sh_tween";
import { GetCurrentRoom } from "./cl_rooms"
import { GetPosition } from "shared/sh_utils_geometry"

const FADE_CIRCLE = 'rbxassetid://6006022378'
const TRANSPARENCY = 0.333
const LOCAL_PLAYER = GetLocalPlayer()

Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
class File
{
   screenUI: ScreenGui | undefined
   camera: Camera

   characterToPlayer = new Map<Model, Player>()

   constructor( camera: Camera )
   {
      this.camera = camera
   }
}
let file = new File( Workspace.CurrentCamera as Camera )


export function CL_FadeOverlaySetup()
{
   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      if ( player !== LOCAL_PLAYER )
         SetPlayerTransparency( player, 1 )

      // cleanup past instances of this player
      for ( let pair of file.characterToPlayer )
      {
         if ( pair[1] === player )
            file.characterToPlayer.delete( pair[0] )
      }

      let character = player.Character
      if ( character === undefined )
         return
      file.characterToPlayer.set( character, player )
   } )
   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         let character = player.Character
         if ( character === undefined )
            return
         if ( file.characterToPlayer.has( character ) )
            file.characterToPlayer.delete( character )
      } )


   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.screenUI !== undefined )
      {
         file.screenUI.Parent = folder
         return
      }

      let screenUI = new Instance( "ScreenGui" )
      file.screenUI = screenUI
      screenUI.Name = "OverlayUI"
      screenUI.Parent = folder
      screenUI.DisplayOrder = UIORDER.UIORDER_FADEOVERLAY

      let fadeCircle = new Instance( "ImageLabel" )
      fadeCircle.Image = FADE_CIRCLE
      fadeCircle.BorderSizePixel = 0
      fadeCircle.ImageTransparency = TRANSPARENCY
      fadeCircle.BackgroundTransparency = 1.0
      fadeCircle.AnchorPoint = new Vector2( 0.5, 0.5 )
      fadeCircle.Parent = screenUI
      fadeCircle.Size = new UDim2( 0.25, 0, 0.25, 0 )

      function CreatePlayerNum( match: Match, player: Player ): TextLabel | undefined
      {
         let playerInfo = match.GetPlayerInfo( player )
         if ( playerInfo.playernum < 0 )
            return undefined
         if ( match.GetGameState() < GAME_STATE.GAME_STATE_PLAYING )
            return undefined

         let textLabel = new Instance( 'TextLabel' )
         textLabel.Parent = screenUI
         textLabel.TextColor3 = PLAYER_COLORS[playerInfo.playernum]
         textLabel.Text = PlayerNumToGameViewable( playerInfo.playernum )
         textLabel.TextScaled = true
         textLabel.Size = new UDim2( 0.1, 0, 0.1, 0 )
         textLabel.AnchorPoint = new Vector2( 0.0, 1.0 )
         textLabel.SizeConstraint = Enum.SizeConstraint.RelativeYY
         textLabel.BackgroundTransparency = 1.0
         textLabel.TextStrokeTransparency = 0
         return textLabel
      }

      function CreateOutsideFrames( count: number )
      {
         let frame = new Instance( "Frame" )
         frame.Transparency = TRANSPARENCY
         frame.BackgroundColor3 = new Color3( 0, 0, 0 )
         frame.BorderSizePixel = 0
         frame.Parent = fadeCircle
         switch ( count )
         {
            case 0:
               frame.AnchorPoint = new Vector2( 0, 1 )
               frame.Position = new UDim2( 0, 0, 0, 0 )
               frame.Size = new UDim2( 1, 0, 25, 0 )
               break

            case 1:
               frame.AnchorPoint = new Vector2( 0, -1 )
               frame.Position = new UDim2( 0, 0, 1, 0 )
               frame.Size = new UDim2( 1, 0, 25, 0 )
               break

            case 2:
               frame.AnchorPoint = new Vector2( 1, 0.5 )
               frame.Position = new UDim2( 0, 0, 0, 0 )
               frame.Size = new UDim2( 25, 0, 25, 0 )
               break

            case 3:
               frame.AnchorPoint = new Vector2( 0, 0.5 )
               frame.Position = new UDim2( 1, 0, 0, 0 )
               frame.Size = new UDim2( 25, 0, 25, 0 )
               break
         }
      }

      for ( let i = 0; i < 4; i++ )
      {
         CreateOutsideFrames( i )
      }

      let camera = file.camera
      let lightsLastDimmedTime = 0
      const LIGHT_NORMAL = 50
      const LIGHT_DIM = 9

      function GetLightDist( match: Match ): number
      {
         switch ( match.GetGameState() )
         {
            case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            case GAME_STATE.GAME_STATE_MEETING_VOTE:
            case GAME_STATE.GAME_STATE_MEETING_RESULTS:
               break

            default:
               const MAX = 200
               if ( GetLocalIsSpectator() )
                  return MAX

               switch ( GetLocalRole() )
               {
                  case ROLE.ROLE_IMPOSTOR:
                     return MAX
               }
               break
         }

         let lightsMax = LIGHT_NORMAL

         if ( ClientHasAssignment( 'Garage', TASK_RESTORE_LIGHTS ) )
         {
            lightsLastDimmedTime = Workspace.DistributedGameTime
            let timeSinceDimmed = lightsLastDimmedTime - ClientGetAssignmentAssignedTime( 'Garage', TASK_RESTORE_LIGHTS )
            return GraphCapped( timeSinceDimmed, 1, 5, lightsMax, LIGHT_DIM )
         }

         let timeSinceDimmed = Workspace.DistributedGameTime - lightsLastDimmedTime
         lightsMax = GraphCapped( timeSinceDimmed, 1, 3, LIGHT_DIM, lightsMax )
         return lightsMax
      }

      let characterChildrenCount = new Map<Model, number>()
      let playerToLabel = new Map<Player, TextLabel>()
      let wasVisiblePlayers = new Map<Player, boolean>()
      let visibleCorpsesToLabel = new Map<NS_Corpse, TextLabel>()
      let visibleCoins = new Map<Part, Boolean>()
      let knownCoins = new Map<Part, boolean>()
      let coinSearchIndex = 0
      let refreshFailsafe = 0

      let FADE_OUT = { Transparency: 1 }
      let FADE_OUT_SPECTATOR = { Transparency: SPECTATOR_TRANS }
      let FADE_IN = { Transparency: 0 }
      const FADE_TIME = 0.25
      const COIN_FADE_TIME = 0.125

      screenUI.Enabled = true

      function Hide( match: Match, player: Player )
      {
         // characters come in transparent
         if ( match.IsSpectator( LOCAL_PLAYER ) )
            SetPlayerTransparency( player, SPECTATOR_TRANS )
         else
            SetPlayerTransparency( player, 1 )
      }

      //let coinCount = 0
      let oldGameState = -1
      let oldGameIndex = -1

      RunService.RenderStepped.Connect( function ()      
      {
         let match = GetLocalMatch()

         let LIGHTDIST = GetLightDist( match )

         let character = LOCAL_PLAYER.Character
         if ( character === undefined )
            return

         let viewPlayer = LOCAL_PLAYER
         switch ( match.GetGameState() )
         {
            case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
            case GAME_STATE.GAME_STATE_MEETING_VOTE:
            case GAME_STATE.GAME_STATE_MEETING_RESULTS:
               let meetingDetails = match.GetMeetingDetails()
               if ( meetingDetails === undefined )
               {
                  Assert( false, "No meeting details" )
                  throw undefined
               }

               viewPlayer = GetPlayerFromUserID( meetingDetails.meetingCaller )
               break
         }

         let pos = GetPosition( viewPlayer )
         let offset = pos.add( new Vector3( 0, 0, LIGHTDIST ) )
         let [offsetLightDistFromCenter, _1] = camera.WorldToScreenPoint( offset )
         let [screenCenter, _2] = camera.WorldToScreenPoint( pos )

         let dist = offsetLightDistFromCenter.sub( screenCenter ).Magnitude
         fadeCircle.Position = new UDim2( 0, screenCenter.X, 0, screenCenter.Y )
         fadeCircle.Size = new UDim2( 0, dist, 0, dist )
         const VISUAL_DIST = fadeCircle.AbsoluteSize.X * 0.5

         let coins = GetCoins( match )
         let search = math.min( 30, coins.size() )
         for ( let i = 0; i < search; i++ )
         {
            let index = ( i + coinSearchIndex ) % coins.size()

            let coin = coins[index]
            let [partScreenCenter, _2] = camera.WorldToScreenPoint( coin.Position )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude
            let isVisible = dist < VISUAL_DIST
            let wasVisible = visibleCoins.has( coin )
            if ( knownCoins.has( coin ) )
            {
               if ( isVisible === wasVisible )
                  continue
            }
            else
            {
               knownCoins.set( coin, true )
            }

            if ( isVisible )
            {
               Tween( coin, { Transparency: 0 }, COIN_FADE_TIME )
               visibleCoins.set( coin, true )
            }
            else
            {
               Tween( coin, { Transparency: 1 }, COIN_FADE_TIME )
               visibleCoins.delete( coin )
            }
         }
         coinSearchIndex += 30


         let doRefreshFailsafe = Workspace.DistributedGameTime > refreshFailsafe
         if ( oldGameIndex !== match.shState.gameIndex )
         {
            oldGameIndex = match.shState.gameIndex
            doRefreshFailsafe = true

            let coins = GetAllCoins()
            for ( let coin of coins )
            {
               coin.Transparency = 1
            }
         }

         if ( oldGameState !== match.GetGameState() )
         {
            oldGameState = match.GetGameState()
            doRefreshFailsafe = true
         }

         if ( doRefreshFailsafe )
            refreshFailsafe = Workspace.DistributedGameTime + 5

         if ( doRefreshFailsafe )
         {
            // rehide all coins
            visibleCoins.clear()

            for ( let pair of playerToLabel )
            {
               pair[1].Destroy()
            }
            playerToLabel.clear()

            for ( let pair of visibleCorpsesToLabel )
            {
               pair[1].Destroy()
            }
            visibleCorpsesToLabel.clear()

            if ( match.IsSpectator( viewPlayer ) )
               SetPlayerTransparency( viewPlayer, SPECTATOR_TRANS )
            else
               SetPlayerTransparency( viewPlayer, 0 )
         }

         let localViewRoom = GetCurrentRoom( viewPlayer )
         let players = match.GetAllPlayers()

         for ( let player of players )
         {
            let character = player.Character
            if ( character === undefined )
               continue
            if ( !file.characterToPlayer.has( character ) )
               continue

            let isVisible = false
            let part: BasePart | undefined
            let head: Part | undefined

            let count = characterChildrenCount.get( character )
            if ( count === undefined || count < character.GetChildren().size() )
            {
               // refresh character as its parts load
               characterChildrenCount.set( character, character.GetChildren().size() )
               Hide( match, player )
            }

            part = character.PrimaryPart
            if ( part !== undefined )
               head = GetFirstChildWithNameAndClassName( character, 'Head', 'Part' ) as Part

            if ( head === undefined )
            {
               Hide( match, player )
               continue
            }

            let [partScreenCenter, _2] = camera.WorldToScreenPoint( head.Position )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude

            isVisible =
               IsAlive( player ) &&
               dist < VISUAL_DIST &&
               !match.IsSpectator( player )


            // maintain old behavior when player is viewing themselves, to not overwrite special spectator trans
            let skipPlayerTween = player === viewPlayer && viewPlayer === LOCAL_PLAYER

            let wasVisible = wasVisiblePlayers.has( player )
            if ( doRefreshFailsafe || isVisible !== wasVisible )
            {
               if ( isVisible )
               {
                  wasVisiblePlayers.set( player, true )

                  TweenPlayerParts( player, FADE_IN, FADE_TIME, "FADE_IN" )

                  if ( match.HasPlayer( player ) )
                  {
                     let textLabel = CreatePlayerNum( match, player )
                     if ( textLabel !== undefined )
                        playerToLabel.set( player, textLabel )
                  }
               }
               else
               {
                  wasVisiblePlayers.delete( player )

                  if ( !skipPlayerTween )
                  {
                     if ( match.IsSpectator( viewPlayer ) && match.IsSpectator( player ) )
                        TweenPlayerParts( player, FADE_OUT_SPECTATOR, FADE_TIME, "FADE_OUT" )
                     else
                        TweenPlayerParts( player, FADE_OUT, FADE_TIME, "FADE_OUT" )
                  }

                  let textLabel = playerToLabel.get( player )
                  if ( textLabel !== undefined )
                  {
                     textLabel.Destroy()
                     playerToLabel.delete( player )
                  }
               }

               let matchPlayers = match.GetAllPlayers()
               let hidePlayers = UserIDToPlayer()
               for ( let player of matchPlayers )
               {
                  if ( hidePlayers.has( player.UserId ) )
                     hidePlayers.delete( player.UserId )
               }

               for ( let pair of hidePlayers )
               {
                  SetPlayerTransparency( pair[1], 1 )
               }
            }

            let textLabel = playerToLabel.get( player )
            if ( textLabel !== undefined )
            {
               if ( isVisible && GetCurrentRoom( player ) === localViewRoom )
               {
                  textLabel.Position = new UDim2( 0, partScreenCenter.X, 0, partScreenCenter.Y )
                  textLabel.TextTransparency = 0
               }
               else
               {
                  textLabel.TextTransparency = 1
               }
            }
         }

         for ( let corpse of match.shState.corpses )
         {
            let corpseModel = GetCorpseClientModel( corpse.userId )
            if ( corpseModel === undefined )
               continue

            let [partScreenCenter, _2] = camera.WorldToScreenPoint( corpseModel.pos )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude

            let isVisible = dist < VISUAL_DIST
            if ( isVisible )
            {
               let textLabel = visibleCorpsesToLabel.get( corpse )
               if ( textLabel !== undefined )
                  textLabel.Position = new UDim2( 0, partScreenCenter.X, 0, partScreenCenter.Y )
            }

            let wasVisible = visibleCorpsesToLabel.has( corpse )
            if ( isVisible === wasVisible )
               continue

            if ( isVisible )
            {
               //TweenPlayerParts( corpse, FADE_IN, FADE_TIME )
               SetCharacterTransparency( corpseModel.model, 0 )

               let textLabel = CreatePlayerNum( match, GetPlayerFromUserID( corpse.userId ) )
               if ( textLabel !== undefined )
                  visibleCorpsesToLabel.set( corpse, textLabel )
            }
            else
            {
               //TweenPlayerParts( corpse, FADE_OUT, FADE_TIME )
               SetCharacterTransparency( corpseModel.model, 1 )

               let textLabel = visibleCorpsesToLabel.get( corpse )
               if ( textLabel !== undefined )
                  textLabel.Destroy()
               visibleCorpsesToLabel.delete( corpse )
            }
         }
      } )
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.screenUI !== undefined )
            file.screenUI.Parent = undefined
      } )
}
