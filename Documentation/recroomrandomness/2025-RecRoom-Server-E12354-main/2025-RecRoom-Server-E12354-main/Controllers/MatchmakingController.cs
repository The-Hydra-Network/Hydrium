using Microsoft.AspNetCore.Mvc;
using Rec_rewild_live_rewrite.api.dbs;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.api.dbs.HeartbeatDB;
using Rec_rewild_live_rewrite.api.server;
using System.Text;
using System.IdentityModel.Tokens.Jwt;
using Rec_rewild_live_rewrite.api;
using static System.Runtime.InteropServices.JavaScript.JSType;
using static Rec_rewild_live_rewrite.api.server.Classes.RRPlus;
using Discord.Net;
using System.Net.Http.Headers;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("Matchmaking")]
    public class MatchmakingController : ControllerBase
    {
        public RoomInstance DefaultSessionDorm = new RoomInstance
        {
            isFull = false,
            isInProgress = false,
            isPrivate = true,
            location = "76d98498-60a1-430c-ab76-b54a29b7a163",
            maxCapacity = 4,
            name = "^" + "DormRoom",
            roomId = 1,
            roomInstanceId = 1,
            roomInstanceType = 0,
            voiceAuthId = null,
            voiceServerId = null,
            subRoomId = 1,
            matchmakingPolicy = 0,
        };


        [HttpPost("player/login")]
        [HttpPost("player/exclusivelogin")]
        public async Task<ContentResult> PlayerLogin()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var relationships = FriendsDB.GetRelationships(account.Id);

            List<ulong> mutualFriendIds = relationships.Where(r => r.RelationshipType == RelationshipType.Friend).Select(r => r.PlayerID).Distinct().ToList();

            var message = new MessageData
            {
                FromPlayerId = (ulong)account.Id,
                Id = (ulong)new Random().Next(),
                SentTime = DateTime.UtcNow,
                Type = WebsocketEvents.MessageType.FriendStatusOnline,
                Data = "Online",
                RoomId = 1
            };

            foreach (var friendId in mutualFriendIds)
            {
                if (SettingsDB.GetPlayerSettingValue("ReceiveFriendOnlineStatus", friendId) == "False")
                {
                    mutualFriendIds.Remove(friendId);
                }
            }

            var ws_message = JsonConvert.SerializeObject(WebsocketEvents.CreateMessageResponse(message));

            await Notifications.SendToPlayers(mutualFriendIds, ws_message);

            return new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [Route("player/logout")]
        public ContentResult PlayerLogout()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            HeartbeatDB.UpdatePlayerHeartbeat(account.Id, null, online: false);
            Webhook.Send(account.Id,
                   "prod",
                   "Matchmaking info",
                   $"({account.Id}) @{account.Username} {account.DisplayName} is logging out of **2023**",
                   5898927
               );
            return new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPut("player/statusvisibility")]
        public IActionResult StatusVisibility([FromForm] int statusVisibility)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            HeartbeatDB.UpdateStatusVisibility(account.Id, statusVisibility);
            return Ok("");
        }

        [HttpPost("player/heartbeat")]
        public IActionResult PlayerHeartbeat()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Content(System.Text.Json.JsonSerializer.Serialize(HeartbeatDB.GetPlayerHeartbeat(account.Id)), "application/json");
        }

        [HttpPost("matchmake/none")]
        public ContentResult Matchmaking_none()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            HeartbeatDB.UpdatePlayerHeartbeat(account.Id, DefaultSessionDorm);
            var CurrentHeartbeat = JsonConvert.SerializeObject(HeartbeatDB.GetPlayerHeartbeat(account.Id));

            return new ContentResult()
            {
                Content = CurrentHeartbeat,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("matchmake/dorm")]
        public IActionResult MatchmakeToDorm([FromForm] string correlationId)
        {
            string auth = HttpContext.Request.Headers["Authorization"];
            if (string.IsNullOrEmpty(auth))
                return new ContentResult { Content = "", ContentType = "application/json", StatusCode = 401 };
            string playerdata = ClientSecurity.DecodeToken(auth);
            if (playerdata == null || playerdata.Contains("error_token"))
                return new ContentResult { Content = "", ContentType = "application/json", StatusCode = 401 };

            var account = JsonConvert.DeserializeObject<player_info>(playerdata);

            string token = auth.Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

            int platformVal = int.Parse(jwt.Payload["platform"].ToString());
            Platforms platform = Enum.IsDefined(typeof(Platforms), platformVal)
                ? (Platforms)platformVal
                : Platforms.All;
            var doesPlayerDormExist = RoomDB.DoesPlayerDormExist(account.Id);
            if (doesPlayerDormExist == false)
            {
                PlayerDB.CreateDormForPlayerId(account.Id);
            }

            try
            {
                var session = Sessions.CreateDorm(account.Id, account.Username);
                if (session == null)
                {
                    var hb = HeartbeatDB.GetPlayerHeartbeat(account.Id);

                    return Ok(hb);
                }

                HeartbeatDB.UpdatePlayerHeartbeat(account.Id, session, true, platform, DeviceClasses.Unknown);
                RoomDB.IncreaseRoomVisit((ulong)session.roomId);

                Webhook.Send(
                    account.Id,
                    "prod",
                    "Matchmaking Info",
                    $"({account.Id}) @{account.Username} is going to their Dorm Room",
                    5898927,
                    "",
                    (ulong)session.roomId
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
            }

            return Content(System.Text.Json.JsonSerializer.Serialize(new FullRoomInstance
            {
                roomInstance = HeartbeatDB.GetPlayerHeartbeat(account.Id)?.roomInstance,
                correlationId = correlationId
            }), "application/json");
        }

        public class MatchmakeV2Request
        {
            public int? JoinMode { get; set; }
            public string CorrelationId { get; set; }
        }


        [HttpPost("matchmake/v2/room/{RoomId}")]
        public IActionResult MatchmakeRoom(ulong RoomId, [FromBody] MatchmakeV2Request request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (PlayerDB.HasActiveModerationBlock(account.Id))
            {
                var heartbeat = HeartbeatDB.GetPlayerHeartbeat(account.Id);

                return Ok(heartbeat);
            }

            var room = RoomDB.GetRoom(RoomId);

            string roomName = room.Name ?? "";
            ulong roomId = room.RoomId;

            string roomIdentifier = $"^{roomName}";
            string tmp = "";
            bool isPrivateRoom = request.JoinMode == 2;
            RoomInstance session = isPrivateRoom
                ? Sessions.CreateRoom(roomName, "", true)
                : Sessions.CreateRoom(roomName);
            if (isPrivateRoom)
            {
                tmp = "[PRIVATE INSTANCE]";
            }
            RoomDB.IncreaseRoomVisit(roomId);
            PlayerDB.SetRecentRooms(account.Id, roomId);

            if (session == null)
            {
                var heartbeat = JsonConvert.SerializeObject(HeartbeatDB.GetPlayerHeartbeat(account.Id));

                return Ok(heartbeat);
            }

            HeartbeatDB.UpdatePlayerHeartbeat(account.Id, session);
            var CurrentHeartbeat = JsonConvert.SerializeObject(HeartbeatDB.GetPlayerHeartbeat(account.Id));
            Webhook.Send(
                 account.Id,
                "prod",
                "Matchmaking Info",
                $"({account.Id}) @{account.Username} is going to ^{roomName} {tmp}",
                5898927,
                "",
                roomId
            );

            return Content(System.Text.Json.JsonSerializer.Serialize(new FullRoomInstance
            {
                roomInstance = HeartbeatDB.GetPlayerHeartbeat(account.Id)?.roomInstance,
                correlationId = request.CorrelationId
            }), "application/json");
        }

        [HttpPost("matchmake/v2/room/{RoomId}/{SubRoomId}")]
        public IActionResult MatchmakeRoom(ulong RoomId, ulong SubRoomId, [FromBody] MatchmakeV2Request request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (PlayerDB.HasActiveModerationBlock(account.Id))
            {
                var heartbeat = HeartbeatDB.GetPlayerHeartbeat(account.Id);

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        heartbeat.playerId,
                        heartbeat.appVersion,
                        heartbeat.deviceClass,
                        errorCode = MatchmakingErrorCode.Banned,
                        heartbeat.isOnline,
                        heartbeat.lastOnline,
                        heartbeat.platform,
                        roomInstance = (string?)null,
                        heartbeat.statusVisibility,
                        heartbeat.vrMovementMode
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            var room = RoomDB.GetRoom(RoomId);

            string roomName = room.Name ?? "";
            ulong roomId = room.RoomId;

            string roomIdentifier = $"^{roomName}";
            string subroomname = RoomDB.get_subroom_from_id(RoomId, SubRoomId);
            string tmp = "";
            bool isPrivateRoom = request.JoinMode == 2;
            RoomInstance session = isPrivateRoom
                ? Sessions.CreateRoom(roomName, subroomname, true)
                : Sessions.CreateRoom(roomName, subroomname);
            if (isPrivateRoom)
            {
                tmp = "[PRIVATE INSTANCE]";
            }
            RoomDB.IncreaseRoomVisit(roomId);
            PlayerDB.SetRecentRooms(account.Id, roomId);

            if (session == null)
            {
                var heartbeat = JsonConvert.SerializeObject(HeartbeatDB.GetPlayerHeartbeat(account.Id));

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(heartbeat),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            HeartbeatDB.UpdatePlayerHeartbeat(account.Id, session);

            var CurrentHeartbeat = JsonConvert.SerializeObject(HeartbeatDB.GetPlayerHeartbeat(account.Id));
            Webhook.Send(
                 account.Id,
                "prod",
                "Matchmaking Info",
                $"({account.Id}) @{account.Username} is going to ^{roomName}.{subroomname} {tmp}",
                5898927,
                "",
                roomId
            );

            return Content(System.Text.Json.JsonSerializer.Serialize(new FullRoomInstance
            {
                roomInstance = HeartbeatDB.GetPlayerHeartbeat(account.Id)?.roomInstance,
                correlationId = request.CorrelationId
            }), "application/json");
        }

        [HttpGet("rooms/requiring/{requirement}")]// ["RecCenter", "test123"]
        public ContentResult RoomsRequiring(string requirement)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            requirement = requirement?.ToLowerInvariant();

            string jsonResponse = requirement switch
            {
                "developer" => "[]",
                "rrplus" => "[]",
                _ => "[]"
            };

            return new ContentResult
            {
                Content = jsonResponse,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("player")]
        public IActionResult GetPlayerHeartbeatById([FromQuery] List<ulong> id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (id == null || id.Count == 0)
            {
                return Ok(ConfigRewild.Bracket);
            }

            var heartbeats = new List<object>();

            foreach (var playerId in id)
            {
                var heartbeat = HeartbeatDB.GetPlayerHeartbeat(playerId);
                if (heartbeat != null)
                    heartbeats.Add(heartbeat);
            }

            return Ok(heartbeats);
        }

        [HttpGet("player/qos")]
        public async Task<IActionResult> GetPlayerQos()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "QOS.json");
            string content = await System.IO.File.ReadAllTextAsync(path);
            return Ok(content);
        }

        [HttpGet("player/connection-info")]
        public IActionResult GetPlayerConnectionInfo([FromQuery] ulong roomInstanceId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var heartbeat = HeartbeatDB.GetPlayerHeartbeat(account.Id);

            return Ok(new
            {
                success = true,
                value = new
                {
                    photonAuthToken = ClientSecurity.Createphotonauthtoken(account.Id),// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNTAzMjY5NzUwIiwicm4ucGxhdGlkIjoiNzY1NjExOTk2MTM4Mzg5MjgiLCJybi5wbGF0IjoiMCIsInJuLmRldmljZWNsYXNzIjoiMiIsInJuLmVudiI6InByb2QiLCJleHAiOjE3NTQzMTYzNTMsImF1ZCI6ImM4YWFhODYwLTFjMGMtNDMzOC1iYWYyLWE1NTNjMDFiMmE1MyJ9.qY_O0tNeZeH2QKuPUIQPhRPnOpp2uhZn3b8eo-ybV3w",
                    photonRealtimeAppId = ConfigRewild.PhotonRealtimeId,
                    photonVoiceAppId = ConfigRewild.PhotonVoiceId,
                    photonChatAppId = ConfigRewild.PhotonChatId,
                    photonRegion = "us", // qos us-east1
                    photonRoomId = heartbeat.roomInstance.photonRoomIdYeee,// "abcdefgh-ijkl-mnop-qrst-upwxyz123456",
                    voiceConnectionInfo = (string?)null,
                    voiceServerId = (string?)null,
                    experiments = new
                    {
                        networkTransformSyncInterval = 10.0,
                        shouldUseUnreliableOnChange = false,
                        shouldAvoidDiscontinuityRPCs = true,
                        shouldAvoidRedundantDiscontinuity = false,
                        r2RuntimeStaticBaking = true,
                        r2AutoEmbodiment = true,
                        r2RuntimeStaticBakingMinShapeThreshold = 1,
                        r2UseCheapReplicas = true,
                        shouldUseGameServerNetworking = false // true make it connect to 127.0.0.1:7777 qos, false it connects to photon servers ns.exitgames.com
                    }
                }
            });
        }

        [HttpPut("player/gameserverregionpings")]
        public IActionResult UpdatePlayerGameServerRegionPings()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok("");
        }

        [HttpPost("roominstance/{roomInstanceId}/reportjoinresult")]
        public IActionResult ReportJoinResultForRoomInstanceId(ulong roomInstanceId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok();
        }
    }
}
