using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.Controllers.AccountsController;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("Accounts")]
    public class AccountsController : ControllerBase
    {
        [HttpGet("account/bulk")]
        public ContentResult AccountBulk([FromQuery] List<ulong> id)
        {
            return new ContentResult()
            {
                Content = PlayerDB.GetAccountsBulk(id),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("account/me")]
        public IActionResult AccountMe()
        {
            string authtoken = HttpContext.Request.Headers["Authorization"].ToString();
            if (string.IsNullOrEmpty(authtoken))
            {
                authtoken = HttpContext.Request.Cookies["Authorization"];
            }

            if (string.IsNullOrEmpty(authtoken))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            }
            string playerdata = ClientSecurity.DecodeToken(authtoken);
            if (playerdata == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            if (playerdata.Contains("error_token"))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            player_info? account = JsonConvert.DeserializeObject<player_info>(playerdata);
            var me = PlayerDB.GetAccountMeSafe(account.Id);
            me.email = "example@example.com";
            return Ok(me);
        }

        [HttpGet("account/search")]
        public IActionResult AccountSearch(string name)
        {
            List<account_data> accounts = PlayerDB.Search(name);
            return Ok(accounts);
        }

        [HttpGet("account/{id}/bio")]
        public IActionResult GetBioForId(ulong id)
        {
            player_data? FullAccount = PlayerDB.GetFullAccount(id);
            string bio = FullAccount?.player_Extra?.Bio ?? "";

            return Ok(new
            {
                accountId = id,
                bio = bio
            });
        }

        [HttpGet("accountprivacysettings/{id}")]
        public ContentResult accountprivacysettings_for_userid(ulong id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            player_data? FullAccount = PlayerDB.GetFullAccount(id);
            bool IsRecentRoomHistoryVisible = FullAccount?.player_Extra?.IsRecentRoomHistoryVisible ?? false;

            var AccountPrivacySettings = JsonConvert.SerializeObject(new
            {
                accountId = id,
                isRecentHistoryVisible = IsRecentRoomHistoryVisible
            }); // Btw, the room history API can return [] if IsRecentRoomHistoryVisible is false like the Rec Room API does. - e12354

            return new ContentResult()
            {
                Content = AccountPrivacySettings,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("parentalcontrol/me")]
        public ContentResult ParentalControlMe()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    accountId = account.Id,
                    disallowInAppPurchases = false,
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPut("account/me/username")]
        public async Task<ContentResult> ChangeUsername([FromForm] string username)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (PlayerDB.HasActiveModerationBlock(account.Id))
            {
                return Utils.Error("You cannot change your name at this time.");
            }
            if (username.Length < 3)
            {
                return Utils.Error("Your @ Name must have atleast 3 characters!");
            }
            if (username.Length > 50)
            {
                return Utils.Error("Your @ Name must not exceed 50 characters!");
            }

            bool CheckSwears = !string.IsNullOrEmpty(username) && Sanitize.ContainsSwears(username);
            if (CheckSwears)
            {
                return Utils.Error("Your @ Name contains swear words!");
            }

            if (username.Contains(" "))
            {
                return Utils.Error("Your @ Name must not contain spaces!");
            }


            if (Regex.IsMatch(username, @"[^\u0000-\u007F]"))
            {
                return Utils.Error("Name contains Unicode characters!");
            }

            bool usercheck = await Task.Run(() => PlayerDB.SetPlayerUsername(username, account.Id));
            if (!usercheck)
            {
                return Utils.Error("This username is already in use!");
            }

            await Task.Run(() => PlayerDB.SetDisplayName(username, account.Id));
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));
                var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));

                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
            _ = Task.Run(() =>
            {
                try
                {
                    Webhook.Send(
                        account.Id,
                        "prod",
                        "Server info",
                        $"({account.Id}) @{account.Username} has changed their @ name to @{username}",
                        5898927
                    );
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Webhook] Failed to send username change webhook: {ex.Message}");
                }
            });
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

        [HttpPut("account/me/bio")]
        public async Task<ContentResult> ChangeBio([FromForm] string bio)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (bio.Length > 255)
            {
                return Utils.Error("Your bio must not exceed 255 characters!");
            }
            bool CheckSwears = !string.IsNullOrEmpty(bio) && Sanitize.ContainsSwears(bio);
            if (CheckSwears)
            {
                return Utils.Error("Your bio contains swear words!");
            }

            string shortBio = bio.Length > 60 ? bio.Substring(0, 60) + "..." : bio;

            await Task.Run(() => PlayerDB.SetPlayerBio(bio, account.Id));
            _ = Task.Run(() =>
            {
                try
                {
                    Webhook.Send(
                        account.Id,
                        "prod",
                        "Server info",
                        $"({account.Id}) @{account.Username} has changed their bio! " + $"Preview: \"{shortBio}\"",
                        5898927
                    );
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Webhook] Failed to send bio change webhook: {ex.Message}");
                }
            });
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(
                   WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(account.Id))
                );
                var globalUpdate = JsonConvert.SerializeObject(
                    WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(account.Id))
                );

                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Notifications] Failed to send bio update: {ex.Message}");
            }
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

        [HttpPut("account/me/displayname")]
        public async Task<ContentResult> ChangeDisplayName()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string NewDisplayName = HttpContext.Request.Form["displayName"].ToString();
            if (PlayerDB.HasActiveModerationBlock(account.Id))
            {
                return Utils.Error("You cannot change your name at this time.");
            }
            if (NewDisplayName.Length > 15)
            {
                return Utils.Error("Your Display Name must not exceed 15 characters!");
            }
            bool CheckSwears = !string.IsNullOrEmpty(NewDisplayName) && Sanitize.ContainsSwears(NewDisplayName);
            if (CheckSwears)
            {
                return Utils.Error("Your Display Name contains swear words!");
            }

            if (Regex.IsMatch(NewDisplayName, @"[^\u0000-\u007F]"))
            {
                return Utils.Error("Your Display Name contains Unicode characters!");
            }

            await Task.Run(() => PlayerDB.SetDisplayName(NewDisplayName, account.Id));
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));
                var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));

                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
            _ = Task.Run(() =>
            {
                try
                {
                    Webhook.Send(
                        account.Id,
                        "prod",
                        "Server info",
                        $"({account.Id}) @{account.Username} has changed their Display Name to \"{NewDisplayName}\"",
                        5898927
                    );
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Webhook] Failed to send Display Name change webhook: {ex.Message}");
                }
            });
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

        [HttpGet("emojiConfig/whitelistedEmojis")]
        public ContentResult GetWhitelistedEmojis()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(Emojis.emojis),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPut("account/me/emoji")]
        public async Task<ContentResult> ChangeEmoji()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string displayEmoji = HttpContext.Request.Form["displayEmoji"].ToString();
            displayEmoji = Uri.UnescapeDataString(displayEmoji ?? "");
            var whitelistedEmojis = Emojis.emojis;
            if (!whitelistedEmojis.Contains(displayEmoji))
            {
                return Utils.Error("Emoji not allowed!");
            }
            await Task.Run(() => PlayerDB.SetPlayerEmoji(displayEmoji, account.Id));
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));
                var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));

                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
            _ = Task.Run(() =>
            {
                try
                {
                    Webhook.Send(
                        account.Id,
                        "prod",
                        "Server info",
                        $"({account.Id}) @{account.Username} has changed their Display Emoji to \"{displayEmoji}\"",
                        5898927
                    );
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Webhook] Failed to send Display Emoji change webhook: {ex.Message}");
                }
            });
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

        [HttpPut("account/me/personalpronouns")]
        public async Task<ContentResult> ChangePersonalPronouns([FromForm] int pronounFlags)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            await Task.Run(() => PlayerDB.SetPlayerPronounFlags(pronounFlags, account.Id));

            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));
                var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(account.Id)));

                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }

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

        [HttpPut("account/me/identityflags")]
        public async Task<ContentResult> ChangeIdentityFlags([FromForm] int identityFlags)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;


            await Task.Run(() => PlayerDB.SetPlayerIdentityFlags(identityFlags, account.Id));
            await Notifications.RefreshAccount(account.Id);
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

        [HttpPut("account/me/profileimage")]
        public async Task<IActionResult> ChangeProfileImage([FromForm] string imageName)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (string.IsNullOrEmpty(imageName))
            {
                return Ok(new
                {
                    success = false,
                    error = "Image name cannot be empty!",
                    value = (string?)null
                });
            }

            await Task.Run(() => PlayerDB.SetPlayerImageName(imageName, account.Id));
            await Notifications.RefreshAccount(account.Id);
            
            return Ok(new
            {
                success = true,
                error = "",
                value = (string?)null
            });
        }

        [HttpPut("account/me/bannerimage")]
        public async Task<IActionResult> ChangeBannerImage([FromForm] string imageName)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (string.IsNullOrEmpty(imageName))
            {
                return Ok(new
                {
                    success = false,
                    error = "Image name cannot be empty!",
                    value = (string?)null
                });
            }

            await Task.Run(() => PlayerDB.SetPlayerBanner(imageName, account.Id));
            await Notifications.RefreshAccount(account.Id);

            return Ok(new
            {
                success = true,
                error = "",
                value = (string?)null
            });
        }

        [HttpPost("account/me/phone")]
        public IActionResult AddPhoneNumber([FromForm] string phone)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string phoneNumber = phone.Substring(2);
            Console.WriteLine($"[Phone] Player {account.Id} is trying to add phone number: {phoneNumber}. Full phone: {phone}");

            return Ok(new
            {
                success = false,
                error = "This ain't implemented yet.",
                value = (string?)null
            });        
        }

        [HttpGet("namegen/options")]
        public IActionResult NameGenOptions()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                nouns = Utils.Nouns,
                adjectives = Utils.Adjectives,
            });       
        }
    }
}
