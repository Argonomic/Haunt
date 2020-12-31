import { Assert } from "./sh_assert"
import { GetPlayerCooldownTimeRemaining } from "./sh_cooldown"
import { AddCallback_OnPlayerConnected } from "./sh_onPlayerConnect"
import { IsServer } from "./sh_utils"

export const ABILITY_COOLDOWNS = "ABILITY_COOLDOWNS"

class Ability
{
   name: string
   abilityIndex: ABILITIES
   icon: string
   serverFunc: undefined | ( ( player: Player ) => void )
   canUseFunc: ( ( player: Player ) => boolean )

   constructor( abilityIndex: ABILITIES, name: string, icon: string )
   {
      this.abilityIndex = abilityIndex
      this.name = name
      this.icon = icon
      this.canUseFunc = function ( player: Player ) { return true }
   }
}

type ABILITIES = number

class File
{
   abilities = new Map<ABILITIES, Ability>()
   playerAbilities = new Map<Player, Array<ABILITIES>>()
   abilitiesChangedCallbacks: Array<( ( player: Player ) => void )> = []
}
let file = new File()

export function SH_AbilitySetup()
{
   AddCallback_OnPlayerConnected(
      function ( player: Player )
      {
         file.playerAbilities.set( player, [] )
      } )
}

export function CreateAbility( abilityIndex: ABILITIES, name: string, icon: string )
{
   let ability = new Ability( abilityIndex, name, icon )
   file.abilities.set( abilityIndex, ability )
}

export function GiveAbility( player: Player, ability: ABILITIES )
{
   print( "GiveAbility " + ability + " to " + player.UserId + " isserver " + IsServer() )
   let abilities = file.playerAbilities.get( player )
   if ( abilities === undefined ) throw undefined

   abilities.push( ability )
   AbilitiesChanged( player )
}

function AbilitiesChanged( player: Player )
{
   for ( let func of file.abilitiesChangedCallbacks )
   {
      func( player )
   }
}

export function TakeAbility( player: Player, ability: ABILITIES )
{
   let abilities = file.playerAbilities.get( player )
   if ( abilities === undefined ) throw undefined

   let changed = false
   for ( let i = 0; i < abilities.size(); i++ )
   {
      if ( abilities[i] !== ability )
         continue

      abilities.remove( i )
      i--
      changed = true
   }
   if ( changed )
      AbilitiesChanged( player )
}

export function HasAbility( player: Player, ability: ABILITIES ): boolean
{
   if ( !file.playerAbilities.has( player ) )
      return false

   let abilities = file.playerAbilities.get( player )
   if ( abilities === undefined ) throw undefined

   for ( let hasAbility of abilities )
   {
      if ( hasAbility === ability )
         return true
   }

   return false
}

export function CanUseAbility( player: Player, abilityIndex: ABILITIES ): boolean
{
   if ( !HasAbility( player, abilityIndex ) )
      return false

   let cooldown = GetPlayerCooldownTimeRemaining( player, ABILITY_COOLDOWNS + abilityIndex )
   if ( cooldown > 0 )
      return false

   let ability = GetAbility( abilityIndex )
   return ability.canUseFunc( player )
}

export function GetAbility( abilityIndex: ABILITIES ): Ability
{
   Assert( file.abilities.has( abilityIndex ), "file.abilities.has( abilityIndex )" )
   let ability = file.abilities.get( abilityIndex )
   if ( ability === undefined ) throw undefined
   return ability
}

export function SetAbilityServerFunc( abilityIndex: ABILITIES, func: ( ( player: Player ) => void ) )
{
   let abilityData = GetAbility( abilityIndex )
   abilityData.serverFunc = func
}

export function SetAbilityCanUseFunc( abilityIndex: ABILITIES, func: ( ( player: Player ) => boolean ) )
{
   let abilityData = GetAbility( abilityIndex )
   abilityData.canUseFunc = func
}

export function AddAbilitiesChangedCallback( func: ( ( player: Player ) => void ) )
{
   file.abilitiesChangedCallbacks.push( func )
}

export function GetPlayerAbilities( player: Player ): Array<ABILITIES>
{
   if ( !file.playerAbilities.has( player ) ) throw undefined
   let abilites = file.playerAbilities.get( player )
   if ( abilites === undefined )
   {
      Assert( false, "No abilities" )
      throw undefined
   }

   return abilites
}