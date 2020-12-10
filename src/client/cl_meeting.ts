import { RunService } from "@rbxts/services";
import { Game, GAME_STATE, PlayerNumToGameViewable, ROLE } from "shared/sh_gamestate";
import { MAX_PLAYERS, PLAYER_COLORS } from "shared/sh_settings";
import { Assert, ClonePlayerModel, GetColor, GetFirstChildWithName, GetFirstChildWithNameAndClassName, GetLocalPlayer, LightenColor, SetCharacterTransparency, SetPlayerYaw } from "shared/sh_utils";
import { AddPlayerGuiFolderExistsCallback } from "./cl_ui";
import { SendRPC } from "./cl_utils";

class File
{
   meetingUI: ScreenGui | undefined
   activeMeeting: ActiveMeeting | undefined
}
let file = new File()

class PlayerButtonGroup
{
   buttonGroup: ButtonGroup
   frameButton: TextButton
   player: Player
   alive = true
   playerNum = -1

   constructor( game: Game, player: Player, playerButtonTemplate: TextButton, playerCount: number, displayChecks: ( buttonGroup: ButtonGroup ) => void, checkYes: () => void )
   {
      this.player = player
      this.frameButton = playerButtonTemplate.Clone()
      this.frameButton.Parent = playerButtonTemplate.Parent
      this.frameButton.Name = playerButtonTemplate.Name + " Clone"
      this.frameButton.Visible = true
      this.buttonGroup = new ButtonGroup( this.frameButton, playerCount, displayChecks, checkYes )
      let playerNumber = GetFirstChildWithNameAndClassName( this.frameButton, 'PlayerNumber', 'TextLabel' ) as TextLabel

      let playerImageLabel = GetFirstChildWithNameAndClassName( this.frameButton, 'PlayerImage', 'ImageLabel' ) as ImageLabel

      let playerName = GetFirstChildWithNameAndClassName( playerImageLabel, 'PlayerName', 'TextLabel' ) as TextLabel

      playerImageLabel.ImageTransparency = 1.0
      playerImageLabel.BackgroundTransparency = 1.0
      playerName.Text = player.Name
      let playerInfo = game.GetPlayerInfo( player )
      if ( playerInfo.playernum >= 0 )
      {
         let color = PLAYER_COLORS[playerInfo.playernum]
         this.frameButton.BackgroundColor3 = LightenColor( color, 0.75 )
         playerNumber.Text = PlayerNumToGameViewable( playerInfo.playernum )
         playerNumber.TextColor3 = color
         this.playerNum = playerInfo.playernum
      }
      else
      {
         playerNumber.Visible = false
      }

      if ( game.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR )
      {
         this.frameButton.Transparency = 0.75
         this.alive = false
      }

      if ( player.Character === undefined )
         return
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
      SetPlayerYaw( player, 0 )//numVal.Value )
      let clonedModel = ClonePlayerModel( player ) as Model
      SetCharacterTransparency( clonedModel, 0 )
      //lastModel = clonedModel

      clonedModel.Parent = viewportFrame
      let head = GetFirstChildWithNameAndClassName( clonedModel, 'Head', 'Part' ) as BasePart
      let camPosVec = new Vector3( 0.45, -0.2, -1.4 )

      let vecEnd = head.Position
      let vecStart = vecEnd.add( camPosVec )
      viewportCamera.CFrame = new CFrame( vecStart, vecEnd )

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

   voteImages: Array<ImageLabel> = []

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

      this.checkboxYes.MouseButton1Up.Connect( checkYes )
      this.checkboxNo.MouseButton1Up.Connect(
         function ()
         {
            buttonGroup.HideChecks()
         }
      )

      let voteImageParent: GuiObject = parent
      let playerImage = GetFirstChildWithNameAndClassName( parent, 'PlayerImage', 'ImageLabel' ) as ImageLabel
      if ( playerImage !== undefined )
         voteImageParent = playerImage

      let voteImage = GetFirstChildWithNameAndClassName( voteImageParent, 'VoteImage', 'ImageLabel' ) as ImageLabel

      for ( let i = 0; i < playerCount; i++ )
      {
         let voteImageClone = voteImage.Clone()
         voteImageClone.Parent = voteImage.Parent
         this.voteImages.push( voteImageClone )

         voteImageClone.Position = new UDim2( voteImage.Position.X.Scale, voteImage.AbsoluteSize.X * ( i * 1.25 ), voteImage.Position.Y.Scale, 0 )
         voteImage.Visible = false
      }
      voteImage.Destroy()

      this.button.MouseButton1Up.Connect(
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
      } )
}

