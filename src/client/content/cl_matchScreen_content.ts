import { RunService, Workspace } from "@rbxts/services";
import { WaitForMatchScreenFrame } from "client/cl_matchScreen";
import { AddPlayerGuiFolderExistsCallback, UIORDER } from "client/cl_ui";
import { IsImpostorRole, MEETING_TYPE, PlayerInfo, ROLE, USERID } from "shared/sh_gamestate";
import { ClonePlayerModel, ClonePlayerModels, GetPlayerFromUserID } from "shared/sh_onPlayerConnect";
import { Tween, TweenCharacterParts, TweenModel } from "shared/sh_tween";
import { GetLocalPlayer, Graph, LoadSound, RandomFloatRange, SetCharacterTransparency, SetCharacterYaw, Thread } from "shared/sh_utils";
import { Assert } from "shared/sh_assert"
import { GetCoinModelsForScore } from "shared/sh_coins";
import { GetGameModeConsts } from "shared/sh_gameModeConsts";
import { SPECTATOR_TRANS } from "shared/sh_settings";

const LOCAL = RunService.IsStudio()
const LOCAL_PLAYER = GetLocalPlayer()

class File
{
   meetingSound = LoadSound( 1846987125 ) //2899745945 ) //4544797741 )//
}
let file = new File()

export function CL_MatchScreenContentSetup()
{
   /*
AddNetVarChangedCallback( NETVAR_MATCHMAKING_STATUS, function ()
{
   let status = GetNetVar_Number( player, NETVAR_MATCHMAKING_STATUS )
   if ( status === MATCHMAKING_STATUS.MATCHMAKING_SEND_TO_RESERVEDSERVER )
      Thread( DrawLevelTransition )      
} )
   */

   if ( LOCAL && false )
   {
      AddPlayerGuiFolderExistsCallback( function ()
      {
         Thread(
            function ()
            {
               for ( ; ; )
               {
                  wait( 1 )
                  TestDraw( 0 )
               }
            } )
      } )
   }

   function TestDraw( num: number )
   {
      switch ( num )
      {
         case 0:
            {
               let players: Array<Player> = []
               for ( let i = 0; i < 10; i++ )
               {
                  players.push( LOCAL_PLAYER )
               }
               let lineup = ClonePlayerModels( players )
               DrawMatchScreen_Intro( true, 1, lineup )
            }
            break

         case 1:
            DrawMatchScreen_EmergencyMeeting( MEETING_TYPE.MEETING_EMERGENCY, LOCAL_PLAYER.UserId, undefined )
            break

         case 2:
            {
               print( "drawing 3 skippers" )
               let skipTie = true
               let receivedHighestVotes: Array<Player> = []
               let receivedVotes: Array<Player> = []
               let votedAndReceivedNoVotes = [LOCAL_PLAYER, LOCAL_PLAYER, LOCAL_PLAYER]
               let impostorCount = 1
               //DrawMatchScreen_VoteResults(
               //skipTie,
               //   receivedHighestVotes,
               //   receivedVotes,
               //   votedAndReceivedNoVotes,
               //   impostorCount,
               //   500
               //)
            }
            break

         case 3:
            {
               let receivedVotes = [LOCAL_PLAYER, LOCAL_PLAYER, LOCAL_PLAYER, LOCAL_PLAYER, LOCAL_PLAYER]
               let votedAndReceivedNoVotes: Array<Player> = [LOCAL_PLAYER, LOCAL_PLAYER]
               let impostorCount = 2
               let skipTie = false
               let receivedHighestVotes = [LOCAL_PLAYER]
               //DrawMatchScreen_VoteResults( skipTie, receivedHighestVotes, receivedVotes, votedAndReceivedNoVotes, impostorCount,
               //500 )
            }

            break

         case 4:
         //{
         //   let playerInfos: Array<PlayerInfo> = []
         //   for ( let i = 0; i < 4; i++ )
         //   {
         //      let playerInfo = new PlayerInfo( LOCAL_PLAYER )
         //      playerInfos.push( playerInfo )
         //      if ( i > 2 )
         //         playerInfo.role = ROLE.ROLE_SPECTATOR_CAMPER
         //      else
         //         playerInfo.role = ROLE.ROLE_CAMPER
         //   }
         //   DrawMatchScreen_Victory( playerInfos, false, true, true, 350 )
         //}

         case 5:
         //{
         //   let playerInfo = 
         //   DrawMatchScreen_Escaped( new PlayerInfo( LOCAL_PLAYER, ROLE.ROLE_CAMPER ), 302 )
         //}

         case 6:
            {
               //DrawMatchScreen_Winners( [player, player], ROLE.ROLE_CAMPER, 1, 500 )
            }
      }
   }

}

