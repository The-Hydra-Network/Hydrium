using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Discord;
using Discord.Interactions;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;

namespace Rec_rewild_live_rewrite.api.DiscordBot
{
    public class BotCommands : InteractionModuleBase<SocketInteractionContext>
    {

        [SlashCommand("get-user", "Get Rec Rewild user by ID or name.")]
        public async Task GetUserByIdOrName(string userInput)
        {
            try
            {
                player_data? player;

                if (ulong.TryParse(userInput, out ulong playerId))
                {
                    player = PlayerDB.GetFullAccount(playerId);
                }
                else
                {
                    player = PlayerDB.GetFullAccountByName(userInput);
                }

                if (player == null)
                {
                    await RespondAsync("No user found with the provided ID or name.", ephemeral: true);
                    return;
                }

                var bio = $"{player.player_Extra.Bio}" ?? "This player hasn't written a bio yet!";
                if (string.IsNullOrEmpty(bio))
                {
                    bio = "This player hasn't written a bio yet!";
                }

                var embed = new EmbedBuilder()
                    .WithTitle($"{player.player.Username}")
                    .WithDescription(
                    $"Username: **@{player.player.Username}**\n" +
                    $"Display Name: **{player.player.DisplayName}**\n" +
                    $"Level: **{player.player.Level}**\n" +
                    $"Bio: ```{bio}```\n" +
                    $"This account is linked to the Discord User: <@{player.player_Extra.DiscordId}>")

                    .WithColor(Color.DarkGreen)
                    //.AddField("test", player.playerid.ToString(), true) 
                    //.WithImageUrl(player.profile_image_url ?? "https://default-image-url.com") 
                    .WithThumbnailUrl($"https://recrewild.oldrec.net/img/{player.player.profileImage}?cropSquare=true")
                    .Build();

                await RespondAsync(embed: embed);
            }
            catch (Exception ex)
            {
                await RespondAsync($"Uh Oh Something Went Wrong! Please try again.", ephemeral: true);
            }
        }

        [SlashCommand("leaderboard", "Display the leaderboard for Rec Rewild rooms.")]
        public async Task ShowLeaderboardAsync(string roomname, int statchannel)
        {
            try
            {
                var room = RoomDB.GetRoomByName(roomname);
                if (room == null)
                {
                    await RespondAsync("Room not found!", ephemeral: true);
                    return;
                }

                var leaderboard = LeaderboardDB.GetNearbyScores(1, statchannel, room.RoomId, 0);
                if (leaderboard == null || leaderboard.Count == 0)
                {
                    await RespondAsync("There is no leaderboard or there are no scores for this room!", ephemeral: true);
                    return;
                }

                var embedBuilder = new EmbedBuilder()
                    .WithTitle($"Rec Rewild - Top Players in ^{roomname} Leaderboard")
                    .WithDescription("Here are the top players.")
                    .WithColor(Color.DarkGreen)
                    .WithFooter("Keep playing to climb the ranks!");

                int rank = 1;
                foreach (var score in leaderboard)
                {
                    var player = PlayerDB.GetFullAccount((ulong)score.PlayerId);
                    if (player == null) continue;

                    string rankSuffix = rank switch
                    {
                        1 => "st",
                        2 => "nd",
                        3 => "rd",
                        _ => "th"
                    };

                    embedBuilder.AddField(
                        $"{rank}{rankSuffix} - @{player.player.Username} (Score: {score.Score})",
                        true
                    );

                    rank++;
                }

                var embed = embedBuilder.Build();
                await RespondAsync(embed: embed);
            }
            catch (Exception ex)
            {
                await RespondAsync($"Uh Oh Something Went Wrong! Please try again.", ephemeral: true);
            }
        }

