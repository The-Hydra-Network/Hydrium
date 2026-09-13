public class Log
{
    private readonly RequestDelegate _next;
    private readonly string _logFilePath;

    public Log(RequestDelegate next, string logFilePath)
    {
        _next = next;
        _logFilePath = logFilePath;

        try
        {
            var dir = Path.GetDirectoryName(_logFilePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
        }
        catch
        {
            // even startup logging must never crash
        }
    }

    public async Task InvokeAsync(HttpContext context)
    {
        await _next(context);

        try
        {
            var logLine =
                $"{DateTime.UtcNow:o} {context.Request.Method} {context.Request.Path} -> {context.Response.StatusCode}";
            
                await File.AppendAllTextAsync(
                    _logFilePath,
                    logLine + Environment.NewLine
                );
            
        }
        catch
        {
            // NEVER let logging crash the request
        }
    }
}