export function DrawMatchScreen_Intro( foundLocalImpostor: boolean, impostorCount: number, lineup: Array<Model> )
{
   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_INTRO" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   title.Text = "Shhh..."
   if ( foundLocalImpostor )
   {
      if ( impostorCount === 1 )
         subTitle.Text = "You are the impostor!"
      else
         subTitle.Text = "You are an impostor!"
   }
   else
   {
      subTitle.Text = "You are innocent"
   }

   let gmc = GetGameModeConsts()

   let impostorText: string
   if ( gmc.revealOtherImpostors )
   {
      if ( impostorCount === 0 )
         impostorText = "There are no impostors"
      else if ( impostorCount === 1 )
         impostorText = "There is 1 impostor"
      else
         impostorText = "There are " + impostorCount + " impostors"
   }
   else
   {
      if ( foundLocalImpostor )
         impostorText = "Battle to be the Last Impostor Standing"
      else
         impostorText = "Avoid Impostors"
   }

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   const FADE_IN = 2

   let debugIt = false
   if ( debugIt )
   {
      title.TextTransparency = 0
      subTitle.TextTransparency = 0
      wait( 1 )
   }
   else
   {
      wait( 0.8 )
      Tween( title, { TextTransparency: 0 }, FADE_IN )
      wait( 1.5 )
      Thread(
         function ()
         {
            wait( 0.5 )
            Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
            wait( 0.4 )

            wait( 2.0 )
            //if ( !foundLocalImpostor )
            {
               Tween( subTitle, { TextTransparency: 1 }, 0.5 )
               wait( 0.5 )
               subTitle.Text = impostorText
               Tween( subTitle, { TextTransparency: 0 }, 0.5 )
            }
         } )
      wait( 0.3 )
   }

   // For rapid iteration
   //RunService.RenderStepped.Connect(
   //   SetCamera
   //)



   {
      ArrangeModelsInLineup( lineup, viewportFrame )
      let lineupCamera = new AnimateLineup( viewportFrame, viewportCamera )

      if ( foundLocalImpostor )
      {
         if ( gmc.revealOtherImpostors )
         {
            Thread(
               function ()
               {
                  wait( 1.6 )
                  let goal = { Transparency: 1 }
                  let camperModels = lineup.slice( impostorCount )
                  for ( let model of camperModels )
                  {
                     TweenCharacterParts( model, goal, 1.0 )
                  }
                  Tween( baseFrame, { BackgroundColor3: new Color3( 0.25, 0, 0 ) }, 2 )
               } )
         }
      }

      wait( FADE_IN + 2 )
      wait( 1.1 )

      lineupCamera.DollyThrough()
   }

   if ( debugIt )
      wait( 2343 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 1.5 )
   Thread(
      function ()
      {
         wait( 1 )
         Tween( baseFrame, { Transparency: 1 }, 1.0 )
      } )

   wait( 1.0 )
}

function SortLocalPlayerInfo( a: PlayerInfo, b: PlayerInfo ): boolean
{
   return a._userid === LOCAL_PLAYER.UserId && b._userid !== LOCAL_PLAYER.UserId
}

