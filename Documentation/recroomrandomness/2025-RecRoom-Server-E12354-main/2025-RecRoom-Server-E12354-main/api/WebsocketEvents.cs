using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.dbs;
using System.Security.Principal;
using static Rec_rewild_live_rewrite.api.WebsocketEvents;
using Rec_rewild_live_rewrite.api.server;
using Microsoft.IdentityModel.Tokens.Experimental;

namespace Rec_rewild_live_rewrite.api
{
    public class WebsocketEvents
    {
        public static Reponse create_player_updated_account2_Response(string id, account_data_me account)
        {
            return new Reponse
            {
                Id = id,
                Msg = account
            };
        }

        public static Reponse create_sub(string id, ulong playerid, int membershipType)
        {
            return new Reponse
            {
                Id = id,
                Msg = new Sub
                {
                    creatorAccountId = playerid,
                    clubId = 1,
                    membershipType = membershipType,
                }
            };
        }

        public static Reponse createResponse_levelupdate(ulong playerid, int level, int xp)
        {
            return new Reponse
            {
                Id = "PlayerProgressionLevelUpdate",
                Msg = new
                {
                    PlayerId = playerid,
                    Level = level,
                    XP = xp,
                }
            };
        }

        public static Reponse CreateResponseReputationUpdate(ulong playerId)
        {
            var acc = PlayerDB.GetFullAccount(playerId);
            return new Reponse
            {
                Id = "ReputationUpdate",
                Msg = new
                {
                    AccountId = playerId,
                    IsCheerful = acc.player.PlayerReputation.IsCheerful,
                    Noteriety = acc.player.PlayerReputation.Noteriety,
                    SelectedCheer = acc.player.PlayerReputation.SelectedCheer,
                    CheerCredit = acc.player.PlayerReputation.CheerCredit,
                    CheerGeneral = acc.player.PlayerReputation.CheerGeneral,
                    CheerHelpful = acc.player.PlayerReputation.CheerHelpful,
                    CheerCreative = acc.player.PlayerReputation.CheerCreative,
                    CheerGreatHost = acc.player.PlayerReputation.CheerGreatHost,
                    CheerSportsman = acc.player.PlayerReputation.CheerSportsman,
                    SubscriberCount = acc.player_Extra.sub_count,
                    SubscribedCount = 0,
                    RecRoomDeveloper = PlayerDB.CheckDevFlag(acc.player.Id)
                }
            };
        }

        public static Reponse CreateMessageResponse(MessageData messageData)
        {
            return new Reponse
            {
                Id = "2",
                Msg = messageData
            };
        }

        public static Reponse CreateLogout(ulong id)
        {
            return new Reponse
            {
                Id = "6", // 6 = Logout
                Msg = new
                {

                }
            };
        }

        public static Reponse CreateBan(Moderation_Detail.ModerationBlockDetails block)
        {
            return new Reponse
            {
                Id = "22",
                Msg = block
            };
        }

        public class Reponse
        {
            public string? Id { get; set; }

            public object? Msg { get; set; }
        }

        public enum ResponseResults
        {
            RelationshipChanged = 1,
            MessageReceived,
            MessageDeleted,
            PresenceHeartbeatResponse,
            RefreshLogin,
            Logout,
            SubscriptionUpdateProfile = 11,
            SubscriptionUpdatePresence,
            SubscriptionUpdateGameSession,
            SubscriptionUpdateRoom = 15,
            SubscriptionUpdateRoomPlaylist,
            ModerationQuitGame = 20,
            ModerationUpdateRequired,
            ModerationKick,
            ModerationKickAttemptFailed,
            ModerationRoomBan,
            ServerMaintenance,
            GiftPackageReceived = 30,
            GiftPackageReceivedImmediate,
            GiftPackageRewardSelectionReceived,
            ProfileJuniorStatusUpdate = 40,
            RelationshipsInvalid = 50,
            StorefrontBalanceAdd = 60,
            StorefrontBalanceUpdate,
            StorefrontBalancePurchase,
            ConsumableMappingAdded = 70,
            ConsumableMappingRemoved,
            PlayerEventCreated = 80,
            PlayerEventUpdated,
            PlayerEventDeleted,
            PlayerEventResponseChanged,
            PlayerEventResponseDeleted,
            PlayerEventStateChanged,
            ChatMessageReceived = 90,
            CommunityBoardUpdate = 95,
            CommunityBoardAnnouncementUpdate,
            InventionModerationStateChanged = 100,
            FreeGiftButtonItemsAdded = 110,
            LocalRoomKeyCreated = 120,
            LocalRoomKeyDeleted
        }

        public enum MessageType
        {
            GameInvite,
            GameInviteDeclined,
            GameJoinFailed,
            PartyActivitySwitch,
            FriendInvite,
            VoteToKick,
            GameInviteV2,
            PartyActivitySwitchV2,
            RequestGameInvite = 10,
            RequestGameInviteDeclined,
            FriendStatusOnline = 20,
            TextMessage = 30,
            FriendRequestAccepted = 40,
            PlayerCheer = 50,
            PlayerCheerAnonymous,
            RoomCoOwnerAdded = 60,
            RoomCoOwnerRemoved,
            RoomCoOwnerInvited,
            CreatorPublishedNewRoom = 70,
            PlayerAttendingEvent = 80,
            PlayerEventInvitation,
            GroupInvitation = 90,
            PlayerJoinedGroup,
            CoachMessage = 100
        }


        public static Reponse createResponse_msg(string message, ulong playerid)
        {
            return new Reponse
            {
                Id = "2",
                Msg = new
                {
                    FromPlayerId = (long)playerid,
                    Id = rng.Next(1, 0x7ffffff),
                    SentTime = DateTime.UtcNow,
                    Type = 100,
                    Data = message,
                    RoomId = 1
                }
            };
        }

        private static readonly Random rng = new Random();
    }
}
