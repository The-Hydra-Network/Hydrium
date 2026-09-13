using System.Text;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Newtonsoft.Json.Linq;
using Discord.Net;
using System.Security.Principal;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class AuthController : ControllerBase
    {
        [HttpGet("/Auth/eac/challenge")]
        public ContentResult EACChallenge()
        {
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject("test"),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/Auth/cachedlogin/forplatformid/{platform}/{platform_id}")] 
        public ContentResult CachedLogins(int platform, ulong platform_id)
        {
            Platforms platformEnum;

            if (Enum.IsDefined(typeof(Platforms), platform))
            {
                platformEnum = (Platforms)platform;
            }
            else
            {
                platformEnum = Platforms.All;
            }
            List<AccountLogin>? accounts = null;
            PlayerDB.GetLogins(platformEnum, platform_id, out accounts);
            if (accounts != null && accounts.Count > 0)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(accounts),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            Webhook.Send(1,
                "mod",
                "Reporing Info - No Cached Logins",
                $"A cached login was attempted for platform {platformEnum} with platform ID {platform_id}, but no matching accounts were found.",
                5898927
            );
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/Auth/connect/token")]
        public async Task<ContentResult> ConnectToken(int platform, ulong platform_id)
        {
            HttpContext.Request.EnableBuffering(); 
            using (var reader = new StreamReader(HttpContext.Request.Body, encoding: Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true))
            {
                var body = await reader.ReadToEndAsync();
                Console.WriteLine("[RAW BODY]");
                Console.WriteLine(body);
                HttpContext.Request.Body.Position = 0;
            }
            string token = null;
            string? temp2 = HttpContext.Request.Headers["Authorization"];
            string? Ip = HttpContext.Request.Headers["CF-Connecting-IP"].FirstOrDefault();
            Guid myuuid = Guid.NewGuid();
            string guid = myuuid.ToString();
            string? grant_type = "";

            try
            {
                grant_type = HttpContext.Request.Form["grant_type"];
            }
            catch
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            ulong accid = 0;
            string? device_id = "";
            string? username = "";
            string? password = "";
            string? platform_auth = HttpContext.Request.Form["platform_auth"];
            string? user_agent = "";
            string? ver = "";

            try
            {
                accid = ulong.Parse(HttpContext.Request.Form["account_id"]);
                device_id = HttpContext.Request.Form["device_id"];
                user_agent = HttpContext.Request.Headers["User-Agent"];
                platform = int.Parse(HttpContext.Request.Form["platform"]);
                platform_id = ulong.Parse(HttpContext.Request.Form["platform_id"]);
                username = HttpContext.Request.Form["username"];
                password = HttpContext.Request.Form["password"];
                platform_auth = HttpContext.Request.Form["platform_auth"];
                ver = HttpContext.Request.Form["ver"];
              
                // Rec Room Studio uses a different user agent
                
                if (user_agent != "BestHTTP")
                {
                    return new ContentResult()
                    {
                        Content = "If you see this, you're a stupid skid and you should 1. stop using http debugger 2. go outside for once 3. if you are from eq then stop. eq allows proxys but we dont",
                        ContentType = "What a fucking loser ",
                        StatusCode = 200
                    };
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }

            Console.WriteLine($"{grant_type} : {accid}");

            if (grant_type == "password") // Rewrite this codeeeeeeeeeeeeeeeeeee
            {
                try
                {
                    string? Username = HttpContext.Request.Form["username"];
                    string? Pass = HttpContext.Request.Form["password"];
                    //var loginResult = PlayerDB.GetAccountPassword(Username, Pass);
                    //string Token = ClientSecurity.RefreshToken_Web(loginResult.Value.accountId);
                    //if (Token == null)
                        goto token_err;
                    /*return new ContentResult()
                    {
                        Content = "{\"access_token\":\"" + Token + "\",\"error_description\":\"\",\"error\":\"\",\"refresh_token\":\"" + guid + "\",\"key\":\"\"}",
                        ContentType = "application/json",
                        StatusCode = 200
                    };*/
                }
                catch
                {
                    return new ContentResult()
                    {
                        Content = "{\r\n   \"access_token\" : null,\r\n   \"error\" : \"invalid_grant\",\r\n   \"error_description\" : \"invalid_username_or_password\",\r\n   \"key\" : null,\r\n   \"refresh_token\" : null\r\n}\r\n",
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }
            }

            if (grant_type == "cached_login")
            {
                ulong steamidticket = 0;
                Console.WriteLine("account cached");
                if (!string.IsNullOrEmpty(platform_auth))
                {
                    string unescaped = System.Net.WebUtility.UrlDecode(platform_auth);
                    Console.WriteLine("[PLATFORM AUTH (Decoded)]");
                    Console.WriteLine(unescaped);

                    var platformAuthJson = JsonConvert.DeserializeObject<Dictionary<string, string>>(unescaped);
                    if (platformAuthJson != null && platformAuthJson.TryGetValue("Ticket", out string ticket))
                    {
                        Console.WriteLine("[Parsed Ticket]");
                        Console.WriteLine(ticket);

                        using (var client = new HttpClient())
                        {
                            var url = $"https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1?key={ConfigRewild.SteamAPIKey}&appid=471710&ticket={ticket}";
                            var response = await client.GetAsync(url);
                            string result = await response.Content.ReadAsStringAsync();
                            Console.WriteLine("[Steam Auth Response]");
                            Console.WriteLine(result);

                            var steamAuthResponse = JsonConvert.DeserializeObject<SteamAuthResponse>(result);
                            if (steamAuthResponse != null && steamAuthResponse.response != null && steamAuthResponse.response.paramsData != null)
                            {
                                if (ulong.TryParse(steamAuthResponse.response.paramsData.steamid, out ulong steamIdFromTicket))
                                {
                                    steamidticket = steamIdFromTicket;
                                    Console.WriteLine("[Parsed SteamID from Ticket]");
                                    Console.WriteLine(steamidticket);
                                }
                                else
                                {
                                    return new ContentResult()
                                    {
                                        Content = "{\"access_token\":\"" + "\",\"error_description\":\"Cannot verify steam ticket\",\"error\":\"steam_ticket\",\"refresh_token\":\"" + "\",\"key\":\"\"}",
                                        ContentType = "application/json",
                                        StatusCode = 200
                                    };
                                }
                            }
                            else
                            {
                                return new ContentResult()
                                {
                                    Content = "{\"access_token\":\"" + "\",\"error_description\":\"Cannot verify steam ticket\",\"error\":\"steam_ticket\",\"refresh_token\":\"" + "\",\"key\":\"\"}",
                                    ContentType = "application/json",
                                    StatusCode = 200
                                };
                            }
                        }
                    }
                }
                var accountData = PlayerDB.GetFullAccount(accid);

                Platforms platformparsed = Enum.IsDefined(typeof(Platforms), platform) ? (Platforms)platform : Platforms.All;
                string request_url = $"{Request.Scheme}://{Request.Host}";
                token = ClientSecurity.RefreshToken(temp2, accid, platform, platform_id, steamidticket, request_url, platformparsed);
                if (token == null)
                    goto token_err;
                if (string.IsNullOrEmpty(token))
                {
                    goto token_err;
                }
                string playerData = ClientSecurity.DecodeToken(token).ToString();
                player_info account = JsonConvert.DeserializeObject<player_info>(playerData);

                Webhook.Send(account.Id,
                    "prod",
                    "Matchmaking info",
                    $"({account.Id}) @{account.Username} {account.DisplayName} is logging in to **{ver}** on the platform **{platformparsed.ToString()}**",
                    5898927
                );
                PlayerDB.SetPlayerDeviceId(device_id, account.Id);
                PlayerDB.SetLastLoginTime(account.Id);
                PlayerDB.AddIpAddress(account.Id, Ip);
                PlayerDB.ResetCheerCreditIfNewDay(account.Id);

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        access_token = token,
                        expires_in = 999999999,
                        token_type = "Bearer",
                        refresh_token = guid,
                        scope = "offline_access rn.accounts rn.accounts.gc rn.api rn.auth rn.auth.gc rn.bugreporting rn.cards rn.chat rn.clubs rn.cms rn.commerce rn.data rn.data.gc rn.datacollection rn.datacollection.gc rn.discovery rn.gamelogs.gc rn.leaderboard rn.link rn.lists rn.match.read rn.match.write rn.moderation rn.notify rn.platformnotifications rn.playersettings rn.roomcomments rn.rooms rn.storage rn.strings rn.studio.gc",
                        key = ""
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (grant_type == "refresh_token")
            {
                // Console.WriteLine("refresh_token");
                // token = ClientSecurity.RefreshToken(temp2, accid, platform, platform_id, device_id);
                // if (token == null)
                //    goto token_err;
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (grant_type == "create_account")
            {
                return new ContentResult()
                {
                    Content = "The dssssssssssssssssssssssdfxe",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

        token_err:
            return new ContentResult()
            {
                /*Content = JsonConvert.SerializeObject(new
                {
                    error = "invalid_grant"
                }),*/
                Content = "",
                ContentType = "application/json",
                StatusCode = 401
            };
        }

        [HttpPost("/Auth/cachedlogin/forplatformids")]
        public IActionResult GetCachedLoginForPlatformIds()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }



        [HttpDelete("/Auth/cachedlogin/current")]
        public ContentResult DeleteCurrentCachedLogin()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = false,
                    error = "This ain't implemented yet.",
                    value = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [Route("/Auth/role/developer/{id}")]
        public IActionResult AuthRoleDeveloper(ulong id)
        { 
            return new ContentResult()
            {
                Content = PlayerDB.CheckDevFlag(id).ToString().ToLower(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [Route("/Auth/role/moderator/{id}")]
        public ContentResult AuthRoleModerator(ulong id)
        {
            return new ContentResult()
            {
                Content = PlayerDB.CheckModFlag(id).ToString().ToLower(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [Route("account/me/remoteauth")]
        public ContentResult RemoteAuth([FromForm] string code)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = false,
                    error = "This ain't implemented yet.",
                    value = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/Auth/account/me/changepassword")]
        public ContentResult ChangePassword([FromForm] string newPassword)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (string.IsNullOrEmpty(newPassword))
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Password cannot be empty!",
                        value = (string?)null
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (newPassword.Length > 64)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Password must be fewer than 64 characters.",
                        value = (string?)null
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            PlayerDB.SetPlayerPassword(newPassword, account.Id, log: false);
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = "",
                    value = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }
    }
}
