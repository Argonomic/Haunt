import { RunService } from "@rbxts/services";
import { Match, GAME_STATE, PlayerInfo, PlayerNumToGameViewable, ROLE } from "shared/sh_gamestate";
import { ClonePlayerModel, GetPlayerFromUserID } from "shared/sh_onPlayerConnect";
import { MATCHMAKE_PLAYERCOUNT_STARTSERVER, PLAYER_COLORS } from "shared/sh_settings";
import { Tween } from "shared/sh_tween";
import { GetFirstChildWithNameAndClassName, GetLocalPlayer, LightenColor, SetCharacterTransparency, Thread, SetCharacterYaw } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "./cl_ui";
import { SendRPC_Client } from "shared/sh_rpc";
import { GetGameModeConsts } from "shared/sh_gameModeConsts"

const LOCAL_PLAYER = GetLocalPlayer()
const MAX_VOTE_SLOTS = 50

class File
{
   meetingUI: ScreenGui | undefined
   activeMeeting: ActiveMeeting | undefined
}
let file = new File()

type EDITOR_VoteImageWithText = ImageLabel &
{
   VoteNumber: TextLabel
   VoteViewport: ViewportFrame
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
   PlayerBackground: ScrollingFrame
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

   constructor( match: Match, player: Player, playerButtonTemplate: EDITOR_PlayerFrameButton, players: Array<Player>, displayChecks: ( buttonGroup: ButtonGroup ) => void, checkYes: () => void )
   {
      this.player = player
      this.frameButton = playerButtonTemplate.Clone()
      this.frameButton.Parent = playerButtonTemplate.Parent
      this.frameButton.Name = playerButtonTemplate.Name + " Clone"
      this.frameButton.Visible = true

      this.buttonGroup = new ButtonGroup( this.frameButton, players, displayChecks, checkYes )
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
      }

      if ( GetGameModeConsts().hasPlayerNumber && playerInfo.playernum >= 0 )
      {
         let color = PLAYER_COLORS[playerInfo.playernum]
         playerNumber.Text = PlayerNumToGameViewable( playerInfo.playernum )
         playerNumber.TextColor3 = color
      }
      else
      {
         playerNumber.Visible = false
      }

      let viewportFrame = new Instance( 'ViewportFrame' )
      viewportFrame.Size = new UDim2( 1.0, 0, 1.0, 0 )
      viewportFrame.Position = new UDim2( 0, 0, 0, 0 )
      viewportFrame.BackgroundColor3 = new Color3( 0, 0, 0 )
      viewportFrame.BorderSizePixel = 0
      viewportFrame.BackgroundTransparency = 1.0
      viewportFrame.Parent = playerImageLabel

      AddPlayerToViewport( viewportFrame, player )
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

   constructor( parent: TextButton, players: Array<Player>, displayChecks: ( buttonGroup: ButtonGroup ) => void, checkYes: () => void )
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

      let hasPlayerNumber = GetGameModeConsts().hasPlayerNumber
      for ( let i = 0; i < players.size(); i++ )
      {
         let voteImageClone = voteImage.Clone()
         voteImageClone.Parent = voteImage.Parent
         this.voteImages.push( voteImageClone )

         voteImageClone.Position = new UDim2( voteImage.Position.X.Scale, voteImage.AbsoluteSize.X * ( i * 1.25 ), voteImage.Position.Y.Scale, 0 )
         voteImage.Visible = false

         if ( !hasPlayerNumber )
            AddPlayerToViewport( voteImageClone.VoteViewport, players[i] )
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
   Assert( MATCHMAKE_PLAYERCOUNT_STARTSERVER <= MAX_VOTE_SLOTS )
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
   frame: EDITOR_MeetingFrame
   drewVote = new Map<Player, boolean>()

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
      this.frame = frame
      let ogPos = frame.Position
      let toggledPos = new UDim2( ogPos.X.Scale, ogPos.X.Offset, 0.9, ogPos.Y.Offset )
      frame.Position = new UDim2( ogPos.X.Scale, ogPos.X.Offset, 1.0, ogPos.Y.Offset )
      Tween( frame, { Position: ogPos }, 0.8, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )

      let playerBackground = frame.PlayerBackground
      let playerButtonTemplate = GetFirstChildWithNameAndClassName( playerBackground, 'PlayerButton', 'TextButton' ) as EDITOR_PlayerFrameButton
      this.playerButtonTemplate = playerButtonTemplate
      playerButtonTemplate.Visible = false

      let visible = true
      let meetingDetails = match.GetMeetingDetails()
      if ( meetingDetails === undefined )
      {
         Assert( false, "No meeting details" )
         throw undefined
      }
      frame.CrimeScene.Visible = true // = meetingDetails.meetingType === MEETING_TYPE.MEETING_REPORT
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
            if ( vote.voter === LOCAL_PLAYER.UserId )
               return // already voted
         }

         for ( let buttonGroup of allButtonGroups )
         {
            buttonGroup.HideChecks()
         }

         switch ( match.GetPlayerRole( LOCAL_PLAYER ) )
         {
            case ROLE.ROLE_IMPOSTOR:
            case ROLE.ROLE_CAMPER:
               buttonGroup.ShowChecks()
               break
         }
      }

      let skipVote = frame.Skip
      let skipButtonGroup = new ButtonGroup( skipVote, players,
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
         let playerButtonGroup = new PlayerButtonGroup( match, player, playerButtonTemplate, players,
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

      for ( let playerButtonGroup of this.playerButtonGroups )
      {
         playerButtonGroup.alive = !match.IsSpectator( playerButtonGroup.player )
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

      let firstDead = 0
      let firstLiving = 0
      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      {
         let playerButtonGroup = this.playerButtonGroups[i]
         if ( playerButtonGroup.alive )
            firstDead++
      }

      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      {
         let playerButtonGroup = this.playerButtonGroups[i]

         let index
         if ( playerButtonGroup.alive )
         {
            index = firstLiving
            firstLiving++
         }
         else
         {
            index = firstDead
            firstDead++
         }

         let odd = index % 2 > 0
         let row = math.floor( index / 2 )

         let scaleX = this.playerButtonTemplate.Position.X.Scale
         let scaleY = this.playerButtonTemplate.Position.Y.Scale

         let offsetY = this.playerButtonTemplate.Position.Y.Scale + row * this.playerButtonTemplate.AbsoluteSize.Y
         let offsetX = 0

         if ( odd )
            offsetX = this.playerButtonTemplate.AbsoluteSize.X * 1.1

         playerButtonGroup.frameButton.Position = new UDim2( scaleX, offsetX, scaleY, offsetY )
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

   private AddVote( buttonGroup: ButtonGroup, voterInfo: PlayerInfo, voterButtonGroup: PlayerButtonGroup )
   {
      let voteNumbers = GetGameModeConsts().hasPlayerNumber
      for ( let voteImage of buttonGroup.voteImages )
      {
         if ( voteImage.Visible )
            continue

         let voteObject: GuiObject
         if ( voteNumbers )
         {
            voteObject = voteImage.VoteNumber
            voteImage.VoteNumber.TextColor3 = PLAYER_COLORS[voterInfo.playernum]
            voteImage.VoteNumber.Text = PlayerNumToGameViewable( voterInfo.playernum )
         }
         else
         {
            voteObject = voteImage.VoteViewport
         }

         let player = GetPlayerFromUserID( voterInfo._userid )
         let baseFrame = this.frame
         if ( !this.drewVote.has( player ) )
         {
            this.drewVote.set( player, true )
            Thread( function ()
            {
               let pnum = voterButtonGroup.frameButton.PlayerNumber
               let flyingNumber = voteObject.Clone()
               flyingNumber.Parent = baseFrame
               flyingNumber.Visible = true
               flyingNumber.AnchorPoint = new Vector2( 0.0, 0.0 )
               flyingNumber.ZIndex = 100
               let pos = pnum.AbsolutePosition.sub( baseFrame.AbsolutePosition )
               flyingNumber.Position = new UDim2( 0, pos.X, 0, pos.Y )

               let startSize = pnum.AbsoluteSize
               flyingNumber.Size = new UDim2( 0, startSize.X, 0, startSize.Y )

               let targetPos = voteObject.AbsolutePosition.sub( baseFrame.AbsolutePosition )
               let targetVec = new UDim2( 0, targetPos.X, 0, targetPos.Y )
               let endSize = voteObject.AbsoluteSize
               let endSizeUDim2 = new UDim2( 0, endSize.X, 0, endSize.Y )

               let time = 1.5
               Tween( flyingNumber, { Position: targetVec, Size: endSizeUDim2 }, time, Enum.EasingStyle.Quart, Enum.EasingDirection.InOut )
               wait( time )

               if ( flyingNumber !== undefined )
                  flyingNumber.Destroy()
               if ( voteImage !== undefined )
               {
                  voteImage.Visible = true
                  if ( voteObject !== undefined )
                     voteObject.Visible = true
               }
            } )
         }
         else
         {
            if ( voteImage !== undefined )
            {
               voteImage.Visible = true
               if ( voteObject !== undefined )
                  voteObject.Visible = true
            }
         }

         return
      }
   }

   public RedrawMeeting( match: Match )
   {
      print( "RedrawMeeting" )
      let playerToButtonGroup = new Map<Player, PlayerButtonGroup>()

      let didVote = false
      for ( let vote of match.GetVotes() )
      {
         if ( vote.voter === LOCAL_PLAYER.UserId )
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
         if ( match.GetGameState() === GAME_STATE.GAME_STATE_MEETING_VOTE )
         {
            this.skipButtonGroup.button.Visible = true
            if ( match.IsSpectator( LOCAL_PLAYER ) )
               this.skipButtonGroup.button.BackgroundColor3 = new Color3( 0.5, 0.5, 0.5 )
            else
               this.skipButtonGroup.button.BackgroundColor3 = new Color3( 1.0, 1.0, 1.0 )
         }
      }

      for ( let playerButtonGroup of this.playerButtonGroups )
      {
         playerButtonGroup.alive = playerButtonGroup.connected
         let player = playerButtonGroup.player

         if ( match.GetPlayerKilled( player ) )
            playerButtonGroup.frameButton.ClipFrame.dead.Visible = true

         if ( match.IsSpectator( player ) )
            playerButtonGroup.alive = false

         if ( !playerButtonGroup.connected || !playerButtonGroup.alive )
            playerButtonGroup.frameButton.Transparency = 0.666
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
         let voter = GetPlayerFromUserID( vote.voter )
         Assert( voter !== undefined, "No voter!" )

         if ( !playerToButtonGroup.has( voter ) )
            continue

         let playerButtonGroup = playerToButtonGroup.get( voter ) as PlayerButtonGroup

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

         let voterPlayerInfo = match.GetPlayerInfo( voter )
         let voterButtonGroup = playerToButtonGroup.get( voter ) as PlayerButtonGroup
         if ( vote.target === undefined )
         {
            // skipped
            this.AddVote( this.skipButtonGroup, voterPlayerInfo, voterButtonGroup )
         }
         else
         {
            let voteTarget = GetPlayerFromUserID( vote.target )
            let voteTargetButtonGroup = playerToButtonGroup.get( voteTarget ) as PlayerButtonGroup
            this.AddVote( voteTargetButtonGroup.buttonGroup, voterPlayerInfo, voterButtonGroup )
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

      if ( lastGameState === GAME_STATE.GAME_STATE_SUDDEN_DEATH )
         return false

      let meetingDetails = match.GetMeetingDetails()
      if ( meetingDetails === undefined )
         return false

      if ( lastGameState === GAME_STATE.GAME_STATE_PLAYING )
         DestroyActiveMeeting()

      switch ( match.GetGameState() )
      {
         case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
         case GAME_STATE.GAME_STATE_MEETING_VOTE:
         case GAME_STATE.GAME_STATE_MEETING_RESULTS:

            let activeMeeting = file.activeMeeting
            if ( activeMeeting === undefined )
            {
               activeMeeting = new ActiveMeeting( match, meetingUITemplate, GetPlayerFromUserID( meetingDetails.meetingCaller ) )
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

function AddPlayerToViewport( viewportFrame: ViewportFrame, player: Player )
{
   let viewportCamera = new Instance( 'Camera' )
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