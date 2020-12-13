import { RunService, Workspace } from "@rbxts/services"
import { Corpse, IsPracticing, PlayerNumToGameViewable, ROLE } from "shared/sh_gamestate"
import { PLAYER_COLORS } from "shared/sh_settings"
import { TweenPlayerParts } from "shared/sh_tween"
import { Assert, GetFirstChildWithNameAndClassName, GetLocalPlayer, IsAlive, SetCharacterTransparency } from "shared/sh_utils"
import { GetLocalGame, GetLocalIsSpectator, GetLocalRole } from "./cl_gamestate"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui"

const FADE_CIRCLE = 'rbxassetid://6006022378'
const TRANSPARENCY = 0.5

Assert( Workspace.CurrentCamera !== undefined, "Workspace has no camera" )
class File
{
   screenUI = new Instance( "ScreenGui" )
   camera: Camera

   constructor( camera: Camera )
   {
      this.camera = camera
   }
}
let file = new File( Workspace.CurrentCamera as Camera )
file.screenUI.Destroy()


export function CL_FadeOverlaySetup()
{
   AddPlayerGuiFolderExistsCallback( function ( gui: Instance )
   {
      let localPlayer = GetLocalPlayer()

      let game = GetLocalGame()

      let screenUI = new Instance( "ScreenGui" )
      file.screenUI = screenUI
      screenUI.Name = "OverlayUI"
      screenUI.Parent = gui
      screenUI.DisplayOrder = UIORDER.UIORDER_FADEOVERLAY

      let fadeCircle = new Instance( "ImageLabel" )
      fadeCircle.Image = FADE_CIRCLE
      fadeCircle.BorderSizePixel = 0
      fadeCircle.ImageTransparency = TRANSPARENCY
      fadeCircle.BackgroundTransparency = 1.0
      fadeCircle.AnchorPoint = new Vector2( 0.5, 0.5 )
      fadeCircle.Parent = screenUI
      fadeCircle.Size = new UDim2( 0.25, 0, 0.25, 0 )

      function CreatePlayerNum( player: Player ): TextLabel
      {
         let textLabel = new Instance( 'TextLabel' )
         textLabel.Parent = screenUI
         let playerInfo = game.GetPlayerInfo( player )
         if ( playerInfo.playernum >= 0 )
            textLabel.TextColor3 = PLAYER_COLORS[playerInfo.playernum]

         textLabel.Text = PlayerNumToGameViewable( playerInfo.playernum )
         //textLabel.Text = player.UserId + " " + playerNum
         textLabel.TextScaled = true
         //textLabel.Font = Enum.Font.LuckiestGuy
         textLabel.Size = new UDim2( 0.1, 0, 0.1, 0 )
         textLabel.AnchorPoint = new Vector2( 0.0, 1.0 )
         textLabel.SizeConstraint = Enum.SizeConstraint.RelativeYY
         textLabel.BackgroundTransparency = 1.0
         textLabel.TextStrokeTransparency = 0
         return textLabel
      }

      //      let myPlayerNum = CreatePlayerNum( localPlayer )

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
               frame.Size = new UDim2( 1, 0, 10, 0 )
               break

            case 1:
               frame.AnchorPoint = new Vector2( 0, -1 )
               frame.Position = new UDim2( 0, 0, 1, 0 )
               frame.Size = new UDim2( 1, 0, 10, 0 )
               break

            case 2:
               frame.AnchorPoint = new Vector2( 1, 0.5 )
               frame.Position = new UDim2( 0, 0, 0, 0 )
               frame.Size = new UDim2( 10, 0, 10, 0 )
               break

            case 3:
               frame.AnchorPoint = new Vector2( 0, 0.5 )
               frame.Position = new UDim2( 1, 0, 0, 0 )
               frame.Size = new UDim2( 10, 0, 10, 0 )
               break
         }
      }

      for ( let i = 0; i < 4; i++ )
      {
         CreateOutsideFrames( i )
      }

      let camera = file.camera

      function GetLightDist(): number
      {
         const MAX = 200
         if ( IsPracticing( localPlayer ) )
            return MAX

         if ( GetLocalIsSpectator() )
            return MAX

         switch ( GetLocalRole() )
         {
            case ROLE.ROLE_POSSESSED:
               return MAX
         }

         return 25
      }

      let visiblePlayersToPlayernum = new Map<Player, TextLabel>()
      let visibleCorpsesToPlayernum = new Map<Corpse, TextLabel>()

      let FADE_OUT = { Transparency: 1 }
      let FADE_IN = { Transparency: 0 }
      const FADE_TIME = 0.25

      //let seed = math.round( math.random() * 100 )

      let connect = RunService.RenderStepped.Connect( function ()      
      {
         let LIGHTDIST = GetLightDist()

         let character = localPlayer.Character
         if ( character === undefined )
            return
         let head = GetFirstChildWithNameAndClassName( character, 'Head', 'Part' ) as Part
         if ( head === undefined )
            return

         let pos = head.Position
         //let pos = GetPosition( localPlayer )
         let offset = pos.add( new Vector3( 0, 0, LIGHTDIST ) )
         let [offsetLightDistFromCenter, _1] = camera.WorldToScreenPoint( offset )
         let [screenCenter, _2] = camera.WorldToScreenPoint( pos )

         let dist = offsetLightDistFromCenter.sub( screenCenter ).Magnitude
         fadeCircle.Position = new UDim2( 0, screenCenter.X, 0, screenCenter.Y )
         fadeCircle.Size = new UDim2( 0, dist, 0, dist )
         const VISUAL_DIST = fadeCircle.AbsoluteSize.X * 0.5

         //myPlayerNum.Position = new UDim2( 0, screenCenter.X, 0, screenCenter.Y )

         let players = game.GetAllPlayers()

         for ( let player of players )
         {
            if ( player === localPlayer )
               continue

            let character = player.Character
            if ( character === undefined )
               continue

            let part = character.PrimaryPart
            if ( part === undefined )
               continue

            let head = GetFirstChildWithNameAndClassName( character, 'Head', 'Part' ) as Part
            if ( head === undefined )
               continue

            //let human = GetFirstChildWithName( character, "Humanoid" ) as Humanoid

            let [partScreenCenter, _2] = camera.WorldToScreenPoint( head.Position )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude

            let withinVisibleDist =
               !IsPracticing( localPlayer ) &&
               IsAlive( player ) &&
               !game.IsSpectator( player ) &&
               dist < VISUAL_DIST

            /*
            print( "\n\nwithinVisibleDist: " + withinVisibleDist +
               "\n!IsPracticing( localPlayer ): " + !IsPracticing( localPlayer ) +
               "\nIsAlive( player ): " + ( IsAlive( player ) ) +
               "\n!game.IsSpectator( player ): " + ( !game.IsSpectator( player ) ) +
               "\ndist < VISUAL_DIST: " + ( dist < VISUAL_DIST ) +
               "\ndist: " + ( dist ) )
            */

            let wasVisible = visiblePlayersToPlayernum.has( player )
            if ( withinVisibleDist === wasVisible )
            {
               if ( withinVisibleDist )
               {
                  let textLabel = visiblePlayersToPlayernum.get( player ) as TextLabel
                  textLabel.Position = new UDim2( 0, partScreenCenter.X, 0, partScreenCenter.Y )
               }

               continue
            }

            if ( withinVisibleDist )
            {
               TweenPlayerParts( player, FADE_IN, FADE_TIME )
               let textLabel = CreatePlayerNum( player )
               visiblePlayersToPlayernum.set( player, textLabel )
            }
            else
            {
               TweenPlayerParts( player, FADE_OUT, FADE_TIME )
               let textLabel = visiblePlayersToPlayernum.get( player ) as TextLabel
               textLabel.Destroy()
               visiblePlayersToPlayernum.delete( player )
            }
         }

         for ( let corpse of game.corpses )
         {
            if ( corpse.clientModel === undefined )
               continue

            let [partScreenCenter, _2] = camera.WorldToScreenPoint( corpse.pos )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude

            let withinVisibleDist = dist < VISUAL_DIST
            let wasVisible = visibleCorpsesToPlayernum.has( corpse )
            if ( withinVisibleDist === wasVisible )
               continue

            if ( withinVisibleDist )
            {
               //TweenPlayerParts( corpse, FADE_IN, FADE_TIME )
               SetCharacterTransparency( corpse.clientModel, 0 )
               let textLabel = CreatePlayerNum( corpse.player )
               visibleCorpsesToPlayernum.set( corpse, textLabel )
            }
            else
            {
               //TweenPlayerParts( corpse, FADE_OUT, FADE_TIME )
               SetCharacterTransparency( corpse.clientModel, 1 )
               let textLabel = visibleCorpsesToPlayernum.get( corpse ) as TextLabel
               textLabel.Destroy()
               visibleCorpsesToPlayernum.delete( corpse )
            }
         }
      } )

      screenUI.AncestryChanged.Connect( function ()
      {
         connect.Disconnect()
         screenUI.Destroy()
      } )
   } )
}