export function DrawMatchScreen_VoteResults( skipTie: boolean, receivedHighestVotes: Array<Player>, receivedVotes: Array<Player>, votedAndReceivedNoVotes: Array<Player>, highestVotedScore: number, wasImpostor: boolean, impostorsRemaining: number )
{
   print( "DrawMatchScreen_VoteResults, highestVotedScore: " + highestVotedScore )
   function GetResultsText(): Array<string>
   {
      if ( skipTie )
      {
         if ( receivedHighestVotes.size() > 0 )
            return ["It's a tie!", "No one was voted off"]
         return ["No one was voted off"]
      }

      if ( receivedHighestVotes.size() === 1 )
         return [receivedHighestVotes[0].Name + " was voted out!"]

      return ["No one was voted off"]
   }

   const RESULTS_TEXT = GetResultsText()

   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_VOTERESULTS" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame

   viewportFrame.Parent = baseFrame
   viewportFrame.Size = new UDim2( 0.9, 0, viewportFrame.Size.Y.Scale, 0 )

   title.Text = "The voters have spoken.."
   title.TextTransparency = 1

   wait( 1.0 )

   Thread(
      function ()
      {
         wait( 1.2 )
         Tween( title, { TextTransparency: 0 }, 1 )
      } )

   let votedOffModel: Model | undefined

   if ( votedAndReceivedNoVotes.size() > 0 || receivedVotes.size() > 0 )
   {
      let voterClones: Array<Model> = []
      {
         let count = 0
         let odd = true
         const dist = 2.5


         // draw these players with their backs turned
         for ( let i = 0; i < votedAndReceivedNoVotes.size(); i++ )
         {
            let player = votedAndReceivedNoVotes[i]
            let offsetCount = count
            let depthOffset = 0
            switch ( count )
            {
               case 0:
                  depthOffset = 0
                  break
               case 1:
                  depthOffset = 1.2
                  break
               case 2:
                  depthOffset = 3
                  break
               case 3:
                  depthOffset = 6
                  break
               default:
                  depthOffset = 10
                  break
            }
            let yaw = -24.5 * offsetCount
            let offset = new Vector3( dist, 0, 0 ).mul( offsetCount * 1.25 )
            let oddMultiplier = 1
            if ( odd )
            {
               oddMultiplier = -1
               count++
            }
            odd = !odd

            offset = offset.mul( oddMultiplier )
            offset = offset.add( new Vector3( 0, 0, depthOffset ) ) // depth
            //offset = offset.add( new Vector3( dist * -0.5, 0, 0.0 ) ) // left
            yaw *= oddMultiplier

            let clonedModel = ClonePlayerModel( player )
            if ( clonedModel !== undefined )
            {
               voterClones.push( clonedModel )
               clonedModel.Parent = viewportFrame
               SetCharacterTransparency( clonedModel, 0 )

               clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )
               SetCharacterYaw( clonedModel, 180 + yaw )
            }
         }
      }


      {
         let count = 0
         let odd = true
         const dist = 3.0

         const ADD_DEPTH = Graph( receivedVotes.size(), 3, 10, 12, 19.5 )

         let getVotedOffModel = receivedHighestVotes.size() === 1

         for ( let i = 0; i < receivedVotes.size(); i++ )
         {
            let player = receivedVotes[i]
            let offsetCount = count
            let yaw = -15 * offsetCount
            let offset = new Vector3( dist, 0, 0 ).mul( offsetCount )
            let multiplier = 1
            if ( odd )
            {
               multiplier = -1
               count++
            }
            odd = !odd

            offset = offset.mul( multiplier )
            offset = offset.add( new Vector3( 0, 0, ADD_DEPTH + offsetCount * 0.5 ) ) // depth
            yaw *= multiplier

            let clonedModel = ClonePlayerModel( player )
            if ( clonedModel !== undefined )
            {
               clonedModel.Parent = viewportFrame
               SetCharacterTransparency( clonedModel, 0 )

               if ( getVotedOffModel && player === receivedHighestVotes[0] )
                  votedOffModel = clonedModel

               clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )
               SetCharacterYaw( clonedModel, 0 )
            }
         }
      }

      let viewportCamera = new Instance( "Camera" ) as Camera
      viewportCamera.FieldOfView = 35

      let vecVal = new Vector3( 0, 4, -6 )
      let vecOffVal = new Vector3( 0, 7.5, -6.5 )

      if ( votedAndReceivedNoVotes.size() === 0 )
         vecOffVal = new Vector3( 0, 12, -5 )

      viewportFrame.CurrentCamera = viewportCamera
      viewportCamera.Parent = viewportFrame
      viewportFrame.ImageTransparency = 1

      // CAMERA START POSITION
      {
         let cameraPosition = vecOffVal
         let vecEnd = cameraPosition
         let vecStart = vecVal.add( cameraPosition )
         let delta = vecStart.sub( vecEnd ).mul( 10 )

         vecStart = vecStart.add( delta )
         vecEnd = vecEnd.add( delta )
         viewportCamera.CFrame = new CFrame( vecStart, vecEnd )
      }

      {
         // CAMERA DOLLIES IN
         {
            let cameraPosition = vecOffVal
            let vecEnd = cameraPosition
            let vecStart = vecVal.add( cameraPosition )
            Tween( viewportCamera, { CFrame: new CFrame( vecStart, vecEnd ) }, 1.5, Enum.EasingStyle.Quart, Enum.EasingDirection.Out )
         }
      }


      /*
      // FOR ITERATION
      viewportFrame.ImageTransparency = 0
      let edVec1 = new Instance( 'Vector3Value' ) as Vector3Value
      edVec1.Parent = viewportCamera
      edVec1.Value = vecOffVal
      let edVec2 = new Instance( 'Vector3Value' ) as Vector3Value
      edVec2.Parent = viewportCamera
      edVec2.Value = vecVal
      viewportFrame.ImageTransparency = 0
      RunService.RenderStepped.Connect(
         function ()
         {
            let cameraPosition = edVec1.Value
            let vecEnd = cameraPosition
            let vecStart = edVec2.Value.add( cameraPosition )
            viewportCamera.CFrame = new CFrame( vecStart, vecEnd )
         }
      )
 
      wait( 5555 )
      */

      const DO_PAN = receivedVotes.size() > 0


      let secondCamTime = Workspace.DistributedGameTime
      if ( DO_PAN )
         secondCamTime += 3.0
      else
         secondCamTime += 1.0

      {
         Thread(
            function ()
            {
               wait( 0.5 )
               Tween( viewportFrame, { ImageTransparency: 0 }, 1.2 )

               wait( secondCamTime - Workspace.DistributedGameTime )

               if ( DO_PAN )
               {
                  let cameraAngle = new Vector3( 0, 1, -4.5 )
                  let cameraPosition = new Vector3( 0, 1, 6.5 )
                  let vecEnd = cameraPosition
                  let vecStart = cameraAngle.add( cameraPosition )
                  Tween( viewportCamera, { CFrame: new CFrame( vecStart, vecEnd ) }, 1.5, Enum.EasingStyle.Quart, Enum.EasingDirection.InOut )
               }
            } )
      }


      //      wait( 3523 )


      wait( secondCamTime - Workspace.DistributedGameTime )

      if ( DO_PAN )
      {
         let voteOffset = new Vector3( 0, -12, 0 )
         for ( let clone of voterClones )
         {
            let cFrame = ( clone.PrimaryPart as Part ).CFrame
            cFrame = cFrame.add( voteOffset )
            TweenModel( clone, cFrame, 1.0, Enum.EasingStyle.Quart, Enum.EasingDirection.In )
         }
      }
   }
   else
   {
      wait( 2 ) // no one voted      
   }
   //subTitle.TextTransparency = 0
   //subTitle.Text = ""
   //Thread(
   //   function ()
   //   {
   //      wait( 1.5 )
   //      subTitle.Text = "."
   //      wait( 0.6 )
   //      subTitle.Text = ".."
   //      wait( 0.6 )
   //      subTitle.Text = "..."
   //   } )

   wait( 1.0 )

   Tween( subTitle, { TextTransparency: 1 }, 0.5 )
   wait( 0.5 )
   subTitle.Text = RESULTS_TEXT[0]
   Tween( subTitle, { TextTransparency: 0 }, 0.5 )
   wait( 1.0 )

   let done = false
   let tween: Tween | undefined

   if ( RESULTS_TEXT.size() > 1 )
   {
      wait( 1.0 )
      Thread( function ()
      {
         lowerTitle.TextTransparency = 1
         lowerTitle.Text = RESULTS_TEXT[1]
         Tween( lowerTitle, { TextTransparency: 0 }, 0.5 )
      } )
   }
   else
   {
      if ( votedOffModel !== undefined )      
      {
         Thread(
            function ()
            {
               if ( votedOffModel === undefined )
                  return

               Thread( function ()
               {
                  CoinExplosion( highestVotedScore, viewportFrame, votedOffModel as Model )
               } )

               const TOTAL_TIME = 5
               const count = 70
               const time = TOTAL_TIME / count

               for ( let i = 0; ; i++ )
               {
                  if ( done )
                     return
                  let cFrame = ( votedOffModel.PrimaryPart as Part ).CFrame
                  let goal = new CFrame( cFrame.Position.add( new Vector3( 0, 0, 10 ) ) )
                  goal = goal.mul( CFrame.Angles( 0, 0, i * 90 ) ) // rotate spin away orientation
                  tween = TweenModel( votedOffModel, goal, time )
                  wait( time )
               }
            }
         )

         wait( 1.0 )
      }
   }

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )

   if ( RESULTS_TEXT.size() > 1 ) // tie
      wait( 1.0 )

   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )

   if ( !skipTie && receivedHighestVotes.size() === 1 )
   {
      wait( 1.0 )

      let name = receivedHighestVotes[0].Name
      if ( wasImpostor )
         title.Text = name + " was an impostor"
      else
         title.Text = name + " was innocent"

      if ( impostorsRemaining === 0 )
         subTitle.Text = "0 impostors remain"
      else
         subTitle.Text = "At least 1 impostor remains"
      /*
      if ( impostorsRemaining === 0 )
         subTitle.Text = "0 impostors remain"
      else if ( impostorsRemaining === 1 )
         subTitle.Text = "1 impostor remains"
      else
         subTitle.Text = impostorsRemaining + " impostors remain"
      */

      Tween( title, { TextTransparency: 0 }, 1.0 )
      wait( 1.5 )
      Tween( subTitle, { TextTransparency: 0 }, 1.0 )
      wait( 2 )

      Tween( title, { TextTransparency: 1 }, 1.0 )
      Tween( subTitle, { TextTransparency: 1 }, 1.0 )
      wait( 1 )
   }

   Tween( viewportFrame, { ImageTransparency: 1 }, 1.5 )
   wait( 1.5 )

   Thread(
      function ()
      {
         wait( 1 )
         Tween( baseFrame, { Transparency: 1 }, 1.0 )
      } )

   done = true
   if ( tween !== undefined )
   {
      tween.Cancel()
   }
}

