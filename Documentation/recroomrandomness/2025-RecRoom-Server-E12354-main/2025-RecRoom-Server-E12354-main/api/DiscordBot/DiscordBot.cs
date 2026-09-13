using Discord;
using Discord.WebSocket;
using Discord.Interactions;
using System;
using System.Reflection;
using System.Threading.Tasks;

public class DiscordBot
{
    private readonly DiscordSocketClient _client;
    private readonly InteractionService _commands;
    private readonly IServiceProvider _services;
    private readonly IServiceProvider _serviceProvider;
    private static string BOT_TOKEN = "REPLACEME"; 

    public DiscordBot(IServiceProvider services)
    {
        _client = new DiscordSocketClient();
        _commands = new InteractionService(_client.Rest);
        _serviceProvider = services;
    }

    public async Task RunAsync()
    {
        _client.Log += Log;
        _client.Ready += Ready;
        _client.InteractionCreated += HandleInteraction;

        await _client.LoginAsync(TokenType.Bot, BOT_TOKEN);
        await _client.StartAsync();

        await Task.Delay(-1);  // Keeps the bot running
    }

    private async Task Ready()
    {
        Console.WriteLine("Bot is connected and ready!");

        // Now that the bot is ready, register commands
        await RegisterCommandsAsync();
    }

    private async Task RegisterCommandsAsync()
    {
        try
        {
            Console.WriteLine("Starting to register commands...");

            await _commands.AddModulesAsync(Assembly.GetEntryAssembly(), _services);
            Console.WriteLine("Modules loaded for command registration.");

            // Register commands for a specific guild (faster propagation)
            await _commands.RegisterCommandsToGuildAsync(1253525152503955497); 
            Console.WriteLine("Commands registered to guild successfully.");

            // Optionally, register commands globally (can take time to propagate)
            //await _commands.RegisterCommandsGloballyAsync();
            //Console.WriteLine("Global commands registered successfully.");
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex);
        }
    }


    private Task Log(LogMessage log)
    {
        Console.WriteLine(log);
        return Task.CompletedTask;
    }

    private async Task HandleInteraction(SocketInteraction interaction)
    {
        // Handle the interaction using the InteractionService
        var context = new SocketInteractionContext(_client, interaction);
        await _commands.ExecuteCommandAsync(context, _serviceProvider);
    }
}
