using LiteDB;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Rec_rewild_live_rewrite.api.server.Classes.db_class
{
    public class EventDBClasses
    {
        public class CreateEventRequest
        {
            // {"RoomId":708,"SubRoomId":1444,"ClubId":null,"name":"awdadwdawdadwdawdadwd","Description":"awdadwdawdadwdawdadwdawdadwdawdadwdawdadwdawdadwdawdadwdawdadwdawdadwd","Tags":["grandopening"],"ImageName":"J9W8A0FUGWXG4CMBKFDJ46CUZHJOHP.png","StartTime":"2025-12-13T14:20:41.6244242Z","EndTime":"2025-12-13T14:50:41.6244242Z","Accessibility":1,"IsMultiInstance":false,"SupportMultiInstanceRoomChat":false,"DefaultBroadcastPermissions":0,"CanRequestBroadcastPermissions":0}
            public ulong RoomId { get; set; }
            public ulong? SubRoomId { get; set; }
            public ulong? ClubId { get; set; }
            public string? Name { get; set; }
            public string? Description { get; set; }
            public List<string>? Tags { get; set; }
            public string? ImageName { get; set; }
            public DateTime StartTime { get; set; }
            public DateTime EndTime { get; set; }
            public PlayerEventAccessibility Accessibility { get; set; }
            public bool IsMultiInstance { get; set; } // this is just multi instance room
            public bool SupportMultiInstanceRoomChat { get; set; } // this let player talk betweeen room instance using room chat
            public int DefaultBroadcastPermissions { get; set; } // idk what this is used for
            public int CanRequestBroadcastPermissions { get; set; } // idk what this is used for
        }

        public class FullPlayerEvent
        {
            public List<FullTag>? Tags { get; set; }
            public List<FullEventResponses>? Responses { get; set; }
            [BsonId]
            public ulong PlayerEventId { get; set; }
            public ulong? CreatorPlayerId { get; set; }
            public string? ImageName { get; set; }
            public ulong RoomId { get; set; }
            public ulong? SubRoomId { get; set; }
            public ulong? ClubId { get; set; }
            public string? Name { get; set; }
            public string? Description { get; set; }
            public DateTime StartTime { get; set; }
            public DateTime EndTime { get; set; }
            public int AttendeeCount { get; set; }
            public int State { get; set; }
            public PlayerEventAccessibility Accessibility { get; set; }
            public bool IsMultiInstance { get; set; } // this is just multi instance room
            public bool SupportMultiInstanceRoomChat { get; set; } // this let player talk betweeen room instance using room chat
            public BroadcastPermissionsEnum DefaultBroadcastPermissions { get; set; } // idk what this is used for
            public BroadcastPermissionsEnum CanRequestBroadcastPermissions { get; set; } // idk what this is used for
            public ulong BroadcastingRoomInstanceId { get; set; }
            public DateTime? RecurrenceSchedule { get; set; }
        }

        public class FullTag
        {
            public string? Tag { get; set; }
            public TagType Type { get; set; }
        }

        public class FullEventResponses
        {
            public ulong PlayerEventResponseId { get; set; }
            public ulong PlayerEventId { get; set; }
            public ulong PlayerId { get; set; }
            public DateTime CreatedAt { get; set; }
            public PlayerEventResponseType Type { get; set; } = PlayerEventResponseType.None;
        }

        public enum PlayerEventResponseType
        {
            None = -1,
            Yes,
            Interested,
            No,
            Pending
        }

        public enum BroadcastPermissionsEnum
        {
            None,
            RoomOwners = 256,
            All = 2147483647
        }

        public enum PlayerEventAccessibility
        {
            Private,
            Public,
            Unlisted
        }

        public enum TagType
        {
            Unknown1 = 0,
            Unknown2 = 1,
            Unknown3 = 2
        }

        public enum EventResults
        {
            Success,
            HasModeratorClosedEvent,
            DoesNotExist,
            PlayerDoesNotExist,
            RoomDoesNotExist,
            StatusUnchanged,
            PrivateEvent,
            SomethingWentWrong,
            DoesNotOwnRoom,
            ResponseDoesNotExist,
            PlayerAlreadyInvited,
            EventDatesInvalid,
            EventTooLong,
            EventTooShort,
            InappropriateName,
            InappropriateDescription,
            SomeInvitesFailed,
            CannotInviteJunior,
            EventCountLimitReached,
            DoesNotOwnEvent,
            UnregisteredOrJuniorNotAllowed,
            InvalidClubPermissions,
            ImageDoesNotExist,
            SubRoomDoesNotExist,
            DoesNotOwnSubRoom,
            ModifyTagsFailed,
            RoomCapacityTooLow,
            BroadcastEventNotMultiInstance,
            PlayerNotAllowedToCreateMultiInstanceEvents,
            PlayerBannedFromEventCreation,
            EventIsModerationClosed,
            EventIsModerationPendingReview
        }
    }
}
