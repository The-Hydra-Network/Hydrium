using System.Collections.Generic;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class Config
    {
        public string MessageOfTheDay { get; set; }
        public string CdnBaseUri { get; set; }
        public string ShareBaseUrl { get; set; }
        public List<LevelProgressionMap> LevelProgressionMaps { get; set; }
        public MatchmakingParams MatchmakingParams { get; set; }
        public List<List<DailyObjective>> DailyObjectives { get; set; }
        public ServerMaintenance ServerMaintainence { get; set; }
        public AutoMicMutingConfig AutoMicMutingConfig { get; set; }
        public StorefrontConfig StorefrontConfig { get; set; }
        public RoomKeyConfig RoomKeyConfig { get; set; }
        public RoomCurrencyConfig RoomCurrencyConfig { get; set; }
        public List<ConfigTableEntry> ConfigTable { get; set; }
        public PhotonConfig PhotonConfig { get; set; }
    }

    public class LevelProgressionMap
    {
        public int Level { get; set; }
        public int RequiredXp { get; set; }
        public int? GiftDropId { get; set; }
    }

    public class MatchmakingParams
    {
        public double PreferFullRoomsFrequency { get; set; }
        public double PreferEmptyRoomsFrequency { get; set; }
    }

    public class DailyObjective
    {
        public int Type { get; set; }
        public int Score { get; set; }
        public int Xp { get; set; }
    }

    public class ServerMaintenance
    {
        public int StartsInMinutes { get; set; }
    }

    public class AutoMicMutingConfig
    {
        public double MicSpamVolumeThreshold { get; set; }
        public double MicVolumeSampleInterval { get; set; }
        public double MicVolumeSampleRollingWindowLength { get; set; }
        public double MicSpamSamplePercentageForWarning { get; set; }
        public double MicSpamSamplePercentageForWarningToEnd { get; set; }
        public double MicSpamSamplePercentageForForceMute { get; set; }
        public double MicSpamSamplePercentageForForceMuteToEnd { get; set; }
        public double MicSpamWarningStateVolumeMultiplier { get; set; }
    }

    public class StorefrontConfig
    {
        public int MinPlayerLevelForGifting { get; set; }
    }

    public class RoomKeyConfig
    {
        public int MaxKeysPerRoom { get; set; }
    }

    public class RoomCurrencyConfig
    {
        public double AwardCurrencyCooldownSeconds { get; set; }
    }

    public class ConfigTableEntry
    {
        public string Key { get; set; }
        public string Value { get; set; }
    }

    public class PhotonConfig
    {
        public string CloudRegion { get; set; }
        public bool CrcCheckEnabled { get; set; }
        public bool EnableServerTracingAfterDisconnect { get; set; }
    }
}
