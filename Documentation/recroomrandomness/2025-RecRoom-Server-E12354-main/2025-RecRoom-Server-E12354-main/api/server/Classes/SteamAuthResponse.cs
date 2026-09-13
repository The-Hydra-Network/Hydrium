using Newtonsoft.Json;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class SteamAuthResponse
    {
        public SteamResponse? response { get; set; }
    }

    public class SteamResponse
    {
        [JsonProperty("params")]
        public SteamParams? paramsData { get; set; }
    }

    public class SteamParams
    {
        public string? result { get; set; }
        public string? steamid { get; set; }
        public string? ownersteamid { get; set; }
        public bool vacbanned { get; set; }
        public bool publisherbanned { get; set; }
    }
}
