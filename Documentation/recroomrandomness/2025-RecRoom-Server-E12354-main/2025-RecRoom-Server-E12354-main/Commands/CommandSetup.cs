using System;
using System.Collections.Generic;
using System.Reflection;

namespace Rec_rewild_live_rewrite.Commands
{
    public static class CommandSetup
    {
        public static Dictionary<string, Action> RegisterAllCommands(object instance)
        {
            var commands = new Dictionary<string, Action>();

            var methods = instance.GetType().GetMethods(BindingFlags.NonPublic | BindingFlags.Instance);
            foreach (var method in methods)
            {
                var attr = method.GetCustomAttribute<ConsoleCommandAttribute>();
                if (attr != null)
                {
                    commands[attr.CommandName] = () => method.Invoke(instance, null);
                }
            }

            return commands;
        }
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class ConsoleCommandAttribute : Attribute
    {
        public string CommandName { get; }
        public string Description { get; }

        public ConsoleCommandAttribute(string name, string desc)
        {
            CommandName = name;
            Description = desc;
        }
    }
}
