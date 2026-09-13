using System.Text.Json.Serialization;
using LiteDB;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class HeartbeatDB
    {
        private static readonly LiteDatabase _db = new($"{Environment.CurrentDirectory}/Data/DBs/Heartbeats.db");
        private static readonly ILiteCollection<PlayerHeartbeatData> _col =
            _db.GetCollection<PlayerHeartbeatData>("players_heartbeat");

        public static void Setup()
        {
            _col.EnsureIndex(x => x.playerid, unique: true);
        }

        public class PlayerHeartbeatData
        {
            [BsonId]
            public ulong iD { get; set; }
            public ulong playerid { get; set; }
            public Heartbeat Heartbeat { get; set; }
        }

        private static Heartbeat CreateDefaultHeartbeat(ulong playerid, Platforms platform, DeviceClasses deviceClasses) =>
            new()
            {
                playerId = (long)playerid,
                appVersion = "20250731.01",
                deviceClass = -1,
                isOnline = false,
                platform = 0,
                roomInstance = null,
                statusVisibility = 4,
                vrMovementMode = 0,
            };

        public static Heartbeat GetPlayerHeartbeat(ulong playerid)
        {
            var data = _col.FindOne(x => x.playerid == playerid);
            return data?.Heartbeat ?? CreateDefaultHeartbeat(playerid, Platforms.Steam, DeviceClasses.Screen);
        }

        public static string GetPlayerHeartbeatRoomName(ulong playerid)
        {
            var data = _col.FindOne(x => x.playerid == playerid);
            return data?.Heartbeat?.roomInstance?.name ?? "nowhere!";
        }

        public static bool CreatePlayerHeartbeat(ulong playerid, out Heartbeat heartbeat, Platforms platform, DeviceClasses deviceClasses)
        {
            if (_col.Exists(x => x.playerid == playerid))
            {
                heartbeat = null!;
                return false;
            }

            heartbeat = CreateDefaultHeartbeat(playerid, platform, deviceClasses);
            _col.Insert(new PlayerHeartbeatData
            {
                iD = (ulong)_col.LongCount() + 1,
                playerid = playerid,
                Heartbeat = heartbeat
            });

            return true;
        }

        public static void UpdateStatusVisibility(ulong playerid, int visibility)
        {
            var data = _col.FindOne(x => x.playerid == playerid);
            if (data != null)
            {
                data.Heartbeat.statusVisibility = visibility;
                _col.Update(data);
            }
        }

        public static string GetPlayerCurrentRoomName(ulong playerid)
        {
            var data = _col.FindOne(x => x.playerid == playerid);
            return data?.Heartbeat?.roomInstance?.name ?? "not in a room.";
        }

        public static void ClearPlayersHeartbeats()
        {
            foreach (var data in _col.FindAll())
            {
                UpdatePlayerHeartbeat(data.playerid, null, false);
            }
        }

        public static void ClearPlayerHeartbeat(ulong playerId) =>
            UpdatePlayerHeartbeat(playerId, null, false);

        public static void UpdatePlayerHeartbeat(
      ulong playerid,
      RoomInstance? roomInstance,
      bool online = true,
      Platforms platform = Platforms.All,
      DeviceClasses deviceClasses = DeviceClasses.Unknown)
        {
            var data = _col.FindOne(x => x.playerid == playerid);

            if (data != null)
            {
                var hb = data.Heartbeat;
                hb.roomInstance = online ? roomInstance : null;
                hb.isOnline = online;

                _col.Update(data);
            }
            else
            {
                // Create a new heartbeat and assign the current roomInstance
                var hb = CreateDefaultHeartbeat(playerid, platform, deviceClasses);
                hb.roomInstance = roomInstance;
                hb.isOnline = online;

                _col.Insert(new PlayerHeartbeatData
                {
                    iD = (ulong)_col.LongCount() + 1,
                    playerid = playerid,
                    Heartbeat = hb
                });
            }
        }

        public class Heartbeat
        {
            public long serverTime { get; set; }
            public long playerId { get; set; }
            public int statusVisibility { get; set; }
            public int platform { get; set; }
            public int deviceClass { get; set; }
            public int vrMovementMode { get; set; }
            public RoomInstance roomInstance { get; set; } // Can be null
            public string lastOnline { get; set; } // ISO 8601 string
            public bool isOnline { get; set; }
            public string appVersion { get; set; }
        }

        public class FullRoomInstance
        {
            public RoomInstance? roomInstance { get; set; }
            public string? correlationId { get; set; }
        }

        public class RoomInstance
        {
            public long roomInstanceId { get; set; }
            public long roomId { get; set; }
            public long subRoomId { get; set; }
            public string? location { get; set; }
            public int roomInstanceType { get; set; }
            public string? name { get; set; }
            public int maxCapacity { get; set; }
            public bool isFull { get; set; }
            public bool isPrivate { get; set; }
            public bool isInProgress { get; set; }
            [JsonIgnore]
            public string? photonRoomIdYeee { get; set; } // im crack
            public string? voiceServerId { get; set; }
            public string? voiceAuthId { get; set; }
            public int matchmakingPolicy { get; set; }
        }

        public enum MatchmakingErrorCode
        {
            Success,
            NoSuchGame,
            PlayerNotOnline,
            InsufficientSpace,
            EventNotStarted,
            EventAlreadyFinished,
            EventCreatorNotReady,
            BlockedFromRoom,
            ProfileLocked,
            NoBirthday,
            MarkedForDelete,
            JuniorNotAllowed,
            Banned,
            AlreadyInBestInstance,
            InsufficientRelationship,
            UpdateRequired = 16,
            AlreadyInTargetInstance,
            RegistrationRequired,
            UGCNotAllowed,
            NoSuchRoom,
            RoomCreatorNotReady,
            RoomIsNotActive,
            RoomBlockedByCreator,
            RoomBlockingCreator,
            RoomIsPrivate,
            RoomInstanceIsPrivate,
            DeviceClassNotSupported = 30,
            DeviceClassNotSupportedByRoomOwner,
            VRMovementModeNotSupportedByRoomOwner,
            EventIsPrivate = 35,
            RoomInviteExpired = 40,
            NoAvailableRegion = 45,
            NotorietyTooPoor = 50,
            BannedFromRoom = 55
        }
    }
}
