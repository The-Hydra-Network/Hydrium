using System;
using System.Text.Json.Serialization;
using LiteDB;

namespace Rec_rewild_live_rewrite.api.server.Classes.db_class
{
    public class account_data
    {
        [JsonPropertyOrder(1)]
        public ulong accountId { get; set; }
        [JsonPropertyOrder(2)]
        public string? username { get; set; }
        [JsonPropertyOrder(3)]
        public string? displayName { get; set; }
        [JsonPropertyOrder(4)]
        public string? profileImage { get; set; }
        [JsonPropertyOrder(5)]
        public bool? isJunior { get; set; }
        [JsonPropertyOrder(6)]
        public long platforms { get; set; }
        [JsonPropertyOrder(7)]
        public long personalPronouns { get; set; }
        [JsonPropertyOrder(8)]
        public long identityFlags { get; set; }
        [JsonPropertyOrder(9)]
        public DateTime createdAt { get; set; }
        [JsonPropertyOrder(10)]
        public bool isMetaPlatformBlocked { get; set; } = false;
    }
    public class setting_data
    {
        public ulong accountId { get; set; }
        public string Key { get; set; }
        public string Val { get; set; }
    }

    public class player_data
    {
        public ulong id { get; set; }
        public ulong playerid { get; set; }
        public Platforms platform { get; set; }
        public List<string>? deviceId { get; set; }
        public string? authtoken { get; set; }
        public string? password { get; set; } 
        public player_info? player { get; set; }
        public player_extra? player_Extra { get; set; }
        public DevFlag dev_Flag { get; set; }
    }

    public enum Platforms
    {
        All = -1,
        Steam,
        Oculus,
        PlayStation,
        Xbox,
        RecNet,
        IOS,
        GooglePlay,
        Standalone
    }

    public class player_extra
    {
        public ulong? DormRoomID { get; set; }
        public List<string>? IpAddresses { get; set; }
        public ulong DiscordId { get; set; }
        public string? Bio { get; set; }
        public string? avatar { get; set; }
        public List<avatar_data_saved>? SavedOutfits { get; set; }
        public Moderation_Detail.ModerationBlockDetails? ModerationBlockDetails { get; set; }
        public List<ulong>? CheeredRooms { get; set; }
        public List<ulong>? FavoritedRooms { get; set; }
        public int sub_count { get; set; } = 0;
        public List<ulong> SubbedTo { get; set; } = new();
        public bool IsRecentRoomHistoryVisible { get; set; } = true;
        public Influencer? Influencer { get; set; }
        public CustomAvatarItems CustomAvatarItems { get; set; } = new CustomAvatarItems();
        public MyRoomData MyRoomData { get; set; } = new MyRoomData();
        public List<MessageData>? Messages { get; set; }
        public PlayerPhotoTaggingSetting PlayerPhotoTaggingSetting { get; set; } = PlayerPhotoTaggingSetting.Anyone;

    }

    public enum PlayerPhotoTaggingSetting
    {
        Anyone,
        Friends,
        NoOne
    }

    public class SetPlayerPhotoTaggingSettingRequest
    {
        public PlayerPhotoTaggingSetting Setting { get; set; }
    }

    public class MyRoomData
    {
        public List<string> owned_room_keys { get; set; } = new List<string>();
        public List<PlayerData> PlayerData { get; set; } = new List<PlayerData>();
        public List<My_Room_currencies> Roomcurrencies { get; set; } = new List<My_Room_currencies>();
    }

    public class PlayerData
    {
        public ulong RoomId { get; set; }
        public string Data { get; set; }
    }

    public class My_Room_currencies
    {
        public long RoomId { get; set; }
        public string Id { get; set; }
        public long Value { get; set; }
    }

    public class SubscribedToEntry
    {
        public ulong PlayerId { get; set; }
    }

    public class avatar_data_saved
    {
        public ulong Slot { get; set; }
        public string? Avatar { get; set; }
        public string? ImageName { get; set; }

        public List<CustomAvatarItemEntry>? CustomAvatarItems { get; set; }

        public string? FaceFeatures { get; set; }
        public string? HairColor { get; set; }
        public string? Name { get; set; }
        public string? SkinColor { get; set; }
        public string? OutfitSelections { get; set; }
        public string? OutfitSelectionsV2 { get; set; }
        public string? PreviewImageName { get; set; }
    }

    public class CustomAvatarItemEntry
    {
        public string? CustomAvatarItemId { get; set; }
        public int BodyPart { get; set; }
    }

    public class avatar_data
    {
        public string? OutfitSelections { get; set; }
        public string? FaceFeatures { get; set; }
        public string? SkinColor { get; set; }
        public string? HairColor { get; set; }

    }

    public class player_info
    {
        public ulong Id { get; set; }
        public string? Username { get; set; }
        public string? DisplayName { get; set; }

