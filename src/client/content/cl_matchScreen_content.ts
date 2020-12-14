import { Workspace } from "@rbxts/services";
import { WaitForMatchScreenFrame } from "client/cl_matchScreen";
import { AddPlayerGuiFolderExistsCallback } from "client/cl_ui";
import { ROLE } from "shared/sh_gamestate";
import { ClonePlayerModel } from "shared/sh_onPlayerConnect";
import { Tween, TweenCharacterParts, TweenModel } from "shared/sh_tween";
import { Assert, GetLocalPlayer, Graph, SetCharacterTransparency, SetCharacterYaw, Thread } from "shared/sh_utils";

class File
{
   player: Player = GetLocalPlayer()
}
let file = new File()

export function CL_MatchScreenContentSetup()
{
   print( "CL_MatchScreenContentSetup" )

   let player = GetLocalPlayer()

   AddPlayerGuiFolderExistsCallback( function ()
   {
      //DrawMatchScreen_Intro( [player, player, player], [player, player], 2 )

      /*
      Thread(
         function ()
         {
            //for ( ; ; )
            {
               wait( 2 )
               TestDraw( 6 )
            }
         } )
         */
   } )


   function TestDraw( num: number )
   {
      switch ( num )
      {
         case 0:
            {
               let players: Array<Player> = []
               for ( let i = 0; i < 10; i++ )
               {
                  players.push( GetLocalPlayer() )
               }
               DrawMatchScreen_Intro( [], players, 2 )
            }
            break

         case 1:
            DrawMatchScreen_EmergencyMeeting()
            break

         case 2:
            {
               let receivedVotes = [player, player, player]
               let votedAndReceivedNoVotes = [player, player, player, player, player, player, player, player]
               let possessedCount = 2
               let skipTie = false
               let receivedHighestVotes = [player, player]
               DrawMatchScreen_VoteResults( skipTie, receivedHighestVotes, receivedVotes, votedAndReceivedNoVotes, possessedCount )
            }
            break

         case 3:
            {
               let receivedVotes = [player, player, player, player, player]
               let votedAndReceivedNoVotes: Array<Player> = [player, player]
               let possessedCount = 2
               let skipTie = false
               let receivedHighestVotes = [player]
               DrawMatchScreen_VoteResults( skipTie, receivedHighestVotes, receivedVotes, votedAndReceivedNoVotes, possessedCount )
            }

            break

         case 6:
            {
               DrawMatchScreen_Winners( [player, player], ROLE.ROLE_CAMPER, 1 )
            }
      }
   }

}

