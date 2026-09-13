using System.Text.Json.Serialization;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class RRPlus
    {
        public class SubscriptionResponse
        {
            [JsonPropertyOrder(1)]
            public Subscription subscription { get; set; }

            [JsonPropertyOrder(2)]
            public ulong? platformAccountSubscribedPlayerId { get; set; }
        }

        public class Subscription
        {
            [JsonPropertyOrder(1)] public int subscriptionId { get; set; }
            [JsonPropertyOrder(2)] public ulong recNetPlayerId { get; set; }
            [JsonPropertyOrder(3)] public int platformType { get; set; }
            [JsonPropertyOrder(4)] public string platformId { get; set; }
            [JsonPropertyOrder(5)] public string platformPurchaseId { get; set; }
            [JsonPropertyOrder(6)] public object? @event { get; set; }
            [JsonPropertyOrder(7)] public int type { get; set; }
            [JsonPropertyOrder(8)] public int level { get; set; }
            [JsonPropertyOrder(9)] public int period { get; set; }
            [JsonPropertyOrder(10)] public DateTime expirationDate { get; set; }
            [JsonPropertyOrder(11)] public bool isAutoRenewing { get; set; }
            [JsonPropertyOrder(12)] public DateTime createdAt { get; set; }
            [JsonPropertyOrder(13)] public DateTime modifiedAt { get; set; }
        }

        public enum SubscriptionLevel
        {
            Gold,
            Platinum,
        }

        public enum SubscriptionPeriod
        {
            Month,
            Year,
        }
    }
}
