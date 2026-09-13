using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using RewildLiveSource.Controllers;
using System.Net.WebSockets;
using System.Security.Principal;
using System.Text;

namespace Rec_rewild_live_rewrite.api.server
{
    public static class Notifications
    {
        private static readonly byte[] Separator = Encoding.UTF8.GetBytes("\u001e");

        public static async Task SendToPlayer(ulong playerId, string message)
        {
            if (!NotificationsController.WebSockets.TryGetValue(playerId, out var socket) || socket == null)
            {
                Console.WriteLine($"[Notifications] No active WebSocket for player {playerId}");
                return;
            }

            await SendAsync(socket, message, playerId);
        }

        public static async Task SendToAll(string message)
        {
            var tasks = NotificationsController.WebSockets
                .Select(kv => SendAsync(kv.Value, message, kv.Key));

            await Task.WhenAll(tasks);
        }

        public static async Task SendToPlayers(List<ulong> playerIds, string message)
        {
            var tasks = new List<Task>();

            foreach (var id in playerIds)
            {
                if (NotificationsController.WebSockets.TryGetValue(id, out var socket) && socket != null)
                    tasks.Add(SendAsync(socket, message, id));
            }

            await Task.WhenAll(tasks);
        }

        private static async Task SendAsync(WebSocket socket, string message, ulong? playerId = null)
        {
            if (socket == null || socket.State != WebSocketState.Open)
                return;

            var packet = new SockSignalR
            {
                type = MessageTypes.Idk,
                target = "Notification",
                arguments = new object[] { message },
                nonblocking = true,
                result = "200 OK"
            };

            var data = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(packet));
            var buffer = new byte[data.Length + Separator.Length];
            Buffer.BlockCopy(data, 0, buffer, 0, data.Length);
            Buffer.BlockCopy(Separator, 0, buffer, data.Length, Separator.Length);

            Console.WriteLine($"[Notifications] Sending to {(playerId.HasValue ? playerId.ToString() : "unknown player")}: {buffer}");

            try
            {
                await socket.SendAsync(
                    new ArraySegment<byte>(buffer),
                    WebSocketMessageType.Text,
                    endOfMessage: true,
                    cancellationToken: CancellationToken.None
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Notifications] Failed to send to {(playerId.HasValue ? playerId.ToString() : "unknown player")}: {ex.Message}");

                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.InternalServerError, "Send failed", CancellationToken.None);
                }
                catch 
                { 

                }
            }
        }

        public static async Task<bool> RefreshAccount(ulong accountId)
        {
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("SelfAccountUpdate", PlayerDB.GetAccountMeSafe(accountId)));
                var globalUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_player_updated_account2_Response("AccountUpdate", PlayerDB.GetAccountMeSafe(accountId)));

                var notifySelfTask = Notifications.SendToPlayer(accountId, selfUpdate);
                var notifyAllTask = Notifications.SendToAll(globalUpdate);

                await Task.WhenAll(notifySelfTask, notifyAllTask);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
                return false;
            }
        }

        private class SockSignalR
        {
            public MessageTypes type { get; set; }
            public string? target { get; set; }
            public object[]? arguments { get; set; }
            public bool nonblocking { get; set; }
            public object? result { get; set; }
        }

        private enum MessageTypes
        {
            Invocation,
            Idk
        }
    }
}
