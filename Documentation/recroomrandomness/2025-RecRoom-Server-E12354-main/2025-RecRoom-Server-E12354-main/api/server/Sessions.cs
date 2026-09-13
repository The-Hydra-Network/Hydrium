using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Security.Principal;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.api.dbs.HeartbeatDB;

namespace Rec_rewild_live_rewrite.api.server
{
    public class Sessions
    {
        private static readonly Random random = new Random();

        public static RoomInstance? CreateRoom(string roomName, string sceneName = "", bool isPrivate = false)
        {
            //const string uuidPrefix = "rewild_live_2023";
            string formattedRoomName = $"^{roomName}";

            if (!string.IsNullOrEmpty(sceneName))
            {
                Console.WriteLine($"[Sessions]: Finding room: \"{roomName}\" with scene id: \"{sceneName}\"");
            }
            else
            {
                Console.WriteLine($"[Sessions]: Finding room: \"{roomName}\"");
            }

            long gameSessionId = random.Next(0x1000, 0x7fffffff);

            RoomDBClasses.RoomRoot roomData = RoomDB.GetRoomByName(roomName);
            if (roomData == null)
            {
                Console.WriteLine($"[Sessions]: Room \"{roomName}\" not found.");
                return null;
            }

            Console.WriteLine($"[Sessions]: {roomName} found! Joining...");

            var firstSubRoom = roomData.SubRooms?.FirstOrDefault();
            string dataBlob = firstSubRoom?.CurrentSave?.DataBlob ?? string.Empty;
            long instanceNumber = random.Next(1000, 999999999);
            Guid instanceId = Guid.NewGuid();

            string photonSuffix = isPrivate
                ? $"_private-room-{instanceNumber}-{instanceId}"
                : "room";

            var session = new RoomInstance
            {
                roomInstanceId = instanceNumber,
                roomId = (long)roomData.RoomId,
                subRoomId = (long)roomData.SubRooms[0].SubRoomId,
                location = roomData.SubRooms[0].UnitySceneId,
                roomInstanceType = 0,
                name = formattedRoomName,
                maxCapacity = roomData.SubRooms[0].MaxPlayers,
                isFull = false,
                isPrivate = isPrivate,
                isInProgress = false,
                photonRoomIdYeee = photonSuffix,
                voiceServerId = null, // this not supported and game may explode when connecting to a server that dont exist
                voiceAuthId = null,
                matchmakingPolicy = 0
            };

            if (!string.IsNullOrEmpty(sceneName))
            {
                ApplySceneSettings(session, roomData, roomName, sceneName, isPrivate);
            }
            else
            {
                ApplyRandomPublicSubroom(session, roomData, roomName, isPrivate);
            }

            return session;
        }

        public static RoomInstance CreateDorm(ulong id, string name)
        {
            Random rng = new Random();

            long RandomNumber = rng.Next(1000, 999999999);

            ulong DormId = PlayerDB.GetDormId(id);

            RoomDBClasses.RoomRoot dorm = RoomDB.GetRoom(DormId);
            if (dorm == null)
            {
                PlayerDB.CreateDormForPlayerId(id);
            }
            long instanceNumber = random.Next(1000, 999999999);
            Guid instanceId = Guid.NewGuid();

            string photonSuffix = $"Rec-Rewild-Dorm-{instanceNumber}-{instanceId}";
            var session = new RoomInstance
            {
                roomInstanceId = RandomNumber,
                roomId = (long)DormId,
                subRoomId = (long?)dorm.SubRooms.FirstOrDefault()?.SubRoomId ?? 0,
                location = "76d98498-60a1-430c-ab76-b54a29b7a163",
                roomInstanceType = 0,
                name = $"@{name}'s Dorm",
                maxCapacity = 4,
                isFull = false,
                isPrivate = true,
                isInProgress = false,
                photonRoomIdYeee = photonSuffix,
                voiceServerId = null, // this not supported and game may explode when connecting to a server that dont exist
                voiceAuthId = null,
                matchmakingPolicy = 0
            };

            RoomDB.IncreaseRoomVisit(DormId);

            return session;
        }

        private static void ApplySceneSettings(RoomInstance session, RoomDBClasses.RoomRoot roomData, string roomName, string sceneName, bool isPrivate)
        {
            foreach (var subroom in roomData.SubRooms)
            {
                if (subroom.Name.Equals(sceneName, StringComparison.OrdinalIgnoreCase))
                {
                    session.subRoomId = (long)subroom.SubRoomId;
                    session.location = subroom.UnitySceneId;

                    if (!isPrivate)
                    {
                        //session.photonRoomId = $"{roomName}-hello-room-{sceneName}";
                    }
                    return;
                }
            }

            Console.WriteLine($"Scene \"{sceneName}\" not found in room \"{roomName}\".");
        }

        private static void ApplyRandomPublicSubroom(RoomInstance session, RoomDBClasses.RoomRoot roomData, string roomName, bool isPrivate)
        {
            var publicSubrooms = roomData.SubRooms
                .Where(sub => sub.Accessibility == RoomDBClasses.RoomAccessibility.Public)
                .ToList();

            if (publicSubrooms.Count == 0)
            {
                Console.WriteLine($"No public subrooms found for \"{roomName}\".");
                return;
            }

            var selectedSubroom = publicSubrooms[random.Next(publicSubrooms.Count)];

            session.subRoomId = (long)selectedSubroom.SubRoomId;
            session.location = selectedSubroom.UnitySceneId;

            if (!isPrivate)
            {
                //session.photonRoomId = $"{roomName}-hello-room-{selectedSubroom.name}";
            }
        }
    }
}
