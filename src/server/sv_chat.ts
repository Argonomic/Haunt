import { Chat, Players, ServerScriptService } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { AddRoleChangeCallback, GAME_STATE, IsSpectatorRole, Match } from "shared/sh_gamestate"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { Thread, UserIDToPlayer, Wait } from "shared/sh_utils"
import { PlayerHasMatch, PlayerToMatch } from "./sv_gameState"

const PREFIX = "Match"

class ChatResults
{
   FromSpeaker: string = ""
   SpeakerUserId: number = 0
   IsFiltered: boolean = false
   ShouldDeliver: boolean = true
}

interface ChatChannel
{
}

interface Speaker
{
   IsInChannel( channelName: string ): boolean
   JoinChannel( channelName: string ): void
   LeaveChannel( channelName: string ): void
}

interface ChatService extends ModuleScript
{
   AddChannel( channelName: string ): void
   GetChannel( channelName: string ): ChatChannel
   GetChannelList(): Array<string>
   GetSpeaker( playerName: string ): Speaker
}

class File
{
}
let file = new File()

export function SV_ChatSetup()
{
   Thread(
      function ()
      {
         let chatService = require( ServerScriptService.WaitForChild( 'ChatServiceRunner' ).WaitForChild( 'ChatService' ) as ChatService ) as ChatService

         function UpdateChatChannel( player: Player, match: Match )
         {
            let speaker = chatService.GetSpeaker( player.Name )

            if ( speaker === undefined )
               return

            if ( !PlayerHasMatch( player ) )
               return
            if ( PlayerToMatch( player ) !== match )
               return
            let channelName = GetPlayerChatChannelName( player, match )
            if ( !chatService.GetChannel( channelName ) )
            {
               chatService.AddChannel( channelName )
               //print( player.Name + " addchannel " + channelName )
            }

            if ( !speaker.IsInChannel( channelName ) )
            {
               speaker.JoinChannel( channelName )
               //print( player.Name + " joinchannel " + channelName )
            }

            let channels = chatService.GetChannelList()
            for ( let channel of channels ) 
            {
               if ( !channel.find( PREFIX ).size() )
                  continue

               if ( channel === channelName )
                  continue

               if ( speaker.IsInChannel( channel ) )
               {
                  speaker.LeaveChannel( channel )
                  //print( player.Name + " leavechannel " + channel )
               }
            }
         }

         AddCallback_OnPlayerConnected(
            function ( player: Player )
            {
               Thread( function ()
               {
                  Wait( 3 ) // give chat a chance to load
                  if ( player.Character === undefined )
                     return
                  if ( !PlayerHasMatch( player ) )
                     return
                  let match = PlayerToMatch( player )
                  UpdateChatChannel( player, match )
               } )
            } )

         AddRoleChangeCallback(
            function ( player: Player, match: Match )
            {
               UpdateChatChannel( player, match )
            } )

         Chat.RegisterChatCallback( Enum.ChatCallbackType.OnServerReceivingMessage,
            function ( a: ChatResults )
            {
               let userIdToPlayer = UserIDToPlayer()
               let player = userIdToPlayer.get( a.SpeakerUserId ) as Player
               a.ShouldDeliver = true

               if ( PlayerHasMatch( player ) )
               {
                  let match = PlayerToMatch( player )
                  UpdateChatChannel( player, match )
                  switch ( match.GetGameState() )
                  {
                     case GAME_STATE.GAME_STATE_PLAYING:
                     case GAME_STATE.GAME_STATE_SUDDEN_DEATH:
                        a.ShouldDeliver = match.IsSpectator( player )
                        break
                  }
               }
               return a
            } )
      } )
}

export function GetPlayerChatChannelName( player: Player, match: Match ): string
{
   if ( !PlayerHasMatch( player ) )
      return PREFIX + "_0"

   Assert( PlayerToMatch( player ) === match, "Player is not in match" )
   let role = match.GetPlayerRole( player )
   if ( IsSpectatorRole( role ) && match.GetGameState() !== GAME_STATE.GAME_STATE_COMPLETE )
      return PREFIX + "Dead_" + match.shState.gameIndex
   return PREFIX + "_" + match.shState.gameIndex
}
