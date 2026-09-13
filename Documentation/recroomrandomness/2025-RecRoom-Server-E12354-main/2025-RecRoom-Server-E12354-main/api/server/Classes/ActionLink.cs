using Newtonsoft.Json;
using LiteDB;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class ActionLink
    {
        [BsonId]
        [JsonIgnore]
        public string LinkId { get; set; } = Utils.GenerateShortCode(6);
        public ulong creatorPlayerId { get; set; }
        public string? data { get; set; }
        public bool isValid { get; set; }
        [JsonIgnore]
        public LinkType CodeType { get; set; }
        [JsonIgnore]
        public int ValidHours { get; set; }
        [JsonIgnore]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        [JsonIgnore]
        public DateTime ExpiresAt => CreatedAt.AddHours(ValidHours);
        [JsonIgnore]
        public int ExtraDataId { get; set; }
    }

    public enum LinkType
    {
        Unknown = -1,
        Friend, // 0
        Referral, // 1
        Meetup, // 2
        Club, // 3
        PlayerEvent, // 4
        Room, // 5
        Influencer, // 6
        Photo // 7
    }
}
