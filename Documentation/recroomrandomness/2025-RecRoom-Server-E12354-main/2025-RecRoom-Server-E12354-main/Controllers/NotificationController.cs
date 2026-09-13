using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using Newtonsoft.Json;

namespace RewildLiveSource.Controllers
{
    [ApiController]
    [Route("Notifications")]
    public class NotificationsController : Controller
    {
        public static ConcurrentDictionary<ulong, WebSocket> WebSockets { get; } = new();

        // ===========================================================
        // Negotiation endpoint
        // ===========================================================
        [HttpPost("hub/v1/negotiate")]
        public ContentResult Negotiate()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var response = new
            {
                negotiateVersion = 0,
                connectionId = account.Id.ToString(),
                availableTransports = new[]
                {
                    new {
                        transport = "WebSockets",
                        transferFormats = new[] { "Text", "Binary" }
                    }
                }
            };

            return JsonResult(response);
        }

        // ===========================================================
        // Notification preferences/config
        // ===========================================================
        [HttpGet("preferences")]
        public IActionResult GetPreferences()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                mutedCategories = Array.Empty<object>()
            });
        }

        [HttpGet("crm/me/config/v3")]
        public ContentResult GetCRMConfig()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return JsonResult(Array.Empty<object>());
        }

        [HttpGet("accounts/{id}/receives/GameplayInvites")]
        public ContentResult GetGameplayInvites(ulong id)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return JsonResult(true);
        }

        [HttpGet("config/categories")]
        public IActionResult GetCategories()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "NotiConfigCategories.json");

            if (!System.IO.File.Exists(path))
            {
                Console.WriteLine("Warning: Notification config json file not found, returning []");
                return Ok(new
                {
                    results = Array.Empty<object>(),
                    totalResults = 0
                });
            }

            return PhysicalFile(path, "application/json");
        }

        // ===========================================================
        // WebSocket handler
        // ===========================================================
        [HttpGet("hub/v1")]
        public async Task HandleHub([FromQuery] string id)
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            if (!ulong.TryParse(id, out var playerId))
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            using var socket = await HttpContext.WebSockets.AcceptWebSocketAsync();
            Console.WriteLine($"[WebSocket] Player {playerId} connected.");

            await HandleConnectionAsync(playerId, socket);
        }

        private static async Task HandleConnectionAsync(ulong playerId, WebSocket socket)
        {
            using var pingCts = new CancellationTokenSource();

            try
            {
                await CloseExistingConnection(playerId);

                WebSockets[playerId] = socket;

                await SendHandshakeAsync(socket);

                // Start ping loop
                _ = Task.Run(() => PingLoopAsync(socket, pingCts.Token));

                var buffer = new byte[4096];
                while (socket.State == WebSocketState.Open)
                {
                    var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close)
                        break;

                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count).TrimEnd('\x1e');
                    Console.WriteLine($"Player ({playerId}) sent {message}");

                    await HandleClientMessageAsync(socket, message);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Error:{playerId}] {ex.Message}");
            }
            finally
            {
                pingCts.Cancel();

                WebSockets.TryRemove(playerId, out _);

                if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing connection", CancellationToken.None);
                }

                Console.WriteLine($"[WebSocket] Player {playerId} disconnected.");
            }
        }

        private static async Task HandleClientMessageAsync(WebSocket socket, string message)
        {
            try
            {
                using var doc = JsonDocument.Parse(message);
                var root = doc.RootElement;

                if (root.TryGetProperty("type", out var typeProp) && typeProp.GetInt32() == 1)
                {
                    string target = root.GetProperty("target").GetString() ?? string.Empty;
                    string invocationId = root.GetProperty("invocationId").GetString() ?? string.Empty;

                    if (target == "SubscribeToPlayers")
                    {
                        var response = new
                        {
                            type = 3,
                            invocationId,
                            result = (object?)null
                        };
                        await SendJsonAsync(socket, response);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ParseError] {ex.Message}");
            }
        }

        private static async Task SendHandshakeAsync(WebSocket socket)
        {
            var handshake = new { protocol = "json", version = 1 };
            await SendJsonAsync(socket, handshake);
        }

        private static async Task PingLoopAsync(WebSocket socket, CancellationToken token)
        {
            try
            {
                while (!token.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    var ping = new { type = 6 };
                    await SendJsonAsync(socket, ping);
                    await Task.Delay(10000, token);
                }
            }
            catch (TaskCanceledException) { }
            catch (Exception ex)
            {
                Console.WriteLine($"[PingError] {ex.Message}");
            }
        }

        private static async Task CloseExistingConnection(ulong playerId)
        {
            if (WebSockets.TryRemove(playerId, out var oldSocket) && oldSocket.State == WebSocketState.Open)
            {
                await oldSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Replaced by new connection", CancellationToken.None);
                Console.WriteLine($"[WebSocket] Closed existing connection for {playerId}");
            }
        }

        private static async Task SendJsonAsync(WebSocket socket, object obj)
        {
            var json = JsonConvert.SerializeObject(obj) + "\x1e";
            var bytes = Encoding.UTF8.GetBytes(json);
            await socket.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        }

        private static ContentResult JsonResult(object data) => new()
        {
            Content = JsonConvert.SerializeObject(data),
            ContentType = "application/json",
            StatusCode = 200
        };
    }
}
