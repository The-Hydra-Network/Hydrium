using LiteDB;

namespace Rec_rewild_live_rewrite.api.server.Classes.db_class
{
    public class PlayerSetting
    {
        [BsonId]
        public ulong PlayerId { get; set; }
        public List<Setting> Settings { get; set; } = new List<Setting>();
    }

    public class Setting
    {
        public string? Key { get; set; }
        public string? Value { get; set; }
    }
}
