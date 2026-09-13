using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class BotController : Controller
    {
        [HttpPost("/api/bot/player/level_up/{discorduserid}")]
        public async Task<ContentResult> LevelUp(ulong discorduserid)
        {
            string botkey = Request.Headers["Bot-Key"].ToString();
            var newLevel = Request.Form["new_level"].ToString();

            if (botkey != ConfigRewild.Rewild_bot_key)
            {
                return new ContentResult // The people tryna find this api wont get in
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            var account = PlayerDB.GetPlayerByDiscordId(discorduserid);
            await PlayerDB.SetPlayerLevel(int.Parse(newLevel), account.player.Id);
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    message = $"Leveled up user {account?.player.Username} to level {newLevel}"
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [Route("/api/bot/create")]
        public ContentResult CreateAccViaBot()
        {
            string key = HttpContext.Request.Headers["Key"].ToString();
            string steamid = HttpContext.Request.Form["steam_id"].ToString();
            string discordUserId = HttpContext.Request.Form["discord_user_id"].ToString();

            ulong steamid2 = ulong.Parse(steamid);

            if (key == ConfigRewild.Rewild_bot_key)
            {
                var blockedIds = new HashSet<string>
                {
                    "1176571557414445137",
                    "1193883666946998383",
                    "1344328341951615106"
                };

                if (PlayerDB.GetAccountCountByPlatformId(steamid2) >= 1)
                {
                    return new ContentResult
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            value = "You already have a account!"
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                if (blockedIds.Contains(discordUserId))
                {
                    return new ContentResult
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            value = "You require manual verification. Contact @e12354 on Discord"
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                var blockedSteamIds = new HashSet<string>
                {
                    "76561199485696854"

                };

                if (blockedSteamIds.Contains(steamid))
                {
                    return new ContentResult
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            value = "You require manual verification. Contact @e12354 on Discord"
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        eeee = discordUserId, // todo
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }
        }
    }
}
