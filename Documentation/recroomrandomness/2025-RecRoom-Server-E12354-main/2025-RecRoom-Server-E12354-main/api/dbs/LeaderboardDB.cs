using LiteDB;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.LeaderboardDBClasses;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class LeaderboardDB
    {
        private static readonly LiteDatabase DB = new LiteDatabase(
            Environment.CurrentDirectory + "/Data/DBs/Leaderboard.db"
        );

        private static ILiteCollection<Entry> Entries =>
            DB.GetCollection<Entry>("leaderboard");

        static LeaderboardDB()
        {
            // Short index names to avoid LiteDB 32-char name limit
            Entries.EnsureIndex("pid", x => x.PlayerId);
            Entries.EnsureIndex("sc", x => x.StatChannel);
            Entries.EnsureIndex("rid", x => x.RoomId);

            // Score index for sorting
            Entries.EnsureIndex("score", x => x.Score);
        }


        // ------------------------------------------
        // Add or Update Stat
        // ------------------------------------------
        public static RequestResult SetStat(ulong playerId, int statChannel, ulong roomId, int newValue)
        {
            try
            {
                var entry = Entries.FindOne(x =>
                    x.PlayerId == (int)playerId &&
                    x.StatChannel == statChannel &&
                    x.RoomId == (long)roomId
                );

                if (entry == null)
                {
                    entry = new Entry
                    {
                        PlayerId = (int)playerId,
                        StatChannel = statChannel,
                        RoomId = (long)roomId,
                        Score = newValue
                    };
                    Entries.Insert(entry);
                }
                else
                {
                    entry.Score = newValue;
                    Entries.Update(entry);
                }

                RecomputeRanks(statChannel, roomId);
                return RequestResult.Success;
            }
            catch
            {
                return RequestResult.InvalidStat;
            }
        }

        // ------------------------------------------
        // Recalculate ranks for a specific leaderboard
        // ------------------------------------------
        private static void RecomputeRanks(int statChannel, ulong roomId)
        {
            var list = Entries.Find(x =>
                x.StatChannel == statChannel &&
                x.RoomId == (long)roomId
            )
            .OrderByDescending(x => x.Score)
            .ToList();

            int rank = 1;
            foreach (var e in list)
            {
                e.Rank = rank++;
                Entries.Update(e);
            }
        }

        // ------------------------------------------
        // Get Player Rank
        // ------------------------------------------
        public static Entry? GetPlayerRank(ulong playerId, int statChannel, ulong roomId)
        {
            return Entries.FindOne(x =>
                x.PlayerId == (int)playerId &&
                x.StatChannel == statChannel &&
                x.RoomId == (long)roomId
            );
        }

        // ------------------------------------------
        // Nearby Scores Window
        // ------------------------------------------
        public static List<Entry> GetNearbyScores(
            ulong playerId,
            int statChannel,
            ulong roomId,
            int windowSize)
        {
            var me = GetPlayerRank(playerId, statChannel, roomId);
            if (me == null)
            {
                return Entries.Find(x =>
         x.StatChannel == statChannel &&
         x.RoomId == (long)roomId
     )
     .OrderBy(x => x.Rank)
     .Take(windowSize * 2 + 1)
     .ToList();

            }

            int start = Math.Max(me.Rank - windowSize, 1);
            int end = me.Rank + windowSize;


            return Entries.Find(x =>
                x.StatChannel == statChannel &&
                x.RoomId == (long)roomId &&
                x.Rank >= start &&
                x.Rank <= end
            )
            .OrderBy(x => x.Rank)
            .ToList();
        }

        // ------------------------------------------
        // Range Get — GetRanks API
        // ------------------------------------------
        public static List<Entry> GetRanks(
     int statChannel,
     ulong roomId,
     int rankStart,
     int rankEnd)
        {
            return Entries.Find(x =>
                x.StatChannel == statChannel &&
                x.RoomId == (long)roomId &&
                x.Rank >= rankStart &&
                x.Rank <= rankEnd
            )
            .OrderBy(x => x.Rank)
            .ToList();
        }
    }
}
