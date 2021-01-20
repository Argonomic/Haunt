import { SocialService, Workspace } from "@rbxts/services"
import { Assert } from "shared/sh_assert"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { AddRPC } from "shared/sh_rpc"
import { MATCHMAKE_PLAYER_OPENED_FRIEND_INVITE, MATCHMAKE_PLAYER_WAITING_FOR_FRIEND_TIME, MATCHMAKE_PLAYER_CAN_MATCHMAKE_TIME } from "shared/sh_settings"
import { ArrayRandomize } from "shared/sh_utils"

class File
{
   playerAvailableToMatchmakeTime = new Map<Player, number>()
}
let file = new File()

export function SV_MatchMakingSetup()
{
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      file.playerAvailableToMatchmakeTime.set( player, Workspace.DistributedGameTime + MATCHMAKE_PLAYER_CAN_MATCHMAKE_TIME )
   } )

   SocialService.GameInvitePromptClosed.Connect(
      function ( player: Player, userIds: Array<number> ) 
      {
         if ( userIds.size() > 0 )
         {
            // if you invited somebody, reset your matchmake time so they have a chance to join
            file.playerAvailableToMatchmakeTime.set( player, Workspace.DistributedGameTime + MATCHMAKE_PLAYER_WAITING_FOR_FRIEND_TIME )
         }
      } )

   AddRPC( "RPC_FromClient_OpenedFriendInvite", function ( player: Player )
   {
      // player is interacting with friend invite, give more time
      file.playerAvailableToMatchmakeTime.set( player, Workspace.DistributedGameTime + MATCHMAKE_PLAYER_OPENED_FRIEND_INVITE )
   } )
}

function IsPlayerAvailableToMatchmake( player: Player ): boolean
{
   let time = file.playerAvailableToMatchmakeTime.get( player )
   if ( time === undefined )
   {
      Assert( false, "time !== undefined" )
      throw undefined
   }

   return Workspace.DistributedGameTime >= time
}

class Party
{
   players: Array<Player>
   constructor( players: Array<Player> )
   {
      Assert( players.size() > 0, "players.size() > 0" )
      this.players = players
   }
}

export function ServerAttemptToFindReadyPlayersOfPlayerCount( players: Array<Player>, matchCount: number ): Array<Player> | undefined
{
   //print( "\nTry Matchmake " + players.size() + " players into match of " + matchCount + " players" )
   Assert( players.size() >= matchCount, "players.size() >= matchCount" )

   let parties = GetPartiesFromPlayers( players )

   for ( let party of parties )
   {
      let map = new Map<Player, boolean>()
      for ( let player of party.players )
      {
         Assert( !map.has( player ), "Found player in more than one party" )
         map.set( player, true )
      }
   }

   // filter parties that don't have anyone available 
   parties = parties.filter( function ( party )
   {
      for ( let player of party.players )
      {
         if ( IsPlayerAvailableToMatchmake( player ) )
            return true
      }
      return false
   } )

   //print( "Built " + parties.size() + " parties: " )
   for ( let party of parties )
   {
      //print( "Players: " + party.players.size() )
   }
   let matchingParties = FindPartiesThatFitMatchCount( parties, matchCount )
   //print( "FindPartiesThatFitMatchCount: " + matchingParties )
   if ( matchingParties === undefined )
      return undefined
   let matchedPlayers: Array<Player> = []
   for ( let party of matchingParties )
   {
      matchedPlayers = matchedPlayers.concat( party.players )
   }

   Assert( matchedPlayers.size() === matchCount, "matchedPlayers.size() === matchCount" )
   //print( "matchedPlayers: " + matchedPlayers.size() )
   return matchedPlayers
}

function FindPartiesThatFitMatchCount( parties: Array<Party>, desiredPlayerCount: number ): Array<Party> | undefined
{
   // enough players to even bother?
   let playerCount = 0
   for ( let party of parties )
   {
      playerCount += party.players.size()
   }
   if ( playerCount < desiredPlayerCount )
      return undefined

   parties.sort( SortParties )

   // try sorted first
   let mmTry = TryCongifurationOrderForPlayerCount( parties, desiredPlayerCount )
   if ( mmTry !== undefined )
      return mmTry

   // try random configurations then
   for ( let i = 0; i < 10; i++ )
   {
      ArrayRandomize( parties )
      let mmTry = TryCongifurationOrderForPlayerCount( parties, desiredPlayerCount )
      if ( mmTry !== undefined )
         return mmTry
   }

   return undefined
}

function TryCongifurationOrderForPlayerCount( parties: Array<Party>, playerCount: number ): Array<Party> | undefined
{
   let count = 0
   let matchmadeParties = parties.filter( function ( party )
   {
      if ( count + party.players.size() <= playerCount )
      {
         count += party.players.size()
         return true
      }

      return false
   } )

   if ( count === playerCount )
      return matchmadeParties

   return undefined
}

function SortParties( a: Party, b: Party )
{
   // bigger parties served faster
   return a.players.size() > b.players.size()
}


function GetPartiesFromPlayers( players: Array<Player> ): Array<Party>
{
   let parties: Array<Party> = []
   let playerToParty = new Map<Player, Party>()
   for ( let player of players )
   {
      for ( let otherPlayer of players )
      {
         if ( player === otherPlayer )
            continue

         if ( !player.IsFriendsWith( otherPlayer.UserId ) )
            continue

         let party1 = playerToParty.get( player )
         let party2 = playerToParty.get( otherPlayer )
         if ( party1 !== undefined )
         {
            if ( party2 === undefined )
            {
               party1.players.push( otherPlayer )
               playerToParty.set( otherPlayer, party1 )
               //print( "1 Added " + otherPlayer.Name + " to party with " + player.Name )
               continue
            }

            if ( party1 === party2 )
            {
               //print( "Same parties" )
            }
            else
            {
               //print( "Merged parties of " + player.Name + " and " + otherPlayer.Name )
               // merge parties
               party1.players = party1.players.concat( party2.players )
               for ( let play of party1.players )
               {
                  playerToParty.set( play, party1 )
               }

               for ( let i = 0; i < parties.size(); i++ )
               {
                  if ( parties[i] === party2 )
                  {
                     parties.remove( i )
                     i--
                  }
               }
            }

            continue
         }
         else if ( party2 !== undefined )
         {
            party2.players.push( player )
            playerToParty.set( player, party2 )
            //print( "2 Added " + player.Name + " to party with " + otherPlayer.Name )
            continue
         }

         let party = new Party( [player, otherPlayer] )
         parties.push( party )
         playerToParty.set( player, party )
         playerToParty.set( otherPlayer, party )
         //print( "Created party for " + player.Name + " " + otherPlayer.Name )
      }

      if ( !playerToParty.has( player ) ) 
      {
         //print( "Creating party for " + player.Name )

         let party = new Party( [player] )
         parties.push( party )
         playerToParty.set( player, party )
      }
   }

   //print( "Parties created: " + parties.size() )
   return parties
}