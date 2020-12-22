import { AddAssertServerCallback } from "shared/sh_assert"
import { AddCallback_OnPlayerConnected } from "shared/sh_onPlayerConnect"

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
   print( "Analytics!!" )
   let config = new AnalyticsData()
   file.GA.Init( "UA-185857526-1", config )

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
   let category = "PlaceId-" + game.PlaceId
   //let action = "Category-Action"
   if ( value === undefined )
      value = 1
   file.GA.ReportEvent( category, action, name, value )
}

/*
class GoogleAnalytics
{
   public ReportEvent( category: string, action: string, name: string, value: number )
   {

   }
}



local GA = require( 153590792 )
local result = GA.Init( "UA-185857526-1", config )

local category = "PlaceId-"..game.PlaceId
local action = "Category-Action"

GA.ReportEvent( category, action, "none", 1 )
GA.ReportEvent( category, action, "something", 2 )
*/