import { RunService } from "@rbxts/services";
import { Match, GAME_STATE, PlayerInfo, PlayerNumToGameViewable, ROLE, MEETING_TYPE } from "shared/sh_gamestate";
import { ClonePlayerModel } from "shared/sh_onPlayerConnect";
import { MATCHMAKE_PLAYERCOUNT_STARTSERVER, PLAYER_COLORS } from "shared/sh_settings";
import { Tween } from "shared/sh_tween";
import { GetFirstChildWithNameAndClassName, GetLocalPlayer, LightenColor, SetCharacterTransparency, Thread, SetCharacterYaw } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";
import { SendRPC_Client } from "shared/sh_rpc";

class File
{
   meetingUI: ScreenGui | undefined
   activeMeeting: ActiveMeeting | undefined
}
let file = new File()

type EDITOR_VoteImageWithText = ImageLabel &
{
   VoteNumber: TextLabel
}

type EDITOR_PlayerFrameButton = TextButton &
{
   PlayerNumber: TextLabel
   voted: TextLabel
   ClipFrame: TextButton &
   {
      horn: ImageLabel
      dead: ImageLabel
   }
   PlayerImage: ImageLabel &
   {
      PlayerName: TextLabel
   }
}

type EDITOR_MeetingFrame = Frame &
{
   CrimeScene: TextButton &
   {
      Label: TextButton
   }
   PlayerBackground: Frame
   Skip: TextButton
   MeetingMessage: TextLabel
}

class PlayerButtonGroup
{
   buttonGroup: ButtonGroup
   frameButton: EDITOR_PlayerFrameButton
   voted: TextLabel
   player: Player
   alive = true
   connected = true
   playerInfo: PlayerInfo
   horn: ImageLabel

   constructor( match: Match, player: Player, playerButtonTemplate: EDITOR_PlayerFrameButton, playerCount: number, displayChecks: ( buttonGroup: ButtonGroup ) => void, checkYes: () => void )
   {
      this.player = player
      this.frameButton = playerButtonTemplate.Clone()
      this.frameButton.Parent = playerButtonTemplate.Parent
      this.frameButton.Name = playerButtonTemplate.Name + " Clone"
      this.frameButton.Visible = true

      this.buttonGroup = new ButtonGroup( this.frameButton, playerCount, displayChecks, checkYes )
      let playerNumber = this.frameButton.PlayerNumber
      let playerImageLabel = this.frameButton.PlayerImage
      let playerName = playerImageLabel.PlayerName
      let voted = this.frameButton.voted
      let clipFrame = this.frameButton.ClipFrame
      this.horn = clipFrame.horn
      this.horn.Visible = false

      this.connected = player.Character !== undefined

      let dead = clipFrame.dead
      dead.Visible = false

      voted.Visible = false
      this.voted = voted

      playerImageLabel.ImageTransparency = 1.0
      playerImageLabel.BackgroundTransparency = 1.0
      playerName.Text = player.Name
      let playerInfo = match.GetPlayerInfo( player )
      this.playerInfo = playerInfo
      if ( playerInfo.playernum >= 0 )
      {
         let color = PLAYER_COLORS[playerInfo.playernum]
         this.frameButton.BackgroundColor3 = LightenColor( color, 0.75 )
         playerNumber.Text = PlayerNumToGameViewable( playerInfo.playernum )
         playerNumber.TextColor3 = color
      }
      else
      {
         playerNumber.Visible = false
      }

      this.alive = this.connected

      if ( match.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR_CAMPER_ESCAPED )
      {
         this.alive = false
      }
      else if ( match.GetPlayerKilled( player ) )
      {
         this.alive = false
         dead.Visible = true
      }

      if ( !this.alive )
         this.frameButton.Transparency = 0.75


      let viewportFrame = new Instance( "ViewportFrame" ) as ViewportFrame
      viewportFrame.Size = new UDim2( 1.0, 0, 1.0, 0 )
      viewportFrame.Position = new UDim2( 0, 0, 0, 0 )
      viewportFrame.BackgroundColor3 = new Color3( 0, 0, 0 )
      viewportFrame.BorderSizePixel = 0
      viewportFrame.BackgroundTransparency = 1.0
      viewportFrame.Parent = playerImageLabel

      let viewportCamera = new Instance( "Camera" ) as Camera
      viewportFrame.CurrentCamera = viewportCamera
      viewportCamera.Parent = viewportFrame

      // For rapid iteration
      //      let numVal = new Instance( 'NumberValue' ) as NumberValue
      //      numVal.Parent = viewportCamera
      //      numVal.Value = 35
      //
      //      let lastModel: Model | undefined
      //      RunService.RenderStepped.Connect(
      //         function ()
      //         {
      //            if ( lastModel !== undefined )
      //               lastModel.Destroy()
      //SetPlayerYaw( player, 0 )//numVal.Value )
      let clonedModel = ClonePlayerModel( player )
      if ( clonedModel !== undefined )
      {
         SetCharacterTransparency( clonedModel, 0 )
         SetCharacterYaw( clonedModel, 0 )
         clonedModel.Parent = viewportFrame
         let head = GetFirstChildWithNameAndClassName( clonedModel, 'Head', 'Part' ) as BasePart
         let camPosVec = new Vector3( 0.45, -0.2, -1.4 )
         let vecEnd = head.Position
         let vecStart = vecEnd.add( camPosVec )
         viewportCamera.CFrame = new CFrame( vecStart, vecEnd )
      }


      //// For rapid iteration
      //let camPos = new Instance( 'Vector3Value' ) as Vector3Value
      //camPos.Parent = viewportCamera
      //camPos.Value = camPosVec

      //let vecEnd = head.Position
      //let vecStart = vecEnd.add( camPos.Value )
      //viewportCamera.CFrame = new CFrame( vecStart, vecEnd )
      //         } )
   }
}

