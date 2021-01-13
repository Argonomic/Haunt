import { RunService } from "@rbxts/services"
import { AddAssertServerCallback } from "shared/sh_assert"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"
import { Thread } from "shared/sh_utils"

const LOCAL = RunService.IsStudio()

class AnalyticsData
{
   DoNotReportScriptErrors = false
   DoNotTrackServerStart = false
   DoNotTrackVisits = false
}

class File
{
   GA = require( 153590792 ) as GoogleAnalytics
}
let file = new File()

interface GoogleAnalytics
{
   readonly ClassName: "GoogleAnalytics";

   readonly Init: ( ua: string, config: any ) => this
   readonly ReportEvent: ( category: string, action: string, name: string, value: number | string ) => void
}

export function SV_AnalyticsSetup()
{
   Thread(
      function ()
      {
         // blocking call
         file.GA.Init( "UA-185857526-1", new AnalyticsData() )
      } )

   AddAssertServerCallback( function ( stack: string )
   {
      ReportEvent( "ScriptError", stack )
   } )

   AddCallback_OnPlayerConnected( function ( player: Player )
   {
      ReportEvent( "PlayerConnected", player.UserId + "" )
   } )
}

export function ReportEvent( action: string, name: string, value?: number )
{
   if ( LOCAL )
      return

   let category = "PlaceId-" + game.PlaceId
   //let action = "Category-Action"
   if ( value === undefined )
      value = 1

   name = name.gsub( "\n", "//" )[0]
   file.GA.ReportEvent( category, action, name, value )
}

