import { Workspace } from "@rbxts/services";
import { Assert } from "shared/sh_assert";
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
   currentlyPickingUp = 0
   currentlyDisplayedScore = 0
   startPosition: UDim2 | undefined

   coinUIs: Array<EDITOR_CoinUI> = []
   coinUI_Popup: EDITOR_CoinUI | undefined
   coinUI_Gain: EDITOR_CoinUI | undefined
   coinUI_Total: EDITOR_CoinUI | undefined

   gemSound = LoadSound( 3147769418 ) // 1369094465 )
   coinSounds: Array<Sound> = [
      //LoadSound( 4612374937 ),
      //LoadSound( 4612375051 ),
      //LoadSound( 4612374807 ),
      LoadSound( 607665037 ),
      LoadSound( 607662191 ),
      LoadSound( 359628148 ),
      LoadSound( 4612376715 ),
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
      if ( file.coinUIs.size() > 0 )
      {
         for ( let coinUI of file.coinUIs )
         {
            coinUI.Parent = folder
         }
         return
      }

      let coinUI = GetFirstChildWithNameAndClassName( folder, 'CoinUI', 'ScreenGui' ) as EDITOR_CoinUI
      coinUI.Enabled = true
      file.startPosition = coinUI.CenterLabel.Position
      let score = GetScore( player )

      {
         let coinUI_Gain = coinUI.Clone()
         coinUI_Gain.Name = 'coinUI_Gain'
         coinUI_Gain.Parent = coinUI.Parent
         file.coinUI_Gain = coinUI_Gain
         file.coinUIs.push( coinUI_Gain )

         coinUI_Gain.DisplayOrder = UIORDER.UIORDER_SCORE_GAIN
         coinUI_Gain.CenterLabel.TextTransparency = 1
         coinUI_Gain.TextLabel.Destroy()
      }

      {
         let coinUI_Total = coinUI.Clone()
         coinUI_Total.Name = 'coinUI_Total'
         coinUI_Total.Parent = coinUI.Parent
         file.coinUI_Total = coinUI_Total
         file.coinUIs.push( coinUI_Total )

         coinUI_Total.DisplayOrder = UIORDER.UIORDER_SCORE_TOTAL
         coinUI_Total.CenterLabel.Destroy()

         if ( score === 0 )
            coinUI_Total.TextLabel.Text = ""
      }

      {
         let coinUI_Popup = coinUI.Clone()
         coinUI_Popup.Name = 'coinUI_Popup'
         coinUI_Popup.Parent = coinUI.Parent
         file.coinUI_Popup = coinUI_Popup
         file.coinUIs.push( coinUI_Popup )

         coinUI_Popup.DisplayOrder = UIORDER.UIORDER_SCORE_POPUP
         coinUI_Popup.TextLabel.Destroy()
         coinUI_Popup.CenterLabel.Destroy()

         Thread(
            function ()
            {
               if ( score > 0 )
                  DrawGainedPoints( score )
            } )
      }

      coinUI.Destroy()
   } )

   AddCallback_OnPlayerCharacterAncestryChanged(
      function ()
      {
         for ( let coinUI of file.coinUIs )
         {
            if ( coinUI !== undefined )
               coinUI.Parent = undefined
         }
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

            switch ( coinType )
            {
               case COIN_TYPE.TYPE_GEM:
                  {
                     let sound = file.gemSound
                     sound.Volume = 0.75
                     sound.Play()
                  }
                  break

               case COIN_TYPE.TYPE_GOLD:
                  {
                     let sound = ArrayRandom( file.coinSounds ) as Sound
                     sound.Volume = 0.5
                     sound.Play()
                  }
                  break

               case COIN_TYPE.TYPE_SILVER:
                  {
                     let sound = ArrayRandom( file.coinSounds ) as Sound
                     sound.Volume = 0.25
                     sound.Play()
                  }
                  break
            }
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
   let coinUI = file.coinUI_Popup
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

export function ClearCoinPopUps()
{
   if ( file.coinUI_Popup === undefined )
      return

   let children = file.coinUI_Popup.CoinPopups.GetChildren()
   for ( let child of children )
   {
      child.Destroy()
   }
}

function DrawGainedPoints( score: number )
{
   let coinUI_Total = file.coinUI_Total
   if ( coinUI_Total === undefined )
      return

   let coinUI_Gain = file.coinUI_Gain
   if ( coinUI_Gain === undefined )
      return

   let lastKnownScore = file.lastKnownScore
   if ( score < lastKnownScore || score === 0 )
   {
      if ( score > 0 )
         coinUI_Total.TextLabel.Text = score + ""
      else
         coinUI_Total.TextLabel.Text = ""
      file.currentlyDisplayedScore = score
      return
   }

   let label = coinUI_Gain.CenterLabel
   let gain = score - file.lastKnownScore
   let lastPickingUpAmount = file.currentlyPickingUp
   file.currentlyPickingUp = gain

   let mainScore = coinUI_Total.TextLabel

   if ( gain - lastPickingUpAmount >= 10 )
   {
      Thread( function ()
      {
         let startTime = Workspace.DistributedGameTime
         let endTime = startTime + 0.3
         for ( ; ; )
         {
            let num = math.floor( GraphCapped( Workspace.DistributedGameTime, startTime, endTime, lastPickingUpAmount, gain ) )
            if ( num < 1 )
               num = 1
            label.Text = "+" + num
            if ( file.currentlyPickingUp !== gain )
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
      wait( 0.5 )

      if ( file.currentlyPickingUp !== gain )
         return

      Tween( label, { TextTransparency: 1, TextStrokeTransparency: 1 }, 0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )

      if ( file.currentlyPickingUp !== gain )
         return

      mainScore.TextColor3 = SCORE_COLOR

      if ( score - lastKnownScore > 1 )
      {
         Thread( function ()
         {
            let startTime = Workspace.DistributedGameTime
            let endTime = startTime + 0.3
            for ( ; ; )
            {
               let num = math.floor( GraphCapped( Workspace.DistributedGameTime, startTime, endTime, lastKnownScore + 1, score ) )
               if ( num > file.currentlyDisplayedScore )
               {
                  file.currentlyDisplayedScore = num
                  mainScore.Text = num + ""
               }
               if ( Workspace.DistributedGameTime >= endTime )
                  return
               wait()
               if ( file.currentlyPickingUp !== gain )
                  return
            }
         } )
      }
      else
      {
         if ( score > file.currentlyDisplayedScore )
         {
            file.currentlyDisplayedScore = score
            mainScore.Text = score + ""
         }
      }


      wait( 0.5 )

      if ( file.currentlyPickingUp !== gain )
         return

      Tween( mainScore, { TextColor3: WHITE }, 1.5 )
      file.lastKnownScore = score

      file.currentlyPickingUp = 0
   } )
}