class ButtonGroup
{
   button: TextButton
   checkboxYes: TextButton
   checkboxNo: TextButton
   checkYes: ImageLabel
   checkNo: ImageLabel

   voteImages: Array<EDITOR_VoteImageWithText> = []

   public HideChecks()
   {
      this.checkNo.Visible = false
      this.checkYes.Visible = false
      this.checkboxNo.Visible = false
      this.checkboxYes.Visible = false
   }

   public ShowChecks()
   {
      this.checkNo.Visible = true
      this.checkYes.Visible = true
      this.checkboxNo.Visible = true
      this.checkboxYes.Visible = true
   }

   constructor( parent: TextButton, playerCount: number, displayChecks: ( buttonGroup: ButtonGroup ) => void, checkYes: () => void )
   {
      let buttonGroup = this
      Assert( parent.IsA( 'TextButton' ), "Not a text button" )
      this.button = parent
      this.checkboxYes = GetFirstChildWithNameAndClassName( parent, 'checkbox_yes', 'TextButton' ) as TextButton
      this.checkboxNo = GetFirstChildWithNameAndClassName( parent, 'checkbox_no', 'TextButton' ) as TextButton
      this.checkYes = GetFirstChildWithNameAndClassName( parent, 'check_yes', 'ImageLabel' ) as ImageLabel
      this.checkNo = GetFirstChildWithNameAndClassName( parent, 'check_no', 'ImageLabel' ) as ImageLabel

      this.checkboxYes.MouseButton1Click.Connect( checkYes )
      this.checkboxNo.MouseButton1Click.Connect(
         function ()
         {
            buttonGroup.HideChecks()
         }
      )

      let voteImageParent: GuiObject = parent
      let playerImage = GetFirstChildWithNameAndClassName( parent, 'PlayerImage', 'ImageLabel' ) as ImageLabel
      if ( playerImage !== undefined )
         voteImageParent = playerImage

      let voteImage = GetFirstChildWithNameAndClassName( voteImageParent, 'VoteImage', 'ImageLabel' ) as EDITOR_VoteImageWithText
      voteImage.VoteNumber.Visible = false
      voteImage.BackgroundTransparency = 1.0

      for ( let i = 0; i < playerCount; i++ )
      {
         let voteImageClone = voteImage.Clone()
         voteImageClone.Parent = voteImage.Parent
         this.voteImages.push( voteImageClone )

         voteImageClone.Position = new UDim2( voteImage.Position.X.Scale, voteImage.AbsoluteSize.X * ( i * 1.25 ), voteImage.Position.Y.Scale, 0 )
         voteImage.Visible = false
      }
      voteImage.Destroy()

      let invisiButton = new Instance( 'TextButton' )
      invisiButton.Parent = this.button
      invisiButton.ZIndex = 6
      invisiButton.Size = new UDim2( 1, 0, 1, 0 )
      invisiButton.BackgroundTransparency = 1
      invisiButton.BorderSizePixel = 0
      invisiButton.Text = ""
      invisiButton.MouseButton1Click.Connect(
         function ()
         {
            displayChecks( buttonGroup )
         }
      )

      this.checkboxYes.Visible = false
      this.checkboxNo.Visible = false
      this.checkYes.Visible = false
      this.checkNo.Visible = false
   }
}