export function DrawMatchScreen_Intro( possessed: Array<Player>, campers: Array<Player>, possessedCount: number )
{
   let foundLocalPossessed = false
   if ( possessed.size() )
   {
      for ( let player of possessed )
      {
         if ( file.player === player )
         {
            foundLocalPossessed = true
            break
         }
      }
      Assert( foundLocalPossessed, "DrawMatchScreen_Intro had possessed players but local player is not possessed" )
   }

   let matchScreenFrame = WaitForMatchScreenFrame( "Intro" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   title.Text = "Shhh..."
   if ( foundLocalPossessed )
   {
      if ( possessedCount === 1 )
         subTitle.Text = "You are the imposter!"
      else
         subTitle.Text = "You are an imposter!"
   }
   else
   {
      subTitle.Text = "You are innocent"
   }

   if ( possessedCount === 1 )
      lowerTitle.Text = "There is 1 imposter"
   else
      lowerTitle.Text = "There are " + possessedCount + " imposters"

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   const FADE_IN = 2

   let debug = false
   if ( debug )
   {
      title.TextTransparency = 0
      subTitle.TextTransparency = 0
      lowerTitle.TextTransparency = 0
      wait( 1 )
   }
   else
   {
      wait( 0.8 )
      Tween( title, { TextTransparency: 0 }, FADE_IN )
      wait( 2.0 )
      Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
      wait( 0.4 )

      Thread(
         function ()
         {
            wait( 2 )
            if ( !foundLocalPossessed )
               Tween( lowerTitle, { TextTransparency: 0 }, FADE_IN )
         } )
   }

   let basePos = new Vector3( 0, 0, 0 )// GetPosition( file.player )
   let camPosVec = new Vector3( 0, 1, -6 )


   let numVal = new Instance( 'Vector3Value' ) as Vector3Value
   numVal.Parent = viewportCamera
   numVal.Value = camPosVec

   // For rapid iteration
   //RunService.RenderStepped.Connect(
   //   SetCamera
   //)
   let vecEnd1 = basePos.add( new Vector3( 0, 0, 120 ) )
   let vecStart1 = basePos.add( numVal.Value.add( new Vector3( 0, 8, 0 ) ).mul( 1.3 ) )
   viewportCamera.CFrame = new CFrame( vecStart1, vecEnd1 )


   let count = 0
   let odd = true
   const dist = 3.0
   let allPlayers = possessed.concat( campers )

   allPlayers.sort( SortLocalPlayer )

   let clonedCampers: Array<Model> = []
   for ( let i = 0; i < allPlayers.size(); i++ )
   {
      let player = allPlayers[i]
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
      offset = offset.add( new Vector3( 0, 0, offsetCount * 1.5 ) ) // depth
      //offset = offset.add( new Vector3( dist * -0.5, 0, 0.0 ) ) // left
      yaw *= multiplier

      let clonedModel = ClonePlayerModel( player ) as Model
      clonedModel.Parent = viewportFrame
      clonedModel.SetPrimaryPartCFrame( new CFrame( basePos.add( offset ) ) )

      if ( i >= possessed.size() )
         clonedCampers.push( clonedModel )

      SetCharacterYaw( clonedModel, yaw )
      SetCharacterTransparency( clonedModel, 0 )
   }

   const CAMERA_TIME = 3.2
   Tween( viewportFrame, { ImageTransparency: 0 }, CAMERA_TIME * 0.5 )

   //wait( 3 )
   let vecEnd2 = basePos
   let vecStart2 = basePos.add( numVal.Value )
   Tween( viewportCamera, { CFrame: new CFrame( vecStart2, vecEnd2 ) }, CAMERA_TIME, Enum.EasingStyle.Exponential, Enum.EasingDirection.Out )

   if ( foundLocalPossessed )
   {
      Thread(
         function ()
         {
            wait( 1.6 )
            let goal = { Transparency: 1 }
            for ( let model of clonedCampers )
            {
               TweenCharacterParts( model, goal, 1.0 )
            }
         } )
   }

   wait( FADE_IN )

   {
      if ( !debug )
         wait( 2 )
   }

   let delta = vecEnd2.sub( vecStart2 )
   delta = delta.add( new Vector3( 0, 2, 0 ) )
   delta = delta.mul( 2 )
   vecStart2 = vecStart2.add( delta )
   vecEnd2 = vecEnd2.add( delta )
   Tween( viewportCamera, { CFrame: new CFrame( vecStart2, vecEnd2 ) }, 2.0, Enum.EasingStyle.Quint, Enum.EasingDirection.In )

   if ( debug )
      wait( 2343 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 1.5 )
   wait( 0.75 )
   Tween( baseFrame, { Transparency: 1 }, 1.0 )
   wait( 1.0 )
}

function SortLocalPlayer( a: Player, b: Player ): boolean
{
   return a === file.player && b !== file.player
}

export function DrawMatchScreen_VoteResults( skipTie: boolean, receivedHighestVotes: Array<Player>, receivedVotes: Array<Player>, votedAndReceivedNoVotes: Array<Player>, possessedCount: number )
{
   //print( "\nDrawMatchScreen_VoteResults: " )
   //print( "skipTie:" + skipTie )
   //print( "receivedHighestVotes:" + receivedHighestVotes.size() )
   //print( "receivedVotes:" + receivedVotes.size() )
   //print( "votedAndReceivedNoVotes:" + votedAndReceivedNoVotes.size() )
   //print( "possessedCount:" + possessedCount )
   //print( " " )


   function GetResultsText(): Array<string>
   {
      if ( receivedVotes.size() === 0 || receivedHighestVotes.size() === 0 )
         return ["No one was voted off"]

      if ( skipTie || receivedHighestVotes.size() > 1 )
         return ["It's a tie!", "No one was voted off"]

      if ( receivedHighestVotes.size() === 1 )
         return [receivedHighestVotes[0].Name + " was voted out!"]

      throw undefined
   }

   const RESULTS_TEXT = GetResultsText()

   let matchScreenFrame = WaitForMatchScreenFrame( "VoteResults" )
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

         let even = votedAndReceivedNoVotes.size() % 2 === 0

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

            let clonedModel = ClonePlayerModel( player ) as Model
            voterClones.push( clonedModel )
            clonedModel.Parent = viewportFrame
            SetCharacterTransparency( clonedModel, 0 )

            clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )
            SetCharacterYaw( clonedModel, 180 + yaw )
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

            let clonedModel = ClonePlayerModel( player ) as Model
            clonedModel.Parent = viewportFrame
            SetCharacterTransparency( clonedModel, 0 )

            if ( getVotedOffModel && player === receivedHighestVotes[0] )
               votedOffModel = clonedModel

            clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )
            SetCharacterYaw( clonedModel, 0 )
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

      if ( receivedVotes.size() > 0 )
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


      let secondCamTime = Workspace.DistributedGameTime + 3.0

      Thread(
         function ()
         {
            wait( 0.5 )
            Tween( viewportFrame, { ImageTransparency: 0 }, 1.2 )

            wait( secondCamTime - Workspace.DistributedGameTime )

            {

               let cameraAngle = new Vector3( 0, 1, -4.5 )
               let cameraPosition = new Vector3( 0, 1, 6.5 )
               let vecEnd = cameraPosition
               let vecStart = cameraAngle.add( cameraPosition )
               Tween( viewportCamera, { CFrame: new CFrame( vecStart, vecEnd ) }, 1.5, Enum.EasingStyle.Quart, Enum.EasingDirection.InOut )
            }
         } )


      //      wait( 3523 )


      wait( secondCamTime - Workspace.DistributedGameTime )

      let voteOffset = new Vector3( 0, -12, 0 )
      for ( let clone of voterClones )
      {
         let cFrame = ( clone.PrimaryPart as Part ).CFrame
         cFrame = cFrame.add( voteOffset )
         TweenModel( clone, cFrame, 1.0, Enum.EasingStyle.Quart, Enum.EasingDirection.In )
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

   wait( 2.0 )

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
   else if ( votedOffModel !== undefined )
   {
      Thread(
         function ()
         {
            if ( votedOffModel === undefined )
               return

            const TOTAL_TIME = 5
            const count = 70
            const time = TOTAL_TIME / count

            for ( let i = 0; ; i++ )
            {
               if ( done )
                  return
               let cFrame = ( votedOffModel.PrimaryPart as Part ).CFrame
               let goal = new CFrame( cFrame.Position.add( new Vector3( 0, 0, 10 ) ) )
               goal = goal.mul( CFrame.Angles( 0, 0, i * 90 ) )
               tween = TweenModel( votedOffModel, goal, time )
               wait( time )
            }
         }
      )

      wait( 1.0 )
   }


   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )

   if ( RESULTS_TEXT.size() > 1 ) // tie
      wait( 1.0 )

   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 1.5 )
   wait( 1.5 )

   Tween( baseFrame, { Transparency: 1 }, 1.0 )

   done = true
   if ( tween !== undefined )
   {
      tween.Cancel()
   }
}