export function DrawMatchScreen_EmergencyMeeting( meetingType: MEETING_TYPE, callerId: USERID, bodyId: USERID | undefined )
{
   file.meetingSound.Play()

   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_EMERGENCYMEETING" )
   let baseFrame = matchScreenFrame.baseFrame
   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   Tween( baseFrame, { Transparency: 0 }, 0.5 )
   wait( 0.5 )

   title.TextTransparency = 1
   title.Text = "Emergency Meeting!"

   subTitle.TextTransparency = 1
   let caller = GetPlayerFromUserID( callerId )

   switch ( meetingType )
   {
      case MEETING_TYPE.MEETING_EMERGENCY:
         subTitle.Text = caller.Name + " called an emergency meeting!"
         break

      case MEETING_TYPE.MEETING_REPORT:
         if ( bodyId !== undefined )
         {
            let body = GetPlayerFromUserID( bodyId )
            subTitle.Text = caller.Name + " found the corpse of " + body.Name
         }
         break
   }

   Tween( title, { TextTransparency: 0 }, 0.5 )
   wait( 1 )
   Tween( subTitle, { TextTransparency: 0 }, 0.5 )
   wait( 1.5 )
   Tween( title, { TextTransparency: 1 }, 1.0 )
   Tween( subTitle, { TextTransparency: 1 }, 1.0 )
   wait( 1 )
   Tween( baseFrame, { Transparency: 1 }, 1.0 )
}

