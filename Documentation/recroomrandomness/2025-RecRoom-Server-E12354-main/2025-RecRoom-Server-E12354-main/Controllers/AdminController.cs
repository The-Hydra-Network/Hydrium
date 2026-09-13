using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using RewildLiveSource.Controllers;
using static Rec_rewild_live_rewrite.api.server.Moderation_Detail;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class AdminController : Controller
    {
        private const string AuthCookieName = "Authorization";

        [HttpGet("/admin/v{version}/login")]
        public IActionResult Login(int version)
        {
            var filePath = Path.Combine(
                Environment.CurrentDirectory, 
                "Web", 
                "Admin", 
                $"LoginV{version}.html"
            );

            if (!System.IO.File.Exists(filePath))
                return NotFound();

            return PhysicalFile(filePath, "text/html");
        }

        [HttpPost("/api/web/admin/login")]
        public ContentResult AdminLoginAPI([FromForm] string username, [FromForm] string password)
        {
            try
            {

                var loginResult = PlayerDB.GetAccountPassword(username, password, isAdminPanel: true);

                if (!loginResult.success)
                {
                    return new ContentResult
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = loginResult.success,
                            error = loginResult.error
                        }),
                        ContentType = "text/html"
                    };
                }

                string token = ClientSecurity.RefreshToken_Web(loginResult.accid);

                Response.Cookies.Append(AuthCookieName, token, new Microsoft.AspNetCore.Http.CookieOptions
                {
                    Expires = DateTime.Now.AddHours(24),
                    HttpOnly = true,
                    Secure = true,
                    SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict
                });          

                Response.Redirect($"/admin/home/v4");

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(loginResult),
                    ContentType = "text/html"
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AdminLoginAPI] Exception: {ex}");
                return new ContentResult
                {
                    Content = "Invalid username or password. Please try again.",
                    ContentType = "text/html"
                };
            }
        }

        [HttpGet("/admin/home/v{version}")]
        public IActionResult AdminHomeVVersion(int version)
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
            {
                return Redirect("/admin/v4/login");
            }

            var filePath = Path.Combine(
                Environment.CurrentDirectory, 
                "Web", 
                "Admin", 
                "Home", 
                $"HomeV{version}.html"
            );

            if (!System.IO.File.Exists(filePath))
                return NotFound();

            return PhysicalFile(filePath, "text/html");
        }

        [Route("/admin/api/dashboard_data")]
        public ContentResult DashboardData()
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            int OnlinePlayers = NotificationsController.WebSockets.Count;
            string AdminMOTD = "Go wild like Rec Rewild!";
            long bytesUsed = GC.GetTotalMemory(false);
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    total_players = PlayerDB.GetPlayerCount(),
                    online_players = OnlinePlayers,
                    banned_players = 0,
                    total_rooms = RoomDB.GetAllRoomsCount(),
                    total_inventions = 0,
                    mem_usage = FormatBytes(bytesUsed),
                    total_clubs = 0,
                    MOTD = AdminMOTD,
                    diskspace = 0,
                    quick_link_sidebar = new List<Object>
                    {
                        new
                        {
                            Title = "Reports",
                            Button_Title = "View Reports",
                            Button_url = "/admin/reports/all",
                            Button_icon = "",
                        }
                    },
                    quick_link = new List<Object>
                    {
                        new
                        {
                            Title = "I just don't know!",
                            disc = "So I'll put the index page.",
                            Button_Title = "Go",
                            Button_url = "/",
                            Button_Color = "#ff0",
                        },
                         new
                        {
                            Title = "Reports",
                            disc = "vew players Reports",
                            Button_Title = "View Reports",
                            Button_url = "/admin/reports/all",
                            Button_Color = "#aaa",
                        },
                         new
                        {
                            Title = "rewild net home page!",
                            disc = "go to rewild net home page",
                            Button_Title = "Go",
                            Button_url = "/rewild_net/home",
                            Button_Color = "#e9a",
                        }
                    },
                }),
                ContentType = "application/json"
            };
        }

        [HttpGet("/admin/api/players")]
        public ContentResult AdminGetPlayersAPI()
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;
            var query = HttpContext.Request.Query;

            string? id = query["id"];
            string? displayName = query["displayName"];
            string? minLevel = query["minLevel"];
            string? jrState = query["jrState"];
            string? platformId = query["platformId"];
            string? deviceId = query["deviceId"].FirstOrDefault();
            bool onlyBannedPlayers = bool.TryParse(query["banned"], out var b) && b;
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(PlayerDB.Find_all_player_filtered(id, displayName, minLevel, jrState, platformId, deviceId, onlyBannedPlayers)),
                ContentType = "application/json"
            };
        }

        [HttpGet("/admin/api/rooms")]
        public IActionResult AdminGetRoomsAPI()
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            return Ok(RoomDB.GetAllRooms());
        }

        [HttpPost("/admin/api/create_player")]
        public ContentResult AdminCreatePlayerAPI()
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            account_data NewAccount = null;
            // ADD oculus support later when we get that ingame
            string platformid = Request.Form["platform_id"];

            Platforms platform = Platforms.All;
            if (platformid.StartsWith("765611"))
            {
                platform = Platforms.Steam;
            }
            else
            {
                platform = Platforms.Oculus;
            }

            var acc = PlayerDB.CreateAccount(Platforms.Steam, ulong.Parse(platformid), Request.Form["device_id"], ulong.Parse(Request.Form["discord_id"]), out NewAccount);
            return new ContentResult
            {
                Content = NewAccount.accountId.ToString(),
                ContentType = "application/json"
            };
        }

        [HttpPost("/admin/api/ban_player")]
        public ContentResult AdminAPIBanPlayer()
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            string playerIdStr = Request.Form["playerId"];
            string durationStr = Request.Form["duration"];
            string categoryStr = Request.Form["category"];
            string message = Request.Form["message"];

            if (!ulong.TryParse(playerIdStr, out ulong playerId))
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Invalid Player Id"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (playerId == 1)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Cannot ban this player"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (PlayerDB.CheckDevFlag(playerId))
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Cannot ban this player"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (!int.TryParse(durationStr, out int duration) || duration < 0)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Invalid duration"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (!Enum.TryParse<Moderation_Detail.ReportCategory>(categoryStr, ignoreCase: true, out var category))
            {
                category = Moderation_Detail.ReportCategory.Moderator;
            }

            string result = PlayerDB.Set_moderation_block(
                playerId,
                category,
                duration,
                gameSessionId: -1,
                isHostKick: false,
                message: message,
                playerIdReporter: 0,
                isBan: true,
                bannedByPlayerId: account.Id
            );

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = ""
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/admin/api/kick_player")]
        public ContentResult KickPlayer()
        {
                var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
                if (error != null)
                    return error;

                string playerid = HttpContext.Request.Form["playerId"].ToString();
                
                if (!ulong.TryParse(playerid, out ulong playerId))
                {
                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            message = "Invalid player ID"
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                if (playerId == account.Id)
                {
                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            message = "You can't kick yourself!"
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }
                /*
                if (player_db_file.CheckDevFlag(playerId))
                {
                    return new ContentResult()
                    {
                        Content = "{\"success\":false,\"message\":\"You can't kick developers silly!\"}",
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }*/

                PlayerDB.Set_moderation_block(
                    playerId,
                    ReportCategory.Moderator,
                    duration: 1,
                    gameSessionId: -1,
                    isHostKick: true,
                    message: "You have been kicked.",
                    playerIdReporter: null,
                    isBan: false,
                    bannedByPlayerId: account.Id
                );
                var acc = PlayerDB.GetFullAccount(playerId);
            Webhook.Send(
                    account.Id,
                    "modacc",
                    "Reporting info - Player",
                    $"({account.Id}) @{account.Username} [DEV] kicked player ({playerId}) @{acc.player.Username} {acc.player.DisplayName}",
                    5898927
                );

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        message = "Kicked player!"
                    }),
                    ContentType = "application/json"
                };
            
        }




        [HttpGet("/admin/api/account/bulk")]
        public ContentResult AccountBulk([FromQuery] List<ulong> id)
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = PlayerDB.GetAccountsBulkAdmin(id),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/admin/api/send_annoucement")]
        public ContentResult AdminAPISendAnnoucement([FromForm] string message, [FromForm] ulong playerId)
        {
            var (account, error) = AuthHelper.ValidateTokenDev(HttpContext);
            if (error != null)
                return error;

            var response = WebsocketEvents.createResponse_msg(message, playerId);
            Notifications.SendToAll(JsonConvert.SerializeObject(response));

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    message = "sent!"
                }),
                ContentType = "application/json"
            };
        }

        [HttpPost("/admin/api/{roomId}/{subroomId}/set_room_datablob")]
        public ContentResult set_room_datablob([FromForm] string dataBlob, ulong roomId, ulong subroomId)
        {
            /*var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;*/

            try 
            {
                var e = RoomDB.SetRoomSubroomRoomFile(roomId, subroomId, dataBlob, "", 1, currentplatform: Platforms.All);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        message = "unknown error!"
                    }),
                    ContentType = "application/json"
                };
            }

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    message = "success!"
                }),
                ContentType = "application/json"
            };
        }

        string FormatBytes(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB", "TB" };
            double len = bytes;
            int order = 0;

            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len /= 1024;
            }

            return $"{len:0.0} {sizes[order]}";
        }
    }
}
