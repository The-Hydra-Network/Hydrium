using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using System.Text;

namespace Rec_rewild_live_rewrite.api.server
{
    public class Webhook
    {
        private static readonly Random rng = new Random();

        public static void Send(ulong accid, string type, string title, string description, long color, string? imageUrl = null, ulong? roomid = null)
        {
            string? webhookUrl = type.ToLower() switch
            {
                "prod" => "https://discord.com/api/webhooks/REPLACEME/REPLACEME",
                "admin" => "https://discord.com/api/webhooks/REPLACEME/REPLACEME",
                "roomie" => "https://discord.com/api/webhooks/REPLACEME/REPLACEME",
                "gaylog" => "https://discord.com/api/webhooks/REPLACEME/REPLACEME",
                _ => null
            };

            if (string.IsNullOrEmpty(webhookUrl))
            {
                Console.WriteLine($"Invalid webhook type: {type}");
                return;
            }


            player_data account = PlayerDB.GetFullAccount(accid);
            bool dev = PlayerDB.CheckDevFlag(accid);
            RoomDBClasses.RoomRoot? room = roomid.HasValue ? RoomDB.GetRoom(roomid.Value) : null;

            string authorName = account?.player?.Username ?? "Unknown User";
            if (dev)
            {
                //authorName += " [DEV]";
            }
            //string authorIcon = "https://example.com/icon.png";

            var payload = JsonConvert.SerializeObject(new discord_content
            {
                content = "",
                attachments = new List<string>(),
                embeds = new List<discord_embed>
                {
                    new discord_embed
                    {
                        title = title,
                        description = description,
                        color = (int)2067276,
                        thumbnail = room != null && !string.IsNullOrEmpty(room.ImageName) ? new { url = $"https://recrewild.oldrec.net/img/{room.ImageName}" } : null,
                        image = string.IsNullOrEmpty(imageUrl) ? null : new discord_embed_image { url = imageUrl },
                        author = new discord_embed_author
                        {
                            name = authorName,
                            icon_url = $"https://recrewild.oldrec.net/img/{account.player.profileImage}?width=80&cropSquare=true",
                            url = $"https://recrewild.oldrec.net/rewild_net/account/user/{account.player.Username}"
                        }
                    }
                }
            });

            Console.WriteLine(
                $"--- {title} ({type.ToUpper()}) ----------------------\n\n" +
                $"{description}\n\n" +
                $"----------------------------------");
            ulong number = (ulong)rng.Next(1000, 999999999);
            try
            {
                using var client = new HttpClient();
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                var response = client.PostAsync(webhookUrl, content).Result;

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Failed to send webhook: {response.StatusCode} - {response.ReasonPhrase}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending webhook: {ex.Message}");
            }
        }

        public class discord_content
        {
            public string? content { get; set; }
            public List<discord_embed>? embeds { get; set; }
            public List<string>? attachments { get; set; }
        }

        public class discord_embed
        {
            public string? title { get; set; }
            public string? description { get; set; }
            public long color { get; set; }
            public object? thumbnail { get; set; }
            public discord_embed_image? image { get; set; }
            public discord_embed_author? author { get; set; }
        }

        public class discord_embed_image
        {
            public string? url { get; set; }
        }
        public class discord_embed_author
        {
            public string? name { get; set; }
            public string? url { get; set; } 
            public string? icon_url { get; set; } 
        }
    }
}
