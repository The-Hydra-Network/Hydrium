using System;
using Rec_rewild_live_rewrite.api.dbs;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class Progress
    {
        public int Level { get; set; }
        public ulong PlayerId { get; set; }
        public int XP { get; set; }

        public static Progress GetPlayerLevel(ulong player_id)
        {
            var account = PlayerDB.GetFullAccount(player_id);
            if (account == null || account.player == null)
            {
                return new Progress
                {
                    Level = 0,
                    PlayerId = player_id,
                    XP = 0
                };
            }

            return new Progress
            {
                Level = account.player.Level,
                PlayerId = account.player.Id,
                XP = account.player.XP
            };
        }
    }
}
