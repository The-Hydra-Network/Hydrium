using Rec_rewild_live_rewrite.api.server;

public class IPAllowMiddleware
{
    private readonly RequestDelegate _next;

    private static readonly HashSet<string> _allowedIPs = new()
    {
        "47.198.33.69"
        //"66.51.113.175",
        //"96.27.234.110"
    };

    public static bool IPAllowMiddleware_enable = true;

    public IPAllowMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task Invoke(HttpContext context)
    {
        if (!IPAllowMiddleware_enable)
        {
            await _next(context);
            return;
        }

        string? remoteIpString = context.Request.Headers["CF-Connecting-IP"].FirstOrDefault() ?? context.Request.Headers["X-Forwarded-For"].FirstOrDefault() ?? context.Connection.RemoteIpAddress?.ToString();

        string? useragent = context.Request.Headers["User-Agent"].FirstOrDefault();

        if (string.IsNullOrEmpty(remoteIpString))
        {
            Deny(context, remoteIpString, useragent);
            return;
        }

        if (!System.Net.IPAddress.TryParse(remoteIpString, out var remoteIp))
        {
            Deny(context, remoteIpString, useragent);
            return;
        }

        if (System.Net.IPAddress.IsLoopback(remoteIp))
        {
            await _next(context);
            return;
        }

        if (remoteIp.IsIPv4MappedToIPv6)
        {
            remoteIp = remoteIp.MapToIPv4();
        }

        if (!_allowedIPs.Contains(remoteIp.ToString()))
        {
            await Deny(context, remoteIp.ToString(), useragent);
            return;
        }

        await _next(context);
    }

    private static async Task Deny(HttpContext context, string? ip, string? useragent)
    {
        string msg = $"Forbidden request from IP: {ip} and user agent {useragent}";
        Console.WriteLine($"[IPAllowMiddleware] {msg}");
        Webhook.Send(1, "gaylog", "uh oh!", msg, 1);
        if (!context.Response.HasStarted)
        {
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync(
                ""
            );
        }
    }
}
