import { Workspace } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect"
import { AddCallback_OnRoomSetup, EDITOR_Vent, Room } from "shared/sh_rooms"
import { GetLocalPlayer, GetPlayerFromDescendant, LoadSound } from "shared/sh_utils"
import { GetPosition, PI } from "shared/sh_utils_geometry"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui"
import { GetBearingBetweenPoints } from "shared/sh_utils_geometry"
import { SendRPC_Client } from "shared/sh_rpc"
import { IsImpostorRole } from "shared/sh_gamestate"
import { GetLocalMatch } from "./cl_gamestate"

const LOCAL_PLAYER = GetLocalPlayer()
const ARROW = 'rbxassetid://144168163'

export function CL_VentSetup()
{
   let ui: ScreenGui | undefined
   let folder: Folder | undefined

   let ventsByRoom = new Map<string, EDITOR_Vent>()

   //let lastRoom = ""
   //print( GetBearingBetweenPoints( 0, 0, 0, 1 ) )
   //print( GetBearingBetweenPoints( 0, 0, 1, 1 ) )
   //print( GetBearingBetweenPoints( 0, 0, 1, 0 ) )
   //print( GetBearingBetweenPoints( 0, 0, 1, -1 ) )
   //print( GetBearingBetweenPoints( 0, 0, 0, -1 ) )
   //print( GetBearingBetweenPoints( 0, 0, -1, -1 ) )
   //print( GetBearingBetweenPoints( 0, 0, -1, 0 ) )
   //print( GetBearingBetweenPoints( 0, 0, -32, 45 ) )
   //print( GetBearingBetweenPoints( 0, 0, -1, 1 ) )
   //
   //function PrintIt( degrees: number )
   //{
   //   let angle = degrees * ( PI / 180 )
   //   let x = math.floor( 100 * math.cos( angle ) )
   //   let y = math.floor( 100 * math.sin( angle ) )
   //   print( "Angle: " + degrees + "    " + x + "," + y + " " + math.floor( new Vector2//( x, y ).Magnitude ) )
   //}
   //
   //
   //print( " " )
   //PrintIt( 0 )
   //PrintIt( 45 )
   //PrintIt( 90 )
   //PrintIt( 135 )
   //PrintIt( 180 )
   //PrintIt( 225 )
   //PrintIt( 270 )
   //PrintIt( 315 )



   AddPlayerGuiFolderExistsCallback( function ( guiFolder: Folder )
   {
      folder = guiFolder
   } )

   function DrawUI( vent: EDITOR_Vent, ventRoomName: string )
   {
      if ( ui !== undefined )
         ui.Destroy()

      if ( folder === undefined )
         return

      let camera = Workspace.CurrentCamera
      if ( camera === undefined )
         return
      ui = new Instance( 'ScreenGui' )
      ui.Name = "Vent Overlay"
      ui.Enabled = true
      ui.ResetOnSpawn = false
      ui.Parent = folder
      ui.DisplayOrder = UIORDER.UIORDER_VENT

      let pos = GetPosition( vent.scr_vent_trigger )
      let [screenPos, _1] = camera.WorldToScreenPoint( pos )
      let viewsize = camera.ViewportSize
      let bounds = math.min( screenPos.X, screenPos.Y, viewsize.X - screenPos.X, viewsize.Y - screenPos.Y )

      let frame = new Instance( 'Frame' )
      frame.Parent = ui
      frame.Size = new UDim2( 0, bounds * 2, 0, bounds * 2 )
      frame.Position = new UDim2( 0, screenPos.X, 0, screenPos.Y )
      frame.AnchorPoint = new Vector2( 0.5, 0.5 )
      frame.BackgroundTransparency = 1.0

      /*
      let textLabel = new Instance( 'TextLabel' )
      textLabel.BackgroundTransparency = 1
      textLabel.Text = math.floor( pos.X ) + " " + math.floor( pos.Z )
      textLabel.Parent = frame
      textLabel.AnchorPoint = new Vector2( 0.5, 0.5 )
      textLabel.Position = new UDim2( 0.5, 0, 0.5, 0 )
      textLabel.Size = new UDim2( 0.25, 0, 0.25, 0 )
      textLabel.TextScaled = true
      textLabel.TextColor3 = new Color3( 1, 1, 1 )
      textLabel.TextTransparency = 0.7
      */

      //let roomName = ( vent.Parent as Instance ).Name
      //let doPrint = lastRoom !== roomName
      //lastRoom = roomName
      //if ( doPrint )
      //   print( "\nFrom: " + roomName )

      let arrowSize = new UDim2( 0, bounds * 0.6, 0, bounds * 0.6 )
      for ( let roomTarget of vent.scr_vent_trigger.GetChildren() )
      {
         if ( roomTarget.Name !== "scr_room_target" )
            continue
         let roomName = ( roomTarget as StringValue ).Value
         let otherVent = ventsByRoom.get( roomName )
         if ( otherVent === undefined )
            continue

         //let pos = 
         //let [targetPos, _1] = camera.WorldToScreenPoint( pos )
         let targetPos = GetPosition( otherVent.Union )

         let arrow = new Instance( 'ImageButton' )
         arrow.Parent = frame
         arrow.AnchorPoint = new Vector2( 0.5, 0.5 )
         arrow.Image = ARROW
         arrow.BackgroundTransparency = 1
         arrow.Size = arrowSize
         arrow.ZIndex = 5

         let points = pos.sub( targetPos )
         let yaw = GetBearingBetweenPoints( 0, 0, points.Z, points.X )
         //yaw = ( 360 - yaw )
         arrow.Rotation = ( 360 - yaw ) - 90
         yaw -= 90

         //print( "Points: " + math.floor( pos.X ) + "/" + math.floor( pos.Z ) + " " + math.floor( targetPos.X ) + "/" + math.floor( targetPos.Z ) + " to yaw " + math.floor( yaw ) )

         let radians = yaw * ( PI / 180 )
         let dist = bounds * 0.75

         let X = math.floor( dist * math.cos( radians ) )
         let Y = math.floor( dist * math.sin( radians ) ) * -1

         /*
         if ( doPrint )
         {
            print( "To: " + roomName )
            print( "Angle: " + yaw )
            print( "Radians: " + radians )
            print( "xy: " + X + "," + Y )
            print( "Dist: " + dist )
            print( "Magnitude: " + math.floor( new Vector2( X, Y ).Magnitude ) )
            print( " " )
         }
         */

         arrow.Position = new UDim2( 0.5, X, 0.5, Y )
         arrow.MouseButton1Click.Connect(
            function ()
            {
               SendRPC_Client( "RPC_FromClient_VentTeleport", ventRoomName, roomName )
            } )
      }
   }


   AddCallback_OnRoomSetup( "scr_vent", function ( vent: EDITOR_Vent, room: Room )
   {
      ventsByRoom.set( room.name, vent )

      vent.scr_vent_trigger.Touched.Connect( function ( toucher )
      {
         let match = GetLocalMatch()
         if ( !IsImpostorRole( match.GetPlayerRole( LOCAL_PLAYER ) ) )
            return
         if ( GetPlayerFromDescendant( toucher ) !== LOCAL_PLAYER )
            return
         DrawUI( vent, room.name )
      } )

      vent.scr_vent_trigger.TouchEnded.Connect( function ( toucher )
      {
         if ( GetPlayerFromDescendant( toucher ) !== LOCAL_PLAYER )
            return
         if ( ui !== undefined )
            ui.Destroy()
      } )

      AddCallback_OnPlayerCharacterAncestryChanged(
         function ()
         {
            if ( ui !== undefined )
               ui.Destroy()
         } )
   } )

}