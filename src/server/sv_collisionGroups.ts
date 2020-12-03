import { PhysicsService, Workspace } from "@rbxts/services"
import { AddCallback_OnPlayerCharacterAdded } from "../shared/sh_onPlayerConnect"
import { ExecOnChildWhenItExists } from "../shared/sh_utils"

const COL_GROUP_PLAYERS = "Players"

class File
{
   previousCollisionGroups = new Map<Instance, number>()
}
let file = new File()

export function SV_CollisionGroupsSetup()
{
   const COL_GROUP = COL_GROUP_PLAYERS

   PhysicsService.CreateCollisionGroup( COL_GROUP )
   PhysicsService.CollisionGroupSetCollidable( COL_GROUP, COL_GROUP, false )

   AddCallback_OnPlayerCharacterAdded( function ( player: Player )
   {
      let character = player.Character as Model
      SetCollisionGroupRecursive( character, COL_GROUP )

      character.DescendantAdded.Connect( function ( instance: Instance )
      {
         SetCollisionGroup( instance, COL_GROUP )
      } )

      character.DescendantRemoving.Connect( ResetCollisionGroup )
   } )

   /*
   ExecOnChildWhenItExists( Workspace, "Collider", function ( part: Part )
   {
      PhysicsService.SetPartCollisionGroup( part, COL_GROUP )
      print( "collider no collide" )
   } )
   */
}

function SetCollisionGroup( instance: Instance, name: string )
{
   if ( instance.IsA( 'BasePart' ) )
   {
      file.previousCollisionGroups.set( instance, instance.CollisionGroupId )
      PhysicsService.SetPartCollisionGroup( instance, name )
   }
}

function SetCollisionGroupRecursive( instance: Instance, name: string )
{
   SetCollisionGroup( instance, name )

   let children = instance.GetChildren()
   for ( let child of children )
   {
      SetCollisionGroupRecursive( child, name )
   }
}

function ResetCollisionGroup( instance: Instance )
{
   if ( !instance.IsA( 'BasePart' ) )
      return

   if ( !file.previousCollisionGroups.has( instance ) )
      return

   let previousCollisionGroupId = file.previousCollisionGroups.get( instance ) as number
   let previousCollisionGroupName = PhysicsService.GetCollisionGroupName( previousCollisionGroupId )
   PhysicsService.SetPartCollisionGroup( instance, previousCollisionGroupName )
   file.previousCollisionGroups.delete( instance )
}