export function CL_MeetingSetup()
{
   AddPlayerGuiFolderExistsCallback(
      function ( folder: Folder )
      {
         file.meetingUI = GetFirstChildWithNameAndClassName( folder, 'MeetingUI', 'ScreenGui' ) as ScreenGui
         file.meetingUI.Enabled = false
         file.meetingUI.DisplayOrder = UIORDER.UIORDER_MEETING
      } )
}

class ActiveMeeting
{
   meetingUI: ScreenGui
   playerButtonTemplate: TextButton
   skipButtonGroup: ButtonGroup
   playerButtonGroups: Array<PlayerButtonGroup>
   meetingMessage: TextLabel
   match: Match
   render: RBXScriptConnection

   constructor( match: Match, meetingUITemplate: ScreenGui, meetingCaller: Player )
   {
      let players: Array<Player> = []
      players = players.concat( match.GetCampers() )
      players = players.concat( match.GetImpostors() )

      Assert( players.size() > 0, "Can't start a meeting with zero players" )
      this.match = match

      let meetingUI = meetingUITemplate.Clone()
      this.meetingUI = meetingUI
      meetingUI.Name = meetingUITemplate.Name + " Clone"
      meetingUI.Parent = meetingUITemplate.Parent
      meetingUI.Enabled = true
      print( "meetingUI.Enabled = true" )

      let frame = GetFirstChildWithNameAndClassName( meetingUI, 'Frame', 'Frame' ) as EDITOR_MeetingFrame
      let ogPos = frame.Position
      let toggledPos = new UDim2( ogPos.X.Scale, ogPos.X.Offset, 0.9, ogPos.Y.Offset )
      frame.Position = new UDim2( ogPos.X.Scale, ogPos.X.Offset, 1.0, ogPos.Y.Offset )
      Tween( frame, { Position: ogPos }, 0.8, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )

      let playerBackground = frame.PlayerBackground
      let playerButtonTemplate = GetFirstChildWithNameAndClassName( playerBackground, 'PlayerButton', 'TextButton' ) as EDITOR_PlayerFrameButton
      this.playerButtonTemplate = playerButtonTemplate
      playerButtonTemplate.Visible = false

      let visible = true
      frame.CrimeScene.Visible = match.meetingType === MEETING_TYPE.MEETING_REPORT
      frame.CrimeScene.Label.MouseButton1Click.Connect(
         function ()
         {
            visible = !visible

            let pos
            if ( visible )
               pos = ogPos
            else
               pos = toggledPos
            Tween( frame, { Position: pos }, 0.5, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )
         } )

      let allButtonGroups: Array<ButtonGroup> = []

      function HideAllChecksAndDisplayThisOne( buttonGroup: ButtonGroup )
      {
         if ( match.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
            return

         if ( match.IsSpectator( localPlayer ) )
            return

         for ( let vote of match.GetVotes() )
         {
            if ( vote.voter === localPlayer )
               return // already voted
         }

         for ( let buttonGroup of allButtonGroups )
         {
            buttonGroup.HideChecks()
         }

         switch ( match.GetPlayerRole( localPlayer ) )
         {
            case ROLE.ROLE_IMPOSTOR:
            case ROLE.ROLE_CAMPER:
               buttonGroup.ShowChecks()
               break
         }
      }

      let skipVote = frame.Skip
      let skipButtonGroup = new ButtonGroup( skipVote, players.size(),
         HideAllChecksAndDisplayThisOne,

         function ()
         {
            SendRPC_Client( "RPC_FromClient_Skipvote" )
         },
      )
      allButtonGroups.push( skipButtonGroup )

      this.skipButtonGroup = skipButtonGroup
      this.HideButtonGroup( skipButtonGroup )

      this.meetingMessage = frame.MeetingMessage

      this.playerButtonGroups = []

      let activeMeeting = this

      let localPlayer = GetLocalPlayer()

      for ( let i = 0; i < players.size(); i++ )
      {
         let player = players[i]
         let playerButtonGroup = new PlayerButtonGroup( match, player, playerButtonTemplate, players.size(),
            function ( buttonGroup: ButtonGroup )
            {
               if ( match.IsSpectator( playerButtonGroup.player ) )
                  return

               HideAllChecksAndDisplayThisOne( buttonGroup )
            },

            function ()
            {
               SendRPC_Client( "RPC_FromClient_Vote", player.UserId )
            },
         )
         allButtonGroups.push( playerButtonGroup.buttonGroup )

         this.playerButtonGroups.push( playerButtonGroup )
         playerButtonGroup.frameButton.Visible = true

         if ( playerButtonGroup.player === meetingCaller )
            playerButtonGroup.horn.Visible = true
      }

      this.playerButtonGroups.sort( SortByLiving )


      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      {
         let zIndex = i
         if ( i % 2 === 0 )
            zIndex += 2

         // so "VOTED" graphic doesn't draw behind stuff
         this.playerButtonGroups[i].frameButton.ZIndex = zIndex
      }


      let last = MATCHMAKE_PLAYERCOUNT_STARTSERVER - 1
      let first = 0

      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      {
         let playerButtonGroup = this.playerButtonGroups[i]

         let index
         if ( playerButtonGroup.alive )
         {
            index = first
            first++
         }
         else
         {
            index = last
            last--
         }

         let odd = index % 2 > 0
         let row = math.floor( index / 2 )

         let y = this.playerButtonTemplate.Position.Y.Scale + row * 0.185
         let x = this.playerButtonTemplate.Position.X.Scale

         if ( odd )
            x = 1.0 - x

         playerButtonGroup.frameButton.Position = new UDim2( x, 0, y, 0 )
      }

      let render = RunService.RenderStepped.Connect( function ()
      {
         if ( !match.GameStateHasTimeLimit() )
         {
            DestroyActiveMeeting()
            return
         }

         let timeRemaining = math.floor( match.GetTimeRemainingForState() )
         if ( timeRemaining > 0 )
            timeRemaining++
         let timeRemainingMsg = " (" + timeRemaining + ")"

         if ( match.IsSpectator( localPlayer ) )
         {
            switch ( match.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_MEETING_VOTE:
                  activeMeeting.meetingMessage.Text = "Waiting for votes.." + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
                  activeMeeting.meetingMessage.Text = "Prepare for voting.. " + timeRemainingMsg
                  break
            }
         }
         else
         {
            switch ( match.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_MEETING_VOTE:
                  if ( !match.DidVote( localPlayer ) )
                     activeMeeting.meetingMessage.Text = "Make your vote!" + timeRemainingMsg
                  else
                     activeMeeting.meetingMessage.Text = "Waiting for votes.." + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
                  activeMeeting.meetingMessage.Text = "Prepare to vote.. " + timeRemainingMsg
                  break
            }
         }
      } )
      this.render = render
   }

   private HideButtonGroup( buttonGroup: ButtonGroup )
   {
      buttonGroup.button.Visible = false
      buttonGroup.HideChecks()
   }

   private HideVoteImages( buttonGroup: ButtonGroup )
   {
      for ( let voteImage of buttonGroup.voteImages )
      {
         voteImage.Visible = false
      }
   }

   private AddVote( buttonGroup: ButtonGroup, playerInfo: PlayerInfo )
   {
      for ( let voteImage of buttonGroup.voteImages )
      {
         if ( voteImage.Visible )
            continue
         voteImage.Visible = true
         voteImage.VoteNumber.Visible = true
         voteImage.VoteNumber.TextColor3 = PLAYER_COLORS[playerInfo.playernum]
         voteImage.VoteNumber.Text = PlayerNumToGameViewable( playerInfo.playernum )

         //voteImage.ImageColor3 = GetColor( voter )
         return
      }
   }

   public RedrawMeeting( match: Match )
   {
      print( "RedrawMeeting" )
      let playerToButtonGroup = new Map<Player, PlayerButtonGroup>()

      let localPlayer = GetLocalPlayer()

      let didVote = false
      for ( let vote of match.GetVotes() )
      {
         if ( vote.voter === localPlayer )
         {
            didVote = true
            break
         }
      }

      if ( didVote )
      {
         this.skipButtonGroup.HideChecks()
         this.skipButtonGroup.button.BackgroundColor3 = new Color3( 0.5, 0.5, 0.5 )
         for ( let playerButtonGroup of this.playerButtonGroups )
         {
            playerButtonGroup.buttonGroup.HideChecks()
         }
      }
      else
      {
         if ( !match.IsSpectator( localPlayer ) )
         {
            if ( match.GetGameState() === GAME_STATE.GAME_STATE_MEETING_VOTE )
               this.skipButtonGroup.button.Visible = true
         }
      }

      // hide all the checkboxes
      this.HideVoteImages( this.skipButtonGroup )

      for ( let playerButtonGroup of this.playerButtonGroups )
      {
         playerToButtonGroup.set( playerButtonGroup.player, playerButtonGroup )
         this.HideVoteImages( playerButtonGroup.buttonGroup )
      }

      const TIME = 0.6
      let dif = 0.3
      print( "Vote count: " + match.GetVotes().size() )
      for ( let vote of match.GetVotes() )
      {
         let voter = vote.voter as Player
         Assert( voter !== undefined, "No voter!" )

         let playerButtonGroup = playerToButtonGroup.get( voter ) as PlayerButtonGroup
         Assert( playerButtonGroup !== undefined, "playerButtonGroup !== undefined" )

         if ( !playerButtonGroup.voted.Visible )
         {
            Tween( playerButtonGroup.voted, { Size: playerButtonGroup.voted.Size, TextTransparency: 0 }, TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.Out )
            Thread( function ()
            {
               wait( TIME * ( 1.0 - dif ) )
               Tween( playerButtonGroup.voted, { TextTransparency: 0, TextStrokeTransparency: 0 }, dif, Enum.EasingStyle.Exponential, Enum.EasingDirection.Out )
            } )

            playerButtonGroup.voted.TextTransparency = 0.95
            playerButtonGroup.voted.TextStrokeTransparency = 0.95
            playerButtonGroup.voted.Size = new UDim2( playerButtonGroup.voted.Size.X.Scale * 5, 0, playerButtonGroup.voted.Size.Y.Scale * 5, 0 )
         }
         playerButtonGroup.voted.Visible = true

         let playerInfo = match.GetPlayerInfo( voter )
         if ( vote.target === undefined )
         {
            // skipped
            this.AddVote( this.skipButtonGroup, playerInfo )
         }
         else
         {
            let playerButtonGroup = playerToButtonGroup.get( vote.target ) as PlayerButtonGroup
            this.AddVote( playerButtonGroup.buttonGroup, playerInfo )
         }
      }
   }
}

export function UpdateMeeting( match: Match, lastGameState: GAME_STATE )
{
   function DrewMeeting(): boolean
   {
      let meetingUITemplate = file.meetingUI
      if ( meetingUITemplate === undefined )
         return false

      let meetingCaller = match.meetingCaller
      if ( meetingCaller === undefined )
         return false

      if ( lastGameState === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
         return false

      let activeMeeting = file.activeMeeting

      if ( lastGameState === GAME_STATE.GAME_STATE_PLAYING )
         DestroyActiveMeeting()

      switch ( match.GetGameState() )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         case GAME_STATE.GAME_STATE_MEETING_VOTE:
            if ( activeMeeting === undefined )
            {
               activeMeeting = new ActiveMeeting( match, meetingUITemplate, meetingCaller )
               file.activeMeeting = activeMeeting
            }

            activeMeeting.RedrawMeeting( match )
            return true
      }
      return false
   }

   if ( DrewMeeting() )
      return

   DestroyActiveMeeting()
}

function DestroyActiveMeeting()
{
   let activeMeeting = file.activeMeeting
   if ( activeMeeting !== undefined )
   {
      activeMeeting.render.Disconnect()
      activeMeeting.meetingUI.Destroy()
      file.activeMeeting = undefined
   }
}

function SortByLiving( a: PlayerButtonGroup, b: PlayerButtonGroup ): boolean
{
   if ( a.alive !== b.alive )
      return a.alive

   if ( a.connected !== b.connected )
      return a.connected

   return a.playerInfo.playernum < b.playerInfo.playernum
}