export function DrawMatchRound( roundNum: number, value: number, opIntroTitle?: string )
{
   print( "DrawMatchRound: " + roundNum )

   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_ROUNDNUM" )
   wait( 3 );

   ( matchScreenFrame.baseFrame.Parent as ScreenGui ).DisplayOrder = UIORDER.UIORDER_READY
   //let baseFrame = matchScreenFrame.baseFrame
   //Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle

   title.TextTransparency = 1
   subTitle.TextTransparency = 1

   if ( opIntroTitle !== undefined )
   {
      title.Text = opIntroTitle
      Tween( title, { TextTransparency: 0, TextStrokeTransparency: 0 }, 1.0 )
      wait( 2 )
      Tween( title, { TextTransparency: 1, TextStrokeTransparency: 1 }, 1.0 )
      wait( 1 )
   }

   title.Text = "Round " + roundNum
   subTitle.Text = "Tasks are worth " + value + " coins"
   Tween( title, { TextTransparency: 0, TextStrokeTransparency: 0 }, 1.0 )
   wait( 2 )
   Tween( subTitle, { TextTransparency: 0, TextStrokeTransparency: 0 }, 1.0 )
   wait( 2.0 )
   //Tween( baseFrame, { Transparency: 1 }, 1 )
   wait( 1 )

   Tween( title, { TextTransparency: 1, TextStrokeTransparency: 1 }, 1 )
   Tween( subTitle, { TextTransparency: 1, TextStrokeTransparency: 1 }, 1 )
}

