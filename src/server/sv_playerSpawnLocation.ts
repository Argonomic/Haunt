class File
{
   playerToSpawnLocation = new Map<Player, Vector3>()
}
let file = new File()

export function SV_PlayerSpawnLocationSetup()
{

}

export function GetPlayerSpawnLocation( player: Player ): Vector3 | undefined
{
   return file.playerToSpawnLocation.get( player )
}

export function SetPlayerSpawnLocation( player: Player, loc: Vector3 )
{
   file.playerToSpawnLocation.set( player, loc )
}
