using System.Security.Principal;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using RewildLiveSource.Controllers;
using static Rec_rewild_live_rewrite.api.server.Moderation_Detail;

namespace RewildLiveSource.api.admin
{
    internal static class DevChatCommands
    {
        public static string? ParseCommand(string msg, string context, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(msg))
                return null;

            if (!msg.StartsWith("!"))
                return null;

            if (!PlayerDB.CheckDevFlag(playerId))
                return "You are not allowed to use dev commands.";

            string[] parts = msg.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            string command = parts[0].ToLowerInvariant();
            string args = parts.Length > 1 ? parts[1] : "";

            return command switch
            {
                "!bring_all" => HandleBringAll(args),
                "!goto" => HandleGoto(args, playerId),
                "!help" => HandleHelp(),
                "!add_room_role" => HandleAddRoomRole(args, playerId),
                "!remove_room_role" => HandleRemoveRoomRole(args, playerId),
                "!ban" => HandleBan(args, playerId),
                "!kick" => HandleKick(args),
                _ => "Unknown command. Use !help"
            };
        }

        // ------------------------------------------------------------
        // BRING ALL
        // ------------------------------------------------------------
        private static string HandleBringAll(string msg)
        {
            if (string.IsNullOrWhiteSpace(msg))
                return "Usage: !bring_all Room.Subroom [private]";

            bool isPrivate = false;
            msg = msg.Trim();

            if (msg.EndsWith(" private", StringComparison.OrdinalIgnoreCase))
            {
                isPrivate = true;
                msg = msg[..^8].Trim();
            }

            string room;
            string subroom = "";

            var split = msg.Split('.', 2, StringSplitOptions.RemoveEmptyEntries);
            room = split[0];
            if (split.Length == 2)
                subroom = split[1];

            var session = Sessions.CreateRoom(room, subroom, isPrivate);

            foreach (var (playerId, _) in NotificationsController.WebSockets.ToArray())
            {
                try
                {
                    HeartbeatDB.UpdatePlayerHeartbeat(playerId, session);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to move player {playerId}: {ex.Message}");
                }
            }


            // ❗ Fallback ONLY if you don't have online tracking
            // for (ulong id = 1; id <= PlayerDB.GetMaxPlayerId(); id++)
            //     HeartbeatDB.UpdatePlayerHeartbeat(id, session);

            return $"Sent all players to {(isPrivate ? "PRIVATE " : "")}{room}" +
                   (string.IsNullOrEmpty(subroom) ? "" : $".{subroom}");
        }

        // ------------------------------------------------------------
        // GOTO
        // ------------------------------------------------------------
        private static string HandleGoto(string arg, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(arg))
                return "Usage: !goto Room.Subroom";

            string room;
            string subroom = "";

            var split = arg.Split('.', 2, StringSplitOptions.RemoveEmptyEntries);
            room = split[0];
            if (split.Length == 2)
                subroom = split[1];

            var session = Sessions.CreateRoom(room, subroom);
            HeartbeatDB.UpdatePlayerHeartbeat(playerId, session);

