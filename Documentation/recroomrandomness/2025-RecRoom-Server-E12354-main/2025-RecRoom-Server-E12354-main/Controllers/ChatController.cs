using System.Linq;
using Discord.Net;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using RewildLiveSource.api.admin;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.ChatDBClasses;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("chat")]
    public class ChatController : ControllerBase
    {
        // https://chat.rec.net/thread?maxCount=50&mode=0 return
        /*
        [
            {
                "latestMessage": {
                    "chatMessageId": 1735292428,
                    "chatThreadId": 1,
                    "senderPlayerId": -5,
                    "timeSent": "2025-08-03T18:39:03.4521439Z",
                    "contents": "{\"Type\":0,\"Version\":1,\"Data\":\"Player <@1> started a chat\"}",
                    "moderationState": 0
                },
                "chatThreadId": 1,
                "playerIds": [
                    1,
                    2
                ],
                "lastReadMessageId": -1,
                "chatThreadName": null,
                "chatThreadType": 0,
                "snoozedUntil": null,
                "isFavorited": false
            }
        ]
        */

        [HttpGet("thread")]
        public ContentResult GetThreads([FromQuery] int maxCount = 50, int mode = 0)
        {
            string authtoken = HttpContext.Request.Headers["Authorization"].ToString();

            if (string.IsNullOrEmpty(authtoken))
            {
                authtoken = HttpContext.Request.Cookies["Authorization"];
            }

            if (string.IsNullOrEmpty(authtoken))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            }
            string playerdata = ClientSecurity.DecodeToken(authtoken);
            if (playerdata == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            if (playerdata.Contains("error_token"))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            player_info? account = JsonConvert.DeserializeObject<player_info>(playerdata);

            // Load from DB
            var threads = ChatDB.GetThreadsForPlayer((ulong)account.Id, 50);

            var response = threads.Select(t => new
            {
                latestMessage = t.Messages.Count > 0 ? new
                {
                    chatMessageId = t.Messages[0].ChatMessageId,
                    chatThreadId = t.ChatThreadId,
                    senderPlayerId = t.Messages[0].SenderPlayerId,
                    timeSent = t.Messages[0].TimeSent,
                    contents = t.Messages[0].Contents,
                    moderationState = t.Messages[0].ModerationState
                } : null,

                chatThreadId = t.ChatThreadId,
                playerIds = t.PlayerIds,
                lastReadMessageId = t.LastReadMessageId,
                chatThreadName = t.ChatThreadName,
                chatThreadType = 0, // RRO uses 0 for user threads
                snoozedUntil = t.SnoozedUntil,
                isFavorited = t.IsFavorited
            });

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(response),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("thread/chatPrivacySetting")]
        public IActionResult GetChatPrivacySetting()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            
            return Ok(new ChatPrivacySettings
            {
                playerId = account.Id,
                directMessagePrivacySetting = ChatPrivacy.Friends,
                groupChatPrivacySetting = ChatPrivacy.Friends
            });
        }

        [HttpGet("thread/{id}")]
        public ContentResult GetThreadById(long id, [FromQuery] int maxCount = 50, [FromQuery] int mode = 0)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            // Load thread
            var thread = ChatDB.GetThread(id);

            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            
            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }
            

            var latestMessage = thread.Messages.Count > 0
                ? thread.Messages.Last()
                : null;

            var response = new
            {
                latestMessage = latestMessage != null ? new
                {
                    chatMessageId = latestMessage.ChatMessageId,
                    chatThreadId = latestMessage.ChatThreadId,
                    senderPlayerId = latestMessage.SenderPlayerId,
                    timeSent = latestMessage.TimeSent,
                    contents = latestMessage.Contents,
                    moderationState = latestMessage.ModerationState
                } : null,

                chatThreadId = thread.ChatThreadId,
                playerIds = thread.PlayerIds,
                lastReadMessageId = thread.LastReadMessageId,
                chatThreadName = thread.ChatThreadName,
                chatThreadType = 0,
                snoozedUntil = thread.SnoozedUntil,
                isFavorited = thread.IsFavorited,

                messages = thread.Messages
                    .OrderByDescending(m => m.ChatMessageId)
                    .Take(maxCount)
                    .OrderBy(m => m.ChatMessageId)
                    .Select(m => new
                    {
                        chatMessageId = m.ChatMessageId,
                        chatThreadId = m.ChatThreadId,
                        senderPlayerId = m.SenderPlayerId,
                        timeSent = m.TimeSent,
                        contents = m.Contents,
                        moderationState = m.ModerationState
                    })
            };

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(response),
                ContentType = "application/json",
                StatusCode = 200
            };
        }



        [HttpPost("thread/{id}")]
        public async Task<ContentResult> SendMessageToThread(long id)
        {
            string authtoken = HttpContext.Request.Headers["Authorization"].ToString();
            if (string.IsNullOrEmpty(authtoken))
            {
                authtoken = HttpContext.Request.Cookies["Authorization"];
            }
            if (string.IsNullOrEmpty(authtoken))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            }
            string playerdata = ClientSecurity.DecodeToken(authtoken);
            if (playerdata == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            if (playerdata.Contains("error_token"))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            player_info? account = JsonConvert.DeserializeObject<player_info>(playerdata);

            // Extract "messageContents" from form or query
            string? contents = HttpContext.Request.Query["messageContents"];
            if (string.IsNullOrWhiteSpace(contents))
                contents = HttpContext.Request.Form["messageContents"];
            var actualcontents = System.Net.WebUtility.UrlDecode(contents);
            var json = JObject.Parse(contents);

            string actualMessage = json["Data"]?.ToString() ?? "";
            if (string.IsNullOrWhiteSpace(contents))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            // Load thread
            var thread = ChatDB.GetThread(id);
            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            if (ConfigRewild.AllowSwearsInChatThreads == false)
            {
                var messageJson = JsonConvert.DeserializeObject<MessageJson>(contents);
                if (messageJson.Type == MessageContentType.Text)
                {
                    messageJson.Data = Sanitize.SanitizeMessage(messageJson.Data);
                }

                contents = JsonConvert.SerializeObject(messageJson);
            }

            // Add message to DB
            var msg = ChatDB.AddMessage(id, (int)account.Id, contents);
            if (msg == null)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new { chatResult = 5, chatThread = (object)null }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            // Reload updated thread
            thread = ChatDB.GetThread(id);

            // Sort messages newest → oldest (same as RRO)
            var messages = thread.Messages
                .OrderByDescending(m => m.ChatMessageId)
                .Select(m => new
                {
                    chatMessageId = m.ChatMessageId,
                    chatThreadId = m.ChatThreadId,
                    senderPlayerId = m.SenderPlayerId,
                    timeSent = m.TimeSent,
                    contents = m.Contents,
                    moderationState = m.ModerationState
                })
                .ToList();

            var response = new
            {
                chatResult = 0,
                chatThread = new
                {
                    messages = messages,
                    chatThreadId = thread.ChatThreadId,
                    playerIds = thread.PlayerIds,
                    lastReadMessageId = thread.LastReadMessageId,
                    chatThreadName = thread.ChatThreadName,
                    chatThreadType = 0,
                    snoozedUntil = thread.SnoozedUntil,
                    isFavorited = thread.IsFavorited
                }
            };

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

            if (PlayerDB.CheckDevFlag(account.Id) && thread.PlayerIds.Contains(1))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await Task.Delay(250); // small delay so ordering looks natural

                        // Remove <=> prefix
                        string messageContent = actualMessage.Substring(3);

                        string? result =
                            DevChatCommands.ParseCommand(messageContent, "ChatThread", account.Id);

                        if (string.IsNullOrWhiteSpace(result))
                            return;

                        string botContent = JsonConvert.SerializeObject(new
                        {
                            Type = 0,
                            Version = 2,
                            Data = "<=>" + result
                        });

                        var botMsg = ChatDB.AddMessage(id, 1, botContent);
                        if (botMsg == null)
                            return;

                        var wsEvent = new
                        {
                            Id = "ChatMessageReceived",
                            Msg = new
                            {
                                chatMessageId = botMsg.ChatMessageId,
                                chatThreadId = botMsg.ChatThreadId,
                                senderPlayerId = botMsg.SenderPlayerId,
                                timeSent = botMsg.TimeSent,
                                contents = botMsg.Contents,
                                moderationState = botMsg.ModerationState
                            }
                        };

                        Notifications.SendToPlayers(
                            thread.PlayerIds,
                            JsonConvert.SerializeObject(wsEvent)
                        );
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"DevChat error: {ex}");
                    }
                });
            }

            await Notifications.SendToPlayers(thread.PlayerIds, JsonConvert.SerializeObject(payload));

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(response),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("thread/{id}/message")]
        public ContentResult GetThreadMessages(
     long id,
     [FromQuery] int messageCount = 50,
     [FromQuery] int mode = 0,
     [FromQuery] int referenceMessageId = 0)
        {
            string authtoken = HttpContext.Request.Headers["Authorization"].ToString();

            if (string.IsNullOrEmpty(authtoken))
            {
                authtoken = HttpContext.Request.Cookies["Authorization"];
            }

            if (string.IsNullOrEmpty(authtoken))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            }
            string playerdata = ClientSecurity.DecodeToken(authtoken);
            if (playerdata == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            if (playerdata.Contains("error_token"))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            player_info? account = JsonConvert.DeserializeObject<player_info>(playerdata);

            var thread = ChatDB.GetThread(id);
            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            IEnumerable<ChatDBClasses.ChatMessage> messages = thread.Messages;

            // Apply messageCount limit and mode
            switch ((ChatDBClasses.QueryMode)mode)
            {
                case ChatDBClasses.QueryMode.Latest:
                    messages = messages
                        .OrderByDescending(m => m.ChatMessageId)
                        .Take(messageCount)
                        .OrderBy(m => m.ChatMessageId);
                    break;

                case ChatDBClasses.QueryMode.NewerThan:
                    messages = messages
                        .Where(m => m.ChatMessageId > referenceMessageId)
                        .OrderBy(m => m.ChatMessageId)
                        .Take(messageCount);
                    break;

                case ChatDBClasses.QueryMode.OlderThan:
                    messages = messages
                        .Where(m => m.ChatMessageId < referenceMessageId)
                        .OrderByDescending(m => m.ChatMessageId)
                        .Take(messageCount)
                        .OrderBy(m => m.ChatMessageId);
                    break;
            }

            /*var response = new[]
            {
                new
                {
                    chatThreadId = thread.ChatThreadId,
                    playerIds = thread.PlayerIds,
                    lastReadMessageId = thread.LastReadMessageId,
                    chatThreadName = thread.ChatThreadName,
                    snoozedUntil = thread.SnoozedUntil,
                    isFavorited = thread.IsFavorited,
                    messages = messages.Select(m => new
                    {
                        chatMessageId = m.ChatMessageId,
                        chatThreadId = m.ChatThreadId,
                        senderPlayerId = m.SenderPlayerId,
                        timeSent = m.TimeSent,
                        contents = m.Contents,
                        moderationState = m.ModerationState
                    }).ToList()
                }
            };*/

            var response = messages.Select(m => new
            {
                chatMessageId = m.ChatMessageId,
                chatThreadId = m.ChatThreadId,
                senderPlayerId = m.SenderPlayerId,
                timeSent = m.TimeSent,
                contents = m.Contents,
                moderationState = m.ModerationState
            }).ToList();

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(response),
                ContentType = "application/json",
                StatusCode = 200
            };
        }




        [HttpPost("thread/withmembers")]
        public ContentResult CreateThread()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string idsStr = Request.Form["ids"].ToString();

            var memberIds = idsStr.Split(',')
                                  .Select(x => ulong.Parse(x.Trim()))
                                  .ToList();



            List<RelationshipDetail> friends = FriendsDB.GetRelationships(account.Id);

            // check if the account is friends with the memberIds if not then remove them from the memberIds

            bool check = memberIds.Where(id => id != account.Id).All(id => friends.Any(f => f.PlayerID == id));

            if (!check)
            {
                return new ContentResult
                {
                    Content = "5",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            
            memberIds.Add(account.Id);

            string messageCountStr = Request.Form["messageCount"].ToString();
            int messageCount = int.TryParse(messageCountStr, out var mc) ? mc : 0;

            var thread = ChatDB.CreateThread(memberIds, account.Id, null);

            var response = new
            {
                chatResult = ChatDBClasses.ChatResults.Success,
                chatThread = new
                {
                    messages = thread.Messages.FirstOrDefault(),
                    chatThreadId = thread.ChatThreadId,
                    playerIds = thread.PlayerIds,
                    lastReadMessageId = thread.LastReadMessageId,
                    chatThreadName = thread.ChatThreadName,
                    chatThreadType = 0,
                    snoozedUntil = thread.SnoozedUntil,
                    isFavorited = thread.IsFavorited
                }
            };

            var payload = new
            {
                Id = "ChatMessageReceived",
                Msg = new
                {
                    chatMessageId = thread.Messages.FirstOrDefault().ChatMessageId,
                    chatThreadId = thread.Messages.FirstOrDefault().ChatThreadId,
                    senderPlayerId = thread.Messages.FirstOrDefault().SenderPlayerId,
                    timeSent = thread.Messages.FirstOrDefault().TimeSent,
                    contents = thread.Messages.FirstOrDefault().Contents,
                    moderationState = thread.Messages.FirstOrDefault().ModerationState
                }
            };

            Notifications.SendToPlayers(memberIds, JsonConvert.SerializeObject(payload));

            // todo: idk what to return back
            return new ContentResult()
            {
                /*
                  Content = JsonConvert.SerializeObject(new
                {
                    ChatMessageId = thread.Messages.FirstOrDefault().ChatMessageId,
                    ChatThreadId = thread.ChatThreadId,
                    Contents = thread.Messages.FirstOrDefault().Contents,   
                    ModerationState = thread.Messages.FirstOrDefault().ModerationState,
                    SenderPlayerId = thread.Messages.FirstOrDefault().SenderPlayerId,
                    TimeSent = thread.Messages.FirstOrDefault().TimeSent
                }),
                */
                Content = JsonConvert.SerializeObject(response),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("thread/{threadid}/rename")]
        public ContentResult RenameThread(long threadid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            string newName = Request.Form["name"].ToString();
            newName = Uri.UnescapeDataString(newName);
            var thread = ChatDB.GetThread(threadid);

            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            var updatedthread = ChatDB.RenameThread(threadid, account.Id, newName);

            return new ContentResult
            {
                Content = ChatResults.Success.ToString(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("thread/{threadid}/leave")]
        public ContentResult LeaveThread(long threadid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var thread = ChatDB.GetThread(threadid);

            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            var updatedthread = ChatDB.LeaveThread(threadid, account.Id);

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("thread/{threadid}/message/{messageid}/read")]
        public ContentResult LeaveThread(long threadid, long messageid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var thread = ChatDB.GetThread(threadid);

            if (thread == null)
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (!thread.PlayerIds.Contains(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            return new ContentResult
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        // /chat/thread/2/message/20/read
    }
}
