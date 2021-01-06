import { ABILITY_COOLDOWNS, CanUseAbility, CreateAbility, GetAbility } from "shared/sh_ability";
import { Assert } from "shared/sh_assert";
import { AddCooldown } from "shared/sh_cooldown";
import { AddRPC } from "shared/sh_rpc";
import { COOLDOWNTIME_SABOTAGE_LIGHTS } from "shared/sh_settings";
import { IsServer } from "shared/sh_utils";

export enum ABILITIES
{
   ABILITY_SABOTAGE_LIGHTS = 0,
}

const ICON_DARKNESS = 'rbxassetid://5823410919'
const TEXT_DARKNESS = "Lights Out"

export const COOLDOWN_SABOTAGE_LIGHTS = ABILITY_COOLDOWNS + ABILITIES.ABILITY_SABOTAGE_LIGHTS

export function SH_AbilityContentSetup()
{
   CreateAbility( ABILITIES.ABILITY_SABOTAGE_LIGHTS, TEXT_DARKNESS, ICON_DARKNESS )
   AddCooldown( COOLDOWN_SABOTAGE_LIGHTS, COOLDOWNTIME_SABOTAGE_LIGHTS )

   if ( IsServer() )
   {
      AddRPC( 'RPC_FromClient_UseAbility', RPC_FromClient_UseAbility )
   }
}

function RPC_FromClient_UseAbility( player: Player, ability: ABILITIES )
{
   Assert( IsServer(), "Server expected" )
   if ( !CanUseAbility( player, ability ) )
      return

   let abilityData = GetAbility( ability )
   if ( abilityData === undefined )
   {
      Assert( false, "RPC_FromClient_UseAbility" )
      throw undefined
   }

   if ( abilityData.serverFunc === undefined )
      return

   abilityData.serverFunc( player )
}