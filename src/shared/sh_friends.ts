import { Players } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { AddCallback_OnPlayerConnected } from "./sh_onPlayerConnect"
import { Thread } from "./sh_utils"

class File
{
   friendsMap = new Map<Player, Map<Player, boolean>>()
}
let file = new File()

export function SH_FriendsSetup()
{
   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      Thread( function ()
      {
         let friends = new Map<Player, boolean>()
         file.friendsMap.set( player, friends )

         let players = Players.GetPlayers()
         for ( let other of players )
         {
            if ( other === player )
               continue

            print( "Friends check: " + player.Name + " with " + other.Name + "=" )

            pcall(
               function ()
               {
                  print( player.IsFriendsWith( other.UserId ) )

                  if ( !player.IsFriendsWith( other.UserId ) )
                     return

                  friends.set( other, true )

                  let otherFriends = file.friendsMap.get( other ) as Map<Player, boolean>
                  if ( otherFriends === undefined )
                     otherFriends = new Map<Player, boolean>()
                  otherFriends.set( player, true )
                  file.friendsMap.set( other, otherFriends )
               } )
         }
      } )

   } )

   Players.PlayerRemoving.Connect(
      function ( player: Player )
      {
         file.friendsMap.delete( player )
         for ( let pair of file.friendsMap )
         {
            if ( pair[1].has( player ) )
               pair[1].delete( player )
         }
      } )


}

export function IsFriends( player1: Player, player2: Player ): boolean
{
   Assert( player1 !== player2, "player1 !== player2" )
   let friendsMap = file.friendsMap.get( player1 )
   if ( friendsMap === undefined )
   {
      Assert( false, "friendsMap is undefined for between " + player1 + " and " + player2 )
      throw undefined
   }
   return friendsMap.has( player2 )
}

export function TotalFriends( players: Array<Player>, player: Player ): number
{
   return GetFriends( players, player ).size()
}

export function GetFriends( players: Array<Player>, player: Player ): Array<Player>
{
   let friends: Array<Player> = []
   for ( let other of players )
   {
      if ( other === player )
         continue
      if ( !IsFriends( player, other ) )
         continue
      friends.push( other )
   }
   return friends
}
