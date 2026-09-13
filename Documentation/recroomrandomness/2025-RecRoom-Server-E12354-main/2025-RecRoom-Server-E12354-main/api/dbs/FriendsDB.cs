using System.Net.WebSockets;
using LiteDB;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.Controllers;
using static Rec_rewild_live_rewrite.api.WebsocketEvents;
using static Rec_rewild_live_rewrite.Controllers.AccountsController;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class FriendsDB
    {
        public static LiteDatabase PlayerFriendDBFile = new LiteDatabase(Environment.CurrentDirectory + "/Data/DBs/PlayersFriends.db");


        // ==========================
        // GET ALL RELATIONSHIPS
        // ==========================
        public static List<RelationshipDetail> GetRelationships(ulong playerId)
        {
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");

            List<RelationshipDetail> list = new();

            foreach (var data in col.FindAll())
            {
                if (data.Relationship.OtherPlayerID != playerId)
                    continue;

                list.Add(new RelationshipDetail
                {
                    Id = data.Relationship.Id,
                    PlayerID = data.Relationship.PlayerID,
                    OtherPlayerID = data.Relationship.OtherPlayerID,
                    RelationshipType = data.Relationship.RelationshipType,
                    Muted = data.Relationship.Muted,
                    Ignored = data.Relationship.Ignored,
                    Favorited = data.Relationship.Favorited,
                    VoiceVolume = data.Relationship.VoiceVolume
                });
            }

            return list;
        }




        // ==========================
        // SEND FRIEND REQUEST
        // ==========================
        public static RelationshipDetail SendFriendRequest(ulong fromPlayer, ulong toPlayer)
        {
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");

            // ---- A -> B ----
            var relA = col.FindOne(x =>
                x.PlayerID == fromPlayer &&
                x.Relationship.OtherPlayerID == toPlayer
            );

            if (relA == null)
            {
                relA = new YourFriendData
                {
                    Id = ObjectId.NewObjectId(),
                    PlayerID = fromPlayer,
                    Relationship = new RelationshipDetail
                    {
                        Id = (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        PlayerID = fromPlayer,
                        OtherPlayerID = toPlayer,
                        RelationshipType = RelationshipType.None,
                        Favorited = ReciprocalStatus.None,
                        Ignored = ReciprocalStatus.None,
                        Muted = ReciprocalStatus.None,
                        VoiceVolume = 100
                    }
                };

                col.Insert(relA);
            }

            // ---- B -> A ----
            var relB = col.FindOne(x =>
                x.PlayerID == toPlayer &&
                x.Relationship.OtherPlayerID == fromPlayer
            );

            if (relB == null)
            {
                relB = new YourFriendData
                {
                    Id = ObjectId.NewObjectId(),
                    PlayerID = toPlayer,
                    Relationship = new RelationshipDetail
                    {
                        Id = (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        PlayerID = toPlayer,
                        OtherPlayerID = fromPlayer,
                        RelationshipType = RelationshipType.None,
                        Favorited = ReciprocalStatus.None,
                        Ignored = ReciprocalStatus.None,
                        Muted = ReciprocalStatus.None,
                        VoiceVolume = 100
                    }
                };

                col.Insert(relB);
            }


            // Update types
            relA.Relationship.RelationshipType = RelationshipType.FriendRequestSent;
            relB.Relationship.RelationshipType = RelationshipType.FriendRequestReceived;

            col.Update(relA);
            col.Update(relB);

            //todo: send ws event to anounce the player that it got a new friend request

            // Websocket pushes
            Notifications.SendToPlayer(
                fromPlayer,
                JsonConvert.SerializeObject(CreateResponseFriendRequestSent(toPlayer))
            );

            Notifications.SendToPlayer(
                toPlayer,
                JsonConvert.SerializeObject(CreateResponseFriendRequestReceived(fromPlayer))
            );

            Notifications.SendToPlayer(
               fromPlayer,
               JsonConvert.SerializeObject(CreateResponseFriendRequestMsg(toPlayer))
           );
            return relA.Relationship;
        }

        public static RelationshipDetail? AcceptFriendRequest(ulong fromPlayer, ulong toPlayer)
        {
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");

            // Request MUST exist in both directions (pending)
            var relA = col.FindOne(x => x.PlayerID == fromPlayer && x.Relationship.OtherPlayerID == toPlayer);
            var relB = col.FindOne(x => x.PlayerID == toPlayer && x.Relationship.OtherPlayerID == fromPlayer);

            // Request cannot be accepted if it doesn't exist
            if (relA == null || relA.Relationship == null ||
                relB == null || relB.Relationship == null)
            {
                return null;
            }

            // Set both sides to Friend
            relA.Relationship.RelationshipType = RelationshipType.Friend;
            relB.Relationship.RelationshipType = RelationshipType.Friend;

            col.Update(relA);
            col.Update(relB);

            // Send WebSocket events
            Notifications.SendToPlayer(fromPlayer,
                JsonConvert.SerializeObject(CreateResponseFriendAccepted(toPlayer, fromPlayer)));

            Notifications.SendToPlayer(toPlayer,
                JsonConvert.SerializeObject(CreateResponseFriendAccepted(fromPlayer, toPlayer)));

            Notifications.SendToPlayer(fromPlayer,
               JsonConvert.SerializeObject(CreateResponseFriendAcceptedMsg(toPlayer)));

            // return the accepted version
            return relA.Relationship;
        }


        private static WebsocketEvents.Reponse CreateResponseFriendAcceptedMsg(ulong fromPlayer) => new WebsocketEvents.Reponse
        {
            Id = "2",
            Msg = new
            {
                Id = (ulong)new Random().Next(),
                FromPlayerId = fromPlayer,
                SentTime = DateTime.UtcNow,
                Type = WebsocketEvents.MessageType.FriendRequestAccepted,
                Data = "",
                RoomId = (ulong?)null,
                PlayerEventId = (ulong?)null,
            }
        };

        public static void DeleteFriends(ulong playerId)
        {
            if (playerId == 0) return;
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");
            col.DeleteMany(x => x.PlayerID == playerId);
        }

        public static Reponse CreateResponseFriendAccepted(ulong playerid, ulong fromplayerid)
        {
            return new Reponse
            {
                Id = "1",
                Msg = new RelationshipDetail()
                {
                    Id = (ulong)new Random().Next(),
                    PlayerID = playerid,
                    OtherPlayerID = fromplayerid,
                    Favorited = ReciprocalStatus.None,
                    Ignored = ReciprocalStatus.None,
                    Muted = ReciprocalStatus.None,
                    RelationshipType = RelationshipType.Friend,
                }
            };
        }

        public static Reponse CreateResponseFriendRemoved(ulong playerid, ulong fromplayerid)
        {
            return new Reponse
            {
                Id = "1",
                Msg = new RelationshipDetail()
                {
                    Id = (ulong)new Random().Next(),
                    PlayerID = playerid,
                    OtherPlayerID = fromplayerid,
                    Favorited = ReciprocalStatus.None,
                    Ignored = ReciprocalStatus.None,
                    Muted = ReciprocalStatus.None,
                    RelationshipType = RelationshipType.None,
                }
            };
        }


        private static WebsocketEvents.Reponse CreateResponseFriendRequestReceived(ulong fromPlayer) => new WebsocketEvents.Reponse
        {
            Id = "1",
            Msg = new RelationshipDetail
            {
                Id = (ulong)new Random().Next(),
                PlayerID = fromPlayer,
                OtherPlayerID = fromPlayer,
                RelationshipType = RelationshipType.FriendRequestReceived,
                Favorited = 0,
                Muted = 0,
                Ignored = 0,
                VoiceVolume = 100
            }
        };

        private static WebsocketEvents.Reponse CreateResponseFriendRequestMsg(ulong fromPlayer) => new WebsocketEvents.Reponse
        {
            Id = "2",
            Msg = new 
            {
                Id = (ulong)new Random().Next(),
                FromPlayerId = fromPlayer,
                SentTime = DateTime.UtcNow,
                Type = WebsocketEvents.MessageType.FriendInvite,
                Data = "",
                RoomId = (ulong?)null,
                PlayerEventId = (ulong?)null,
            }
        };

        public static RelationshipDetail RemoveFriend(ulong playerA, ulong playerB)
        {
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");

            // A -> B
            var relA = col.FindOne(x => x.PlayerID == playerA &&
                                        x.Relationship.OtherPlayerID == playerB);

            // B -> A
            var relB = col.FindOne(x => x.PlayerID == playerB &&
                                        x.Relationship.OtherPlayerID == playerA);

            // If they were never connected, return empty relationship
            if (relA == null && relB == null)
            {
                return new RelationshipDetail
                {
                    PlayerID = playerA,
                    OtherPlayerID = playerB,
                    RelationshipType = RelationshipType.None
                };
            }

            // Delete A->B
            if (relA != null)
                col.Delete(relA.Id);

            // Delete B->A
            if (relB != null)
                col.Delete(relB.Id);

            // Send WS update to player A
            Notifications.SendToPlayer(
                playerA,
                JsonConvert.SerializeObject(
                    CreateResponseFriendRemoved(playerA, playerB)
                )
            );

            // Send WS update to player B
            Notifications.SendToPlayer(
                playerB,
                JsonConvert.SerializeObject(
                    CreateResponseFriendRemoved(playerB, playerA)
                )
            );

            // Return final relationship state
            return new RelationshipDetail
            {
                PlayerID = playerA,
                OtherPlayerID = playerB,
                RelationshipType = RelationshipType.None,
                Favorited = ReciprocalStatus.None,
                Ignored = ReciprocalStatus.None,
                Muted = ReciprocalStatus.None,
                VoiceVolume = 100
            };
        }

        public static RelationshipDetail AddFriend(ulong playerA, ulong playerB)
        {
            var col = PlayerFriendDBFile.GetCollection<YourFriendData>("PlayersFriends");

            // A -> B
            var relA = col.FindOne(x => x.PlayerID == playerA &&
                                       x.Relationship.OtherPlayerID == playerB);

            if (relA == null)
            {
                relA = new YourFriendData
                {
                    Id = ObjectId.NewObjectId(),
                    PlayerID = playerA,
                    Relationship = new RelationshipDetail
                    {
                        Id = (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        PlayerID = playerA,
                        OtherPlayerID = playerB,
                        Favorited = ReciprocalStatus.None,
                        Ignored = ReciprocalStatus.None,
                        Muted = ReciprocalStatus.None,
                        VoiceVolume = 100
                    }
                };
                col.Insert(relA);
            }

            // B -> A
            var relB = col.FindOne(x => x.PlayerID == playerB &&
                                       x.Relationship.OtherPlayerID == playerA);

            if (relB == null)
            {
                relB = new YourFriendData
                {
                    Id = ObjectId.NewObjectId(),
                    PlayerID = playerB,
                    Relationship = new RelationshipDetail
                    {
                        Id = (ulong)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        PlayerID = playerB,
                        OtherPlayerID = playerA,
                        Favorited = ReciprocalStatus.None,
                        Ignored = ReciprocalStatus.None,
                        Muted = ReciprocalStatus.None,
                        VoiceVolume = 100
                    }
                };
                col.Insert(relB);
            }

            // Set both sides to Friend
            relA.Relationship.RelationshipType = RelationshipType.Friend;
            relB.Relationship.RelationshipType = RelationshipType.Friend;

            col.Update(relA);
            col.Update(relB);

            // WebSocket updates
            Notifications.SendToPlayer(
                playerA,
                JsonConvert.SerializeObject(CreateResponseFriendAccepted(playerA, playerB))
            );

            Notifications.SendToPlayer(
                playerB,
                JsonConvert.SerializeObject(CreateResponseFriendAccepted(playerB, playerA))
            );

            return relA.Relationship;
        }




        // {"type":1,"target":"Notification","arguments":["{\"id\":\"2\",\"msg\":{\"id\":16212007930,\"fromPlayerId\":1764227894,\"sentTime\":\"2025-06-23T17:20:53.72092Z\",\"type\":4,\"data\":\"\",\"roomId\":null,\"playerEventId\":null}}"]}

        private static WebsocketEvents.Reponse CreateResponseFriendRequestSent(ulong toPlayer) => new WebsocketEvents.Reponse
        {
            Id = "50",
            Msg = ""
        };
    }
}
