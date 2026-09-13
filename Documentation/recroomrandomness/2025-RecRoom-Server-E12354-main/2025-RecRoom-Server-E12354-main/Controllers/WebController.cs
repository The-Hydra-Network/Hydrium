using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.api.server;
using System.ComponentModel.DataAnnotations;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class WebController : ControllerBase
    {
        [Route("/")]
        public IActionResult Index()
        {
            var filePath = Path.Combine(Environment.CurrentDirectory, "Web", "Index.html");

            if (!System.IO.File.Exists(filePath))
                return NotFound();

            return PhysicalFile(filePath, "text/html");
        } 

        [Route("/robots.txt")]
        public IActionResult Robots()
        {
            var content = string.Join(Environment.NewLine, new[]
            {
                "User-agent: *",
                "Disallow: /admin/v4/login",
                "Disallow: /admin/v4/home",
                "Disallow: /admin/v5/login",
                "Disallow: /admin/v5/home"
            });

            return Content(content, "text/plain");
        }

        [HttpGet("/favicon.ico")]
        public IActionResult Favicon()
        {
            var filePath = Path.Combine(Environment.CurrentDirectory, "Web", "favicon.png");

            if (!System.IO.File.Exists(filePath))
                return NotFound();

            return PhysicalFile(filePath, "image/x-icon");
        }

        [HttpGet("/ns")]
        public IActionResult ns([FromQuery(Name = "v"), Required] string Version)
        {
            if (Version == "20250731")
            {
                return Ok(new
                {
                    Accounts = "https://recrewildtest.oldrec.net/Accounts",
                    API = "https://recrewildtest.oldrec.net",
                    AI = "https://recrewildtest.oldrec.net/Ai",
                    Auth = "https://recrewildtest.oldrec.net/Auth",
                    BugReporting = "https://recrewildtest.oldrec.net",
                    Cards = "https://recrewildtest.oldrec.net",
                    CDN = "https://cdn.rec.net",//"https://recrewildtest.oldrec.net/cdn",
                    Chat = "https://recrewildtest.oldrec.net/chat",
                    Clubs = "https://recrewildtest.oldrec.net/clubs",
                    CMS = "https://recrewildtest.oldrec.net/cms",
                    Commerce = "https://recrewildtest.oldrec.net/Commerce",
                    Data = "https://recrewildtest.oldrec.net",
                    DataCollection = "https://recrewildtest.oldrec.net",
                    Discovery = "https://recrewildtest.oldrec.net",
                    Econ = "https://recrewildtest.oldrec.net",
                    GameLogs = "https://recrewildtest.oldrec.net",
                    Geo = "https://recrewildtest.oldrec.net",
                    Images = "https://recrewildtest.oldrec.net/img/",
                    Leaderboard = "https://recrewildtest.oldrec.net/server/Leaderboard",
                    Link = "https://recrewildtest.oldrec.net/link",
                    Lists = "https://recrewildtest.oldrec.net/lists",
                    Matchmaking = "https://recrewildtest.oldrec.net/Matchmaking",
                    Moderation = "https://recrewildtest.oldrec.net",
                    Notifications = "https://recrewildtest.oldrec.net/Notifications",
                    PlatformNotifications = "https://recrewildtest.oldrec.net/Notifications",
                    PlayerSettings = "https://recrewildtest.oldrec.net/server/PlayerSettings",
                    RoomComments = "https://recrewildtest.oldrec.net/RoomComments",
                    RoomieIntegrations = "https://recrewildtest.oldrec.net/Roomie",
                    Rooms = "https://recrewildtest.oldrec.net/Room_server",
                    Storage = "https://recrewildtest.oldrec.net/server/Storage",
                    Strings = "https://recrewildtest.oldrec.net/Strings",
                    StringsCDN = "https://recrewildtest.oldrec.net/StringsCDN",
                    Studio = "https://recrewildtest.oldrec.net/Studio",
                    Thorn = "https://recrewildtest.oldrec.net/Thorn",
                    Videos = "https://recrewildtest.oldrec.net/videodir",
                    WWW = "https://recrewildtest.oldrec.net"
                });
            }
            return BadRequest("");
        }
    }
}
