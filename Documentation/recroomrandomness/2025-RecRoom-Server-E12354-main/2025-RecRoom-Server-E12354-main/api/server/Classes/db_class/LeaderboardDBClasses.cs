using System.Text.Json.Serialization;

namespace Rec_rewild_live_rewrite.api.server.Classes.db_class
{
    public class LeaderboardDBClasses
    {
        public class GetNearbyScoresRequest
        {
            // {"PlayerId":2,"StatChannel":2,"RoomId":29,"FilterType":1,"SortAscending":false,"WindowSize":10}
            public ulong PlayerId { get; set; }
            public int StatChannel { get; set; }
            public ulong RoomId { get; set; }
            public FilterTypeEnum FilterType { get; set; }
            public bool SortAscending { get; set; }
            public int WindowSize { get; set; }
        }

        public class GetRanksRequest
        {
            // {"PlayerId":2,"StatChannel":2,"RoomId":29,"FilterType":0,"SortAscending":false,"RankStart":0,"RankEnd":9}
            public ulong PlayerId { get; set; }
            public int StatChannel { get; set; }
            public ulong RoomId { get; set; }
            public FilterTypeEnum FilterType { get; set; }
            public bool SortAscending { get; set; }
            public int RankStart { get; set; } // skip
            public int RankEnd { get; set; }   // take
        }

        public class CheckAndSetStatRequest
        {
            // {"StatChannel":2,"RoomId":29,"StatValue":1,"CurrentStatValue":null}
            public int StatChannel { get; set; }
            public ulong RoomId { get; set; }
            public int StatValue { get; set; }
            public int? CurrentStatValue { get; set; }
        }

        public class Entry
        {
            [JsonIgnore]
            public int Id { get; set; } // LiteDB PK

            public int PlayerId { get; set; }
            [JsonIgnore]
            public int StatChannel { get; set; }
            [JsonIgnore]
            public long RoomId { get; set; }

            public int Score { get; set; }
            public int Rank { get; set; }
        }


        public class SingleLeaderboard
        {
            public List<Entry> Rows { get; set; }
        }

        public class FullLeaderboard
        {
            public List<Entry> GlobalOverall { get; set; }
            public List<Entry> GlobalPeriodic { get; set; }
            public List<Entry> FriendsOverall { get; set; }
            public List<Entry> FriendsPeriodic { get; set; }
            public DateTime NextResetUTC { get; set; }
        }

        public enum RequestResult
		{
			Success,
			InvalidStat,
			RedisConnectionError
		}

		public enum FilterType
		{
			Global,
			Friends
		}

		public enum Timeframe
		{
			AllTime,
			TwoWeeks
		}

        public enum FilterTypeEnum
        {
            NearbyScoresGlobal,
            NearbyScoresFriends,
            Champions,
            NUM_VALUES // wat
        }
    }
}