class ActiveMeeting
{
   meetingUI: ScreenGui
   playerButtonTemplate: TextButton
   skipButtonGroup: ButtonGroup
   playerButtonGroups: Array<PlayerButtonGroup>
   meetingMessage: TextLabel
   game: Game
   render: RBXScriptConnection

   constructor( game: Game, meetingUITemplate: ScreenGui )
   {
      let players = game.GetAllPlayers()
      Assert( players.size() > 0, "Can't start a meeting with zero players" )
      print( "StartMeeting" )
      this.game = game

      let meetingUI = meetingUITemplate.Clone()
      this.meetingUI = meetingUI
      meetingUI.Name = meetingUITemplate.Name + " Clone"
      meetingUI.Parent = meetingUITemplate.Parent
      meetingUI.Enabled = true

      let frame = GetFirstChildWithNameAndClassName( meetingUI, 'Frame', 'Frame' ) as Frame
      let playerBackground = GetFirstChildWithNameAndClassName( frame, 'PlayerBackground', 'Frame' ) as Frame
      let playerButtonTemplate = GetFirstChildWithNameAndClassName( playerBackground, 'PlayerButton', 'TextButton' ) as TextButton
      this.playerButtonTemplate = playerButtonTemplate
      playerButtonTemplate.Visible = false

      let allButtonGroups: Array<ButtonGroup> = []

      function HideAllChecksAndDisplayThisOne( buttonGroup: ButtonGroup )
      {
         if ( game.GetGameState() !== GAME_STATE.GAME_STATE_MEETING_VOTE )
         {
            print( "wrong gamestate: " + game.GetGameState() )
            return
         }

         if ( game.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR )
         {
            print( "Wrong role: " + game.GetPlayerRole( player ) )
            return
         }

         for ( let vote of game.GetVotes() )
         {
            if ( vote.voter === player )
            {
               print( "Already voted!" )
               return // already voted
            }
         }

         print( "Passed returns" )

         for ( let buttonGroup of allButtonGroups )
         {
            buttonGroup.HideChecks()
         }

         switch ( game.GetPlayerRole( player ) )
         {
            case ROLE.ROLE_POSSESSED:
            case ROLE.ROLE_CAMPER:
               buttonGroup.ShowChecks()
               print( "Show checks!" )
               break
         }
      }

      let skipVote = GetFirstChildWithNameAndClassName( frame, 'Skip', 'TextButton' ) as TextButton
      let skipButtonGroup = new ButtonGroup( skipVote, players.size(),
         HideAllChecksAndDisplayThisOne,

         function ()
         {
            SendRPC( "RPC_FromClient_Skipvote" )
         },
      )
      allButtonGroups.push( skipButtonGroup )

      this.skipButtonGroup = skipButtonGroup
      this.HideButtonGroup( skipButtonGroup )

      this.meetingMessage = GetFirstChildWithName( frame, 'MeetingMessage' ) as TextLabel

      this.playerButtonGroups = []

      let activeMeeting = this

      let player = GetLocalPlayer()

      for ( let i = 0; i < players.size(); i++ )
      {
         let player = players[i]
         let playerButtonGroup = new PlayerButtonGroup( game, player, playerButtonTemplate, players.size(),
            function ( buttonGroup: ButtonGroup )
            {
               if ( game.GetPlayerRole( playerButtonGroup.player ) === ROLE.ROLE_SPECTATOR )
                  return

               HideAllChecksAndDisplayThisOne( buttonGroup )
            },

            function ()
            {
               SendRPC( "RPC_FromClient_Vote", player.UserId )
            },
         )
         allButtonGroups.push( playerButtonGroup.buttonGroup )

         this.playerButtonGroups.push( playerButtonGroup )
         playerButtonGroup.frameButton.Visible = true
      }

      print( "\nMEETING DRAW" )
      //      this.playerButtonGroups.sort( SortByPlayerNum )
      //      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      //      {
      //         let playerButtonGroup = this.playerButtonGroups[i]
      //         print( "i: " + i + " playerNum: " + PlayerNumToGameViewable( playerButtonGroup.playerNum ) )
      //      }

      print( "\nLIVING SORT" )
      this.playerButtonGroups.sort( SortByLiving )
      for ( let i = 0; i < this.playerButtonGroups.size(); i++ )
      {
         let playerButtonGroup = this.playerButtonGroups[i]
         print( "i: " + i + " playerNum: " + PlayerNumToGameViewable( playerButtonGroup.playerNum ) )
      }

      let last = MAX_PLAYERS - 1
      let first = 0

      print( "\nResult:" )
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
         print( "i: " + i + " alive:" + playerButtonGroup.alive + " index:" + index + " playerNum:" + PlayerNumToGameViewable( playerButtonGroup.playerNum ) + " row:" + row + " odd:" + odd )

         let y = this.playerButtonTemplate.Position.Y.Scale + row * 0.185
         let x = this.playerButtonTemplate.Position.X.Scale

         if ( odd )
            x = 1.0 - x

         playerButtonGroup.frameButton.Position = new UDim2( x, 0, y, 0 )
      }

