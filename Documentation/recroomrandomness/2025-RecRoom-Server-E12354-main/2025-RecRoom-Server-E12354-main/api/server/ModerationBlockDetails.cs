using Newtonsoft.Json;

namespace Rec_rewild_live_rewrite.api.server
{
    public class Moderation_Detail
    {
        public class ModerationBlockDetails
        {
            public Moderation_Detail.ReportCategory ReportCategory { get; set; } = Moderation_Detail.ReportCategory.Unknown;
            public int Duration { get; set; } = 0; 
            public long GameSessionId { get; set; } = 0;
            public bool? IsHostKick { get; set; } = false;
            public string? Message { get; set; } = "";
            public ulong? PlayerIdReporter { get; set; } = null;
            public bool? IsBan { get; set; } = false;
            [JsonIgnore]
            public long ModerationSetUnixTime { get; set; } = 0;
            [JsonIgnore]
            public ulong BannedByPlayerId { get; set; } = 0;
        }

        public enum ReportCategory
        {
            Moderator = -1,
            Unknown,
            DEPRECATED_MicrophoneAbuse,
            Harassment,
            Cheating,
            DEPRECATED_ImmatureBehavior,
            AFK,
            Misc,
            Underage,
            VoteKick = 10,
            CoC_Underage = 100,
            CoC_Sexual,
            CoC_Discrimination,
            CoC_Trolling,
            CoC_NameOrProfile,
            IssuingInaccurateReports = 1000
        }
    }
}
