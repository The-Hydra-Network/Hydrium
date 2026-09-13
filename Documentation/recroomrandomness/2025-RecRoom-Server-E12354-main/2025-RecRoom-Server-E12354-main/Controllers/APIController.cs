using System.ComponentModel.DataAnnotations;
using System.Diagnostics.Contracts;
using System.Net.Mime;
using System.Net.WebSockets;
using System.Numerics;
using System.Security.Cryptography.Xml;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Discord;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Configuration.UserSecrets;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using RewildLiveSource.api.admin;
using RewildLiveSource.Controllers;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata;
using static ImageMetadataDB;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.EventDBClasses;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.RoomDBClasses;
using static Rec_rewild_live_rewrite.api.server.Classes.RRPlus;
using static Rec_rewild_live_rewrite.api.WebsocketEvents;
using System.Text.Json.Nodes;
using System.Text.Json;
using System.IO;

namespace Rec_rewild_live_rewrite.Controllers
{
    [ApiController]
    public class APIController : ControllerBase
    {
        private static readonly string UPTIME = DateTime.UtcNow.ToString("o");


        [HttpGet("/api/versioncheck/v4")]
        public IActionResult VersionCheck([FromQuery(Name = "v"), Required] string appVersion, [FromQuery(Name = "p"), Required] int? platform)
        {
            /*if (appVersion == "20250731.01")
            {
                return Ok(new VersionCheck
                {
                    ValidVersion = VersionStatus.ValidForPlay,
                    VersionStatus = VersionStatus.ValidForPlay,
                    UpdateNotificationStage = UpdateNoti.None,
                    IsVersionIslanded = false,
                    IsCrossPlayDisabled = false
                });
            }

            return Ok(new VersionCheck
            {
                ValidVersion = VersionStatus.UpdateRequired,
                VersionStatus = VersionStatus.UpdateRequired,
                UpdateNotificationStage = UpdateNoti.Prompt,
                IsVersionIslanded = true,
                IsCrossPlayDisabled = false
            });*/
            return Ok(new VersionCheck
                {
                    ValidVersion = VersionStatus.ValidForPlay,
                    VersionStatus = VersionStatus.ValidForPlay,
                    UpdateNotificationStage = UpdateNoti.None,
                    IsVersionIslanded = false,
                    IsCrossPlayDisabled = false
                });
        }

        [HttpGet("/api/versioncheck/islandedversions")]
        public IActionResult IslandedVersions()
        {
            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/api/gameconfigs/v1/all")]
        public IActionResult Gameconfigs()
        {
            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "Gameconfigs.json");

            if (!System.IO.File.Exists(path))
            {
                Console.WriteLine("Warning: Gameconfigs.json not found, returning []");
                return Ok(ConfigRewild.Bracket);
            }

            return PhysicalFile(path, "application/json");
        }


