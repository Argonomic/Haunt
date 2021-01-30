import { Workspace } from "@rbxts/services"
import { AddNetVar, GetNetVar_Number, SetNetVar } from "./sh_player_netvars"
import { GetServerTime } from "./sh_time"
import { IsServer } from "./sh_utils"
import { Assert } from "shared/sh_assert"

class Cooldown
{
   name: string
   cooldownTime: number
   netvar: string

   constructor( name: string, cooldownTime: number )
   {
      this.name = name
      this.cooldownTime = cooldownTime
      this.netvar = name
   }
}

class File
{
   nameToCooldown = new Map<string, Cooldown>()
}
let file = new File()

export function GetPlayerCooldownTimeRemaining( player: Player, name: string ): number
{
   if ( !file.nameToCooldown.has( name ) )
      return 0

   let cooldown = file.nameToCooldown.get( name ) as Cooldown
   return GetNetVar_Number( player, cooldown.netvar ) - GetServerTime()
}

export function GetRenderedCooldownTimeRemaining( player: Player, name: string ): number
{
   let cooldownRemaining = GetPlayerCooldownTimeRemaining( player, name )
   if ( cooldownRemaining > 0 )
      cooldownRemaining++ // add one because otherwise 0.5 is not drawn, but can't use.
   cooldownRemaining = math.floor( cooldownRemaining );
   return cooldownRemaining
}

export function ResetCooldownTime( player: Player, name: string )
{
   Assert( IsServer(), "Only server does this" )
   Assert( file.nameToCooldown.has( name ), "Cooldown " + name + " does not exist" )
   let cooldown = file.nameToCooldown.get( name ) as Cooldown
   SetNetVar( player, cooldown.netvar, Workspace.DistributedGameTime + cooldown.cooldownTime )
}

export function DoCooldown( player: Player, name: string, time: number )
{
   Assert( IsServer(), "Only server does this" )
   Assert( file.nameToCooldown.has( name ), "Cooldown " + name + " does not exist" )
   let cooldown = file.nameToCooldown.get( name ) as Cooldown
   SetNetVar( player, cooldown.netvar, Workspace.DistributedGameTime + time )
}

export function ResetAllCooldownTimes( player: Player )
{
   Assert( IsServer(), "Only server does this" )
   for ( let pair of file.nameToCooldown )
   {
      let cooldown = pair[1]
      SetNetVar( player, cooldown.netvar, Workspace.DistributedGameTime + cooldown.cooldownTime )
   }
}

export function AddCooldown( name: string, time: number )
{
   AddNetVar( "number", name, 0 )
   file.nameToCooldown.set( name, new Cooldown( name, time ) )
}

export function SH_CooldownSetup()
{

}