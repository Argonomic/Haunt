import { Players, RunService, Workspace } from "@rbxts/services"
import { IsPracticing, NETVAR_MATCHMAKING_STATUS, ROLE } from "shared/sh_gamestate"
import { GetNetVar_Number } from "shared/sh_player_netvars"
import { Assert, GetPosition, SetPlayerTransparencyAndColor, TweenPlayerParts } from "shared/sh_utils"
import { GetLivingPlayersInMyGame, GetLocalRole } from "./cl_gamestate"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"

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
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      if ( GetLocalRole() === ROLE.ROLE_POSSESSED )
         return

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

      let localPlayer = Players.LocalPlayer
      let LIGHTDIST = 25
      if ( IsPracticing( localPlayer ) )
         LIGHTDIST *= 2

      let visiblePlayers = new Map<Player, boolean>()

      let FADE_OUT = { Transparency: 1, Color: new Color3( 0, 0, 0 ) }
      let FADE_IN = { Transparency: 0, Color: new Color3( 1, 1, 1 ) }
      const FADE_TIME = 0.25

      //let seed = math.round( math.random() * 100 )

      let connect = RunService.RenderStepped.Connect( function ()      
      {
         let pos = GetPosition( localPlayer )
         let offset = pos.add( new Vector3( 0, 0, LIGHTDIST ) )
         let [offsetLightDistFromCenter, _1] = camera.WorldToScreenPoint( offset )
         let [screenCenter, _2] = camera.WorldToScreenPoint( pos )

         let dist = offsetLightDistFromCenter.sub( screenCenter ).Magnitude
         fadeCircle.Position = new UDim2( 0, screenCenter.X, 0, screenCenter.Y )
         fadeCircle.Size = new UDim2( 0, dist, 0, dist )
         const VISUAL_DIST = fadeCircle.AbsoluteSize.X * 0.5

         let players = GetLivingPlayersInMyGame()
         //print( "living players: " + players.size() )
         for ( let player of players )
         {
            let character = player.Character
            if ( character === undefined )
               continue

            let part = character.PrimaryPart
            if ( part === undefined )
               continue

            let [partScreenCenter, _2] = camera.WorldToScreenPoint( part.Position )
            let dist = partScreenCenter.sub( screenCenter ).Magnitude

            let withinVisibleDist = dist < VISUAL_DIST
            let wasVisible = visiblePlayers.has( player )
            if ( withinVisibleDist === wasVisible )
               continue

            if ( withinVisibleDist )
            {
               TweenPlayerParts( player, FADE_IN, FADE_TIME )
               visiblePlayers.set( player, true )
            }
            else
            {
               TweenPlayerParts( player, FADE_OUT, FADE_TIME )
               visiblePlayers.delete( player )
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

