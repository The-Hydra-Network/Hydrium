using System.Collections.Concurrent;

public static class RateLimit
{
    private static readonly ConcurrentDictionary<string, DateTime> _requests = new();

    public static bool TryConsume(
        string key,
        int cooldownSeconds,
        out int retryAfterSeconds)
    {
        retryAfterSeconds = 0;
        var now = DateTime.UtcNow;

        var last = _requests.GetOrAdd(key, _ => DateTime.MinValue);
        var elapsed = (now - last).TotalSeconds;

        if (elapsed < cooldownSeconds)
        {
            retryAfterSeconds = (int)Math.Ceiling(cooldownSeconds - elapsed);
            return false;
        }

        _requests[key] = now;

        Cleanup(now);
        return true;
    }

    private static void Cleanup(DateTime now)
    {
        if (_requests.Count < 10_000) return;

        foreach (var kv in _requests)
        {
            if ((now - kv.Value).TotalMinutes > 10)
                _requests.TryRemove(kv.Key, out _);
        }
    }
}