        [HttpGet("/api/config/v1/amplitude")] // Get amplitude, analytics stuff - e12354
        public ContentResult Amplitude()
        {
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new Amplitude2023
                {
                    AmplitudeKey = "cb2fb2ecb9953512c29af5bca58f2b4a",
                    UseRudderStack = true,
                    RudderStackKey = "23NiJHIgu3koaGNCZIiuYvIQNCu",
                    UseStatSig = ConfigRewild.StatsigEnabled,
                    StatSigKey = "client-SBZkOrjD3r1Cat3f3W8K6sBd11WKlXZXIlCWj6l4Aje",
                    StatSigEnvironment = 0
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v1/defaultunlocked")]
        public ContentResult DefaultUnlockeItems()
        {
            return new ContentResult
            {
                Content = ConfigRewild.DefaultUnlocked,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/customAvatarItems/v1/isCreationAllowedForAccount")]
        public ContentResult IsCreationAllowedForAccount()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new SuccessResponse
                {
                    success = true,
                    value = null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/objectives/v1/myprogress")]
        public ContentResult MyObjectivesProgress()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new MyObjectives
                {
                    Objectives = new List<object>(),
                    ObjectiveGroups = new List<object>()
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/PlayerReporting/v1/moderationBlockDetails")]
        public IActionResult ModerationBlockDetails()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(PlayerDB.Get_moderation_block(account.Id));
        }

        [HttpPost("/api/PlayerReporting/v1/hile")]
        public IActionResult HileAPI([FromForm] Hile.HileTypes Type, [FromForm] string? Message)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok("false");
        }

        [HttpGet("/api/avatar/v2")]
        public IActionResult myAvatarV2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            ulong targetId = account.Id;

            player_data player = PlayerDB.GetFullAccount(targetId);
            if (player == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            if (string.IsNullOrEmpty(player.player_Extra.avatar))
            {
                return Ok(new
                {
                    LegacyData = new
                    {
                        SelectionsV1 = (string?)null,
                        SelectionsV2 = (string?)null,
                        FaceFeatures = (string?)null,
                        SkinColor = (string?)null,
                        HairColor = (string?)null
                    },
                    Selections = Array.Empty<object>(),
                    DataVersion = 9,
                    CustomizationSettings = (string?)null,
                    ThumbnailFileName = (string?)null,
                    Name = (string?)null,
                    Accessibility = 0,
                    Slot = 0
                });
            }

            return new ContentResult()
            {
                Content = player.player_Extra.avatar,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v2/{accid?}")]
        public ContentResult AvatarV2(ulong? accid = null)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            ulong targetId = accid ?? account.Id;

            player_data player = PlayerDB.GetFullAccount(targetId);
            if (player == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            if (string.IsNullOrEmpty(player.player_Extra.avatar))
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        FaceFeatures = "",
                        HairColor = "",
                        OutfitSelections = "",
                        SkinColor = ""
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            return new ContentResult()
            {
                Content = player.player_Extra.avatar,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v4/items")]
        public async Task<IActionResult> GetAvatarItems()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data",
                "APIS",
                "items",
                "avatar_items.json"
            );

            if (!System.IO.File.Exists(path))
                return Ok(ConfigRewild.Bracket);

            return PhysicalFile(path, "application/json");
        }

        [HttpGet("/api/checklist/v1/current")]
        public ContentResult CurrentChecklist()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/players/v2/progression/bulk")]
        public ContentResult BulkPlayersProgression([FromQuery] List<ulong> id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (id == null || id.Count == 0)
                return new ContentResult()
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };

            var result = id.Select(Progress.GetPlayerLevel);
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(result),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/announcement/v1/get")]
        public ContentResult GetAnnouncements()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/equipment/v2/getUnlocked")]
        public IActionResult GetUnlockedEquipment()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data",
                "APIS",
                "items",
                "Equipments.json"
            );

            if (!System.IO.File.Exists(path))
                return Ok(Array.Empty<object>());

            return PhysicalFile(path, "application/json");
        }

        [HttpGet("/api/consumables/v2/getUnlocked")]
        public IActionResult GetUnlockedConsumables()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data",
                "APIS",
                "items",
                "Consumables.json"
            );

            if (!System.IO.File.Exists(path))
                return Ok(Array.Empty<object>());

            return PhysicalFile(path, "application/json");
        }

        [HttpGet("/api/playerReputation/v2/bulk")]
        public ContentResult BulkPlayersReputation([FromQuery] List<ulong> id)
        {
            if (id == null || id.Count == 0)
                return new ContentResult()
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };

            var reps = new List<Rep>();
            // var player = PlayerDB.GetFullAccount(account.Id);
            foreach (var playerId in id)
            {
                var acc = PlayerDB.GetFullAccount(playerId);
                if (acc?.player == null)
                    continue;

                var rep = acc.player.PlayerReputation ?? new mPlayerReputation();
                var extra = acc.player_Extra;

                reps.Add(new Rep
                {
                    AccountId = playerId,
                    IsCheerful = rep.IsCheerful,
                    Noteriety = 0,
                    SelectedCheer = rep.SelectedCheer,
                    CheerCredit = rep.CheerCredit,
                    CheerGeneral = rep.CheerGeneral,
                    CheerHelpful = rep.CheerHelpful,
                    CheerCreative = rep.CheerCreative,
                    CheerGreatHost = rep.CheerGreatHost,
                    CheerSportsman = rep.CheerSportsman,
                });
            }


            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(reps),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomkeys/v1/mine")]
        public ContentResult my_roomkeys()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("/api/avatar/v1/defaultbaseavataritems")]
        public ContentResult DefaultBaseAvatarItems()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = ConfigRewild.DefaultBaseAvatarItems,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v1/lockeditems/bulk")]
        public ContentResult GetLockedItemsBulk([FromBody] LockedItems request)
        {
            

            string path = Path.Combine("Data", "AvatarItems.json");
            if (!System.IO.File.Exists(path))
                return new ContentResult
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };

            var allItems = JArray.Parse(System.IO.File.ReadAllText(path));

            JArray filteredItems = new JArray();
            if (request.AvatarItemDescriptions != null && request.AvatarItemDescriptions.Count > 0)
            {
                foreach (var item in allItems)
                {
                    string desc = item["AvatarItemDesc"]?.ToString();
                    if (desc != null && request.AvatarItemDescriptions.Contains(desc))
                    {
                        filteredItems.Add(item);
                    }
                }
            }
            else
            {
                filteredItems = allItems;
            }

            return new ContentResult
            {
                Content = filteredItems.ToString(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/config/v1/backtrace")]
        public ContentResult Backtrace()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    ReportBudget = 0,
                    FilterType = 0,
                    SampleRate = 0.025,
                    LogLineCount = 50,
                    CaptureNativeCrashes = 1,
                    ANRThresholdMs = 0,
                    MessageCount = 1000,
                    MessageRegex = "^Cannot set the parent of the GameObject .* while its new parent|^\\>\\x2010x\\:\\x20|'LabelTheme' contains missing PaletteTheme reference on",
                    VersionRegex = ".*"
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/config/v2")]
        public ContentResult ConfigV2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var levels = new List<LevelProgressionMap>();
            levels.Add(new LevelProgressionMap { Level = 0, RequiredXp = 1, GiftDropId = null });
            for (int i = 1; i <= 20; i++)
            {
                levels.Add(new LevelProgressionMap
                {
                    Level = i,
                    RequiredXp = i + 1,
                    GiftDropId = 0
                });
            }

            var dailySet = new List<DailyObjective>
            {
                new DailyObjective { Type = 20, Score = 1, Xp = 200 },
                new DailyObjective { Type = 21, Score = 1, Xp = 200 },
                new DailyObjective { Type = 22, Score = 1, Xp = 200 }
            };

            var dailyObjectives = new List<List<DailyObjective>>();
            for (int i = 0; i < 7; i++)
                dailyObjectives.Add(new List<DailyObjective>(dailySet));

            string url = $"{Request.Scheme}://{Request.Host}";

            var config = new Config
            {
                MessageOfTheDay = "Welcome to Rec_rewild live!",
                CdnBaseUri = $"{url}",
                ShareBaseUrl = $"{url}/share/{0}",
                LevelProgressionMaps = levels,
                MatchmakingParams = new MatchmakingParams
                {
                    PreferFullRoomsFrequency = 1.0,
                    PreferEmptyRoomsFrequency = 0.0
                },
                DailyObjectives = dailyObjectives,
                ServerMaintainence = new ServerMaintenance
                {
                    StartsInMinutes = 0
                },
                AutoMicMutingConfig = new AutoMicMutingConfig
                {
                    MicSpamVolumeThreshold = 10.0,
                    MicVolumeSampleInterval = 1.0,
                    MicVolumeSampleRollingWindowLength = 15.0,
                    MicSpamSamplePercentageForWarning = 100.0,
                    MicSpamSamplePercentageForWarningToEnd = 0.0,
                    MicSpamSamplePercentageForForceMute = 500.0,
                    MicSpamSamplePercentageForForceMuteToEnd = 0.0,
                    MicSpamWarningStateVolumeMultiplier = 10.0
                },
                StorefrontConfig = new StorefrontConfig
                {
                    MinPlayerLevelForGifting = 0
                },
                RoomKeyConfig = new RoomKeyConfig
                {
                    MaxKeysPerRoom = 100
                },
                RoomCurrencyConfig = new RoomCurrencyConfig
                {
                    AwardCurrencyCooldownSeconds = 10.0
                },
                ConfigTable = new List<ConfigTableEntry>
                {
                    new ConfigTableEntry { Key = "Gift.DropChance", Value = "1" },
                    new ConfigTableEntry { Key = "Gift.XP", Value = "0.5" }
                },
                PhotonConfig = new PhotonConfig
                {
                    CloudRegion = "us",
                    CrcCheckEnabled = false,
                    EnableServerTracingAfterDisconnect = false
                }
            };

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(config, Formatting.None),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/storefronts/v3/giftdropstore/{StoreId}")]
        public IActionResult GetGiftdropStore(int StoreId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                NewUntil = (string?)null,
                NextUpdate = "9999-12-31T18:00:00Z",
                StoreItems = Array.Empty<object>(),
                StorefrontName = (string?)null,
                StorefrontType = StoreId,
                SubscriberDiscountPercent = 10
            });
        }

        [HttpGet("/api/challenge/v2/getCurrent")]
        public ContentResult GetCurrentChallenges()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/PlayerReporting/v1/voteToKickReasons")]
        public ContentResult VoteToKickReasons()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var reasons = new[]
            {
                new { Reason = "Discriminatory language", ReportCategory = 102 },
                new { Reason = "Discriminatory behavior", ReportCategory = 102 },
                new { Reason = "Threats or encouraging suicide", ReportCategory = 102 },
                new { Reason = "Toxic behavior", ReportCategory = 102 },
                new { Reason = "Sexual behavior in public", ReportCategory = 101 },
                new { Reason = "Sexual language in public", ReportCategory = 101 },
                new { Reason = "Non-consensual sexual behavior", ReportCategory = 101 },
                new { Reason = "Player in walls or floor", ReportCategory = 103 },
                new { Reason = "Friendly fire", ReportCategory = 103 },
                new { Reason = "Microphone spam", ReportCategory = 103 },
                new { Reason = "Abusing bugs or exploits", ReportCategory = 103 },
                new { Reason = "Spawn camping", ReportCategory = 103 },
                new { Reason = "Inactive in games (AFK)", ReportCategory = 6 },
                new { Reason = "Prefab swapping", ReportCategory = 6 },
                new { Reason = "Not following game rules", ReportCategory = 6 }
            };

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(reasons),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/images/v2/named")]
        public ContentResult NamedImages()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v2/gifts")]
        public ContentResult Gifts()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/gamerewards/v1/pending")]
        public ContentResult PendingGameRewards()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/communityboard/v2/current")]
        public ContentResult CurrentCommunityBoard()
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
            player_info account = JsonConvert.DeserializeObject<player_info>(playerdata);

            string filePath = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "communityboard.json");
            string content = System.IO.File.ReadAllText(filePath);
            return new ContentResult()
            {
                Content = content,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/storefronts/v4/balance/{balance_type}")]
        public ContentResult StorefrontBalance(int balance_type = 0)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var balance = new[]
            {
                new
                {
                    Balance = 0,
                    BalanceType = balance_type,
                    CurrencyType = balance_type,
                    Platform = 0
                }
            };

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(balance),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/customAvatarItems/v1/isCreationEnabled")]
        public ContentResult IsCreationEnabled()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            player_data FullAccount = PlayerDB.GetFullAccount(account.Id);

            return new ContentResult()
            {
                Content = "true",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/customAvatarItems/v1/isRenderingEnabled")]
        public ContentResult IsRenderingEnabled()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            player_data FullAccount = PlayerDB.GetFullAccount(account.Id);

            return new ContentResult()
            {
                Content = "true",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/CampusCard/v1/UpdateAndGetSubscription")]
        public IActionResult RRPlus()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var subscription = new SubscriptionResponse
            {
                subscription = new Subscription
                {
                    subscriptionId = 507911,
                    recNetPlayerId = account.Id,
                    platformType = 0,
                    platformId = "76561198216660599",
                    platformPurchaseId = "4069635207998545083",
                    @event = null,
                    type = 0,
                    level = 0,
                    period = 0,
                    expirationDate = new DateTime(2024, 3, 20, 12, 0, 0, DateTimeKind.Utc),
                    isAutoRenewing = false,
                    createdAt = new DateTime(2024, 2, 18, 7, 15, 0, 284, DateTimeKind.Utc).AddTicks(5308),
                    modifiedAt = new DateTime(2024, 3, 20, 7, 1, 55, DateTimeKind.Utc).AddTicks(3454572)
                },
                platformAccountSubscribedPlayerId = null
            };

            return Content(System.Text.Json.JsonSerializer.Serialize(subscription), "application/json");
        }

        [HttpGet("/api/subscriptionseasons/v1/seasons/current")]
        public ContentResult RRPlus2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/inventions/v2/mine")]
        public ContentResult MyInventions()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db 
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomkeys/v1/room")]
        public ContentResult Roomkeys()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomcurrencies/v1/currencies")]
        public ContentResult RoomCurrencies()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomconsumables/v1/roomConsumable/room/{RoomId}")]
        public ContentResult RoomConsumables(ulong RoomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomconsumables/v1/roomConsumable/room/{RoomId}/me")]
        public ContentResult MyRoomConsumables(ulong RoomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/roomcurrencies/v1/getAllBalances")]
        public ContentResult GetAllRoomCurrenciesBalances()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/images/v1/slideshow")]
        public ContentResult Slideshow()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/itemWishlists/v1/wishlist/me")]
        public IActionResult MyItemWishlists()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/api/itemWishlists/v1/wishlist/{playerId}")]
        public IActionResult GetWishlistForPlayer(ulong playerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/api/server/status")]
        public ContentResult status()
        {

            string key = HttpContext.Request.Headers["key"].ToString();

            if (key == ConfigRewild.VALID_STATUS_KEY)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        uptime = UPTIME,
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        message = "Forbidden!"
                    }),
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }
        }

        [HttpPost("/api/sanitize/v1")]
        public IActionResult APISanitizeV1([FromBody] Sanitize request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string value = request?.Value ?? "";

            if (ConfigRewild.AllowSwears == true)
            {
                return Content(JsonConvert.SerializeObject(value), "application/json");
            }
            string sanitized = Sanitize.SanitizeMessage(value);
            if (ConfigRewild.LogMessagesFromSanitize == true)
            {
                _ = Task.Run(() =>
                {
                    try
                    {
                        Webhook.Send(account.Id, "mod", "Reporting Info - Sanitize", $"({account.Id}) @{account.Username} \n**Sanitize requested!**\n" +
                        $"**Current Room:** {HeartbeatDB.GetPlayerCurrentRoomName(account.Id)}\n" +
                        $"**Request Message:** \"{value}\"\n" +
                        $"**Sanitized Message:** \"{sanitized}\"\n" +
                        $"**Context:** \"{request.Context}\""
                        , 5898927);
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine(ex);
                    }
                });
            }
            return Content(JsonConvert.SerializeObject(sanitized), "application/json");
        }

        [HttpPost("/api/sanitize/v1/isPure")]
        public IActionResult ApiSanitizeV1IsPure([FromBody] Sanitize request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var isPure = !Sanitize.ContainsSwears(request.Value);

            return Ok(new
            {
                IsPure = isPure
            });
        }

        [HttpGet("/api/customAvatarItems/v2/fromCreator/{PlayerId}")]
        public ContentResult CustomAvatarItemsFromCreator(ulong PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new RoomDBClasses.Resultslist<RoomDBClasses.RoomRoot>
                {
                    Results = [],
                    TotalResults = 0
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("/api/influencerpartnerprogram/influencer")]
        public ContentResult influencerpartnerprogram(ulong accountId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 404
            };
        }

        [HttpPost("/api/avatar/v2/set")]
        public async Task<ContentResult> SetAvatar()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string jsonData = "";
            try
            {
                using var reader = new StreamReader(HttpContext.Request.Body);
                jsonData = await reader.ReadToEndAsync();
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

            if (string.IsNullOrWhiteSpace(jsonData))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };

            try
            {
                Newtonsoft.Json.Linq.JToken.Parse(jsonData);
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


            var player = PlayerDB.GetFullAccount(account.Id);
            if (player == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };

            try
            {
                PlayerDB.set_player_avatar(jsonData, player.playerid);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Avatar Set Error] {ex}");
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            return new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpPost("/api/consumables/v1/consume")]
        public IActionResult ConsumeConsumable()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok("");
        }

        [HttpGet("/api/online_players")]
        public IActionResult OnlinePlayers()
        {
            var onlineList = new List<object>();

            foreach (var (playerId, socket) in NotificationsController.WebSockets)
            {
                onlineList.Add(new
                {
                    PlayerId = playerId,
                    CurrentRoom = HeartbeatDB.GetPlayerCurrentRoomName(playerId)
                });
            }

            return Ok(onlineList);
        }

        [HttpGet("/api/ping")]
        public ContentResult ServerPing()
        {
            return new ContentResult
            {
                Content = "true",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        // todo check if it a real image file and return a 400 error if it not a image file - Waeboi69
        [HttpPost("/api/images/v4/uploadsaved")]
        public async Task<ContentResult> UploadImage()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            HttpContext.Request.EnableBuffering();

            byte[] array;
            using (var memoryStream = new MemoryStream(capacity: 4 * 1024 * 1024))
            {
                await HttpContext.Request.Body.CopyToAsync(memoryStream, bufferSize: 131072);
                array = memoryStream.ToArray();
            }

            HttpContext.Request.Body.Position = 0;

            var saveImageTask = Task.Run(() => Images.SaveImageFile(array));
            var formTask = HttpContext.Request.ReadFormAsync();

            var file = await saveImageTask.ConfigureAwait(false);
            var form = await formTask.ConfigureAwait(false);

            if (!form.TryGetValue("imgMeta", out var imgMetaValue) || string.IsNullOrEmpty(imgMetaValue))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            ImageMetadataDB.ImageMetadata? metadata = null;

            if (!string.IsNullOrEmpty(imgMetaValue))
            {
                metadata = JsonConvert.DeserializeObject<ImageMetadataDB.ImageMetadata>(imgMetaValue!);
            }

            var newImage = new FullSavedImage
            {
                Id = 0,
                RoomId = metadata.roomId,
                PlayerId = account.Id,
                ImageName = file.rawfilename,
                Description = metadata.description,
                Accessibility = metadata.accessibility,
                TaggedPlayerIds = metadata.playerIds,
                CreatedAt = DateTime.UtcNow
            };

            if (metadata.savedImageType != SavedImageTypeEnum.OutfitThumbnail)
            {
                await Task.Run(() => ImageMetadataDB.InsertImage(newImage)).ConfigureAwait(false);

                if (metadata.accessibility == ImageAccessibility.Public)
                {
                    _ = Task.Run(() => Webhook.Send(
                        account.Id, "prod", "Server info",
                        $"({account.Id}) @{account.Username} has uploaded an image",
                        5898927, $"https://recrewild.oldrec.net/img/{file.rawfilename}"
                    ));
                }
            }

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = "",
                    ImageName = file.rawfilename
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("/api/images/v6")]
        public ContentResult GetImageByImageName(string name)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            try
            {
                var image = ImageMetadataDB.GetImageByName(name);

                if (image != null)
                {
                    return new ContentResult
                    {
                        Content = JsonConvert.SerializeObject(image, Formatting.Indented),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                return new ContentResult
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Image V6 Error] {ex}");
                return new ContentResult
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
        }

        [HttpGet("/api/images/v5/cheered/bulk")]
        public ContentResult ImagesCheered([FromQuery] int[] id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var results = id.Select(imageId => new
            {
                SavedImageId = imageId,
                IsCheered = ImageMetadataDB.HasUserCheered(imageId, account.Id)
            }).ToList();

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(results),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/images/v4/room/{id}")]
        public ContentResult GetRoomImages(int id, int sort = 0, int filter = 0, int take = 50, int skip = 0)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var images = ImageMetadataDB.GetRoomImages(account.Id, id, sort, filter, take, skip);
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(images, Formatting.Indented),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/images/v1/cheer")]
        public ContentResult CheerImage([FromBody] CheerRequest request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            bool isCheered = ImageMetadataDB.ToggleCheer(request.SavedImageId, account.Id, request.Cheer);
            int cheerCount = ImageMetadataDB.GetCheerCount(request.SavedImageId);

            ImageMetadataDB.UpdateImageCheerCount(request.SavedImageId, cheerCount);

            return new ContentResult
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/images/v5/player/{playerid}")]
        public IActionResult GetPlayerImages(ulong playerid, int sort = 0)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var playerImages = ImageMetadataDB.GetPlayerImages(account.Id, playerid);

            return Ok(playerImages);
        }

        [HttpGet("/api/images/v5/bulk")]
        public ContentResult GetImagesByBulkIds()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var idsRaw = Request.Query["ids"];

            List<int> idList = idsRaw
                .SelectMany(x => x.Split(',', StringSplitOptions.RemoveEmptyEntries))
                .Select(x => x.Trim())
                .Where(x => int.TryParse(x, out _))
                .Select(int.Parse)
                .ToList();

            if (idList.Count == 0)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            var images = ImageMetadataDB.GetImagesByIds(idList);

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(images),
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("/api/rooms/v1/filters")]
        public ContentResult GetRoomTags()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var roomTags = new
            {
                PinnedFilters = new[]
                {
                    "recroomoriginal", "community", "featured", "quest", "pvp", "hangout", "game",
                    "art", "store", "tutorial", "fandom", "performance", "action", "horror"
                },
                PopularFilters = new[]
                {
                    "pvp", "quest", "game", "hangout", "art"
                },
                TrendingFilters = new[]
                {
                    "roleplay", "nomp", "rp", "casual", "fun", "action", "military", "sports"
                }
            };

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(roomTags),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/inventions/v1/room")]
        public ContentResult RoomInventions(ulong id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/rooms/v1/verifyRole")]
        public ContentResult VerifyRole()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/avatar/v3/saved")]
        public ContentResult GetOutfit()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = PlayerDB.GetAvatarSaved(account.Id),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/avatar/v4/saved/set")]
        public async Task<ContentResult> SaveOutfit()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            using var reader = new StreamReader(HttpContext.Request.Body);
            string body = await reader.ReadToEndAsync();

            avatar_data_saved avatar;
            try
            {
                avatar = JsonConvert.DeserializeObject<avatar_data_saved>(body);
                if (avatar == null)
                    throw new Exception("Deserialization returned null");

                Console.WriteLine($"Slot: {avatar.Slot}, Name: {avatar.Name}, SkinColor: {avatar.SkinColor}");


                PlayerDB.SetAvatarSaved(account.Id, new List<avatar_data_saved> { avatar });
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to parse or save avatar JSON: " + ex.Message);
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Success = true,
                    Slot = avatar.Slot
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/PlayerCheer/v1/SetSelectedCheer")]
        public async Task<ContentResult> SetSelectedCheer()
        {
            try
            {
                var (account, error) = AuthHelper.ValidateToken(HttpContext);
                if (error != null)
                    return error;

                string? cheerCategoryStr = HttpContext.Request.Form["CheerCategory"];

                if (string.IsNullOrEmpty(cheerCategoryStr))
                {
                    return new ContentResult()
                    {
                        Content = "",
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                if (!Enum.TryParse<CheerCategoryEnum>(cheerCategoryStr, out var cheerCategory))
                {
                    return new ContentResult()
                    {
                        Content = "",
                        ContentType = "application/json",
                        StatusCode = 400
                    };
                }

                if (account == null)
                {
                    return new ContentResult()
                    {
                        Content = "",
                        ContentType = "application/json",
                        StatusCode = 401
                    };
                }
                await Task.Run(() => PlayerDB.SetPlayerCheer(cheerCategory, account.Id));

                try
                {
                    var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.CreateResponseReputationUpdate(account.Id));
                    var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.CreateResponseReputationUpdate(account.Id));

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
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"SetSelectedCheer Error: {ex}");
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }
        }

        [HttpGet("/api/incentivizedreferrals/progress")]
        public ContentResult get_incentivizedreferrals_incentivizedreferrals()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    value = new
                    {
                        ReferralsVerifiedCount = 0,
                        PlayerReferralRewards = new List<object>()
                    },
                    /*
                    [{
                        "UnlockedAt": null,
                        "ClaimedAt": null,
                        "Status": 0,
                        "ReferralRewardTier": {
                            "ReferralRewardTierId": 1,
                            "RequiredReferralCount": 1,
                            "RewardSelectionCount": 1
                        }
                    }]
                    */
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        //https://econ.rec.net/api/influencerpartnerprogram/influencer?accountId=1503269750 return a 404 or a influencer account id

        // /api/influencerpartnerprogram/support

        // /api/inventions/v1/fromcreators // todo: add this


        [HttpGet("/api/influencerpartnerprogram/influencers")]
        public ContentResult GetAllInfluencers()
        {
            // https://econ.rec.net/api/influencerpartnerprogram/influencers?take=1000
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    InfluencerIds = PlayerDB.GetInfluencerIds(),
                    ContinuationToken = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/influencerpartnerprogram/support")]
        public ContentResult SupportInfluencer()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string? SupportIdStr = HttpContext.Request.Form["influencerAccountId"].ToString();
            ulong SupportId = ulong.Parse(SupportIdStr);
            PlayerDB.SupportInfluencer(account.Id, SupportId);

            return new ContentResult
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

        [HttpPost("/api/influencerpartnerprogram/remove")]
        public ContentResult RemoveInfluencer()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            PlayerDB.SupportInfluencer(account.Id, 0);

            return new ContentResult
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

        [HttpGet("/api/influencerpartnerprogram/myinfluencer")]
        public IActionResult MyInfluencer()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var myInfluencer = PlayerDB.GetMyInfluencer(account.Id);
            if (myInfluencer == 0)
            {
                return NotFound();
            }
            return Ok(myInfluencer);
        }

        // /api/relationships/v2/sendfriendrequest?id={playerid}

        // /api/relationships/v2/addfriend?id={playerid}

        // /api/relationships/v2/acceptfriendrequest?id={playerid}

        [HttpGet("/api/relationships/v2/get")]
        public ContentResult GetRelationships()
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

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(FriendsDB.GetRelationships(account.Id)),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/relationships/v2/sendfriendrequest")]
        public async Task<ContentResult> SendFriendRequest(ulong id) // player id
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (PlayerDB.CheckDevFlag(account.Id) && id == 1)
            {
                RelationshipDetail rs = FriendsDB.SendFriendRequest(id, account.Id);

                _ = Task.Run(async () =>
                {
                    await Task.Delay(1000);
                    FriendsDB.AcceptFriendRequest(account.Id, 1);
                });

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(rs),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }


            RelationshipDetail relationship = FriendsDB.SendFriendRequest(id, account.Id);

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(relationship),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/relationships/v2/acceptfriendrequest")]
        public ContentResult AcceptFriendRequest(ulong id) // player id
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            // Todo: add rate limiting

            RelationshipDetail relationship = FriendsDB.AcceptFriendRequest(id, account.Id);

            if (relationship == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(relationship),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/relationships/v2/addfriend")]
        public ContentResult AddFriendViaHandshakeInGame(ulong id) // player id
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            // Todo: add rate limiting
            RelationshipDetail relationship = FriendsDB.AcceptFriendRequest(id, account.Id);

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(relationship),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/relationships/v2/removefriend")]
        public ContentResult RemoveFriend(ulong id) // player id
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            //Todo: add rate limiting

            RelationshipDetail relationship = FriendsDB.RemoveFriend(id, account.Id);

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(relationship),
                ContentType = "application/json",
                StatusCode = 200
            };
        }
        /*
        [HttpPost("/api/customAvatarItems/v1")]
        public async Task<ContentResult> CreateCustomAvatar()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            HttpContext.Request.EnableBuffering();

            byte[] array;
            using (var memoryStream = new MemoryStream(capacity: 4 * 1024 * 1024))
            {
                await HttpContext.Request.Body.CopyToAsync(memoryStream, bufferSize: 131072);
                array = memoryStream.ToArray();
            }

            HttpContext.Request.Body.Position = 0;

            // todo: get the desinflesti elif g

            var saveImageTask = Task.Run(() => Images.SaveImageFile(array));
            var formTask = HttpContext.Request.ReadFormAsync();

            var file = await saveImageTask.ConfigureAwait(false);
            var form = await formTask.ConfigureAwait(false);
            if (!form.TryGetValue("metadata", out var metadatavalue) || string.IsNullOrEmpty(metadatavalue))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }
            CreateCustomAvatarItemResponse metadata = JsonConvert.DeserializeObject<CreateCustomAvatarItemResponse>(metadatavalue);
            if (metadata.Accessibility == 1)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        Success = false,
                        Value = (string?)null,
                        ErrorId = "Rooms.DoesntExist",
                        Error = "Sorry, that option is not available yet. Switch to 'Just Me'"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Success = true,
                    Value = metadata,
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }
        */

        [HttpPost("/api/customAvatarItems/v1/bulk")]
        public IActionResult BulkCustomAvatarItems([FromForm] List<string> customAvatarItemIds)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "customitems.json");

            if (!System.IO.File.Exists(path))
            {
                return NotFound();
            }

            string json = System.IO.File.ReadAllText(path);

            JObject root = JObject.Parse(json);
            JArray results = (JArray)root["Results"];

            var filtered = results
                .Where(x => customAvatarItemIds.Contains((string)x["CustomAvatarItemId"]))
                .ToList();

            return new ContentResult
            {
                Content = JArray.FromObject(filtered).ToString(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/inventions/v1/featured")]
        public ContentResult FeaturedInventions()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/customAvatarItems/v1/featured")]
        public IActionResult FeaturedCustomAvatarItems()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "customitems.json");
            var stream = System.IO.File.OpenRead(path);

            return new FileStreamResult(stream, "application/json");
        }

        [HttpGet("/api/testcasemanagement/v1/{route}")]
        public ContentResult TestCaseManagement(string route)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (route == "testplans")
            {
                return new ContentResult()
                {
                    Content = "[]", // todo db
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            if (route == "testpasssummary")
            {
                return new ContentResult()
                {
                    Content = "[]", // todo db
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1/searchlive")]
        public ContentResult SearchLivePlayerEvents()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPut("roomconsumables/v1/roomConsumable")]
        public ContentResult CreateRoomConsumable()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/messages/v2/get")]
        public ContentResult GetMessages()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(PlayerDB.GetMessages(account.Id)),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/PlayerCheer/v1/create")]
        public async Task<IActionResult> SendCheer([FromForm] ulong PlayerIdTo, [FromForm] int CheerCategory, [FromForm] ulong RoomId, [FromForm] bool Anonymous)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            /*  What the game requests:
                PlayerIdTo=1
                CheerCategory=0
                RoomId=1
                Anonymous=False
             */

            Rec_rewild_live_rewrite.api.WebsocketEvents.MessageType cheerType = Anonymous ? Rec_rewild_live_rewrite.api.WebsocketEvents.MessageType.PlayerCheerAnonymous : Rec_rewild_live_rewrite.api.WebsocketEvents.MessageType.PlayerCheer;
            if (account.PlayerReputation.CheerCredit <= 0)
            {
                return Ok(new
                {
                    success = false,
                    error = "You have no more cheers.",
                    value = (string?)null
                });
            }

            if (PlayerIdTo == account.Id)
            {
                return Ok(new
                {
                    success = false,
                    error = "You cannot cheer yourself!",
                    value = (string?)null
                });
            }

            // decrease cheer credit by 1
            await Task.Run(() =>
                PlayerDB.SetCheerCredit(account.PlayerReputation.CheerCredit - 1, account.Id)
            );

            var newMsg = PlayerDB.AddMessage(
                toPlayerId: PlayerIdTo,
                fromPlayerId: account.Id,
                type: cheerType,
                data: CheerCategory.ToString(),
                roomId: RoomId,
                playerEventId: null
            );

            try
            {
                var response = JsonConvert.SerializeObject(
                    WebsocketEvents.CreateMessageResponse(newMsg)
                );

                var notifyTask = Notifications.SendToPlayer(PlayerIdTo, response);
                await Task.WhenAll(notifyTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }

            return Ok(new
            {
                success = true,
                error = "",
                value = (string?)null
            });
        }

        [HttpPost("/api/messages/v3/delete")]
        public IActionResult DeleteMessages([FromBody] DeleteMessagesRequest request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (request?.MessageIds == null || request.MessageIds.Count == 0)
            {
                return NoContent();
            }

            foreach (var id in request.MessageIds)
            {
                PlayerDB.DeleteMessage(account.Id, id);
            }

            return NoContent();
        }

        [HttpGet("/api/playerevents/v1/room/{RoomId}")]
        public ContentResult PlayerEventsForRoom(ulong RoomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1/tagfilters")]
        public ContentResult PlayerEventsTagFilters()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var tagfilters = new
            {
                PinnedFilters = new[]
               {
                    "workshops",
                    "celebration",
                    "game",
                    "meetup",
                    "performance",
                    "coop",
                    "grandopening",
                    "class",
                    "competition"
                },
                PopularFilters = new[]
               {
                    "workshops",
                    "celebration",
                    "class",
                    "coop",
                    "competition",
                    "game",
                    "grandopening",
                    "meetup",
                    "performance"
                },
                TrendingFilters = (string?)null
            };

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(tagfilters),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/playerevents/v2")]
        public ContentResult CreatePlayerEvent([FromBody] EventDBClasses.CreateEventRequest request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            FullPlayerEvent NewlyCreatedEvent = EventDB.CreateEvent(account.Id, request);

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Result = EventResults.Success,
                    TagModifyResult = (string?)null,
                    PlayerEvent = new
                    {
                        Tags = NewlyCreatedEvent.Tags,
                        PlayerEventId = NewlyCreatedEvent.PlayerEventId,
                        CreatorPlayerId = NewlyCreatedEvent.CreatorPlayerId,
                        ImageName = NewlyCreatedEvent.ImageName,
                        RoomId = NewlyCreatedEvent.RoomId,
                        SubRoomId = NewlyCreatedEvent.SubRoomId,
                        ClubId = NewlyCreatedEvent.ClubId,
                        Name = NewlyCreatedEvent.Name,
                        Description = NewlyCreatedEvent.Description,
                        StartTime = NewlyCreatedEvent.StartTime,
                        EndTime = NewlyCreatedEvent.EndTime,
                        AttendeeCount = NewlyCreatedEvent.AttendeeCount,
                        State = NewlyCreatedEvent.State,
                        ImageAccessibility = NewlyCreatedEvent.Accessibility,
                        IsMultiInstance = NewlyCreatedEvent.IsMultiInstance,
                        SupportMultiInstanceRoomChat = NewlyCreatedEvent.SupportMultiInstanceRoomChat,
                        DefaultBroadcastPermissions = NewlyCreatedEvent.DefaultBroadcastPermissions,
                        CanRequestBroadcastPermissions = NewlyCreatedEvent.CanRequestBroadcastPermissions,
                        RecurrenceSchedule = NewlyCreatedEvent.RecurrenceSchedule
                    }
                }), // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1/{EventId}/responses")]
        public ContentResult PlayerEventResponsesForEventId(ulong EventId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var playerEvent = EventDB.GetFullEventById(EventId);

            if (playerEvent == null)
            {
                return new ContentResult
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(playerEvent.Responses ?? new List<FullEventResponses>()),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1")]
        public ContentResult GetAllEvents()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var events = EventDB.SearchEventByQuery("");

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(events.Select(e => new
                {
                    e.PlayerEventId,
                    e.CreatorPlayerId,
                    e.ImageName,
                    e.RoomId,
                    e.SubRoomId,
                    e.ClubId,
                    e.Name,
                    e.Description,
                    e.StartTime,
                    e.EndTime,
                    e.AttendeeCount,
                    e.State,
                    e.Accessibility,
                    e.IsMultiInstance,
                    e.SupportMultiInstanceRoomChat,
                    e.DefaultBroadcastPermissions,
                    e.CanRequestBroadcastPermissions,
                    e.BroadcastingRoomInstanceId,
                    e.RecurrenceSchedule
                })),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1/all")]
        public ContentResult GetAllEvents2()
        {
            //var (account, error) = AuthHelper.ValidateToken(HttpContext);
            //if (error != null)
            //    return error;

            var events = EventDB.SearchEventByQuery("");

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Created = events.Select(e => new
                    {
                        e.PlayerEventId,
                        e.CreatorPlayerId,
                        e.ImageName,
                        e.RoomId,
                        e.SubRoomId,
                        e.ClubId,
                        e.Name,
                        e.Description,
                        e.StartTime,
                        e.EndTime,
                        e.AttendeeCount,
                        e.State,
                        e.Accessibility,
                        e.IsMultiInstance,
                        e.SupportMultiInstanceRoomChat,
                        e.DefaultBroadcastPermissions,
                        e.CanRequestBroadcastPermissions,
                        e.BroadcastingRoomInstanceId,
                        e.RecurrenceSchedule
                    }),
                    Responses = new List<object>(),
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("/api/playerevents/v1/search")]
        public ContentResult SearchEvents(string query = "", string sort = "Attendance", string scheduleFilter = "Upcoming")
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var events = EventDB.SearchEventByQuery(query);

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(events.Select(e => new
                {
                    e.PlayerEventId,
                    e.CreatorPlayerId,
                    e.ImageName,
                    e.RoomId,
                    e.SubRoomId,
                    e.ClubId,
                    e.Name,
                    e.Description,
                    e.StartTime,
                    e.EndTime,
                    e.AttendeeCount,
                    e.State,
                    e.Accessibility,
                    e.IsMultiInstance,
                    e.SupportMultiInstanceRoomChat,
                    e.DefaultBroadcastPermissions,
                    e.CanRequestBroadcastPermissions,
                    e.BroadcastingRoomInstanceId,
                    e.RecurrenceSchedule
                })),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPut("playerevents/v2/{EventId}/name")]
        public ContentResult SetEventName(ulong EventId, [FromForm] string name)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            FullPlayerEvent playerEvent = EventDB.GetFullEventById(EventId);

            if (playerEvent == null)
            {
                Utils.ErrorEvent(EventResults.DoesNotExist);
            }

            if (playerEvent.CreatorPlayerId != account.Id)
            {
                Utils.ErrorEvent(EventResults.DoesNotOwnEvent);
            }

            if (string.IsNullOrEmpty(name) || name.Length > 64)
            {
                Utils.ErrorEvent(EventResults.InappropriateName);
            }

            if (Sanitize.ContainsSwears(name))
            {
                Utils.ErrorEvent(EventResults.InappropriateName);
            }

            FullPlayerEvent UpdatedEvent = EventDB.SetEventName(EventId, name);
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Result = EventResults.Success,
                    TagModifyResult = (string?)null,
                    PlayerEvent = new
                    {
                        Tags = UpdatedEvent.Tags,
                        PlayerEventId = UpdatedEvent.PlayerEventId,
                        CreatorPlayerId = UpdatedEvent.CreatorPlayerId,
                        ImageName = UpdatedEvent.ImageName,
                        RoomId = UpdatedEvent.RoomId,
                        SubRoomId = UpdatedEvent.SubRoomId,
                        ClubId = UpdatedEvent.ClubId,
                        Name = UpdatedEvent.Name,
                        Description = UpdatedEvent.Description,
                        StartTime = UpdatedEvent.StartTime,
                        EndTime = UpdatedEvent.EndTime,
                        AttendeeCount = UpdatedEvent.AttendeeCount,
                        State = UpdatedEvent.State,
                        ImageAccessibility = UpdatedEvent.Accessibility,
                        IsMultiInstance = UpdatedEvent.IsMultiInstance,
                        SupportMultiInstanceRoomChat = UpdatedEvent.SupportMultiInstanceRoomChat,
                        DefaultBroadcastPermissions = UpdatedEvent.DefaultBroadcastPermissions,
                        CanRequestBroadcastPermissions = UpdatedEvent.CanRequestBroadcastPermissions,
                        RecurrenceSchedule = UpdatedEvent.RecurrenceSchedule
                    }
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("/api/playerwarnings")]
        public IActionResult CreatePlayerWarning([FromForm] ulong WarnedPlayerId, [FromForm] Moderation_Detail.ReportCategory ReportCategory, [FromForm] string DisplayReason, [FromForm] string? ModeratorNote = "") // WarnedPlayerId=3&ReportCategory=103&DisplayReason=Intentional%20team%20killing&ModeratorNote=
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (!PlayerDB.CheckDevFlag(account.Id))
            {
                return Forbid();
            }

            PlayerDB.Set_moderation_block(
                playerid: account.Id,
                category: ReportCategory,
                duration: 0,
                -1,
                isHostKick: false,
                message: DisplayReason,
                playerIdReporter: WarnedPlayerId,
                isBan: false,
                bannedByPlayerId: account.Id
                );

            return Ok(new
            {
                success = true,
                error = "",
                value = (string?)null
            });
        }

        [HttpGet("/api/banappeal/generateCode")]
        public IActionResult GenerateBanAppealCode()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = false,
                error = "",
                value = "DM @e12354 to appeal!"
            });
        }

        [HttpGet("/outfits/me")]
        public IActionResult GetMyOutfits()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var player = PlayerDB.GetFullAccount(account.Id);

            if (string.IsNullOrEmpty(player.player_Extra.avatar))
            {
                return Ok(new
                {
                    LegacyData = new
                    {
                        SelectionsV1 = (string?)null,
                        SelectionsV2 = (string?)null,
                        FaceFeatures = (string?)null,
                        SkinColor = (string?)null,
                        HairColor = (string?)null
                    },
                    Selections = Array.Empty<object>(),
                    DataVersion = 9,
                    CustomizationSettings = (string?)null,
                    ThumbnailFileName = (string?)null,
                    Name = (string?)null,
                    Accessibility = 0,
                    Slot = 0
                });
            }


            return Ok(player.player_Extra.avatar);
        }

        [HttpPut("/outfits/me")]
        public async Task<IActionResult> SetMyOutfit()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string jsonData = "";
            try
            {
                using var reader = new StreamReader(HttpContext.Request.Body);
                jsonData = await reader.ReadToEndAsync();
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

            if (string.IsNullOrWhiteSpace(jsonData))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };

            try
            {
                Newtonsoft.Json.Linq.JToken.Parse(jsonData);
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


            var player = PlayerDB.GetFullAccount(account.Id);
            if (player == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };

            try
            {
                PlayerDB.set_player_avatar(jsonData, player.playerid);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Avatar Set Error] {ex}");
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            return new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };

            return Ok(player.player_Extra.avatar);
        }

