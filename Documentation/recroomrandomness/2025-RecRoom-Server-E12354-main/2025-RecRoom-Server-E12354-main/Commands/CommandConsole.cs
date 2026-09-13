using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualBasic;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.Controllers;

namespace Rec_rewild_live_rewrite.Commands
{
    public class CommandConsole
    {
        private readonly Dictionary<string, Action> _commands = new();

        public CommandConsole()
        {
            _commands = CommandSetup.RegisterAllCommands(this);

            Console.WriteLine("Type !help to see available commands.");

            string? input;
            while (true)
            {
                Console.Write("> ");
                input = Console.ReadLine();

                if (string.IsNullOrWhiteSpace(input))
                    continue;

                if (_commands.TryGetValue(input.Trim(), out var command))
                {
                    try
                    {
                        command.Invoke();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[Error] {ex.Message}");
                    }
                }
                else
                {
                    Console.WriteLine($"Unknown command: {input}");
                }
            }
        }

        [ConsoleCommand("!help", "Shows this help message.")]
        private void Help()
        {
            Console.WriteLine("\nAvailable Commands:");
            foreach (var kvp in _commands)
            {
                var method = GetType().GetMethod(kvp.Value.Method.Name,
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                var attr = method?.GetCustomAttribute<ConsoleCommandAttribute>();
                if (attr != null)
                    Console.WriteLine($"  {attr.CommandName,-15} {attr.Description}");
            }
            Console.WriteLine();
        }

        [ConsoleCommand("!send_msg_in_chat", "e e e e e e.")]
        private void E()
        {
            Console.WriteLine("Enter chat thread ID: ");
            var idStr = Console.ReadLine();
            if (!long.TryParse(idStr, out var id))
            {
                Console.WriteLine("Invalid chat thread ID format.");
                return;
            }

            var thread = ChatDB.GetThread(id);

            Console.WriteLine("Enter id who you gonna send as: ");
            var senderIdStr = Console.ReadLine();
            if (!int.TryParse(senderIdStr, out var senderId))
            {
                Console.WriteLine("Invalid sender player ID format.");
                return;
            }
            Console.WriteLine("Enter message contents: ");
            var contents = Console.ReadLine() ?? "";
            if (!string.IsNullOrEmpty(contents)) 
            {
                contents = JsonConvert.SerializeObject(new
                {
                    Type = 0,
                    Version = 1,
                    Data = contents
                });
            }
            var msg = ChatDB.AddMessage(id, senderId, contents);

            thread = ChatDB.GetThread(id);

            var payload = new
            {
                Id = "ChatMessageReceived",
                Msg = new
                {
                    chatMessageId = msg.ChatMessageId,
                    chatThreadId = msg.ChatThreadId,
                    senderPlayerId = msg.SenderPlayerId,
                    timeSent = msg.TimeSent,
                    contents = msg.Contents,
                    moderationState = msg.ModerationState
                }
            };

            Notifications.SendToPlayers(thread.PlayerIds, JsonConvert.SerializeObject(payload));
        }

        [ConsoleCommand("!create_test_accounts", "Creates test accounts in the database.")]
        private void CreateTestAccounts()
        {
            try
            {
                Console.WriteLine("Creating test accounts...");
                PlayerDB.CreateAccount(0, 1, "deviceid_test1", 1, out var account1);
                PlayerDB.CreateAccount(0, 76561199535310323, "deviceid_test2", 1228278497194147860, out var account2);
                PlayerDB.CreateAccount(0, 76561199244473837, "deviceid_test3", 1200818172715073596, out var account3);
                Console.WriteLine("✅ Test accounts created successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex}");
            }
        }

        [ConsoleCommand("!delete_player", "Deletes a player account by ID.")]
        private void DeletePlayer()
        {
            Console.Write("Enter player ID to delete: ");
            var idStr = Console.ReadLine();
            if (ulong.TryParse(idStr, out var id))
            {
                if (PlayerDB.DeletePlayerFull(id))
                    Console.WriteLine($"✅ Deleted player {id}");
                else
                    Console.WriteLine($"⚠️ Player {id} not found.");
            }
            else
            {
                Console.WriteLine("Invalid ID format.");
            }
        }
         
        [ConsoleCommand("!set_room_image", "Sets a room's image by ID or name.")]
        private void SetRoomImage()
        {
            Console.Write("Enter room ID or name: ");
            string input = Console.ReadLine();

            ulong roomId = 0;
            bool validRoom = false;

            if (ulong.TryParse(input, out var id))
            {
                if (RoomDB.DoesRoomExist(id))
                {
                    roomId = id;
                    validRoom = true;
                }
            }
            else
            {
                var room = RoomDB.GetRoomByName(input);
                if (room != null)
                {
                    roomId = room.RoomId;
                    validRoom = true;
                }
                Console.WriteLine("Current image name: " + room.ImageName);
            }

            if (!validRoom)
            {
                Console.WriteLine("Room not found by ID or name.");
                return;
            }
            Console.Write("Enter new image name: ");
            string imageName = Console.ReadLine();
            RoomDB.SetRoomImageName(roomId, imageName);
            Console.WriteLine($"Room image updated successfully for room ID {roomId}.");
        }

        [ConsoleCommand("!set_player_influencer", "Sets a player's influencer status and creator code.")]
        private void SetPlayerInfluencer()
        {
            Console.Write("Enter player ID: ");
            string input = Console.ReadLine();
            if (!ulong.TryParse(input, out var playerId))
            {
                Console.WriteLine("Invalid player ID.");
                return;
            }

            Console.Write("Set as influencer? (yes/no): ");
            string influencerInput = Console.ReadLine()?.Trim().ToLowerInvariant();
            bool isInfluencer = influencerInput == "yes" || influencerInput == "y";

            Console.Write("Enter creator code (or leave blank to skip): ");
            string creatorCode = Console.ReadLine()?.Trim();

            // Set influencer
            PlayerDB.SetIsInfluencer(playerId, isInfluencer);

            // Set creator code if provided
            if (!string.IsNullOrWhiteSpace(creatorCode))
            {
                PlayerDB.SetCreatorCode(playerId, creatorCode);
            }

            Console.WriteLine($"Player {playerId} updated: Influencer={isInfluencer}, CreatorCode='{creatorCode}'");
        }

        /*[ConsoleCommand("!send_message", "tset")]
        private async Task Test()
        {
            Console.WriteLine("How u gonna send it as? \n Type 1 for [ALL] or 2 for [TOPLAYER]");
            var input = Console.ReadLine();

            // 1 = ALL, 2 = specific target player
            bool sendToAll = input == "1";

            // Create the message entry once (stored in DB)
            var newMsg = PlayerDB.AddMessage(
                toPlayerId: sendToAll ? 0 : playerIdTo, // 0 = no specific target for DB
                fromPlayerId: fromid,
                type: WebsocketEvents.MessageType.CoachMessage,
                data: messagestr,
                roomId: null,
                playerEventId: null
            );

            if (newMsg == null)
            {
                Console.WriteLine("Failed to create message entry (AddMessage returned null).");
                return;
            }

            try
            {
                // Convert message to websocket event
                var response = JsonConvert.SerializeObject(
                    WebsocketEvents.CreateMessageResponse(newMsg)
                );

                if (sendToAll)
                {
                    Console.WriteLine("Sending message to ALL players...");
                    await Notifications.SendToAll(response);
                }
                else
                {
                    Console.WriteLine($"Sending message to player {playerIdTo}...");
                    await Notifications.SendToPlayer(playerIdTo, response);
                }

                Console.WriteLine("Message sent successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
        }
        */

        [ConsoleCommand("!get_player_ip", "Gets a player's IP.")]
        private void GetPlayerIP()
        {
            Console.WriteLine("What is the player ID?");
            string? playerIdInput = Console.ReadLine();
            if (!ulong.TryParse(playerIdInput, out ulong playerId))
            {
                Console.WriteLine("Invalid player ID.");
                return;
            }

            var decryptedIps = PlayerDB.GetDecryptedIpAddresses(playerId);

            if (decryptedIps.Count == 0)
            {
                Console.WriteLine("No decrypted IP addresses found.");
                return;
            }
            else
            {
                Console.WriteLine("Decrypted IP addresses:");
                foreach (var ip in decryptedIps)
                {
                    Console.WriteLine($"- {ip}");
                }
            }
        }


        [ConsoleCommand("!import_player_from_recnet", "Imports a player from RecNet.")]
        public void ImportPlayerFromRecNet()
        {
            Console.WriteLine("What is the player ID?");
            string? playerIdInput = Console.ReadLine();
            if (!ulong.TryParse(playerIdInput, out ulong playerId))
            {
                Console.WriteLine("Invalid player ID.");
                return;
            }

            using var http = new HttpClient();

            var userJson = http.GetStringAsync("https://accounts.rec.net/account/bulk?id=1999").Result;
            var user = JsonDocument.Parse(userJson).RootElement;

            string username = user.GetProperty("username").GetString();
            string displayName = user.GetProperty("displayName").GetString();
            string profileImage = user.GetProperty("profileImage").GetString();
            string bannerImage = user.GetProperty("bannerImage").ToString();
            int personalPronouns = user.GetProperty("personalPronouns").GetInt32();
            int identityFlags = user.GetProperty("identityFlags").GetInt32();

            Console.WriteLine($"Downloaded the player '@{username}'!, What platform id do you want to assign '@{username}'?");
            string? platformIdInput = Console.ReadLine();
            if (!ulong.TryParse(platformIdInput, out ulong platformId))
            {
                Console.WriteLine("Invalid player ID.");
                return;
            }
            PlayerDB.CreateAccount(Platforms.Steam, platformId, "test", 0, out var newaccount);
            bool success = PlayerDB.SetPlayerUsername(username, newaccount.accountId);
            PlayerDB.SetDisplayName(displayName, newaccount.accountId);
            PlayerDB.SetPlayerImageName(profileImage, newaccount.accountId);
            PlayerDB.SetPlayerBanner(bannerImage, newaccount.accountId);
            PlayerDB.SetPlayerPronounFlags(personalPronouns, newaccount.accountId);
            PlayerDB.SetPlayerIdentityFlags(identityFlags, newaccount.accountId);
        }


        [ConsoleCommand("!exit", "Shuts down the server.")]
        private void Exit()
        {
            Environment.Exit(0);
        }
    }
}