export function DrawMatchScreen_Victory( playerInfos: Array<PlayerInfo>, impostorsWin: boolean, myWinningTeam: boolean, mySurvived: boolean, myWinnings: number, localWasInGame: boolean )
{
   print( "DrawMatchScreen_Victory playerInfos:" + playerInfos.size() + " impostorsWin:" + impostorsWin + " myWinningTeam:" + myWinningTeam + " mySurvived:" + mySurvived + " myWinnings:" + myWinnings )

   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_VICTORY" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   if ( mySurvived )
      title.Text = "Victory"
   else
      title.Text = "Defeat"

   if ( localWasInGame )
   {
      if ( mySurvived )
         subTitle.Text = "You survived"
      else
         subTitle.Text = "You did not survive"
   }
   else
   {
      subTitle.Text = ""
   }

   lowerTitle.Text = myWinnings + " Coins added to your stash"


   const FADE_IN = 2

   wait( 0.8 )
   Tween( title, { TextTransparency: 0 }, FADE_IN )

   if ( impostorsWin )
      Tween( baseFrame, { BackgroundColor3: new Color3( 0.25, 0, 0 ) }, 2 )

   playerInfos.sort( SortLocalPlayerInfo )

   let lineupTeam
   let lineupPlayerInfos

   {
      let campers: Array<Player> = []
      let impostors: Array<Player> = []
      let camperPlayerInfos: Array<PlayerInfo> = []
      let impostorPlayerInfos: Array<PlayerInfo> = []

      for ( let i = 0; i < playerInfos.size(); i++ )
      {
         let playerInfo = playerInfos[i]
         let player = GetPlayerFromUserID( playerInfo._userid )

         if ( IsImpostorRole( playerInfo.role ) )
         {
            impostors.push( player )
            impostorPlayerInfos.push( playerInfo )
         }
         else
         {
            campers.push( player )
            camperPlayerInfos.push( playerInfo )
         }
      }

      if ( impostorsWin )
      {
         lineupTeam = impostors
         lineupPlayerInfos = impostorPlayerInfos
      }
      else
      {
         lineupTeam = campers
         lineupPlayerInfos = camperPlayerInfos
      }
   }

   let trans = new Map<Model, boolean>()
   let lineup: Array<Model> = []
   for ( let i = 0; i < lineupPlayerInfos.size(); i++ )
   {
      let model = ClonePlayerModel( lineupTeam[i] )
      if ( model !== undefined )
      {
         lineup.push( model )

         let playerInfo = lineupPlayerInfos[i]
         switch ( playerInfo.role )
         {
            case ROLE.ROLE_SPECTATOR_CAMPER:
            case ROLE.ROLE_SPECTATOR_IMPOSTOR:
               trans.set( model, true )
               break
         }
      }
      // escaper did not see any players in an impostor wins sudden death
   }

   ArrangeModelsInLineup( lineup, viewportFrame )
   for ( let pair of trans )
   {
      SetCharacterTransparency( pair[0], SPECTATOR_TRANS )
   }

   let animLineup = new AnimateLineup( viewportFrame, viewportCamera )
   wait( animLineup.GetArriveTime() )

   Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
   wait( 0.4 )

   if ( myWinnings > 0 )
   {
      wait( 1 )
      Tween( lowerTitle, { TextTransparency: 0 }, FADE_IN )
   }

   wait( 3 )
   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 0.75 )
   wait( 0.75 )

   Tween( baseFrame, { Transparency: 1 }, 1.0 )
}