        [HttpGet("/outfits/me/saved")]
        public IActionResult GetMySavedOutfits()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }


        [HttpGet("/sampling")]
        public IActionResult Sampling()
        {
            // Validate the user token
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var samplingData = new List<object>
            {
                new { eventType = "SimilarEntitiesContext", shouldBeSampled = false },
                new { eventType = "OnlineRankingContext", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_modify_object", shouldBeSampled = false },
                new { eventType = "heartbeat", shouldBeSampled = false },
                new { eventType = "edible_bite", shouldBeSampled = false },
                new { eventType = "impression", shouldBeSampled = false },
                new { eventType = "downloadable_cache_loaded", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_selectionChanged", shouldBeSampled = false },
                new { eventType = "hand_gesture_use", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_open_menu", shouldBeSampled = false },
                new { eventType = "load_outfit_failed", shouldBeSampled = false },
                new { eventType = "subroom_stats", shouldBeSampled = false },
                new { eventType = "button_press", shouldBeSampled = false },
                new { eventType = "click", shouldBeSampled = false },
                new { eventType = "emote_use", shouldBeSampled = false },
                new { eventType = "watch_stats", shouldBeSampled = false },
                new { eventType = "edible_consume", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_menu_item_selected", shouldBeSampled = false },
                new { eventType = "drinkable_drink", shouldBeSampled = false },
                new { eventType = "sessionMetadata", shouldBeSampled = false },
                new { eventType = "stacked_UI_flow_change", shouldBeSampled = false },
                new { eventType = "food_spawned", shouldBeSampled = false },
                new { eventType = "Announcement_Shown", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_connect", shouldBeSampled = false },
                new { eventType = "mtm_round_stats", shouldBeSampled = false },
                new { eventType = "RRUI_route_change", shouldBeSampled = false },
                new { eventType = "drinkable_consume", shouldBeSampled = false },
                new { eventType = "makerpen_session_detailed", shouldBeSampled = false },
                new { eventType = "store_search", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_create_object", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_changed_setting", shouldBeSampled = false },
                new { eventType = "ugc_room_save_stats_detailed", shouldBeSampled = false },
                new { eventType = "downloadable_item_loaded", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_configure_object", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_search", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_acm_movement_check", shouldBeSampled = false },
                new { eventType = "eligible_for_matchmaking_toast_event", shouldBeSampled = false },
                new { eventType = "ineligible_for_matchmaking_toast_event", shouldBeSampled = false },
                new { eventType = "external_room_progression_shown", shouldBeSampled = false },
                new { eventType = "time_to_content_load", shouldBeSampled = false },
                new { eventType = "time_to_first_card_loaded", shouldBeSampled = false },
                new { eventType = "avatar_outfit_changed", shouldBeSampled = false },
                new { eventType = "DataAPIQuery", shouldBeSampled = false },
                new { eventType = "RoomElasticsearchQuery", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_favorite_object", shouldBeSampled = false },
                new { eventType = "mlm_quest_step_start", shouldBeSampled = false },
                new { eventType = "mlm_acquire_egg", shouldBeSampled = false },
                new { eventType = "mlm_monster_added", shouldBeSampled = false },
                new { eventType = "mlm_monster_need_met", shouldBeSampled = false },
                new { eventType = "mlm_monster_lvl_up", shouldBeSampled = false },
                new { eventType = "mlm_travel_companion_change", shouldBeSampled = false },
                new { eventType = "mlm_monster_rename", shouldBeSampled = false },
                new { eventType = "mlm_left_evergrown", shouldBeSampled = false },
                new { eventType = "mlm_crafting_complete", shouldBeSampled = false },
                new { eventType = "mlm_sanctuary_lvl_up", shouldBeSampled = false },
                new { eventType = "mlm_monster_light_lvl_up", shouldBeSampled = false },
                new { eventType = "mlm_daily_check_in", shouldBeSampled = false },
                new { eventType = "mlm_add_guaranteed_item", shouldBeSampled = false },
                new { eventType = "RoomAutocompleteElasticsearchQuery", shouldBeSampled = false },
                new { eventType = "mlm_player_capacity_reached", shouldBeSampled = false },
                new { eventType = "mlm_tag_failure", shouldBeSampled = false },
                new { eventType = "mlm_npc_nearby", shouldBeSampled = false },
                new { eventType = "mlm_conversation_start", shouldBeSampled = false },
                new { eventType = "autocomplete_impression", shouldBeSampled = false },
                new { eventType = "rtb_player_stats", shouldBeSampled = false },
                new { eventType = "rtb_challenge_stats", shouldBeSampled = false },
                new { eventType = "rtb_public_event_stats", shouldBeSampled = false },
                new { eventType = "ugc_makerpen_container_rename", shouldBeSampled = false },
                new { eventType = "rtb_feedback", shouldBeSampled = false },
                new { eventType = "contextual_features", shouldBeSampled = false },
                new { eventType = "RoomSearchRequest", shouldBeSampled = false },
                new { eventType = "StatsigParameterDesync", shouldBeSampled = false },
                new { eventType = "reccon_candy_stats", shouldBeSampled = false },
                new { eventType = "reccon_roomstats", shouldBeSampled = false },
                new { eventType = "reccon_trivia_stats", shouldBeSampled = false },
                new { eventType = "reccon_fashion_stats", shouldBeSampled = false },
                new { eventType = "mlm_missing_replicators", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInStatsigTimeout", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInOnlineFriendClick", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInOnlineFriendsPagination", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInOnlineFriendsJoinFriendClick", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInOnlineFriendsViewAll", shouldBeSampled = false },
                new { eventType = "smart_circuit_makerpen_drag_released", shouldBeSampled = false },
                new { eventType = "ugc_room_event", shouldBeSampled = false },
                new { eventType = "CustomAvatarItemSearchRequest", shouldBeSampled = false },
                new { eventType = "perf_metrics", shouldBeSampled = false },
                new { eventType = "whalegame_boatmaterialreset", shouldBeSampled = false },
                new { eventType = "engagementTitlescreenJumpRightInOnlineFriendsViewMore", shouldBeSampled = false },
                new { eventType = "ValentinesDay2025", shouldBeSampled = false },
                new { eventType = "orientation_purchase_flow_steps", shouldBeSampled = false },
                new { eventType = "ai_error", shouldBeSampled = false },
                new { eventType = "ai_mistake", shouldBeSampled = false },
                new { eventType = "ai_missing_functionality", shouldBeSampled = false },
                new { eventType = "ai_response_error", shouldBeSampled = false },
                new { eventType = "ai_text_bug", shouldBeSampled = false },
                new { eventType = "socialcreation1_robotparts", shouldBeSampled = false },
                new { eventType = "socialcreation1_robotactivated", shouldBeSampled = false },
                new { eventType = "ai_conversation", shouldBeSampled = false },
                new { eventType = "ai_expense", shouldBeSampled = false },
                new { eventType = "crossed_bridge", shouldBeSampled = false },
                new { eventType = "completed_task_normally", shouldBeSampled = false },
                new { eventType = "bridge_dropped_time", shouldBeSampled = false },
                new { eventType = "Player_pressed_button", shouldBeSampled = false },
                new { eventType = "bridge_dropped_due_to_time", shouldBeSampled = false },
                new { eventType = "Players_at_finishline", shouldBeSampled = false },
                new { eventType = "Players_at_timeout", shouldBeSampled = false },
                new { eventType = "Social_creation_2_events", shouldBeSampled = false },
                new { eventType = "socail_creation_2_completed_task_normally", shouldBeSampled = false },
                new { eventType = "Socialcreation2_Players_at_finishline", shouldBeSampled = false },
                new { eventType = "Socialcreation2_completed_task_normally", shouldBeSampled = false },
                new { eventType = "Socialcreation2_Placed_object", shouldBeSampled = false },
                new { eventType = "Socialcreation2_Players_at_timeout", shouldBeSampled = false },
                new { eventType = "Socialcreation2_crossed_bridge", shouldBeSampled = false },
                new { eventType = "Socialcreation2_bridge_dropped_due_to_time", shouldBeSampled = false },
                new { eventType = "Socialcreation2_Player_pressed_button", shouldBeSampled = false },
                new { eventType = "widget_watch_state_change", shouldBeSampled = false },
                new { eventType = "ListFilteredEntities", shouldBeSampled = false },
                new { eventType = "roomie_ai_session", shouldBeSampled = false },
                new { eventType = "roomie_ai_response", shouldBeSampled = false },
                new { eventType = "roomie_ai_conversation_history", shouldBeSampled = false },
                new { eventType = "ai_session", shouldBeSampled = false },
                new { eventType = "ai_conversation_history", shouldBeSampled = false },
                new { eventType = "ai_response", shouldBeSampled = false },
                new { eventType = "roomie_ai_expense", shouldBeSampled = false },
                new { eventType = "roomie_ai_error", shouldBeSampled = false },
                new { eventType = "roomie_ai_response_error", shouldBeSampled = false },
                new { eventType = "avatar_item_consumable", shouldBeSampled = false },
                new { eventType = "ham_reached", shouldBeSampled = false },
                new { eventType = "prompt_submitted", shouldBeSampled = false },
                new { eventType = "llm_response_received", shouldBeSampled = false },
                new { eventType = "AccountsToGenericCandidatesContext", shouldBeSampled = false },
                new { eventType = "RoomsToGenericSimilarEntitiesContext", shouldBeSampled = false },
                new { eventType = "Rooms_searchContext", shouldBeSampled = false },
                new { eventType = "QueryRecommendation", shouldBeSampled = false },
                new { eventType = "Generic_searchContext", shouldBeSampled = false },
                new { eventType = "avatar_effect_grenade", shouldBeSampled = false },
                new { eventType = "game_ai_session", shouldBeSampled = false },
                new { eventType = "game_ai_conversation_history", shouldBeSampled = false },
                new { eventType = "game_ai_response", shouldBeSampled = false },
                new { eventType = "game_ai_response_error", shouldBeSampled = false },
                new { eventType = "roomie_avatar_equip", shouldBeSampled = false },
                new { eventType = "game_ai_error", shouldBeSampled = false },
                new { eventType = "roomie_ai_stuck_in_text", shouldBeSampled = false },
                new { eventType = "roomie_ai_restart", shouldBeSampled = false },
                new { eventType = "gift_button_clicked", shouldBeSampled = false },
                new { eventType = "gift_button_consume_clicked", shouldBeSampled = false },
                new { eventType = "rma_booth_entered", shouldBeSampled = false },
                new { eventType = "rma_rate_button_pushed ", shouldBeSampled = false },
                new { eventType = "rma_rating_completion", shouldBeSampled = false },
                new { eventType = "sj_rate_button_pushed", shouldBeSampled = false },
                new { eventType = "sj_rating_completion", shouldBeSampled = false },
                new { eventType = "avatar_glitch_effect_grenade", shouldBeSampled = false },
                new { eventType = "game_ai_expense", shouldBeSampled = false },
                new { eventType = "roomie_interaction", shouldBeSampled = false },
                new { eventType = "roomie_ai_energy_updated", shouldBeSampled = false },
                new { eventType = "Ticket consumed", shouldBeSampled = false }
            };

            return Ok(samplingData);
        }

        [HttpGet("/api/consumables/v1/all")]
        public async Task<IActionResult> GetUnlockableConsumables()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "items", "AllUnlockableConsumables.json");
            string content = await System.IO.File.ReadAllTextAsync(path);
            return Ok(content);
        }

        [HttpPost("/statsigUserProperties")]
        public IActionResult GetStatsigUserProperties()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = ConfigRewild.StatsigEnabled
            });
        }

        [HttpGet("/api/referee/files")]
        public IActionResult GetRefereeFiles()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpPost("/api/PlayerReporting/v1/referee")] // we hate referee so false it to hell
        public IActionResult RefereeCheck()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok("false");
        }

        [HttpGet("/api/ugcPurchasables/v1/items/room/{roomId}")]
        public IActionResult RefereeCheck(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpPost("/lists/contextualfeatures")]
        public IActionResult ContextualFeatures()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = true,
                error_id = (string?)null,
                error = (string?)null
            });
        }

        [HttpGet("/api/progressionEvents/active")]
        public IActionResult GetActiveProgressionEvents()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return NoContent();
        }

        [HttpGet("/api/makerai/checkfreetrialeligibility")]
        public IActionResult CheckFreeTrialEligibility()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Content("false", "application/json");
        }

        [HttpGet("/api/inventions/v2/search")]
        public IActionResult SearchInventions([FromQuery] int skip, [FromQuery] int take)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/api/relationships/mutualfriends")]
        public IActionResult CheckFreeTrialEligibility([FromQuery(Name = "id"), Required] int PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }


        [HttpGet("/api/CampusCard/v1/SignUpBonus")]
        public IActionResult GetRRPlusSignUpBonus()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                RRPlusSignUpBonusId = 3,
                MinFreeItemsPrice = 6000,
                MaxFreeItemsPrice = 10000
            });
        }

        [HttpGet("/lists/algorithmiclists/{algorithmicList}")]
        public async Task<IActionResult> GetAlgorithmicList(string algorithmicList, [FromQuery] int type)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) return error;

            var safeFileName = Path.GetFileName(algorithmicList);
            
            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data", "APIS", "AlgorithmicLists",
                $"{safeFileName}_{type}.json"
            );

            if (!System.IO.File.Exists(path))
                return Ok(new
                {
                    Type = type,
                    Entities = Array.Empty<object>()
                });

            try 
            {
                var jsonText = await System.IO.File.ReadAllTextAsync(path);
                var node = JsonNode.Parse(jsonText);
                
                return Ok(new
                {
                    Type = type,
                    Entities = node as JsonArray ?? new JsonArray()
                });
            }
            catch (System.Text.Json.JsonException)
            {
                return Ok(new
                {
                    Type = type,
                    Entities = Array.Empty<object>()
                });
            }
        }

        [HttpGet("/lists/curatedlists")]
        public async Task<IActionResult> GetCuratedlists([FromQuery] ulong creatorAccountId, [FromQuery] ulong type, [FromQuery] string name)
        {
            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data", "APIS", "CuratedLists",
                $"{creatorAccountId}_{type}_{name}.json"
            );

            if (!System.IO.File.Exists(path))
                return NotFound();

            return PhysicalFile(path, "application/json");
        }

        [HttpGet("/api/activities/charades/v1/words/Icebreakers")]
        public IActionResult GetIcebreakers(ulong RoomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "Charades", "Icebreakers.json");
            if (!System.IO.File.Exists(path))
                return Ok(ConfigRewild.Bracket);

            return PhysicalFile(path, "application/json");
        }

        [HttpGet("/aimoderation/roomie/enabledForPlayer")]
        public IActionResult IsRoomieEnabledForPlayer()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok("true");
        }

        [HttpPost("/aimoderation/roomie/conversation")]
        public IActionResult SaveRoomieConversation([FromForm] string conversation)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) return error;

            if (string.IsNullOrEmpty(conversation)) 
                return BadRequest();

            string pattern = @"(?<=\d{2}:\d{2}:\d{2}\s)(USER|AI)(?=\s\(|:)";

            string processedConversation = Regex.Replace(conversation ?? "", pattern, m => 
            {
                return m.Value == "USER" ? account.Username : "Roomie";
            });

            _ = Task.Run(() => Webhook.Send(
                        account.Id, 
                        "roomie", 
                        "Roomie Info",
                        $"User: @{account.Username} ({account.Id})\n\nLog: {processedConversation}",
                        5898927, 
                        null
                    ));

            return Ok();
        }

        [HttpGet("/api/players/v1/playerPhotoTaggingSetting")]
        public IActionResult GetPlayerPhotoTaggingSetting()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) 
                return error;

            return Ok(PlayerDB.GetPlayerPhotoTaggingSetting(account.Id));
        }

        [HttpPut("/api/players/v1/playerPhotoTaggingSetting")]
        public IActionResult SetPlayerPhotoTaggingSetting([FromBody] SetPlayerPhotoTaggingSettingRequest request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) 
                return error;

            return Ok(PlayerDB.SetPlayerPhotoTaggingSetting(account.Id, request.Setting));
        }

        [HttpGet("/api/keepsakes/globalconfig")]
        public IActionResult GetKeepsakeGlobalConfig()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) 
                return error;

            return Ok(new
            {
                KeepsakeFeatureEnabled = true,
                KeepsakeRoomLimit = 10,
                SocialXpBoostEnabled = false
            });
        }

        [HttpGet("/api/quickPlay/v1/getandclear")]
        public IActionResult GetAndClearQuickPlay()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) 
                return error;

            return NoContent();
        }

        [HttpGet("/api/keepsakes/rooms/{roomId}")]
        public IActionResult GetKeepsakesForRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null) 
                return error;

            return NoContent();
        }

        [HttpPost("/api/messages/v1/friendOnlineStatus")]
        public IActionResult GetFriendOnlineCount()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            
            return Ok(new
            {
                success = true,
                value = new
                {
                    FriendsOnlineCount = int.MaxValue // hehe
                }
            });
        }

        [HttpGet("/api/purchasableXpBoosts/activations")]
        public IActionResult GetPurchasableXpBoosts()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            
            return Ok(new
            {
                Results = Array.Empty<object>(),
                TotalResults = 0
            });
        }

        [HttpGet("/api/inventions/v2/batch")]
        public IActionResult GetListOfInventions([FromQuery] List<ulong> id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            
            return Ok(ConfigRewild.Bracket);
        }

        [HttpPost("/api/consumables/v1/updateActive")]
        public IActionResult UpdateActiveConsumable()
        {
            return NoContent();
        }

        [HttpGet("/api/inventions/v1/fromcreators")]
        public IActionResult UpdateActiveConsumable([FromQuery] ulong id, [FromQuery] int skip, [FromQuery] int take)
        {
            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/sections/bulk")]
        public IActionResult GetSectionsBulk([FromQuery] List<string> id)
        {
            var filePath = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "WatchPages", "bulk.json");

            if (!System.IO.File.Exists(filePath))
                return NotFound();

            var jsonString = System.IO.File.ReadAllText(filePath);
            var allSections = System.Text.Json.JsonSerializer.Deserialize<List<Dictionary<string, object>>>(jsonString);

            if (id == null || !id.Any())
                return Ok(new List<object>());

            var filtered = allSections.Where(s => s.ContainsKey("id") && id.Contains(s["id"]?.ToString())).ToList();

            return Ok(filtered);
        }
    }
}
