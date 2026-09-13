using System;
using LiteDB;

namespace Rec_rewild_live_rewrite.api.server.Classes.db_class
{
    public class YourFriendData
    {
        [BsonId]
        public ObjectId? Id { get; set; }
        public ulong PlayerID { get; set; }
        public RelationshipDetail Relationship { get; set; }
    }

    public class FriendData
    {
        [BsonId]
        public ObjectId? Id { get; set; }
        public string? FriendId { get; set; }
        public RelationshipType Relationship { get; set; }
        public FriendInfo FriendFlags { get; set; }
        public ReciprocalStatus Status { get; set; }
    }

    public class RelationshipDetail
    {
        public ulong Id { get; set; }
        public ulong PlayerID { get; set; }
        public ulong OtherPlayerID { get; set; }
        public RelationshipType RelationshipType { get; set; }
        public ReciprocalStatus Muted { get; set; }
        public ReciprocalStatus Ignored { get; set; }
        public ReciprocalStatus Favorited { get; set; }
        public int VoiceVolume { get; set; } = 100;
    }

    public enum RelationshipType
    {
        None,
        FriendRequestSent,
        FriendRequestReceived,
        Friend,
    }
    
    [Flags]
    public enum FriendInfo
    {
        None = 0,
        Favorited = 1,
        Muted = 2, 
        Ignored = 4,
        Blocked = 5
    }

    public enum ReciprocalStatus
    {
        None,
        Local,
        Remote,
        Mutual
    }
}