      this.render = RunService.RenderStepped.Connect( function ()
      {
         let timeRemainingMsg = " (" + math.floor( game.GetTimeRemainingForState() ) + ")"
         if ( game.GetPlayerRole( player ) === ROLE.ROLE_SPECTATOR )
         {
            switch ( game.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_MEETING_VOTE:
                  activeMeeting.meetingMessage.Text = "Waiting for votes.." + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
                  activeMeeting.meetingMessage.Text = "Prepare for voting.. " + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_RESULTS:
                  activeMeeting.meetingMessage.Text = "The results are in!"
                  break
            }
         }
         else
         {
            switch ( game.GetGameState() )
            {
               case GAME_STATE.GAME_STATE_MEETING_VOTE:
                  if ( game.DidVote( player ) )
                     activeMeeting.meetingMessage.Text = "Make your vote!" + timeRemainingMsg
                  else
                     activeMeeting.meetingMessage.Text = "Waiting for votes.." + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
                  activeMeeting.meetingMessage.Text = "Prepare to vote.. " + timeRemainingMsg
                  break

               case GAME_STATE.GAME_STATE_MEETING_RESULTS:
                  activeMeeting.meetingMessage.Text = "The results are in!"
                  break
            }
         }
      } )
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

   private AddVote( buttonGroup: ButtonGroup, voter: Player )
   {
      for ( let voteImage of buttonGroup.voteImages )
      {
         if ( voteImage.Visible )
            continue
         voteImage.Visible = true
         voteImage.ImageColor3 = GetColor( voter )
         return
      }
   }

   public RedrawMeeting( game: Game )
   {
      print( "RedrawMeeting" )
      print( "Visible: " + this.meetingUI.Enabled )

      let playerToButtonGroup = new Map<Player, PlayerButtonGroup>()

      let localPlayer = GetLocalPlayer()

      let didVote = false
      for ( let vote of game.GetVotes() )
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
         this.skipButtonGroup.button.Visible = false
         for ( let playerButtonGroup of this.playerButtonGroups )
         {
            playerButtonGroup.buttonGroup.HideChecks()
         }
      }
      else
      {
         if ( game.GetPlayerRole( localPlayer ) !== ROLE.ROLE_SPECTATOR )
         {
            if ( game.GetGameState() === GAME_STATE.GAME_STATE_MEETING_VOTE )
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

      for ( let vote of game.GetVotes() )
      {
         let voter = vote.voter as Player
         Assert( voter !== undefined, "No voter!" )

         if ( vote.target === undefined )
         {
            // skipped
            this.AddVote( this.skipButtonGroup, voter )
         }
         else
         {
            let playerButtonGroup = playerToButtonGroup.get( vote.target ) as PlayerButtonGroup
            this.AddVote( playerButtonGroup.buttonGroup, voter )
         }
      }

      print( "Finished refreshing meeting" )
   }
}

export function UpdateMeeting( game: Game )
{
   //print( "UpdateMeeting" )
   let meetingUITemplate = file.meetingUI
   if ( meetingUITemplate === undefined )
      return

   let meetingCaller = game.meetingCaller
   if ( meetingCaller === undefined )
      return

   let activeMeeting = file.activeMeeting

   switch ( game.GetGameState() )
   {
      case GAME_STATE.GAME_STATE_MEETING_VOTE:
      case GAME_STATE.GAME_STATE_MEETING_DISCUSS:
      case GAME_STATE.GAME_STATE_MEETING_RESULTS:
         if ( activeMeeting === undefined )
         {
            activeMeeting = new ActiveMeeting( game, meetingUITemplate )
            file.activeMeeting = activeMeeting
         }

         activeMeeting.RedrawMeeting( game )
         break

      default:
         if ( activeMeeting !== undefined )
         {
            activeMeeting.render.Disconnect()
            activeMeeting.meetingUI.Destroy()
            file.activeMeeting = undefined
         }
         return
   }
}

function SortByLiving( a: PlayerButtonGroup, b: PlayerButtonGroup ): boolean
{
   if ( a.alive !== b.alive )
      return a.alive

   return a.playerNum < b.playerNum
}