export function DrawMatchScreen_Escaped( playerInfo: PlayerInfo, myWinnings: number )
{
   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_ESCAPED" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   title.Text = "Congratulations"
   subTitle.Text = "You escaped"
   lowerTitle.Text = myWinnings + " Coins added to your stash"

   const FADE_IN = 2

   wait( 0.8 )
   Tween( title, { TextTransparency: 0 }, FADE_IN )

   let lineup = ClonePlayerModels( [GetPlayerFromUserID( playerInfo._userid )] )
   ArrangeModelsInLineup( lineup, viewportFrame )

   let animLineup = new AnimateLineup( viewportFrame, viewportCamera )
   wait( animLineup.GetArriveTime() * 0.4 )

   Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
   wait( 0.5 )
   Tween( lowerTitle, { TextTransparency: 0 }, FADE_IN )

   wait( 2.25 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 0.75 )
   wait( 0.75 )

   Tween( baseFrame, { Transparency: 1 }, 1.0 )

}

export function DrawMatchScreen_BecameImpostor()
{
   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_BECAMEIMPOSTOR" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   title.Text = "You become Impostor!"
   subTitle.Text = "Destroy other Impostors"

   const FADE_IN = 2

   wait( 0.8 )
   Tween( title, { TextTransparency: 0 }, FADE_IN )

   let lineup = ClonePlayerModels( [LOCAL_PLAYER] )
   ArrangeModelsInLineup( lineup, viewportFrame )

   let animLineup = new AnimateLineup( viewportFrame, viewportCamera )
   wait( animLineup.GetArriveTime() * 0.4 )

   wait( 0.5 )
   Tween( subTitle, { TextTransparency: 0 }, FADE_IN )

   wait( 2.00 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 0.75 )
   wait( 0.75 )

   Tween( baseFrame, { Transparency: 1 }, 1.0 )
}

export function DrawLevelTransition()
{
   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_LEVELTRANSITION" )
   let baseFrame = matchScreenFrame.baseFrame
   baseFrame.Transparency = 1
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   wait( 9999 )
}

const range = 70
const rot = 1500
function CoinExplosion( highestVotedScore: number, viewportFrame: ViewportFrame, votedOffModel: Model )
{
   let coins = GetCoinModelsForScore( highestVotedScore )

   let pos = ( votedOffModel.PrimaryPart as Part ).CFrame
   for ( let coin of coins )
   {
      coin.Transparency = 0
      coin.Position = pos.Position
      coin.Orientation = new Vector3( RandomFloatRange( 0, 360 ), RandomFloatRange( 0, 360 ), RandomFloatRange( 0, 360 ) )
      coin.RotVelocity = new Vector3( RandomFloatRange( -rot, rot ), RandomFloatRange( -rot, rot ), RandomFloatRange( -rot, rot ) )

      coin.Parent = viewportFrame
      Tween( coin,
         {
            Position: new Vector3( RandomFloatRange( -range, range ), RandomFloatRange( -range, range ), RandomFloatRange( -range, range ) ),
            Orientation: new Vector3( RandomFloatRange( -rot, rot ), RandomFloatRange( -rot, rot ), RandomFloatRange( -rot, rot ) )
         }
         , 5 )
   }
}

