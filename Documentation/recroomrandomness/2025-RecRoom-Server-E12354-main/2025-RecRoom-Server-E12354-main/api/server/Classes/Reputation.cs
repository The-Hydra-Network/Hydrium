using Rec_rewild_live_rewrite.api.server.Classes.db_class;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class Rep
    {
        public ulong AccountId { get; set; }
        public bool IsCheerful { get; set; }
        public int Noteriety { get; set; }
        public CheerCategoryEnum SelectedCheer { get; set; }
        public int CheerCredit { get; set; }
        public int CheerGeneral { get; set; }
        public int CheerHelpful { get; set; }
        public int CheerCreative { get; set; }
        public int CheerGreatHost { get; set; }
        public int CheerSportsman { get; set; }
    }
}
