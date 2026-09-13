namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class VersionCheck
    {
        public VersionStatus ValidVersion { get; set; }
        public VersionStatus VersionStatus { get; set; }
        public UpdateNoti UpdateNotificationStage { get; set; }
        public bool IsVersionIslanded { get; set; }
        public bool IsCrossPlayDisabled { get; set; }
    }

    public enum VersionStatus
    {
        ValidForPlay,
        UpdateRequired
    }

    public enum UpdateNoti
    {
        None,
        Silent,
        Warn,
        Prompt,
        Require
    }
}
