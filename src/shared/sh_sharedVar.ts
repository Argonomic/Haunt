import { Workspace } from "@rbxts/services"
import { Assert } from "./sh_assert"
import { GetExistingFirstChildWithNameAndClassName, IsServer } from "./sh_utils"

class File
{
   isReservedServer: BoolValue | undefined
   sharedInts = new Map<string, IntValue>()
   defaultVal = new Map<string, number>()
   parentFolder = new Instance( 'Folder' )
}
let file = new File()

const SHARED_VARS_FOLDER = "SharedVars"
export function SH_SharedVarSetup()
{
   if ( IsServer() )
   {
      file.parentFolder.Name = SHARED_VARS_FOLDER
      file.parentFolder.Parent = Workspace
   }
   else
   {
      file.parentFolder.Destroy()
      file.parentFolder = GetExistingFirstChildWithNameAndClassName( Workspace, SHARED_VARS_FOLDER, "Folder" ) as Folder
   }
}

export function CreateSharedInt( name: string, value: number )
{
   file.defaultVal.set( name, value )
   if ( IsServer() )
   {
      let intValue = new Instance( 'IntValue' )
      intValue.Name = name
      intValue.Parent = file.parentFolder
      intValue.Value = value
      file.sharedInts.set( name, intValue )
   }
   else
   {
      let child = GetExistingFirstChildWithNameAndClassName( file.parentFolder, name, "IntValue" ) as IntValue
      file.sharedInts.set( name, child )
   }
}

export function GetSharedVarInt( name: string ): number
{
   let val = file.sharedInts.get( name )
   if ( val !== undefined )
      return val.Value

   let def = file.defaultVal.get( name )
   if ( def === undefined )
   {
      Assert( false, "Expected sharedvar " + name )
      throw undefined
   }
   return def
}

export function SetSharedVarInt( name: string, value: number )
{
   Assert( IsServer(), "IsServer" )
   let val = file.sharedInts.get( name )
   if ( val !== undefined )
      val.Value = value
}