export function DrawMatchScreen_GameOver()
{
   let matchScreenFrame = WaitForMatchScreenFrame( "MATCHSCREEN_GAMEOVER" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   title.Text = "Game Over"
   Tween( title, { TextTransparency: 0 }, 2 )
   wait( 123123 )
}

function ArrangeModelsInLineup( cloneModels: Array<Model>, viewportFrame: ViewportFrame )
{
   let count = 0
   let odd = true
   const dist = 3.0

   // draw these players
   for ( let i = 0; i < cloneModels.size(); i++ )
   {
      let offsetCount = count
      let yaw = 10 * offsetCount
      let offset = new Vector3( dist, 0, 0 ).mul( offsetCount )
      let multiplier = 1
      if ( odd )
      {
         multiplier = -1
         count++
      }
      odd = !odd

      offset = offset.mul( multiplier )
      offset = offset.add( new Vector3( 0, 0, offsetCount * 1.5 ) ) // depth
      //offset = offset.add( new Vector3( dist * -0.5, 0, 0.0 ) ) // left
      yaw *= multiplier

      let clonedModel = cloneModels[i]
      clonedModel.Parent = viewportFrame
      clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )
      SetCharacterYaw( clonedModel, yaw )
      SetCharacterTransparency( clonedModel, 0 )
   }
}

class AnimateLineup
{
   viewportFrame: ViewportFrame
   viewportCamera: Camera
   numVal: Vector3Value
   vecEnd1: Vector3
   vecStart1: Vector3
   vecStart2: Vector3
   private CAMERA_TIME = 3.2

   constructor( viewportFrame: ViewportFrame, viewportCamera: Camera )
   {
      this.viewportFrame = viewportFrame
      this.viewportCamera = viewportCamera

      let numVal = new Instance( 'Vector3Value' ) as Vector3Value
      this.numVal = numVal
      numVal.Parent = viewportCamera
      numVal.Value = new Vector3( 0, 1, -6 )

      let vecEnd1 = new Vector3( 0, 0, 120 )
      this.vecEnd1 = vecEnd1
      let vecStart1 = numVal.Value.add( new Vector3( 0, 8, 0 ) ).mul( 1.3 )
      this.vecStart1 = vecStart1
      viewportCamera.CFrame = new CFrame( vecStart1, vecEnd1 )

      Tween( viewportFrame, { ImageTransparency: 0 }, this.CAMERA_TIME * 0.5 )

      let vecStart2 = numVal.Value
      this.vecStart2 = vecStart2
      Tween( viewportCamera, { CFrame: new CFrame( vecStart2, new Vector3( 0, 0, 0 ) ) }, this.CAMERA_TIME, Enum.EasingStyle.Exponential, Enum.EasingDirection.Out )
   }

   public GetArriveTime(): number
   {
      return this.CAMERA_TIME
   }

   public DollyThrough()
   {
      // zoom through
      let vecEnd2 = new Vector3( 0, 0, 0 )
      let delta = vecEnd2.sub( this.vecStart2 )
      delta = delta.add( new Vector3( 0, 2, 0 ) )
      delta = delta.mul( 2 )
      this.vecStart2 = this.vecStart2.add( delta )
      vecEnd2 = vecEnd2.add( delta )
      Tween( this.viewportCamera, { CFrame: new CFrame( this.vecStart2, vecEnd2 ) }, 2.0, Enum.EasingStyle.Quint, Enum.EasingDirection.In )
   }
}

