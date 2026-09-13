using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace Rec_rewild_live_rewrite.api.server
{
    public class Steam
    {
        private static readonly HttpClient _http = new HttpClient();

        public static async Task<SteamAccountInfo?> GetAccountInfoAsync(string steamId64)
        {
            if (string.IsNullOrWhiteSpace(steamId64))
                return null;

            var url = $"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={ConfigRewild.SteamAPIKey}&steamids={steamId64}";

            var response = await _http.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return null;

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());

            var player = json["response"]?["players"]?.First;
            if (player == null)
                return null;

            return new SteamAccountInfo
            {
                SteamId = steamId64,
                PersonaName = player["personaname"]?.ToString(),
                ProfileUrl = player["profileurl"]?.ToString(),
                Avatar = player["avatarfull"]?.ToString()
            };
        }
    }

    public class SteamAccountInfo
    {
        public string SteamId { get; set; } = "";
        public string? PersonaName { get; set; }
        public string? ProfileUrl { get; set; }
        public string? Avatar { get; set; }
    }
}
