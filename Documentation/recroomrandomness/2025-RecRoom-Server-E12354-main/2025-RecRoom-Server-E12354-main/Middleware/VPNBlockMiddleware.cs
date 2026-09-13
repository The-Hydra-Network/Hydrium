using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

public class VpnBlockMiddleware
{
    private static readonly HttpClient Http = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(5)
    };

    private static readonly string DataPath = Path.Combine(Environment.CurrentDirectory, "Data");
    private static readonly string CacheFile = Path.Combine(DataPath, "Ips.json");

    private static readonly List<IpCacheEntry> IpCache;

    private readonly RequestDelegate _next;

    static VpnBlockMiddleware()
    {
        Http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

        // Ensure Data folder exists
        if (!Directory.Exists(DataPath))
            Directory.CreateDirectory(DataPath);

        // Load or initialize cache
        if (File.Exists(CacheFile))
        {
            var json = File.ReadAllText(CacheFile);
            try
            {
                IpCache = JsonSerializer.Deserialize<List<IpCacheEntry>>(json) ?? new List<IpCacheEntry>();
            }
            catch
            {
                IpCache = new List<IpCacheEntry>();
            }
        }
        else
        {
            IpCache = new List<IpCacheEntry>();
        }
    }

    public VpnBlockMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        string? ip = context.Request.Headers["CF-Connecting-IP"].FirstOrDefault()
        ?? context.Request.Headers["X-Forwarded-For"].FirstOrDefault()
        ?? context.Connection.RemoteIpAddress?.ToString();

        if (ip == null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("???");
            return;
        }

        string ipStr = ip.ToString();

        // ---------- VPN CHECK START ----------

        // Check cache first
        var cached = IpCache.Find(x => x.Ip == ipStr);
        if (cached != null)
        {
            if (cached.IsVpn)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("You have been blocked due to being suspicious.");
                return;
            }
            else
            {
                await _next(context);
                return;
            }
        }

        // Not in cache fetch from web
        bool isVpn = true;
        try
        {
            var url = $"https://whatismyipaddress.com/ip/{ipStr}";

            var request = new HttpRequestMessage(HttpMethod.Get, url);

            // Set all headers to mimic real browser
            request.Headers.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
            request.Headers.Add("Accept-Encoding", "gzip, deflate, br, zstd");
            request.Headers.Add("Accept-Language", "en-US,en;q=0.9");
            request.Headers.Add("Cache-Control", "no-cache");
            request.Headers.Add("Cookie", "_omappvp=gVm5QIhYs7ZPribnnBc5i0hcLYpksUDiKmaUjnC3eJDngY1GqHDK9X9VZ6X6YjdGJOIEopJi4PrOdRMf9FdpCTgsbQBQd8NA; usprivacy=1N--; pt=3f72ce96ed0863ed93f8e4f35cd5c051; cf_clearance=E.lrd8juQIWkUqgGOEu9IK1D7hj4VjU9MrKMu3ndw.Q-1768983651-1.2.1.1-yatNw.jMPyw7hUdlaVTRBwLPNS3zrTyJYuJP7WZ5cMC_JU1QcPOxxCSj.BIc6n9gYQlDTuu3MIeDohOS.dF.GzEY6SroaJJRS3Kqz.bSs2HmGA8WiDdMZ585PG47Sngr2MFufhyaQUejsCs62g3Xn5TNQW6ScnFH.SwZ_4_ltZrdvu7pYtu3SrGQC8rWvhyHgR_6DJJ8BM64SeF8zIL9ghgA4e0cSmp3q63JijsJb_I; _awl=2.1768987486.5-5aef88a3ad28e1513eae2c6b9b05ea1e-6763652d75732d7765737431-1");
            request.Headers.Add("Pragma", "no-cache");
            request.Headers.Add("Priority", "u=0, i");
            request.Headers.Add("Sec-CH-UA", "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"");
            request.Headers.Add("Sec-CH-UA-Mobile", "?0");
            request.Headers.Add("Sec-CH-UA-Platform", "\"Windows\"");
            request.Headers.Add("Sec-Fetch-Dest", "document");
            request.Headers.Add("Sec-Fetch-Mode", "navigate");
            request.Headers.Add("Sec-Fetch-Site", "none");
            request.Headers.Add("Sec-Fetch-User", "?1");
            request.Headers.Add("Upgrade-Insecure-Requests", "1");
            request.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36");

            var response = await Http.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[VPNBlockMiddleware] Failed to fetch IP info {ipStr}, status {response.StatusCode}");
                isVpn = true; // fail-closed
            }
            else
            {
                var html = await response.Content.ReadAsStringAsync();
                isVpn = !html.Contains("Services:</span><span>None detected", StringComparison.OrdinalIgnoreCase);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[VPNBlockMiddleware] Error checking IP {ipStr}: {ex.Message}");
            isVpn = false; // fail-closed
        }

        // Save to cache
        IpCache.Add(new IpCacheEntry { Ip = ipStr, IsVpn = isVpn });
        File.WriteAllText(CacheFile, JsonSerializer.Serialize(IpCache, new JsonSerializerOptions { WriteIndented = false }));

        if (isVpn)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsync("You have been blocked due to being suspicious.");
            return;
        }

        // ---------- VPN CHECK END ----------

        await _next(context);
    }

    private class IpCacheEntry
    {
        public string Ip { get; set; } = "";
        public bool IsVpn { get; set; }
    }
}
