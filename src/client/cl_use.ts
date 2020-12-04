import { Players, RunService, Workspace } from "@rbxts/services"
import { GetUsableByType, GetUsables, Usable, USETYPES } from "shared/sh_use"
import { Assert, GetFirstChildWithName, GetPosition, IsAlive, UserIDToPlayer } from "shared/sh_utils"
import { AddPlayerGuiExistsCallback, UIORDER } from "./cl_ui"
import { SendRPC } from "./cl_utils"


class File
{
   //useGetters = new Map<USETYPES, Function>()
   debounceTime = 0
   playerUseDisabledCallback: Array<Function> = []
}

let file = new File()

export function AddPlayerUseDisabledCallback( func: Function )
{
   file.playerUseDisabledCallback.push( func )
}

export function SetUseDebounceTime( time: number )
{
   file.debounceTime = Workspace.DistributedGameTime + time
}

function UseButtonVisible( useUI: ScreenGui, imageButton: ImageButton, textLabel: TextLabel )
{
   let player = Players.LocalPlayer

   function CanUse(): boolean
   {
      if ( !IsAlive( player ) )
         return false

      if ( Workspace.DistributedGameTime < file.debounceTime )
         return false

      for ( let callback of file.playerUseDisabledCallback )
      {
         if ( callback() )
            return false

      }

      return true
   }

   useUI.Enabled = false
   let lastUsable: Usable | undefined
   RunService.RenderStepped.Connect( function ()
   {
      if ( !CanUse() )
      {
         if ( useUI.Enabled )
            useUI.Enabled = false

         return
      }

      let newUsable = GetUsableForUseAttempt()
      if ( newUsable !== lastUsable )
      {
         lastUsable = newUsable
         if ( newUsable === undefined )
         {
            useUI.Enabled = false
            return
         }

         imageButton.Image = newUsable.image
         textLabel.Text = newUsable.text
         useUI.Enabled = true
      }
   } )
}

function GetUsableForUseAttempt(): Usable | undefined
{
   let player = Players.LocalPlayer
   let pos = GetPosition( player )

   let usables = GetUsables()
   for ( let usable of usables )
   {
      if ( usable.testPlayerPosToInstance !== undefined )
      {
         let targets = usable.getter() as Array<Instance>

         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerPosToInstance( pos, target ) )
               return usable
         }
      }
      else if ( usable.testPlayerToBasePart !== undefined )
      {
         let targets = usable.getter() as Array<BasePart>
         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerToBasePart( player, target ) )
               return usable
         }
      }
      else if ( usable.testPlayerPosToPos !== undefined )
      {
         let targets = usable.getter() as Array<Vector3>
         for ( let target of targets )
         {
            Assert( target !== undefined, "Use Target is not defined!" )
         }

         for ( let target of targets )
         {
            if ( usable.testPlayerPosToPos( pos, target ) )
               return usable
         }
      }
      else
      {
         Assert( false, "No usable test defined" )
      }
   }

   return undefined
}

export function CL_UseSetup()
{
   AddPlayerGuiExistsCallback( function ( gui: Instance )
   {
      let useUI = GetFirstChildWithName( gui, 'UseUI' ) as ScreenGui
      useUI.DisplayOrder = UIORDER.UIORDER_USEBUTTON

      let imageButton = GetFirstChildWithName( useUI, 'ImageButton' ) as ImageButton

      let textLabel = GetFirstChildWithName( imageButton, "TextLabel" )
      if ( textLabel === undefined )
      {
         Assert( false, "Couldn't find TextLabel" )
         return
      }

      imageButton.MouseButton1Up.Connect( function ()
      {
         let usable = GetUsableForUseAttempt()
         if ( usable === undefined )
            return

         SendRPC( "RPC_FromClient_OnUse", usable.useType )
      } )

      UseButtonVisible( useUI, imageButton, textLabel as TextLabel )
   } )
}

/*
export function AddOnUseGetter( useType: USETYPES, getter: Function )
{
   Assert( !file.useGetters.has( useType ), "Already added getter for use type " + useType )
   file.useGetters.set( useType, getter )
}
*/