        [SlashCommand("create", "Create your Rec Rewild account.")]
        public async Task CreateAccount(string platformid)
        {
            string CreateErrorMessage =
                "Invalid platform ID provided. Please use [Steam ID](https://media.discordapp.net/attachments/1449894388464615647/1472652698808488007/SteamIDTutorial.png?ex=69935a33&is=699208b3&hm=ed4b9b9810afb627a3279655c4ea712ad19d95d01bbb4adbe0cf5111833c19ce&)";

            ulong allowedChannelId = 1449894388464615647; // command allowed channel
            ulong logChannelId = 1473888914841407488; // staff log channel

            // Local logging function inside this method
            async Task Log(string message)
            {
                var logChannel = Context.Client.GetChannel(logChannelId) as IMessageChannel;
                if (logChannel != null)
                    await logChannel.SendMessageAsync(message);
            }

            // Check allowed channel
            if (Context.Channel.Id != allowedChannelId)
            {
                await Log($"⚠️ **Wrong Channel Attempt**\nUser: <@{Context.User.Id}> (`{Context.User.Id}`)\nChannel: <#{Context.Channel.Id}>\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                await RespondAsync($"❌ You can only use this command in <#{allowedChannelId}>.", ephemeral: true);
                return;
            }

            // Validate platform ID format
            if (!ulong.TryParse(platformid, out ulong platformId))
            {
                await Log($"❌ **Invalid Platform ID Format**\nUser: <@{Context.User.Id}> (`{Context.User.Id}`)\nInput: `{platformid}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                await RespondAsync(CreateErrorMessage, ephemeral: false);
                return;
            }

            if (!platformid.StartsWith("7656"))
            {
                await Log($"❌ **Invalid Steam ID Prefix**\nUser: <@{Context.User.Id}> (`{Context.User.Id}`)\nInput: `{platformid}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                await RespondAsync(CreateErrorMessage, ephemeral: false);
                return;
            }

            if (Context == null || Context.User == null)
            {
                throw new Exception("Context or Context.User is null");
            }

            try
            {
                var guildUser = Context.User as IGuildUser;
                ulong DiscordUserId = guildUser?.Id ?? Context.User.Id;
                Console.WriteLine($"Creating account for Discord User ID: {DiscordUserId} with Platform ID: {platformId}");

                HashSet<ulong> blockedDiscordIds = new()
        {
            1176571557414445137,
            1193883666946998383,
            1344328341951615106
        };

                HashSet<ulong> blockedPlatformIds = new()
        {
            76561199485696854
        };

                // Duplicate checks
                if (PlayerDB.GetAccountCountByPlatformId(platformId) > 0)
                {
                    await Log($"⚠️ **Duplicate Platform Attempt**\nUser: <@{DiscordUserId}> (`{DiscordUserId}`)\nPlatform ID: `{platformId}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                    await RespondAsync("You already have an account!", ephemeral: false);
                    return;
                }

                if (PlayerDB.GetAccountCountByDiscordId(DiscordUserId) > 0)
                {
                    await Log($"⚠️ **Duplicate Discord Attempt**\nUser: <@{DiscordUserId}> (`{DiscordUserId}`)\nPlatform ID: `{platformId}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                    await RespondAsync("You already have an account!", ephemeral: false);
                    return;
                }

                // Blocked users
                if (blockedDiscordIds.Contains(DiscordUserId) || blockedPlatformIds.Contains(platformId))
                {
                    await Log($"🚫 **Blocked Account Creation Attempt**\nUser: <@{DiscordUserId}> (`{DiscordUserId}`)\nPlatform ID: `{platformId}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                    await RespondAsync("You require manual verification. Contact @e12354 on Discord.", ephemeral: false);
                    return;
                }

                // Create account
                account_data acc;
                PlayerDB.CreateAccount(Platforms.Steam, platformId, Utils.GetRandomString(30), DiscordUserId, out acc);
                var random_pass = Utils.GetRandomString(30);
                PlayerDB.SetPlayerPassword(random_pass, acc.accountId, log: false);

                string username = guildUser?.Nickname
                                  ?? Context.User.GlobalName
                                  ?? Context.User.Username
                                  ?? Utils.GetRandomName();
                string sanitizedUsername = Regex.Replace(username, @"[^a-zA-Z0-9]", "");
                if (string.IsNullOrWhiteSpace(sanitizedUsername))
                    sanitizedUsername = Utils.GetRandomName();

                bool success = PlayerDB.SetPlayerUsername(sanitizedUsername, acc.accountId);
                PlayerDB.SetDisplayName(sanitizedUsername, acc.accountId);
                if (!success)
                {
                    sanitizedUsername += new Random().Next(100000, 999999).ToString();
                    PlayerDB.SetPlayerUsername(sanitizedUsername, acc.accountId);
                    PlayerDB.SetDisplayName(sanitizedUsername, acc.accountId);
                }

                var account = PlayerDB.GetFullAccount(acc.accountId);

                // Log successful creation
                await Log($"🆕 **Account Created Successfully**\nUser: <@{DiscordUserId}> (`{DiscordUserId}`)\nPlatform ID: `{platformId}`\nAccount ID: `{acc.accountId}`\nUsername: `{account.player.Username}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");

                // DM user
                try
                {
                    await Context.User.SendMessageAsync(
                        $"✅ **Rec Rewild account created!**\n\n" +
                        $"**Username:** `{account.player.Username}`\n" +
                        $"**Password:** `{random_pass}`\n\n" +
                        $"⚠️ Keep this password secret. Sharing this password will result in a ban."
                    );
                }
                catch
                {
                    await Log($"⚠️ **DM Failed After Account Creation**\nUser: <@{DiscordUserId}> (`{DiscordUserId}`)\nAccount ID: `{acc.accountId}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                    await RespondAsync("Account created, but I couldn't DM you. Please enable DMs from this server. After you do launch the build.", ephemeral: false);
                    return;
                }

                await RespondAsync("📩 Check your DMs!", ephemeral: false);
            }
            catch (Exception ex)
            {
                await Log($"💥 **Account Creation Exception**\nUser: <@{Context.User.Id}> (`{Context.User.Id}`)\nError: `{ex.Message}`\nTime: <t:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}:F>");
                Console.WriteLine(ex);
                await RespondAsync("Uh oh! Something went wrong. Please try again.", ephemeral: false);
            }
        }

    }
}
