import { Workspace } from "@rbxts/services";
import { COIN_TYPE, GetCoinDataFromType } from "shared/sh_coins";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { AddRPC } from "shared/sh_rpc";
import { GetScore, NETVAR_SCORE } from "shared/sh_score";
import { Tween } from "shared/sh_tween";
import { Thread, GetFirstChildWithNameAndClassName, Graph, GetLocalPlayer, LoadSound, ArrayRandom, RandomFloatRange, GraphCapped } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";


type EDITOR_CoinUI = ScreenGui &
{
   TextLabel: TextLabel
   CenterLabel: TextLabel
   CoinPopups: Folder
}

class File
{
   lastKnownScore = 0
   currentlyDisplayedGain = 0
   startPosition: UDim2 | undefined

   coinUI: EDITOR_CoinUI | undefined
   coinSounds: Array<Sound> = [
      LoadSound( 4612374937 ),
      LoadSound( 4612375051 ),
      LoadSound( 4612374807 ),
      //LoadSound( 607665037 ),
      //LoadSound( 607662191 ),
      //LoadSound( 359628148 ),
      //LoadSound( 4612376715 ),
   ]
}
let file = new File()

const SCORE_COLOR = new Color3( 1, 1, 0 )
const WHITE = new Color3( 1, 1, 1 )

export function CL_CoinsSetup()
{
   let player = GetLocalPlayer()
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( file.coinUI !== undefined )
      {
         file.coinUI.Parent = folder
         return
      }

      file.coinUI = GetFirstChildWithNameAndClassName( folder, 'CoinUI', 'ScreenGui' ) as EDITOR_CoinUI
      file.coinUI.TextLabel.Text = ""
      file.coinUI.CenterLabel.TextTransparency = 1
      file.coinUI.DisplayOrder = UIORDER.UIORDER_SCORE
      file.coinUI.Enabled = true

      file.startPosition = file.coinUI.CenterLabel.Position
      let score = GetScore( player )
      if ( score > 0 )
         DrawGainedPoints( score )
      else
         file.coinUI.TextLabel.Text = ""
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         if ( file.coinUI !== undefined )
            file.coinUI.Parent = undefined
      } )

   AddNetVarChangedCallback( NETVAR_SCORE,
      function ()
      {
         let score = GetScore( player )
         Thread(
            function ()
            {
               DrawGainedPoints( score )
            } )
      } )

   AddRPC( "RPC_FromServer_PickupCoin",
      function ( pos: Vector3, coinType: COIN_TYPE )
      {
         let coinData = GetCoinDataFromType( coinType )

         DrawRisingNumberFromWorldPos( pos, coinData.value, coinData.color )

         Thread( function ()
         {
            let waittime = RandomFloatRange( 0, 0.25 )
            if ( waittime > 0 )
               wait( waittime )

            let sound = ArrayRandom( file.coinSounds ) as Sound
            sound.Play()
         } )
      } )

   AddRPC( "RPC_FromServer_GavePoints", // like completing a task
      function ( pos: Vector3, value: number )
      {
         DrawRisingNumberFromWorldPos( pos, value, SCORE_COLOR )
      } )
}

function CreatePointsElem( value: number, color: Color3 ): TextLabel
{
   let points = new Instance( 'TextLabel' )
   points.Name = "CoinLabel"
   points.Text = "+" + value
   points.Size = new UDim2( 0.04, 0, 0.04, 0 )
   points.AnchorPoint = new Vector2( 0.5, 0.5 )
   points.TextScaled = true
   points.BackgroundTransparency = 1.0
   points.TextStrokeTransparency = 0.0
   points.TextColor3 = color
   points.Font = Enum.Font.Highway
   return points
}

