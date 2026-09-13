public class IPBlockMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly HashSet<string> _blockedIPs = new() // this can be ipv6 or ipv4
    {
        "37.203.37.86",
        "173.2.187.39"
    };

    public IPBlockMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task Invoke(HttpContext context)
    {
        string? remoteIp = context.Request.Headers["CF-Connecting-IP"].FirstOrDefault()
        ?? context.Request.Headers["X-Forwarded-For"].FirstOrDefault()
        ?? context.Connection.RemoteIpAddress?.ToString();

        if (!string.IsNullOrEmpty(remoteIp) && _blockedIPs.Contains(remoteIp))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;// this do kick people //Status401Unauthorized;
            await context.Response.WriteAsync("");
            return;
        }

        await _next(context);
    }
}