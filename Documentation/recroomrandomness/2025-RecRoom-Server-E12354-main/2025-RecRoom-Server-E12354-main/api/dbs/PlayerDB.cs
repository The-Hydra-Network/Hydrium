using System;
using System.Numerics;
using System.Security.Principal;
using LiteDB;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.Controllers;
using SixLabors.ImageSharp;
using static ImageMetadataDB;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class PlayerDB
    {
        public static LiteDatabase PlayerDBFile = new LiteDatabase(Environment.CurrentDirectory + $"/Data/DBs/Players.db");
        private static readonly Random random = new Random();
        private static readonly object randLock = new object();

        public static bool CreateAccount(Platforms platform, ulong platformId, string deviceId, ulong discord_id, out account_data account)
        {
            account = new account_data();

            var col = PlayerDBFile.GetCollection<player_data>("players");
            var maxId = col.FindAll().OrderByDescending(x => x.id).FirstOrDefault()?.id ?? 0;
            ulong accid = maxId + 1;
            account.accountId = accid;
            string name = Utils.GetRandomName();

            account = new account_data
            {
                createdAt = DateTime.UtcNow,
                identityFlags = 0,
                isJunior = null,
                personalPronouns = 0,
                platforms = 0,
                displayName = name,
                username = name,
                profileImage = Utils.GetRandomImageName(),
                accountId = accid
            };
            col.Insert(new player_data
            {
                playerid = account.accountId,
                id = accid,
                platform = platform,
                //platformId = platformId,
                deviceId = new List<string>
                {
                    deviceId
                },
                authtoken = Utils.GetRandomString(400),
                password = "",
                player = new player_info
                {
                    Id = accid,
                    Username = account.username,
                    DisplayName = account.displayName,
                    XP = 0,
                    Level = 1,
                    created_at = account.createdAt,
                    bannerImage = null,
                    profileImage = account.profileImage,
                    IsJunior = false,
                    AvoidJuniors = true,
                    PlayerReputation = new mPlayerReputation
                    {
                        Noteriety = 0,
                        CheerCredit = 20,
                        CheerGeneral = 1,
                        CheerHelpful = 1,
                        CheerGreatHost = 1,
                        CheerSportsman = 1,
                        CheerCreative = 1,
                        SubscriberCount = 0,
                        SubscribedCount = 0,
                        SelectedCheer = CheerCategoryEnum.None
                    },
                    PlatformIds = new List<mPlatformID>
                    {
                         new mPlatformID
                         {
                             Platform = platform,
                             PlatformId = platformId
                         }
                     }
                },
                player_Extra = new player_extra
                {
                    DormRoomID = 1,
                    IpAddresses = new List<string>(),
                    DiscordId = discord_id,
                    Bio = "",
                    avatar = "{\"FaceFeatures\": \"\",\"HairColor\": \"\",\"OutfitSelections\": \"\",\"SkinColor\": \"\"}",
                    SavedOutfits = new List<avatar_data_saved>(),
                    //ModerationBlockDetails = new Moderation_Detail.ModerationBlockDetails()
                    CheeredRooms = new List<ulong>(),
                    FavoritedRooms = new List<ulong>(),
                    sub_count = 0,
                    SubbedTo = new List<ulong>(),
                    IsRecentRoomHistoryVisible = true,
                    Influencer = new Influencer
                    {
                        creatorCode = "",
                        isInfluencer = false,
                    },
                    CustomAvatarItems = new Rec_rewild_live_rewrite.api.server.Classes.db_class.CustomAvatarItems(),
                },
                dev_Flag = DevFlag.none
            });
            //Settings.SaveSettings_db(Settings.CreateDefaultSettings(), accid);
            HeartbeatDB.CreatePlayerHeartbeat(accid, out _, platform, DeviceClasses.Unknown);
            CreateDormForPlayerId(accid);
            return true;
        }

        public static bool ImportPlayers(string importPath)
        {
            Console.WriteLine($"[IMPORT] Starting player import");
            Console.WriteLine($"[IMPORT] Import path: {importPath}");

            try
            {
                if (!File.Exists(importPath))
                {
                    Console.WriteLine($"[ERROR] Import file not found: {importPath}");
                    return false;
                }

                Console.WriteLine("[IMPORT] Reading import file...");
                var json = File.ReadAllText(importPath);
                Console.WriteLine($"[IMPORT] File size: {json.Length} bytes");

                Console.WriteLine("[IMPORT] Deserializing player data...");
                var importedPlayers = JsonConvert.DeserializeObject<List<player_data>>(json);

                if (importedPlayers == null)
                {
                    Console.WriteLine("[ERROR] Deserialization returned null (invalid JSON?)");
                    return false;
                }

                if (importedPlayers.Count == 0)
                {
                    Console.WriteLine("[WARN] Import file contained 0 players");
                    return false;
                }

                Console.WriteLine($"[IMPORT] Players found in file: {importedPlayers.Count}");

                var col = PlayerDBFile.GetCollection<player_data>("players");

                int inserted = 0;
                int skipped = 0;

                foreach (var player in importedPlayers)
                {
                    if (player == null)
                    {
                        Console.WriteLine("[WARN] Encountered null player entry, skipping");
                        skipped++;
                        continue;
                    }

                    Console.WriteLine($"[IMPORT] Processing player ID: {player.id}");

                    try
                    {
                        // Avoid duplicate IDs
                        if (col.Exists(x => x.id == player.id))
                        {
                            Console.WriteLine($"[SKIP] Duplicate player ID {player.id}");
                            skipped++;
                            continue;
                        }
                        player.player_Extra.DormRoomID = RoomDB.clone_dorm_room(player.playerid);

                        col.Insert(player);
                        var name = player.player.Username ?? "<unknown>";
                        var displayName = player.player.DisplayName ?? "<unknown>";
                        var displayEmoji = player.player.DisplayEmoji ?? "";
                        Console.WriteLine($"[OK] Inserted player ({player.id}) @{name} {displayName} {displayEmoji}");
                        inserted++;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[ERROR] Failed to insert player ID {player.id}: {ex.Message}");
                        skipped++;
                    }
                }

                Console.WriteLine("[IMPORT] Import completed");
                Console.WriteLine($"[IMPORT] Inserted: {inserted}");
                Console.WriteLine($"[IMPORT] Skipped: {skipped}");
                Console.WriteLine($"[IMPORT] Total processed: {importedPlayers.Count}");

                return inserted > 0;
            }
            catch (JsonException jex)
            {
                Console.WriteLine($"[ERROR] JSON parsing error: {jex.Message}");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Import failed with exception: {ex}");
                return false;
            }
        }

        public static bool ExportPlayers(string exportPath)
        {
            try
            {
                var col = PlayerDBFile.GetCollection<player_data>("players");
                var allPlayers = col.FindAll().ToList();

                var json = JsonConvert.SerializeObject(allPlayers, Formatting.Indented);
                File.WriteAllText(exportPath, json);

                Console.WriteLine($"Exported {allPlayers.Count} players to {exportPath}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Export failed: {ex.Message}");
                return false;
            }
        }

        public static bool CreateDormForPlayerId(ulong playerid, bool log = false)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.player.Id == playerid);

            if (player.player_Extra != null)
            {
                ulong roomid = RoomDB.clone_dorm_room(playerid);
                player.player_Extra.DormRoomID = roomid;
                col.Update(player);
                if (log)
                {
                    Console.WriteLine($"Room id is {roomid} and successfully updaeted player");
                }
                return true;
            }

            return false;
        }

        public static void EnsureDormsForAllPlayers()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            // Get all players
            var players = col.FindAll();

            foreach (var player in players)
            {
                if (player?.player == null || player.player_Extra == null)
                    continue;

                // Missing or invalid dorm
                if (player.player_Extra.DormRoomID == null || player.player_Extra.DormRoomID == 1)
                {
                    ulong roomId = RoomDB.clone_dorm_room(player.player.Id);
                    player.player_Extra.DormRoomID = roomId;
                    col.Update(player);
                    Console.WriteLine($"Created dorm {roomId} for player {player.player.Id}");
                }
            }
        }

        public static void EnsureDormsDontBeStupid(bool log = false)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var players = col.FindAll();
            int fixCount = 0;

            foreach (var player in players)
            {
                if (player?.player == null || player.player_Extra == null)
                    continue;

                var room = RoomDB.GetRoom((ulong)player.player_Extra.DormRoomID);

                // Check if the room is missing or simply isn't flagged as a Dorm
                if (room == null || !room.IsDorm)
                {
                    if (log)
                    {
                        string reason = (room == null) ? "Room Missing" : "Room not a Dorm";
                        Console.WriteLine($"[DormFix] Player: {player.player.Username} ({player.player.Id}) | Reason: {reason}");
                    }

                    CreateDormForPlayerId(player.player.Id);
                    fixCount++;
                }
            }

            if (log && fixCount > 0)
            {
                Console.WriteLine($"[DormFix] Finished. Fixed {fixCount} player dorm records.");
            }
        }


        public static ulong GetDormId(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.player.Id == playerid);

            if (playerid == 1)
            {
                return 1;
            }

            if (player.player_Extra != null)
            {
                return (ulong)player.player_Extra.DormRoomID;
            }

            return 1;
        }

        public static bool GetLogins(Platforms platform, ulong platformId, out List<AccountLogin> accounts)
        {
            accounts = new List<AccountLogin>();

            var col = PlayerDBFile.GetCollection<player_data>("players");

            // Pull all players (or consider filtering by another simple field if possible)
            var allPlayers = col.FindAll().ToList();

            // Filter in memory
            var players = allPlayers
                .Where(player => player.player.PlatformIds != null &&
                                 player.player.PlatformIds.Any(pid => pid.Platform == platform &&
                                                                      pid.PlatformId == platformId))
                .ToList();

            if (players.Count == 0)
                return false;

            foreach (var player in players)
            {
                var pid = player.player.PlatformIds.First(p => p.Platform == platform &&
                                                               p.PlatformId == platformId);

                accounts.Add(new AccountLogin
                {
                    accountId = player.playerid,
                    createdAt = player.player.created_at,
                    lastLoginTime = player.player.last_login_time,
                    platform = (Platforms)pid.Platform,
                    platformId = pid.PlatformId.ToString()
                });
            }

            accounts = accounts
                .OrderByDescending(a => a.lastLoginTime)
                .ToList();

            return true;
        }



        public static string GetAccountsBulk(List<ulong> playerIds)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            col.EnsureIndex(x => x.id);

            var players = col.Find(x => playerIds.Contains(x.playerid)).ToList();
            if (players.Count == 0)
            {
                return "[]";
            }

            var accounts = players
                .Select(player =>
                {
                    Platforms combinedPlatforms = Platforms.All;

                    if (player.player.PlatformIds != null && player.player.PlatformIds.Count > 0)
                    {
                        foreach (var entry in player.player.PlatformIds)
                        {
                            if (Enum.IsDefined(typeof(Platforms), entry.Platform))
                            {
                                combinedPlatforms |= (Platforms)entry.Platform;
                            }
                        }
                    }
                    else
                    {
                        combinedPlatforms = Enum.IsDefined(typeof(Platforms), player.platform)
                            ? (Platforms)player.platform
                            : Platforms.All;
                    }

                    return new account_data_web
                    {
                        accountId = player.playerid,
                        createdAt = player.player.created_at,
                        displayName = player.player.DisplayName,
                        displayEmoji = player.player.DisplayEmoji,
                        username = player.player.Username,
                        identityFlags = player.player.identityFlags,
                        isJunior = player.player.IsJunior,
                        personalPronouns = player.player.pronounFlags,
                        platforms = (long)combinedPlatforms,
                        profileImage = player.player.profileImage,
                        bannerImage = player.player.bannerImage
                    };
                })
                .OrderBy(a => a.accountId)
                .ToList();

            return JsonConvert.SerializeObject(accounts);
        }

        public static string GetAccountsBulkAdmin(List<ulong> playerIds)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            col.EnsureIndex(x => x.id);

            var players = col.Find(x => playerIds.Contains(x.playerid)).ToList();
            if (players.Count == 0)
            {
                return "[]";
            }

            var accounts = players
                .Select(player =>
                {
                    Platforms combinedPlatforms = Platforms.All;

                    if (player.player.PlatformIds != null && player.player.PlatformIds.Count > 0)
                    {
                        foreach (var entry in player.player.PlatformIds)
                        {
                            if (Enum.IsDefined(typeof(Platforms), entry.Platform))
                            {
                                combinedPlatforms |= (Platforms)entry.Platform;
                            }
                        }
                    }
                    else
                    {
                        combinedPlatforms = Enum.IsDefined(typeof(Platforms), player.platform)
                            ? (Platforms)player.platform
                            : Platforms.All;
                    }

                    return new
                    {
                        accountId = player.playerid,
                        createdAt = player.player.created_at,
                        displayName = player.player.DisplayName,
                        displayEmoji = player.player.DisplayEmoji,
                        username = player.player.Username,
                        identityFlags = player.player.identityFlags,
                        isJunior = player.player.IsJunior,
                        personalPronouns = player.player.pronounFlags,
                        platforms = (long)combinedPlatforms,
                        profileImage = player.player.profileImage,
                        bannerImage = player.player.bannerImage,
                        bio = player.player_Extra.Bio,
                        mbd = JsonConvert.DeserializeObject(PlayerDB.Get_moderation_block(player.playerid)),
                        PlatformIDs = player.player.PlatformIds.Select(p => new
                        {
                            p.Platform,
                            PlatformId = p.PlatformId.ToString(),
                            // Username = Steam.GetAccountInfoAsync(p.PlatformId.ToString()).Result?.PersonaName ?? ""
                        }),
                        level = player.player.Level,
                        xp = player.player.XP
                    };
                })
                .OrderBy(a => a.accountId)
                .ToList();

            return JsonConvert.SerializeObject(accounts);
        }


        public static player_data? getfullaccount_token(ulong playerid, ulong platformid, int platform)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
                return null;

            var ids = player.player.PlatformIds;
            if (ids == null || ids.Count == 0)
                return null;

            bool match = ids.Any(p => p.PlatformId == platformid);

            return match ? player : null;
        }

        /*public static player_data? GetFullAccount(ulong playerid, ulong plaformid, int plaform, string device_id)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return null;
            }
            if (player.platformId == plaformid && player.deviceId.Contains(device_id))
                return player;
            return null;
        }
        */

        public static player_data? GetFullAccount(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player == null)
            {
                return null;
            }

            return player;
        }

        public static player_data? GetFullAccountByName(string username)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Username == username);

            if (player == null)
            {
                return null;
            }

            return player;
        }

        public static player_info? GetAccountById(ulong id)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindById(id);
            return player?.player;
        }

        public static account_data_me? GetAccountMeSafe(ulong playerid)
        {

            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return null;
            }
            Platforms combinedPlatforms = Platforms.All;

            if (player.player.PlatformIds != null && player.player.PlatformIds.Count > 0)
            {
                foreach (var entry in player.player.PlatformIds)
                {
                    // Only accept valid enum values
                    if (Enum.IsDefined(typeof(Platforms), entry.Platform))
                    {
                        combinedPlatforms |= (Platforms)entry.Platform;
                    }
                }
            }
            else
            {
                // Fallback to old single-platform field
                combinedPlatforms = Enum.IsDefined(typeof(Platforms), player.platform)
                    ? (Platforms)player.platform
                    : Platforms.All;
            }
            account_data_me account = new account_data_me
            {
                accountId = player.playerid,
                bannerImage = player.player.bannerImage,
                createdAt = player.player.created_at,
                displayName = player.player.DisplayName,
                email = player.player.Email,
                displayEmoji = player.player.DisplayEmoji,
                username = player.player.Username,
                identityFlags = player.player.identityFlags,
                isJunior = player.player.IsJunior,
                personalPronouns = player.player.pronounFlags,
                platforms = (long)combinedPlatforms,
                profileImage = player.player.profileImage,
            };
            /*
            account_data_me account = new account_data_me
            {
                accountId = player.playerid,
                bannerImage = player.player.bannerImage,
                createdAt = player.player.created_at,
                displayName = player.player.DisplayName,
                displayEmoji = player.player.DisplayEmoji,
                username = player.player.Username,
                identityFlags = player.player.identityFlags,
                isJunior = player.player.IsJunior,
                personalPronouns = player.player.pronounFlags,
                platforms = (long)combinedPlatforms,
                profileImage = player.player.profileImage,
            };
            */
            return account;

        }

        public static string Get_moderation_block(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return JsonConvert.SerializeObject(new Moderation_Detail.ModerationBlockDetails());
            }

            var block = player.player_Extra.ModerationBlockDetails;

            if (block != null && block.Duration > 0 && block.ModerationSetUnixTime > 0)
            {
                // Permanent ban check
                if (block.Duration == int.MaxValue)
                    return JsonConvert.SerializeObject(block);

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                int elapsed = (int)(now - block.ModerationSetUnixTime);
                int remaining = block.Duration - elapsed;

                if (remaining <= 0)
                {
                    player.player_Extra.ModerationBlockDetails = null;
                    col.Update(player);
                    return JsonConvert.SerializeObject(new Moderation_Detail.ModerationBlockDetails());
                }

                // Update duration to time left
                block.Duration = remaining;
            }

            return JsonConvert.SerializeObject(block ?? new Moderation_Detail.ModerationBlockDetails());
        }



        public static string Set_moderation_block(
     ulong playerid,
     Moderation_Detail.ReportCategory category,
     int duration,
     long gameSessionId,
     bool? isHostKick,
     string? message,
     ulong? playerIdReporter,
     bool? isBan,
        ulong bannedByPlayerId,
        bool addAppealMessage = true
 )
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
                return "{}";
            if (addAppealMessage && isBan == true)
            {
                message += " To appeal this ban, DM @e12354 on Discord.";
            }
            var newBlock = new Moderation_Detail.ModerationBlockDetails
            {
                ReportCategory = category,
                Duration = duration,
                GameSessionId = gameSessionId,
                IsHostKick = isHostKick,
                Message = message,
                PlayerIdReporter = playerIdReporter,
                IsBan = isBan,
                ModerationSetUnixTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                BannedByPlayerId = bannedByPlayerId
            };

            player.player_Extra.ModerationBlockDetails = newBlock;
            col.Update(player);

            try
            {
                Notifications.SendToPlayer(playerid, JsonConvert.SerializeObject(WebsocketEvents.CreateBan(newBlock)));
            }
            catch { }

            return JsonConvert.SerializeObject(newBlock);
        }


        public static bool HasActiveModerationBlock(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
                return false;

            var block = player.player_Extra.ModerationBlockDetails;
            if (block == null || block.Duration <= 0 || block.ModerationSetUnixTime <= 0)
                return false;

            if (block.Duration == int.MaxValue) // Permanent ban
                return true;

            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            int elapsed = (int)(now - block.ModerationSetUnixTime);
            int remaining = block.Duration - elapsed;

            if (remaining <= 0)
            {

                return false;
            }

            return true;
        }

        public static bool CheckDevFlag(ulong id)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.id == id);

            if (player != null && (player.dev_Flag & DevFlag.dev) == DevFlag.dev)
            {
                return true;
            }

            return false;
        }

        public static bool CheckModFlag(ulong id)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.id == id);

            if (player != null && (player.dev_Flag & DevFlag.mod) == DevFlag.mod)
            {
                return true;
            }

            return false;
        }

        public static void set_player_avatar(string avatar, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player_Extra.avatar = avatar;
                    col.Update(player_Setting1);
                    return;
                }
            }
        }

        public static (bool Cheered, bool Favorited) GetInteraction(ulong playerid, ulong roomid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
                return (false, false);

            bool cheered = player.player_Extra.CheeredRooms?.Contains(roomid) ?? false;
            bool favorited = player.player_Extra.FavoritedRooms?.Contains(roomid) ?? false;

            return (cheered, favorited);
        }

        public static bool ToggleCheer(ulong playerid, ulong roomid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null) return false;

            if (player.player_Extra.CheeredRooms == null)
                player.player_Extra.CheeredRooms = new List<ulong>();

            bool nowCheered;
            if (player.player_Extra.CheeredRooms.Contains(roomid))
            {
                player.player_Extra.CheeredRooms.Remove(roomid);
                nowCheered = false;
                RoomDB.UpdateRoomCheerCount(roomid, -1);
            }
            else
            {
                player.player_Extra.CheeredRooms.Add(roomid);
                nowCheered = true;
                RoomDB.UpdateRoomCheerCount(roomid, +1);
            }

            col.Update(player);
            return nowCheered;
        }

        public static bool ToggleFavorite(ulong playerid, ulong roomid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null) return false;

            if (player.player_Extra.FavoritedRooms == null)
                player.player_Extra.FavoritedRooms = new List<ulong>();

            bool nowFavorited;
            if (player.player_Extra.FavoritedRooms.Contains(roomid))
            {
                player.player_Extra.FavoritedRooms.Remove(roomid);
                nowFavorited = false;
                RoomDB.UpdateRoomFavoriteCount(roomid, -1);
            }
            else
            {
                player.player_Extra.FavoritedRooms.Add(roomid);
                nowFavorited = true;
                RoomDB.UpdateRoomFavoriteCount(roomid, +1);
            }

            col.Update(player);
            return nowFavorited;
        }

        public static List<account_data> Search(string text)
        {

            var col = PlayerDBFile.GetCollection<player_data>("players");

            List<account_data> list = new List<account_data>();
            foreach (player_data room in col.FindAll())
            {
                bool found = true;

                if (found)
                {
                    if (text.StartsWith("@"))
                    {
                        if (!$"@{room.player.Username.ToLower()}".Contains(text.ToLower()))
                        {
                            found = false;
                        }
                    }
                    else if (room.player.DisplayName is not null)
                    {
                        if (!room.player.DisplayName.ToLower().Contains(text.ToLower()))
                        {
                            found = false;
                        }
                    }
                }

                if (found)
                {
                    var room_data = GetAccountBulk(room.playerid);
                    if (room_data is null)
                        continue;
                    list.Add(room_data);
                }
            }
            return list;
        }

        public static account_data GetAccountBulk(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return null;
            }
            Platforms combinedPlatforms = Platforms.All;

            if (player.player.PlatformIds != null && player.player.PlatformIds.Count > 0)
            {
                foreach (var entry in player.player.PlatformIds)
                {
                    // Only accept valid enum values
                    if (Enum.IsDefined(typeof(Platforms), entry.Platform))
                    {
                        combinedPlatforms |= (Platforms)entry.Platform;
                    }
                }
            }
            else
            {
                // Fallback to old single-platform field
                combinedPlatforms = Enum.IsDefined(typeof(Platforms), player.platform)
                    ? (Platforms)player.platform
                    : Platforms.All;
            }

            return new account_data
            {
                accountId = player.playerid,
                createdAt = player.player.created_at,
                displayName = player.player.DisplayName,
                username = player.player.Username,
                identityFlags = 0,
                isJunior = player.player.IsJunior,
                personalPronouns = 0,
                platforms = 1,
                profileImage = player.player.profileImage,
            };
        }

        public static bool SetPlayerUsername(string username, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var existingplayer = col.FindOne(x => x.player != null && x.player.Username == username && x.playerid != playerid);
            if (existingplayer != null)
            {
                return false;
            }
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.Username = username;
                    col.Update(player_Setting1);
                    return true;
                }
            }
            return false;
        }

        public static bool SetPlayerDev(DevFlag dev_Flag, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var playerRecord = col.FindOne(x => x.playerid == playerid);
            if (playerRecord != null)
            {
                if (playerRecord.player != null)
                {
                    playerRecord.dev_Flag = dev_Flag;
                    col.Update(playerRecord);
                    return true;
                }
            }
            return false;
        }

        public static bool SetAllDev()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            foreach (var playerRecord in col.FindAll())
            {
                if (playerRecord.player != null)
                {
                    playerRecord.dev_Flag = DevFlag.dev;
                    col.Update(playerRecord);
                    return true;
                }
            }
            return false;
        }

        public static account_login<account_data> GetAccountPassword(string username, string password, bool isAdminPanel)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                return new account_login<account_data>
                {
                    success = false,
                    error = "Your username or password is empty, please enter a username and password.",
                };
            }

            var player = col.FindOne(x => x.player.Username == username);
            if (player == null)
            {
                return new account_login<account_data>
                {
                    success = false,
                    error = "The account you are trying to login to does not exist.",
                };
            }

            if (string.IsNullOrEmpty(player.password))
            {
                return new account_login<account_data>
                {
                    success = false,
                    error = "The password or username you entered don't match the account you are trying to login to."
                };
            }

            if (string.IsNullOrEmpty(password))
            {
                return new account_login<account_data>
                {
                    success = false,
                    error = "The password or username you entered don't match the account you are trying to login to.",
                };
            }

            if (isAdminPanel)
            {
                var devCheckResult = PlayerDB.CheckDevFlag(player.playerid);
                if (!devCheckResult)
                {
                    return new account_login<account_data>
                    {
                        success = false,
                        error = "You are not a developer",
                    };
                }
            }

            bool isValid = ClientSecurity.VerifyPassword(password, player.password);

            if (!isValid)
            {
                string oldHash = ClientSecurity.GetHashString(password);
                if (string.Equals(player.password, oldHash, StringComparison.OrdinalIgnoreCase))
                {
                    player.password = ClientSecurity.HashPassword(password);
                    col.Update(player);
                }
                else
                {
                    return new account_login<account_data>
                    {
                        success = false,
                        error = "The password or username you entered don't match the account you are trying to login to."
                    };
                }
            }

            return new account_login<account_data>
            {
                success = true,
                error = "",
                accid = player.playerid,
            };
        }

        public static void SetPlayerPassword(string pass, ulong playerid, bool log)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var playerRecord = col.FindOne(x => x.playerid == playerid);
            if (playerRecord != null && playerRecord.player != null)
            {
                playerRecord.password = ClientSecurity.HashPassword(pass); 
                col.Update(playerRecord);
                if (log)
                {
                    Console.WriteLine($"[Password Change] PlayerID: {playerid} has changed their password.");
                }
            }
        }

        public static bool SetPlayerBio(string bio, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player_Extra.Bio = bio;
                    col.Update(player_Setting1);
                    return true;
                }
            }
            return false;
        }

        public static async Task<bool> SetPlayerLevel(int level, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.Level = level;
                    try
                    {
                        await Notifications.SendToAll(JsonConvert.SerializeObject(WebsocketEvents.createResponse_levelupdate(playerid, level, 0)));
                    }
                    catch
                    {

                    }
                    col.Update(player_Setting1);
                    return true;
                }
            }
            return false;
        }

        public static player_data? GetPlayerByDiscordId(ulong discordId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player_Extra.DiscordId == discordId);
            return player;
        }

        public static void SetDisplayName(string username, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.DisplayName = username;
                    col.Update(player_Setting1);
                    return;
                }
            }
        }

        public static bool SetLastLoginTime(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);
            if (player != null)
            {
                player.player.last_login_time = DateTime.UtcNow;
                col.Update(player);
                return true;
            }
            return false;
        }

        public static bool ResetCheerCreditIfNewDay(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);

            if (player?.player?.PlayerReputation == null)
                return false;

            DateTime lastLoginDate = player.player.last_login_time.Date;
            DateTime today = DateTime.UtcNow.Date;

            if (lastLoginDate < today)
            {
                player.player.PlayerReputation.CheerCredit = 20;
                player.player.last_login_time = DateTime.UtcNow;

                col.Update(player);
                return true;
            }

            return false;
        }


        public static bool AddIpAddress(ulong playerid, string ip)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);
            if (player != null)
            {
                if (player.player_Extra.IpAddresses == null)
                    player.player_Extra.IpAddresses = new List<string>();

                string encryptedIp = Utils.EncryptAes(ip);

                if (!player.player_Extra.IpAddresses.Contains(encryptedIp))
                    player.player_Extra.IpAddresses.Add(encryptedIp);

                col.Update(player);
                return true;
            }
            return false;
        }


        public static List<string> GetDecryptedIpAddresses(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);

            List<string> result = new();
            if (player?.player_Extra?.IpAddresses != null)
            {
                foreach (string encryptedIp in player.player_Extra.IpAddresses)
                {
                    try
                    {
                        result.Add(Utils.DecryptAes(encryptedIp));
                    }
                    catch
                    {
                       
                    }
                }
            }
            return result;
        }

        public static void SetPlayerEmoji(string emoji, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.DisplayEmoji = emoji;
                    col.Update(player_Setting1);
                    return;
                }
            }
        }

        public static void SetPlayerPronounFlags(int pronounflag, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.pronounFlags = pronounflag;
                    col.Update(player_Setting1);
                }
                else
                {
                   
                }
            }
            else
            {
                
            }
        }
        public static void AddSubscription(ulong fromPlayerId, ulong toPlayerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var playerRecord = col.FindOne(x => x.playerid == fromPlayerId);
            if (playerRecord == null || playerRecord.player_Extra == null)
                throw new InvalidOperationException($"player_Extra for player {fromPlayerId} not found.");

            // check if already subscribed
            if (!playerRecord.player_Extra.SubbedTo.Contains(toPlayerId))
            {
                playerRecord.player_Extra.SubbedTo.Add(toPlayerId);
                col.Update(playerRecord);
                IncrementSubscriberCount(toPlayerId);
            }
        }

        public static void IncrementSubscriberCount(ulong playerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);
            if (player != null && player.player_Extra != null)
            {
                player.player_Extra.sub_count++;
                col.Update(player);
            }
        }

        public static void RemoveSubscription(ulong fromPlayerId, ulong toPlayerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var playerRecord = col.FindOne(x => x.playerid == fromPlayerId);
            if (playerRecord == null || playerRecord.player_Extra == null)
                return;

            if (playerRecord.player_Extra.SubbedTo.Remove(toPlayerId))
            {
                col.Update(playerRecord);
                DecrementSubscriberCount(toPlayerId);
            }
        }

        public static void DecrementSubscriberCount(ulong playerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);
            if (player != null && player.player_Extra != null && player.player_Extra.sub_count > 0)
            {
                player.player_Extra.sub_count--;
                col.Update(player);
            }
        }

        public static List<ulong> GetSubscribedToIds(ulong playerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var playerRecord = col.FindOne(x => x.playerid == playerId);
            if (playerRecord != null && playerRecord.player_Extra != null)
            {
                return playerRecord.player_Extra.SubbedTo;
            }
            return new List<ulong>();
        }

        public static void SetPlayerIdentityFlags(int IdentityFlag, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.identityFlags = IdentityFlag;
                    col.Update(player_Setting1);
                }
                else
                {

                }
            }
            else
            {
            }
        }

        public static void SetPlayerImageName(string imageName, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player?.player == null)
                return;

            player.player.profileImage = imageName;
            col.Update(player);
        }

        public static void SetPlayerBanner(string imageName, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player?.player == null)
                return;

            player.player.bannerImage = imageName;
            col.Update(player);
        }

        public static int GetAccountCountByPlatformId(ulong platformId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            return col.Count(x =>
                x.player.PlatformIds != null &&
                x.player.PlatformIds
                    .Select(pid => pid.PlatformId)
                    .Any(id => id == platformId)
            );
        }
        public static int GetAccountCountByDiscordId(ulong discordId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            return col.Count(x =>
                x.player_Extra != null &&
                x.player_Extra.DiscordId == discordId
            );
        }

        public static List<ulong> GetAccountIdsByDiscordId(ulong discordId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            return col
                .Find(x =>
                    x.player_Extra != null &&
                    x.player_Extra.DiscordId == discordId
                )
                .Select(x => (ulong)x.playerid)
                .ToList();
        }


        public static ulong GetPlayerCount()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var players = col.FindAll().ToList();

            if (players.Count == 0)
                return 0;

            ulong minID = players.Min(p => p.playerid);
            ulong maxID = players.Max(p => p.playerid);
            ulong expectedCount = (ulong)(maxID - minID + 1);

            return expectedCount;
        }

        

        public static List<object> Find_all_player_filtered(string? id, string? displayName, string? minLevel, string? jrState, string? platformId, string? deviceId, bool onlyBannedPlayers)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players"); List<object> list = new List<object>();

            foreach (player_data player in col.FindAll())
            {
                if (id != null && player.playerid.ToString() != id)
                    continue;

                if (displayName != null && !player.player.DisplayName.Contains(displayName, StringComparison.OrdinalIgnoreCase))
                    continue;

                if (minLevel != null && int.TryParse(minLevel, out int minLvl))
                {
                    if (player.player.Level < minLvl)
                        continue;
                }

                if (jrState != null && jrState != "N/A")
                {
                    bool expectedJunior = jrState == "true";
                    if (player.player.IsJunior != expectedJunior)
                        continue;
                }

                if (!string.IsNullOrEmpty(platformId) && (player.player.PlatformIds == null || !player.player.PlatformIds.Any(pid => pid.PlatformId.ToString() == platformId)))
                {
                    continue;
                }

                if (onlyBannedPlayers)
                {
                    var block = player.player_Extra.ModerationBlockDetails;
                    if (block == null || block.IsBan != true || !HasActiveModerationBlock(player.playerid))
                        continue;
                }


                if (deviceId != null && !string.Equals(player.deviceId.ToString(), deviceId, StringComparison.OrdinalIgnoreCase))
                    continue;

                var room_data = GetAccountBulk_full(player.playerid);
                if (room_data != null)
                    list.Add(room_data);
            }

            return list;
        }

        public static object? GetAccountBulk_full(ulong playerid)
        {

            var col = PlayerDBFile.GetCollection<player_data>("players");
            List<object> list = new List<object>();
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return null;
            }
            return new
            {
                AccountId = player?.playerid,
                Level = player?.player?.Level,
                xp = player?.player?.XP,
                DisplayName = player?.player?.DisplayName,
                DeviceId = player?.deviceId,
                Username = player?.player?.Username,
                IsJunior = player?.player?.IsJunior,
                ProfileImage = player?.player?.profileImage,
                LastLoginTime = player?.player?.last_login_time,
                CreatedAt = player?.player?.created_at,
                PlatformIDs = player?.player?.PlatformIds,
                dormroom_id = player?.player_Extra?.DormRoomID,
            };
        }

        public static void DeletePlayer(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player != null)
            {
                col.Delete(playerid);
                Console.WriteLine("Deleted player id " + playerid);
            }
            else
            {
                Console.WriteLine($"Player with ID {playerid} not found.");
            }
        }

        public static int DeletePlayersWithNullLastLogin()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var minDate = DateTime.MinValue;

            var playersToDelete = col
                .Find(x => x.player.last_login_time == minDate)
                .Select(x => x.playerid)
                .ToList();

            int deleted = 0;

            foreach (var id in playersToDelete)
            {
                if (DeletePlayerFull(id))
                    deleted++;
            }

            Console.WriteLine($"Deleted {deleted} players with default LastLogin.");

            return deleted;
        }


        public static bool DeletePlayerFull(ulong playerid)
        {
            try
            {
                DeletePlayer(playerid);
                RoomDB.DeleteAllRoomsFromPlayerId(playerid);
                HeartbeatDB.ClearPlayerHeartbeat(playerid);
                SettingsDB.DeleteSettings(playerid);
                LinkDB.DeleteLinksFromPlayerId(playerid);
                ImageMetadataDB.DeleteImagesFromPlayerId(playerid);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static string SetRecentRooms(ulong playerid, ulong room_id)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);

            if (player != null)
            {
                if (player.player.recent_rooms == null)
                {
                    player.player.recent_rooms = new List<ulong>();
                }

                player.player.recent_rooms.Remove(room_id);
                player.player.recent_rooms.Insert(0, room_id);

                col.Update(player);
            }
            return "";
        }

        public static string GetRecentRooms(ulong playerId, int skip = 0, int take = 20)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerId);

            if (player == null || player.player.recent_rooms == null || !player.player.recent_rooms.Any())
            {
                return "[]";
            }

            var paginatedRoomIds = player.player.recent_rooms
                .Skip(Math.Max(0, skip))
                .Take(Math.Max(1, take))
                .ToList();

            var visitedRooms = new List<RoomDBClasses.RoomRoot>();

            foreach (ulong roomId in paginatedRoomIds)
            {
                var room = RoomDB.GetRoom(roomId);
                if (room != null)
                {
                    visitedRooms.Add(room);
                }
            }

            return JsonConvert.SerializeObject(visitedRooms, Formatting.None);
        }


        public static string ClearRecentRoomsForAllPlayers()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var allPlayers = col.FindAll();

            foreach (var player in allPlayers)
            {
                if (player.player.recent_rooms != null && player.player.recent_rooms.Count > 0)
                {
                    player.player.recent_rooms = new List<ulong>();
                    col.Update(player);
                }
            }

            return "";
        }

        public static string GetFavoritedRooms(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Id == playerid);

            if (player == null || player.player_Extra.FavoritedRooms == null)
            {
                return "[]";
            }

            var favRooms = new List<RoomDBClasses.RoomRoot>();

            foreach (ulong roomId in player.player_Extra.FavoritedRooms)
            {
                var room = RoomDB.GetRoom(roomId);
                if (room != null)
                {
                    favRooms.Add(room);
                }
            }

            return JsonConvert.SerializeObject(favRooms);
        }

        // Todo: Make this support multiple device ids - e12354
        public static void SetPlayerDeviceId(string DeviceId, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player != null)
            {
                if (player.player != null)
                {
                    player.deviceId = new List<string> { DeviceId };
                    col.Update(player);
                    return;
                }
            }
        }
        public static void SetPlayerDiscordId(ulong DiscordId, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player != null)
            {
                if (player.player != null)
                {
                    player.player_Extra.DiscordId = DiscordId;
                    col.Update(player);
                    return;
                }
            }
        }

        public static string GetPlayerNameById(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            return player?.player.Username ?? "Unknown";
        }

        public static ulong GetPlayerIdByName(string name)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player.Username == name);
            return player?.player.Id ?? 0;
        }

        public static string GetAvatarSaved(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
            {
                return "[]";
            }

            return JsonConvert.SerializeObject(player.player_Extra.SavedOutfits);
        }

        public static string SetAvatarSaved(ulong playerid, List<avatar_data_saved> avatars)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");

            var player = col.FindOne(x => x.playerid == playerid);
            if (player == null)
                return "[]";

            if (player.player_Extra.SavedOutfits == null)
                player.player_Extra.SavedOutfits = new List<avatar_data_saved>();

            var incomingSlots = avatars.Select(a => a.Slot).ToHashSet();
            player.player_Extra.SavedOutfits.RemoveAll(a => incomingSlots.Contains(a.Slot));

            player.player_Extra.SavedOutfits.AddRange(avatars);

            col.Update(player);

            return JsonConvert.SerializeObject(player.player_Extra.SavedOutfits);
        }

        public static void SetPlayerCheer(CheerCategoryEnum cheer = CheerCategoryEnum.None, ulong playerid = 0)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player.PlayerReputation != null)
                {
                    player_Setting1.player.PlayerReputation.SelectedCheer = cheer;
                    col.Update(player_Setting1);
                    return;
                }
            }
        }




        public static CheerCategoryEnum? GetPlayerCheer(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);

            if (player_Setting1 != null)
            {
                if (player_Setting1.player.PlayerReputation != null)
                {
                    return player_Setting1.player.PlayerReputation.SelectedCheer;
                }
            }

            return null;
        }

        public static List<ulong> GetInfluencerIds()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var result = col.Query().Where(x => x.player_Extra.Influencer.isInfluencer == true).Select(x => x.playerid).ToList();
            return result;
        }

        public static player_data? GetInfluencerByCreatorCode(string creatorcode)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.player_Extra.Influencer.creatorCode == creatorcode && x.player_Extra.Influencer.isInfluencer == true);
            return player;
        }

        public static void SetIsInfluencer(ulong playerid, bool IsInfluencer)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player == null)
                return;

            if (player.player_Extra == null)
                player.player_Extra = new player_extra();

            if (player.player_Extra.Influencer == null)
                player.player_Extra.Influencer = new Influencer();

            player.player_Extra.Influencer.isInfluencer = IsInfluencer;

            col.Update(player);
        }

        public static void SetCreatorCode(ulong playerid, string creatorcode)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player == null)
                return;

            if (player.player_Extra == null)
                player.player_Extra = new player_extra();

            if (player.player_Extra.Influencer == null)
                player.player_Extra.Influencer = new Influencer();

            player.player_Extra.Influencer.creatorCode = creatorcode;

            col.Update(player);
        }

        public static void SupportInfluencer(ulong requestplayerid, ulong SupportId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == requestplayerid);
            if (player != null)
            {
                if (player.player_Extra.Influencer == null)
                {
                    player.player_Extra.Influencer = new Influencer();
                }

                player.player_Extra.Influencer.SupportingInfluencer = SupportId;
                col.Update(player);
                return;
            }
        }

        public static ulong? GetMyInfluencer(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);

            if (player != null)
            {
                if (player.player_Extra.Influencer != null)
                {
                    return player.player_Extra.Influencer.SupportingInfluencer;
                }
            }

            return 0;
        }

        // message funcs

        public static List<MessageData> GetMessages(ulong playerId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);

            if (player == null)
                return new List<MessageData>();

            if (player.player_Extra.Messages == null)
                player.player_Extra.Messages = new List<MessageData>();

            return player.player_Extra.Messages;
        }

        public static MessageData? AddMessage(ulong toPlayerId, ulong fromPlayerId, WebsocketEvents.MessageType type, string? data, ulong? roomId = null, ulong? playerEventId = null)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == toPlayerId);

            if (player == null)
                return null;

            if (player.player_Extra.Messages == null)
                player.player_Extra.Messages = new List<MessageData>();

            var msg = new MessageData()
            {
                Id = GenerateRandomMessageId(),
                FromPlayerId = fromPlayerId,
                SentTime = DateTime.UtcNow,
                Type = type,
                Data = data,
                RoomId = roomId,
                PlayerEventId = playerEventId
            };

            player.player_Extra.Messages.Add(msg);
            col.Update(player);

            return msg;
        }

        public static void DeleteMessage(ulong playerId, ulong messageId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);

            if (player == null)
                return;

            if (player.player_Extra.Messages == null || player.player_Extra.Messages.Count == 0)
                return;

            var message = player.player_Extra.Messages.FirstOrDefault(m => m.Id == messageId);

            if (message == null)
                return;

            player.player_Extra.Messages.Remove(message);

            // Save changes
            col.Update(player);
        }


        public static ulong GenerateRandomMessageId()
        {
            lock (randLock)
            {
                byte[] buffer = new byte[8];
                random.NextBytes(buffer);
                return BitConverter.ToUInt64(buffer, 0);
            }
        }
        // message funcs

        public static int SetCheerCredit(int cheerCredit, ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player_Setting1 = col.FindOne(x => x.playerid == playerid);
            if (player_Setting1 != null)
            {
                if (player_Setting1.player != null)
                {
                    player_Setting1.player.PlayerReputation.CheerCredit = cheerCredit;
                    col.Update(player_Setting1);
                    return cheerCredit;
                }
            }
            return 0;
        }

        public static void Setup()
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            col.EnsureIndex(x => x.playerid, true);
            col.EnsureIndex(x => x.platform);
            col.EnsureIndex(x => x.player.PlatformIds);
            col.EnsureIndex(x => x.player.Username);
            col.EnsureIndex(x => x.deviceId);
            col.EnsureIndex(x => x.authtoken);
            col.EnsureIndex(x => x.id);
            col.EnsureIndex(x => x.player_Extra.Messages);
            col.EnsureIndex("infl", "playerExtra.Influencer.isInfluencer");
        }

        public static string? GetPlayerData(ulong playerId, ulong roomId)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);

            if (player?.player_Extra?.MyRoomData?.PlayerData == null)
                return null;

            var entry = player.player_Extra.MyRoomData.PlayerData.FirstOrDefault(p => p.RoomId == roomId);
            
            return entry?.Data;
        }

        public static bool SetPlayerData(ulong playerId, ulong roomId, string data)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerId);

            if (player == null) 
                return false;

            if (player.player_Extra == null)
                player.player_Extra = new player_extra();

            if (player.player_Extra.MyRoomData == null)
                player.player_Extra.MyRoomData = new MyRoomData();

            if (player.player_Extra.MyRoomData.PlayerData == null) 
                player.player_Extra.MyRoomData.PlayerData = new List<PlayerData>();

            var existingEntry = player.player_Extra.MyRoomData.PlayerData.FirstOrDefault(p => p.RoomId == roomId);

            if (existingEntry != null)
            {
                existingEntry.Data = data;
            }
            else
            {
                player.player_Extra.MyRoomData.PlayerData.Add(new PlayerData 
                { 
                    RoomId = roomId, 
                    Data = data 
                });
            }

            return col.Update(player);
        }

        public static PlayerPhotoTaggingSetting GetPlayerPhotoTaggingSetting(ulong playerid)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player != null)
            {
                if (player.player != null)
                {
                    return player.player_Extra.PlayerPhotoTaggingSetting;
                }
            }
            return PlayerPhotoTaggingSetting.Anyone;
        }

        public static bool SetPlayerPhotoTaggingSetting(ulong playerid, PlayerPhotoTaggingSetting playerPhotoTaggingSetting)
        {
            var col = PlayerDBFile.GetCollection<player_data>("players");
            var player = col.FindOne(x => x.playerid == playerid);
            if (player != null)
            {
                if (player.player != null)
                {
                    player.player_Extra.PlayerPhotoTaggingSetting = playerPhotoTaggingSetting;
                    col.Update(player);
                    return true;
                }
            }
            return false;
        }
    }
}