function DrawRisingNumberFromWorldPos( pos: Vector3, value: number, color: Color3 )
{
   let coinUI = file.coinUI
   if ( coinUI === undefined )
      return

   let camera = Workspace.CurrentCamera
   if ( camera === undefined )
      return

   let points = CreatePointsElem( value, color )
   points.Parent = coinUI.CoinPopups

   let [vector, onScreen] = camera.WorldToScreenPoint( pos )
   let viewSize = camera.ViewportSize

   let X = Graph( vector.X, 0, viewSize.X, 0, 1.0 )
   let Y = Graph( vector.Y, 0, viewSize.Y, 0, 1.0 )
   points.Position = new UDim2( X, 0, Y, 0 )

   Thread(
      function ()
      {
         let newPosition = new UDim2( points.Position.X.Scale, 0, points.Position.Y.Scale - 0.1, 0 )
         Tween( points, { Position: newPosition }, 1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
         wait( 2.0 )
         Tween( points, { TextStrokeTransparency: 1, TextTransparency: 1 }, 1.0, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
         wait( 1.0 )
         points.Destroy()
      } )
}

export function ClearCoinOverlays()
{
   if ( file.coinUI === undefined )
      return

   //let coinUI = file.coinUI.Clone()
   //coinUI.Parent = file.coinUI.Parent
   //file.coinUI.Destroy()
   //file.coinUI = coinUI

   let children = file.coinUI.CoinPopups.GetChildren()
   for ( let child of children )
   {
      child.Destroy()
   }
}

function DrawGainedPoints( score: number )
{
   if ( file.coinUI === undefined )
      return

   let lastKnownScore = file.lastKnownScore
   if ( score < lastKnownScore || score === 0 )
   {
      if ( score > 0 )
         file.coinUI.TextLabel.Text = score + ""
      else
         file.coinUI.TextLabel.Text = ""
      return
   }

   let label = file.coinUI.CenterLabel
   let gain = score - file.lastKnownScore
   let lastGain = file.currentlyDisplayedGain
   file.currentlyDisplayedGain = gain

   let mainScore = file.coinUI.TextLabel

   if ( gain - lastGain >= 10 )
   {
      Thread( function ()
      {
         let startTime = Workspace.DistributedGameTime
         let endTime = startTime + 0.3
         for ( ; ; )
         {
            let num = math.floor( GraphCapped( Workspace.DistributedGameTime, startTime, endTime, lastGain, gain ) )
            if ( num < 1 )
               num = 1
            label.Text = "+" + num
            if ( file.currentlyDisplayedGain !== gain )
               return
            if ( Workspace.DistributedGameTime >= endTime )
               return
            wait()
         }
      } )
   }
   else
   {
      label.Text = "+" + gain
   }

   Thread( function ()
   {
      label.TextColor3 = SCORE_COLOR
      Tween( label, { TextColor3: WHITE }, 1.0 )
      Tween( label, { TextTransparency: 0, TextStrokeTransparency: 0 }, 0.1 )
      label.Size = new UDim2( 0.25, 0, 0.25, 0 )

      Tween( label, { Size: new UDim2( 0.08, 0, 0.08, 0 ) }, 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
      wait( 1.2 )

      if ( file.currentlyDisplayedGain !== gain )
         return

      Tween( label, { TextTransparency: 1, TextStrokeTransparency: 1 }, 0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )

      if ( file.currentlyDisplayedGain !== gain )
         return

      mainScore.TextColor3 = SCORE_COLOR

      if ( score - lastKnownScore >= 10 )
      {
         Thread( function ()
         {
            let startTime = Workspace.DistributedGameTime
            let endTime = startTime + 0.3
            for ( ; ; )
            {
               let num = math.floor( GraphCapped( Workspace.DistributedGameTime, startTime, endTime, lastKnownScore, score ) )
               mainScore.Text = num + ""
               if ( Workspace.DistributedGameTime >= endTime )
                  return
               wait()
            }
         } )
      }
      else
      {
         mainScore.Text = score + ""
      }


      wait( 0.5 )

      if ( file.currentlyDisplayedGain !== gain )
         return

      Tween( mainScore, { TextColor3: WHITE }, 1.5 )
      file.lastKnownScore = score
      file.currentlyDisplayedGain = 0
   } )
}

function GetStartPosition(): UDim2
{
   if ( file.startPosition === undefined )
      throw undefined
   return file.startPosition as UDim2
}