            return string.IsNullOrEmpty(subroom)
                ? $"Teleporting you to {room}"
                : $"Teleporting you to {room}.{subroom}";
        }

        // ------------------------------------------------------------
        // HELP
        // ------------------------------------------------------------
        private static string HandleHelp()
        {
            return @"
!bring_all <Room.Subroom> [private]
  Sends all players to the specified room.
  Example: !bring_all RecCenter.Home private

!goto <Room.Subroom>
  Teleports you to a room.
  Example: !goto RecCenter.Home

!add_room_role <PlayerName|me>, <RoomName>, <Role>
  Roles: None, Banned, Host, Moderator, CoOwner, TemporaryCoOwner, Creator

!remove_room_role <PlayerName|me>, <RoomName>
  Removes ALL roles for a player in a room.

!ban <PlayerName>, <DurationSeconds>, <Category>, [Message]
  Example: !ban ThriftyEmu, 3600, Cheating, Please follow the rules
".Trim();
        }

        // ------------------------------------------------------------
        // ADD ROOM ROLE
        // ------------------------------------------------------------
        private static string HandleAddRoomRole(string args, ulong callerId)
        {
            if (string.IsNullOrWhiteSpace(args))
                return "Usage: !add_room_role PlayerName, RoomName, RoleName";

            var split = args.Split(',', StringSplitOptions.RemoveEmptyEntries);

            ulong targetId;
            string roomName;
            string roleName;

            if (split.Length == 2)
            {
                targetId = callerId;
                roomName = split[0].Trim();
                roleName = split[1].Trim();
            }
            else if (split.Length == 3)
            {
                string playerName = split[0].Trim();
                roomName = split[1].Trim();
                roleName = split[2].Trim();

                targetId = playerName.Equals("me", StringComparison.OrdinalIgnoreCase)
                    ? callerId
                    : PlayerDB.GetPlayerIdByName(playerName);

                if (targetId == 0)
                    return $"Player '{playerName}' not found.";
            }
            else
            {
                return "Invalid format. Use: !add_room_role PlayerName, RoomName, RoleName";
            }

            if (!Enum.TryParse<RoomDBClasses.Role_data>(roleName, true, out var role))
                return $"Invalid role '{roleName}'.";

            bool result = RoomDB.AddRoleToRoom(roomName, (int)targetId, role);

            if (!result)
                return $"Room '{roomName}' not found.";

            if (role == RoomDBClasses.Role_data.Creator)
                RoomDB.SetRoomCreatorId(targetId, roomName);

            return $"Added role {role} to room {roomName} for player ID {targetId}.";
        }

        // ------------------------------------------------------------
        // REMOVE ROOM ROLE
        // ------------------------------------------------------------
        private static string HandleRemoveRoomRole(string args, ulong callerId)
        {
            if (string.IsNullOrWhiteSpace(args))
                return "Usage: !remove_room_role PlayerName, RoomName";

            var split = args.Split(',', StringSplitOptions.RemoveEmptyEntries);
            if (split.Length != 2)
                return "Invalid format. Use: !remove_room_role PlayerName, RoomName";

            string playerName = split[0].Trim();
            string roomName = split[1].Trim();

            ulong targetId = playerName.Equals("me", StringComparison.OrdinalIgnoreCase)
                ? callerId
                : PlayerDB.GetPlayerIdByName(playerName);

            if (targetId == 0)
                return $"Player '{playerName}' not found.";

            bool result = RoomDB.RemoveRoleFromRoom(roomName, (int)targetId);

            return result
                ? $"Removed all roles from room '{roomName}' for player '{playerName}'."
                : $"Room '{roomName}' not found or no roles assigned.";
        }

        // ------------------------------------------------------------
        // BAN
        // ------------------------------------------------------------
        private static string HandleBan(string args, ulong devid)
        {
            if (string.IsNullOrWhiteSpace(args))
                return "Usage: !ban PlayerName, DurationSeconds, Category, Message";

            var split = args.Split(',', 4, StringSplitOptions.RemoveEmptyEntries);
            if (split.Length < 3)
                return "Invalid format. Use: !ban PlayerName, DurationSeconds, Category, Message";

            string playerName = split[0].Trim();
            string durationStr = split[1].Trim();
            string categoryStr = split[2].Trim();
            string message = split.Length == 4 ? split[3].Trim() : "";

            ulong playerId = PlayerDB.GetPlayerIdByName(playerName);
            if (playerId == 0)
                return $"Player '{playerName}' not found.";

            if (!int.TryParse(durationStr, out int duration) || duration < 0)
                return "Invalid duration. Must be a non-negative number.";

            if (!Enum.TryParse<Moderation_Detail.ReportCategory>(categoryStr, true, out var category))
                category = Moderation_Detail.ReportCategory.Moderator;

            PlayerDB.Set_moderation_block(
                playerId,
                category,
                duration,
                gameSessionId: -1,
                isHostKick: false,
                message: message,
                playerIdReporter: null,
                isBan: true,
                bannedByPlayerId: devid
            );

            return $"Player '{playerName}' banned for {duration} seconds ({category}).";
        }

        private static string HandleKick(string args)
        {
            if (string.IsNullOrWhiteSpace(args))
                return "Usage: !kick PlayerName";

            var split = args.Split(',', 4, StringSplitOptions.RemoveEmptyEntries);
            if (split.Length < 3)
                return "Invalid format. Use: !kick PlayerName";

            string playerName = split[0].Trim();

            ulong playerId = PlayerDB.GetPlayerIdByName(playerName);
            if (playerId == 0)
                return $"Player '{playerName}' not found.";

            PlayerDB.Set_moderation_block(
                  playerId,
                  ReportCategory.Moderator,
                  duration: 1,
                  gameSessionId: -1,
                  isHostKick: true,
                  message: "You have been kicked.",
                  playerIdReporter: null,
                  isBan: false,
                  bannedByPlayerId: 0
                 );

            return $"Player '{playerName}' has been kicked to their Dorm Room.";
        }
    }
}