export function DrawMatchScreen_EmergencyMeeting()
{
   let matchScreenFrame = WaitForMatchScreenFrame( "EmergencyMeeting" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 0.5 )
   wait( 0.5 )

   let centerprint = matchScreenFrame.centerprint
   centerprint.TextTransparency = 1
   centerprint.Text = "Emergency Meeting!"

   Tween( centerprint, { TextTransparency: 0 }, 0.5 )
   wait( 2 )
   Tween( centerprint, { TextTransparency: 1 }, 1.0 )
   wait( 1 )
   Tween( baseFrame, { Transparency: 1 }, 1.0 )
}


export function DrawMatchScreen_Winners( winners: Array<Player>, localRole: ROLE, startingPossessedCount: number )
{
   let localWinner = false
   for ( let player of winners )
   {
      if ( file.player === player )
      {
         localWinner = true
         break
      }
   }

   let matchScreenFrame = WaitForMatchScreenFrame( "Winners" )
   let baseFrame = matchScreenFrame.baseFrame
   Tween( baseFrame, { Transparency: 0 }, 1.0 )

   let title = matchScreenFrame.title
   let subTitle = matchScreenFrame.subTitle
   let lowerTitle = matchScreenFrame.lowerTitle
   let viewportFrame = matchScreenFrame.viewportFrame
   let viewportCamera = matchScreenFrame.viewportCamera

   if ( localWinner )
      title.Text = "Victory"
   else
      title.Text = "Defeat"

   title.TextTransparency = 1
   subTitle.TextTransparency = 1
   lowerTitle.TextTransparency = 1
   viewportFrame.ImageTransparency = 1

   const FADE_IN = 2

   wait( 0.8 )
   Tween( title, { TextTransparency: 0 }, FADE_IN )
   wait( 0.5 )

   if ( localWinner )
   {
      switch ( localRole )
      {
         case ROLE.ROLE_CAMPER:
         case ROLE.ROLE_SPECTATOR_CAMPER:
            if ( winners.size() > 1 )
            {
               if ( startingPossessedCount === 1 )
                  subTitle.Text = "You defeated the imposter!"
               else
                  subTitle.Text = "You defeated the imposters!"
            }
            else
               subTitle.Text = "You escaped!"

            Tween( subTitle, { TextTransparency: 0 }, FADE_IN )
            wait( 0.4 )
            break
      }
   }

   //let numVal = new Instance( 'Vector3Value' ) as Vector3Value
   //numVal.Parent = viewportCamera
   //numVal.Value = camPosVec
   // For rapid iteration
   //RunService.RenderStepped.Connect(
   //   SetCamera
   //)

   let vecEnd2 = new Vector3( 0, 0, 0 )
   let vecStart2 = vecEnd2.add( new Vector3( 0, 1, -6 ) )
   viewportCamera.CFrame = new CFrame( vecStart2, vecEnd2 )


   let count = 0
   let odd = true
   const dist = 3.0
   winners.sort( SortLocalPlayer )

   for ( let i = 0; i < winners.size(); i++ )
   {
      let player = winners[i]
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
      offset = offset.add( new Vector3( 0, 0, offsetCount * 1.5 ) ) // depth
      //offset = offset.add( new Vector3( dist * -0.5, 0, 0.0 ) ) // left
      yaw *= multiplier

      let clonedModel = ClonePlayerModel( player ) as Model
      clonedModel.Parent = viewportFrame
      clonedModel.SetPrimaryPartCFrame( new CFrame( offset ) )

      SetCharacterYaw( clonedModel, yaw )
      SetCharacterTransparency( clonedModel, 0 )
   }

   const CAMERA_TIME = 1.7
   Tween( viewportFrame, { ImageTransparency: 0 }, CAMERA_TIME * 0.5 )


   wait( FADE_IN )
   wait( 2 )

   wait( 2343 )

   const FADE_OUT = 2.0
   Tween( title, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( subTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   Tween( lowerTitle, { TextTransparency: 1 }, FADE_OUT * 0.75 )
   wait( 1.0 )
   Tween( viewportFrame, { ImageTransparency: 1 }, 0.75 )
   wait( 0.75 )

   Tween( baseFrame, { Transparency: 1 }, 1.0 )
}