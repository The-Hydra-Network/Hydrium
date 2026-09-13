using LiteDB;
using Microsoft.Extensions.FileProviders;
using Rec_rewild_live_rewrite;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.Controllers;
using Rec_rewild_live_rewrite.Commands;
using Rec_rewild_live_rewrite.api.server;
using System.Security.Principal;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Rec_rewild_live_rewrite.api.server.Classes;
using Newtonsoft.Json;

internal class Program
{
    private static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.WebHost.ConfigureKestrel(serverOptions =>
        {
            serverOptions.AllowSynchronousIO = true;
        });

        builder.Services.AddHttpLogging(configureOptions => { });

        builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = null;
    });

        builder.Services.AddSignalR();

        builder.Services.AddSingleton<DiscordBot>();

        builder.Host.UseContentRoot(Directory.GetCurrentDirectory());

        builder.Services.Configure<ApiBehaviorOptions>(options =>
        {
            options.SuppressModelStateInvalidFilter = false;
        });

        var app = builder.Build();

        if (!Directory.Exists(Environment.CurrentDirectory + "/Data"))
        {
            Directory.CreateDirectory(Environment.CurrentDirectory + "/Data");
            Directory.CreateDirectory(Environment.CurrentDirectory + "/Data/APIS");
            Directory.CreateDirectory(Environment.CurrentDirectory + "/Data/DBs");
        }

        if (!Directory.Exists(Environment.CurrentDirectory + "/Web"))
        {
            Directory.CreateDirectory(Environment.CurrentDirectory + "/Web");
            Directory.CreateDirectory(Environment.CurrentDirectory + "/Web/Admin");
        }

        app.UseMiddleware<Log>(Path.Combine(Environment.CurrentDirectory, "Data", "APILog.txt"));

        app.UseMiddleware<RequestResponseLoggingMiddleware>();

        //app.UseMiddleware<VpnBlockMiddleware>();

        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.ToString();
            if (path.Contains("//"))
            {
                path = path.Replace("//", "/");
                context.Request.Path = path;
            }
            await next.Invoke();
        });

        app.UseWebSockets();

        app.UseAuthorization();

        app.UseMiddleware<IPAllowMiddleware>();

        // app.UseStatusCodePagesWithReExecute("/Web/404");

        var webSocketOptions = new WebSocketOptions
        {
            KeepAliveInterval = TimeSpan.FromMinutes(2)
        };

        app.UseWebSockets(webSocketOptions);

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(Path.Combine(builder.Environment.ContentRootPath, "Data", "Videos")),
            RequestPath = "/cdn/video",
            OnPrepareResponse = ctx =>
            {
                ctx.Context.Response.Headers.Remove("Accept-Ranges");
                var allowedContentTypes = new[] 
                {
                    "video/mp4", // some webm video break recroom video screen and show artifact
                    "video/mkv"
                };
                if (!allowedContentTypes.Contains(ctx.Context.Response.ContentType))
                {
                    ctx.Context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    ctx.Context.Response.Body = Stream.Null;
                }
            }
        });

        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(
         Path.Combine(builder.Environment.ContentRootPath, "Data", "CDN", "Configs")
     ),
            RequestPath = "/cdn/config",
            OnPrepareResponse = ctx =>
            {
                ctx.Context.Response.Headers.Remove("Accept-Ranges");
            },
            ServeUnknownFileTypes = true // optional if some files have unknown extensions
        });

        app.UseHttpLogging();

        app.MapControllers();

        //PlayerDB.EnsureDormsDontBeStupid(log: true);

        //RoomDB.d(51, 138, "f94c6b386d2b45a0a582f688022aba0c.room");

        //PlayerDB.ImportPlayers(Environment.CurrentDirectory + "/Data/exported_players.json");
        //await RoomDB.ImportRooms(Environment.CurrentDirectory + "/Data/yay.json");
        // Once everything is checked for prod release, uncomment this and import the players and rooms.
        /*
        await Task.Run(() =>
        {
            try
            {
                Webhook.Send(
                1,
                "prod",
                "Server Info",
                "Rec Rewild Live server just went online!",
                5898927
                );

            }
            catch (Exception ex)
            {
                Console.WriteLine($"{ex.Message}");
            }
        });
        */
        // PlayerDB.SetIsInfluencer(282, true);
        // PlayerDB.SetCreatorCode(282, "idk");
        // RoomDB.FixDuplicateDorms();
        // PlayerDB.EnsureDormsForAllPlayers();
        // PlayerDB.SetPlayerDev(Rec_rewild_live_rewrite.api.server.Classes.db_class.DevFlag.none, 3);
        // PlayerDB.ClearRecentRoomsForAllPlayers();
        //var botTask = StartBotAsync(app.Services);
        new Thread(new ThreadStart(debug_run)).Start();
        
        PlayerDB.Setup();
        HeartbeatDB.Setup();
        RoomDB.Setup();

        app.Run();
        //await botTask;
    }
    public static async Task StartBotAsync(IServiceProvider services)
    {
        var bot = services.GetRequiredService<DiscordBot>();
        await bot.RunAsync();
    }

    public static void debug_run()
    {
        new CommandConsole();
    }
}