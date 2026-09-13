using System.Xml.Linq;
using LiteDB;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.ChatDBClasses;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class ChatDB
    {
        public static LiteDatabase ChatDBFile = new LiteDatabase(Environment.CurrentDirectory + "/Data/DBs/Chat.db");
        private static ILiteCollection<ChatThread> Threads => ChatDBFile.GetCollection<ChatThread>("threads");
        private static ILiteCollection<ChatMessage> Messages => ChatDBFile.GetCollection<ChatMessage>("messages");

        static ChatDB()
        {
            Threads.EnsureIndex(x => x.ChatThreadId, unique: true);
            Threads.EnsureIndex(x => x.PlayerIds);
            Messages.EnsureIndex(x => x.ChatThreadId);
            Messages.EnsureIndex(x => x.ChatMessageId, unique: true);
        }

        public static ChatThread CreateThread(List<ulong> memberIds, ulong creatorid, string? name = null)
        {
                    long newThreadId = Threads.Count() + 1;

                    ChatThread thread = new ChatThread
                    {
                        ChatThreadId = newThreadId,
                        PlayerIds = memberIds,
                        ChatThreadName = name,
                        IsFavorited = false,
                        SnoozedUntil = null,
                        LastReadMessageId = 1,
                        Messages = new List<ChatMessage>()
                    };

                    Threads.Insert(thread);

                    var messageJson = new MessageJson
                    {
                        Type = MessageContentType.Text,
                        Version = 1,
                        Data = $"Player <@U{creatorid}> started a chat"
                    };

                    string json = JsonConvert.SerializeObject(messageJson);

                    AddMessage(
                        threadId: newThreadId,
                        senderId: -5,
                        jsonContents: json
                    );

                    // IMPORTANT FIX → Load thread again with messages included
                    return GetThread(newThreadId);
        }


        public static ChatMessage AddMessage(long threadId, int senderId, string jsonContents)
        {
            // if senderId is -5 then it will do the chat welcome

            var thread = GetThread(threadId);
            if (thread == null)
                return null;

            long newMessageId = Messages.Count() + 1;

            ChatMessage msg = new ChatMessage
            {
                ChatMessageId = newMessageId,
                ChatThreadId = threadId,
                SenderPlayerId = senderId,
                TimeSent = DateTime.UtcNow,
                Contents = jsonContents,
                ModerationState = 0
            };

            Messages.Insert(msg);

            thread.Messages.Add(msg);
            thread.LastReadMessageId = newMessageId;
            Threads.Update(thread);

            return msg;
        }

        public static ChatThread RenameThread(long threadId, ulong senderId, string NewThreadName)
        {
            var thread = GetThread(threadId);
            if (thread == null)
                return null;

            thread.ChatThreadName = NewThreadName;

            var messageJson = new MessageJson
            {
                Type = MessageContentType.Text,
                Version = 1,
                Data = $"Player <@U{senderId}> renamed the chat"
            };

            string json = JsonConvert.SerializeObject(messageJson);

            var newmsg = AddMessage(
                threadId: threadId,
                senderId: -5,
                jsonContents: json
            );

            var payload = new
            {
                Id = "ChatMessageReceived",
                Msg = new
                {
                    chatMessageId = newmsg.ChatMessageId,
                    chatThreadId = newmsg.ChatThreadId,
                    senderPlayerId = newmsg.SenderPlayerId,
                    timeSent = newmsg.TimeSent,
                    contents = newmsg.Contents,
                    moderationState = newmsg.ModerationState
                }
            };

            Notifications.SendToPlayers(thread.PlayerIds, JsonConvert.SerializeObject(payload));
            Threads.Update(thread);
            return GetThread(threadId);
        }

        public static ChatThread LeaveThread(long threadId, ulong senderId)
        {
            var thread = GetThread(threadId);
            if (thread == null)
                return null;

            thread.PlayerIds.Remove(senderId);
            var messageJson = new MessageJson
            {
                Type = MessageContentType.Text,
                Version = 1,
                Data = $"Player <@U{senderId}> left"
            };

            string json = JsonConvert.SerializeObject(messageJson);

            var newmsg = AddMessage(
                threadId: threadId,
                senderId: -5,
                jsonContents: json
            );

            var payload = new
            {
                Id = "ChatMessageReceived",
                Msg = new
                {
                    chatMessageId = newmsg.ChatMessageId,
                    chatThreadId = newmsg.ChatThreadId,
                    senderPlayerId = newmsg.SenderPlayerId,
                    timeSent = newmsg.TimeSent,
                    contents = newmsg.Contents,
                    moderationState = newmsg.ModerationState
                }
            };

            Notifications.SendToPlayers(thread.PlayerIds, JsonConvert.SerializeObject(payload));

            Threads.Update(thread);
            return GetThread(threadId);
        }

        public static ChatThread? GetThread(long threadId)
        {
            var thread = Threads.FindOne(x => x.ChatThreadId == threadId);
            if (thread == null) return null;

            thread.Messages = Messages.Find(x => x.ChatThreadId == threadId).OrderBy(x => x.ChatMessageId).ToList();
            return thread;
        }

        public static List<ChatThread> GetThreadsForPlayer(ulong playerId, int maxCount)
        {
            var list = Threads.Find(x => x.PlayerIds.Contains(playerId)).OrderByDescending(x => x.LastReadMessageId).Take(maxCount).ToList();

            foreach (var t in list)
            {
                t.Messages = Messages.Find(x => x.ChatThreadId == t.ChatThreadId).OrderByDescending(x => x.ChatMessageId).Take(1).ToList(); // Load only the latest message
            }

            return list;
        }
    }
}