        public string? DisplayEmoji { get; set; }

        public string? Email { get; set; }
        public int XP { get; set; }
        public int Level { get; set; }
        public int pronounFlags { get; set; }
        public int identityFlags { get; set; }
        public bool IsJunior { get; set; }
        public bool AvoidJuniors { get; set; }
        public mPlayerReputation? PlayerReputation { get; set; }
        public List<mPlatformID>? PlatformIds { get; set; }
        public DateTime created_at { get; set; }
        public DateTime last_login_time { get; set; }
        public List<ulong> recent_rooms { get; set; } = new List<ulong>();
        public string? bannerImage { get; set; }
        public string? profileImage { get; set; }
    }

    public class AccountLogin
    {
        public DateTime createdAt { get; set; }
        public DateTime lastLoginTime { get; set; }
        public ulong accountId { get; set; }
        public Platforms platform { get; set; }
        public string? platformId { get; set; }
    }

    public class mPlatformID 
    {
        public Platforms Platform { get; set; }
        public ulong PlatformId { get; set; }
    }

    public class mPlayerReputation
    {
        public bool IsCheerful { get; set; }
        public int Noteriety { get; set; }
        public int CheerGeneral { get; set; }
        public int CheerHelpful { get; set; }
        public int CheerGreatHost { get; set; }
        public int CheerSportsman { get; set; }
        public int CheerCreative { get; set; }
        public int CheerCredit { get; set; }
        public int SubscriberCount { get; set; }
        public int SubscribedCount { get; set; }
        public CheerCategoryEnum SelectedCheer { get; set; }
    }

    public class DeleteMessagesRequest
    {
        public List<ulong> MessageIds { get; set; }
    }


    public enum CheerCategoryEnum
    {
        None = -1,
        General = 0,
        Helpful = 10,
        Sportmanship = 20,
        GreatHost = 30,
        Creative = 40
    }

    public class account_data_web
    {
        public ulong accountId { get; set; }
        public DateTime createdAt { get; set; }
        public string? displayName { get; set; }

        public string? displayEmoji { get; set; }
        public long identityFlags { get; set; }
        public bool? isJunior { get; set; }
        public long personalPronouns { get; set; }
        public long platforms { get; set; }
        public string? profileImage { get; set; }
        public string? bannerImage { get; set; }
        public string? username { get; set; }
    }

    public class account_data_me
    {
        public ulong accountId { get; set; }
        public int availableusernameChanges { get; set; } = 3;
        public string? bannerImage { get; set; }
        public DateTime createdAt { get; set; }

        public string? email { get; set; }
        public string? displayName { get; set; }

        public string? displayEmoji { get; set; }
        public long identityFlags { get; set; }

        public bool hasBirthday { get; set; } = true;
        public string? Phone { get; set; }
        public bool? isJunior { get; set; }
        public long personalPronouns { get; set; }
        public long platforms { get; set; }
        public string? profileImage { get; set; }
        public bool TreatAsJunior { get; set; } = false;
        public string? username { get; set; }
    }

    public class CustomAvatarItems
    {
        public bool isCreationAllowedForAccount { get; set; } = true;
        public bool isCreationEnabled { get; set; } = true;
        public bool isRenderingEnabled { get; set; } = true;

        public List<string> ownedItems { get; set; } = new List<string>();
    }

    public class Influencer
    {
        public string creatorCode { get; set; } = "";
        public bool isInfluencer { get; set; } = false;
        public ulong SupportingInfluencer { get; set; }
    }

    public class MessageData
    {
        /*
        [
              {
                "Id": 15909836337,
                "FromPlayerId": 64495891,
                "SentTime": "2025-05-27T11:39:25.12Z",
                "Type": 200,
                "Data": "58129955",
                "RoomId": null,
                "PlayerEventId": null
              }
        ]
        */
        public ulong Id { get; set; }
        public ulong FromPlayerId { get; set; }
        public DateTime SentTime { get; set; }
        public WebsocketEvents.MessageType Type { get; set; }
        public string? Data { get; set; }
        public ulong? RoomId { get; set; }
        public ulong? PlayerEventId { get; set; }

    }

    public enum DeviceClasses
    {
        Unknown,
        VR,
        Screen,
        Mobile,
        VRLow,
        Quest2
    }

    public class account_login<T>
    {
        public bool success { get; set; }
        public string? error { get; set; }
        [JsonIgnore]
        public ulong accid { get; set; }
    }

    [Flags]
    public enum DevFlag
    {
        none = 0,
        screenshare = 1,
        dev = 2,
        mod = 4,
        owner = 8,
        junior = 16,
        keepsake = 32,
        newly_created_account = 64,
        restricted_account = 128,
        unused_2 = 256,
        unused_3 = 512,
        unused_4 = 1024,
        unused_5 = 2048,
        unused_6 = 4096,
        unused_7 = 8192,
    }
}
