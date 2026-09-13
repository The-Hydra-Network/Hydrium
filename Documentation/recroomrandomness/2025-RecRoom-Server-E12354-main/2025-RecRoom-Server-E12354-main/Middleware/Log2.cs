using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

public class RequestResponseLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestResponseLoggingMiddleware> _logger;

    public RequestResponseLoggingMiddleware(RequestDelegate next, ILogger<RequestResponseLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        if (context.Request.Path.Equals("/api/images/v4/uploadsaved") || (context.Request.Path.Equals("/Matchmaking/heartbeat") || context.Request.Path.Equals("/api/gameconfigs/v1/all") || context.Request.Path.StartsWithSegments("/Room_server/rooms/visitedby/me") || context.Request.Path.Equals("/api/avatar/v4/items") || context.Request.Path.Equals("/api/avatar/v1/defaultunlocked") || context.Request.Path.Equals("/api/equipment/v2/getUnlocked") || context.Request.Path.Equals("/admin/api/players") || context.Request.Path.Equals("/admin/api/rooms") || context.Request.Path.StartsWithSegments("/Room_server/rooms/hot") || context.Request.Path.StartsWithSegments("/Room_server/rooms/") || context.Request.Path.StartsWithSegments("/Room_server/rooms/search") || context.Request.Path.StartsWithSegments("/api/images/v5") || context.Request.Path.StartsWithSegments("/cdn/room") || context.Request.Path.StartsWithSegments("/cdn/") || context.Request.Path.Equals("/api/consumables/v2/getUnlocked")))
        {
            await _next(context);
            return;
        }

        string requestUrl = $"{context.Request.Method} {context.Request.Scheme}://{context.Request.Host}{context.Request.Path}{context.Request.QueryString}";
        string contentType = context.Request.ContentType ?? string.Empty;
        bool isBinaryRequest = IsBinaryContentType(contentType);

        string cfConnectingIp = context.Request.Headers["CF-Connecting-IP"].FirstOrDefault() ?? "[NO CF-CONNECTING-IP]";

        string auth = context.Request.Headers["Authorization"].FirstOrDefault()
             ?? context.Request.Cookies["Authorization"];


        string requestBody = (context.Request.Method == "POST" || context.Request.Method == "PUT") && !isBinaryRequest
            ? await ReadRequestBody(context)
            : "[NO REQUEST BODY]";

        Console.WriteLine($"[REQUEST] {requestUrl}");
        Console.WriteLine($"[CF-CONNECTING-IP] {cfConnectingIp}");
        Console.WriteLine($"[AUTH] {auth}");

        _logger.LogInformation($"Request: {requestUrl} - CF-Connecting-IP: {cfConnectingIp}");

        if (!isBinaryRequest)
        {
            Console.WriteLine($"[REQUEST BODY] {requestBody}");
            _logger.LogInformation($"Request Body: {requestBody}");
        }
        else
        {
            Console.WriteLine("[REQUEST BODY] [BINARY CONTENT SKIPPED]");
        }

        var originalResponseBodyStream = context.Response.Body;
        using (var responseBodyStream = new MemoryStream())
        {
            context.Response.Body = responseBodyStream;
            await _next(context);

            string responseContentType = context.Response.ContentType ?? string.Empty;
            bool isBinaryResponse = IsBinaryContentType(responseContentType);

            string responseBody = !isBinaryResponse ? await ReadResponseBody(responseBodyStream) : "[BINARY CONTENT SKIPPED]";

            Console.WriteLine($"[RESPONSE] Status: {context.Response.StatusCode}");
            if (!isBinaryResponse)
            {
                Console.WriteLine($"[RESPONSE BODY] {responseBody}");
                _logger.LogInformation($"Response: {context.Response.StatusCode} - Body: {responseBody}");
            }
            else
            {
                Console.WriteLine("[RESPONSE BODY] [BINARY CONTENT SKIPPED]");
            }

            responseBodyStream.Seek(0, SeekOrigin.Begin);
            await responseBodyStream.CopyToAsync(originalResponseBodyStream);
        }
    }

    private async Task<string> ReadRequestBody(HttpContext context)
    {
        context.Request.EnableBuffering();

        using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
        string body = await reader.ReadToEndAsync();
        context.Request.Body.Position = 0;

        return string.IsNullOrWhiteSpace(body) ? "[EMPTY REQUEST BODY]" : body;
    }

    private async Task<string> ReadResponseBody(Stream responseBodyStream)
    {
        responseBodyStream.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(responseBodyStream, Encoding.UTF8, leaveOpen: true);
        string body = await reader.ReadToEndAsync();
        responseBodyStream.Seek(0, SeekOrigin.Begin);

        return string.IsNullOrWhiteSpace(body) ? "[EMPTY RESPONSE BODY]" : body;
    }

    private bool IsBinaryContentType(string contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return false;

        contentType = contentType.ToLowerInvariant();

        return contentType.StartsWith("image/") ||
               contentType.StartsWith("audio/") ||
               contentType.StartsWith("video/") ||
               contentType == "application/octet-stream" ||
               contentType.Contains("application/pdf") ||
               contentType.Contains("application/zip") ||
               contentType.Contains("application/x-binary");
    }
}
