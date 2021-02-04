import { RunService } from "@rbxts/services";
import { Assert } from "shared/sh_assert";
import { Match, GAME_STATE, NETVAR_JSON_GAMESTATE } from "shared/sh_gamestate";
import { AddCallback_OnPlayerCharacterAncestryChanged } from "shared/sh_onPlayerConnect";
import { AddNetVarChangedCallback } from "shared/sh_player_netvars";
import { Tween } from "shared/sh_tween";
import { GetExistingFirstChildWithNameAndClassName, GraphCapped, LoadSound, Thread } from "shared/sh_utils";
import { GetLocalMatch } from "./cl_localMatch";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";

const BEEP = LoadSound( 138081500 )

type EDITOR_SuddenDeath = ScreenGui &
{
   Frame: Frame &
   {
      SuddenDeath: TextLabel
      NoMoreMeetings: TextLabel

      SecondsLeft: TextLabel
      Time: TextLabel

      FinalSeconds: TextLabel
   }
}

export function CL_SuddenDeathSetup()
{
   let first = true
   let suddenDeathUI_orUndefined: EDITOR_SuddenDeath | undefined
   AddPlayerGuiFolderExistsCallback( function ( folder: Folder )
   {
      if ( suddenDeathUI_orUndefined !== undefined )
      {
         suddenDeathUI_orUndefined.Parent = folder
         return
      }

      Assert( first, "First" )
      first = false

      let suddenDeathUI = GetExistingFirstChildWithNameAndClassName( folder, 'SuddenDeath', 'ScreenGui' ) as EDITOR_SuddenDeath
      suddenDeathUI_orUndefined = suddenDeathUI
      suddenDeathUI.DisplayOrder = UIORDER.UIORDER_SUDDEN_DEATH
      suddenDeathUI.ResetOnSpawn = false

      AddCallback_OnPlayerCharacterAncestryChanged(
         function ()
         {
            suddenDeathUI.Parent = undefined
         } )

      let connect: RBXScriptConnection | undefined

      let wasSuddenDeath = false
      let originalSize = suddenDeathUI.Frame.Size

      AddNetVarChangedCallback( NETVAR_JSON_GAMESTATE,
         function ()
         {
            Thread(
               function ()
               {
                  wait() // after it actually state
                  if ( connect !== undefined )
                  {
                     connect.Disconnect()
                     connect = undefined
                  }

                  let match: Match
                  {
                     let _game = GetLocalMatch()
                     let isSuddenDeath = _game !== undefined && _game.GetGameState() === GAME_STATE.GAME_STATE_SUDDEN_DEATH
                     suddenDeathUI.Enabled = isSuddenDeath

                     if ( !isSuddenDeath )
                        return
                     match = _game as Match
                  }

                  if ( !wasSuddenDeath )
                  {
                     // zoom in the text when it appears
                     wasSuddenDeath = true
                     suddenDeathUI.Frame.Size = new UDim2( suddenDeathUI.Frame.Size.X.Scale * 2, 0, suddenDeathUI.Frame.Size.Y.
                        Scale * 2, 0 )
                     Tween( suddenDeathUI.Frame, { Size: originalSize }, 0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
                  }

                  let lastTime = -1
                  connect = RunService.RenderStepped.Connect(
                     function ()
                     {
                        if ( match.GetGameState() !== GAME_STATE.GAME_STATE_SUDDEN_DEATH )
                           return

                        let time = match.GetTimeRemainingForState()
                        if ( time > 0 )
                           time = math.floor( time + 1 )

                        suddenDeathUI.Frame.SecondsLeft.Visible = false
                        suddenDeathUI.Frame.Time.Visible = false
                        suddenDeathUI.Frame.FinalSeconds.Visible = true
                        suddenDeathUI.Frame.FinalSeconds.Text = time + ""

                        if ( time > 10 )
                        {
                           suddenDeathUI.Frame.SuddenDeath.Visible = true
                           suddenDeathUI.Frame.NoMoreMeetings.Visible = true

                           suddenDeathUI.Frame.FinalSeconds.Size = new UDim2( 1, 0, 0.5, 0 )
                           suddenDeathUI.Frame.FinalSeconds.Position = new UDim2( 0, 0, 0.9, 0 )
                        }
                        else
                        {
                           suddenDeathUI.Frame.SuddenDeath.Visible = false
                           suddenDeathUI.Frame.NoMoreMeetings.Visible = false

                           suddenDeathUI.Frame.FinalSeconds.Size = new UDim2( 1, 0, 1, 0 )
                           suddenDeathUI.Frame.FinalSeconds.Position = new UDim2( 0, 0, 0, 0 )

                           if ( time !== lastTime )
                           {
                              lastTime = time
                              BEEP.Volume = GraphCapped( time, 10, 6, 0.1, 0.5 )
                              BEEP.Play()
                           }
                        }
                     } )
               } )
         } )
   } )
}