using Microsoft.AspNetCore.Mvc;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Rec_rewild_live_rewrite.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class DiscordController : Controller
    {
        private const string ClientId = "1449223976751464501";
        private const string ClientSecret = "cwy1iuG6Aik0NtNf4hjchSaLlCcVqgmg";
        private const string RedirectUri = "https://recrewild.oldrec.net/api/auth/discord/callback";

        [HttpGet("discord")]
        public IActionResult DiscordLogin()
        {
            var url =
                "https://discord.com/api/oauth2/authorize" +
                $"?client_id={ClientId}" +
                $"&redirect_uri={Uri.EscapeDataString(RedirectUri)}" +
                "&response_type=code" +
                "&scope=identify email";

            return Redirect(url);
        }

        [HttpGet("discord/callback")]
        public async Task<IActionResult> DiscordCallback([FromQuery] string code)
        {
            if (string.IsNullOrEmpty(code))
                return BadRequest("Missing OAuth code.");

            using var http = new HttpClient();

            // Exchange code for access token
            var tokenResponse = await http.PostAsync(
                "https://discord.com/api/oauth2/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = ClientId,
                    ["client_secret"] = ClientSecret,
                    ["grant_type"] = "authorization_code",
                    ["code"] = code,
                    ["redirect_uri"] = RedirectUri
                })
            );

            if (!tokenResponse.IsSuccessStatusCode)
                return Unauthorized("OAuth token exchange failed.");

            var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
            var token = JsonDocument.Parse(tokenJson)
                .RootElement.GetProperty("access_token").GetString();

            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var userJson = await http.GetStringAsync("https://discord.com/api/users/@me");
            var user = JsonDocument.Parse(userJson).RootElement;

            string discordId = user.GetProperty("id").GetString();
            string username = user.GetProperty("username").GetString();

            // Email may be null
            string? email = null;
            if (user.TryGetProperty("email", out var emailProp))
                email = emailProp.GetString();

            Console.WriteLine($"Discord Login: {username} ({discordId}) | Email: {email ?? "N/A"}");

            // 🔐 Lookup account
            var accountIds = PlayerDB.GetAccountIdsByDiscordId(ulong.Parse(discordId));

            if (accountIds == null || !accountIds.Any())
            {
                return Unauthorized("Discord account not linked.");
            }

            var account = PlayerDB.GetFullAccount(accountIds.First());

            if (account == null)
            {
                return Unauthorized("Account not found.");
            }

            // ✅ Issue JWT
            string jwtToken = ClientSecurity.RefreshToken_Web(account.playerid);

            Response.Cookies.Append("Authorization", jwtToken, new Microsoft.AspNetCore.Http.CookieOptions
            {
                Expires = DateTime.Now.AddHours(24),
                HttpOnly = true,
                Secure = true,
                SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict
            });

            return Redirect("/admin/home/v4");
        }
    }
}
