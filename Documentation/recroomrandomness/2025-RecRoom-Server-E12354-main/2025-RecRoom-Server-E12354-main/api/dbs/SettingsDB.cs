using LiteDB;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class SettingsDB
    {
        private static readonly string _dbPath = Path.Combine(Environment.CurrentDirectory, "Data", "DBs", "Settings.db");
        private static readonly LiteDatabase _db = new LiteDatabase(_dbPath);

        private static ILiteCollection<PlayerSetting> PlayerSettings => _db.GetCollection<PlayerSetting>("players_settings");

        public static List<Setting> LoadSettings(ulong playerId)
        {
            return PlayerSettings.FindById(playerId)?.Settings ?? new List<Setting>();
        }

        public static void SaveSettings(List<Setting> settings, ulong playerId)
        {
            if (playerId == 0) return;

            var player = new PlayerSetting
            {
                PlayerId = playerId,
                Settings = settings
            };

            PlayerSettings.Upsert(player); // ✅ SAFE
        }


        public static void SetPlayerSetting(string key, string value, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(key) || playerId == 0)
                return;

            if (key is "SplitTestAssignedSegments" or "Growth.LastEmailPromptTime")
                return;

            var col = PlayerSettings;

            var player = col.FindById(playerId) ?? new PlayerSetting
            {
                PlayerId = playerId,
                Settings = CreateDefaultSettings()
            };

            var setting = player.Settings.FirstOrDefault(s => s.Key == key);
            if (setting != null)
                setting.Value = value;
            else
                player.Settings.Add(new Setting { Key = key, Value = value });

            col.Upsert(player); // 🔥 KEY LINE
        }

        public static void DeletePlayerKey(string key, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(key) || playerId == 0)
                return;

            var col = PlayerSettings;

            var player = col.FindById(playerId);
            if (player == null || player.Settings == null)
                return;

            player.Settings.RemoveAll(s => s.Key == key);

            col.Upsert(player);
        }

        public static string? GetPlayerSettingValue(string key, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(key) || playerId == 0)
                return null;

            // ignored keys
            if (key == "SplitTestAssignedSegments")
                return null;

            if (key == "Growth.LastEmailPromptTime")
                return null;

            var settings = LoadSettings(playerId);
            var setting = settings.Find(s => s.Key == key);

            return setting?.Value;
        }

        public static void SetPlayerSettingFromJson(string jsonData, ulong playerId)
        {
            if (string.IsNullOrWhiteSpace(jsonData) || playerId == 0)
                return;

            Setting? setting;
            try
            {
                setting = JsonConvert.DeserializeObject<Setting>(jsonData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to parse setting JSON: {ex.Message}");
                return;
            }

            if (setting == null || string.IsNullOrEmpty(setting.Key) || setting.Key == "SplitTestAssignedSegments")
                return;

            SetPlayerSetting(setting.Key, setting.Value ?? "", playerId);
        }

        public static void DeleteSettings(ulong playerId)
        {
            if (playerId == 0) return;

            var col = PlayerSettings; 
            col.DeleteMany(x => x.PlayerId == playerId);
        }

        public static List<Setting> CreateDefaultSettings() => new List<Setting>
        {
            new Setting { Key = "MOD_BLOCKED_TIME", Value = "0" },
            new Setting { Key = "MOD_BLOCKED_DURATION", Value = "0" },
            new Setting { Key = "PlayerSessionCount", Value = "0" },
            new Setting { Key = "ShowRoomCenter", Value = "1" },
            new Setting { Key = "QualitySettings", Value = "1" },
            new Setting { Key = "Recroom.OOBE", Value = "1" },
            new Setting { Key = "VoiceFilter", Value = "0" },
            new Setting { Key = "VIGNETTED_TELEPORT_ENABLED", Value = "0" },
            new Setting { Key = "CONTINUOUS_ROTATION_MODE", Value = "0" },
            new Setting { Key = "ROTATION_INCREMENT", Value = "0" },
            new Setting { Key = "ROTATE_IN_PLACE_ENABLED", Value = "0" },
            new Setting { Key = "TeleportBuffer", Value = "0" },
            new Setting { Key = "VoiceChat", Value = "1" },
            new Setting { Key = "PersonalBubble", Value = "0" },
            new Setting { Key = "ShowNames", Value = "1" },
            new Setting { Key = "H.264 plugin", Value = "1" },
            new Setting { Key = "Recroom.AccountCreation.HasStarted", Value = "true" },
            new Setting { Key = "Recroom.AccountCreation.HasFinished", Value = "false" },
            new Setting { Key = "Recroom.AccountCreation.HasChosenUsername", Value = "false" },
            new Setting { Key = "Recroom.AccountCreation.HasCreatedPassword", Value = "false" },
            new Setting { Key = "TUTORIAL_COMPLETE_MASK", Value = "0" },
            new Setting { Key = "BACKPACK_FAVORITE_TOOL", Value = "-1" }
        };
    }
}
