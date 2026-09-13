using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("clubs")]
    public class ClubsController : ControllerBase
    {
        // subscription/mine/member
        // club/categoryTags // the tags for clubs // todo: get club tags from rec.net
        // club/home/me // return 404 if you don't have a club home set, i think this return just "1" room id
        // announcements/v2/mine/unread
        // announcements/v2/subscription/mine/unread
        // /clubs/club/mine/created

        [HttpGet("club/mine/created")]
        public ContentResult MyClubs()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("announcements/v2/mine/unread")]
        public ContentResult UnreadAnnoucements()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("announcements/v2/subscription/mine/unread")]
        public ContentResult UnreadAnnoucements2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("subscription/subscriberCount/{PlayerId}")]
        public ContentResult SubscriberCount(ulong PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var acc = PlayerDB.GetFullAccount(PlayerId);
            if (acc == null)
            {
                return new ContentResult()
                {
                    Content = "0",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            return new ContentResult()
            {
                Content = acc?.player_Extra?.sub_count.ToString(),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("subscription/{PlayerId}")]
        public async Task<ContentResult> SubscribeToPlayer(ulong PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var roomId = Request.Form["roomId"].ToString(); // idk
            await Task.Run(() => PlayerDB.AddSubscription(account.Id, PlayerId));
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_sub("CreatorClubSubscriptionUpdate", PlayerId, 10));
                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);

                await Task.WhenAll(notifySelfTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    value = PlayerId,
                    success = true,
                    error_id = (string?)null,
                    error = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpDelete("subscription/{PlayerId}")]
        public async Task<ContentResult> UnsubscribeToPlayer(ulong PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            await Task.Run(() => PlayerDB.RemoveSubscription(account.Id, PlayerId));
            try
            {
                var selfUpdate = JsonConvert.SerializeObject(WebsocketEvents.create_sub("CreatorClubSubscriptionUpdate", PlayerId, 0));
                var notifySelfTask = Notifications.SendToPlayer(account.Id, selfUpdate);

                await Task.WhenAll(notifySelfTask);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send notification: {ex.Message}");
            }
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error_id = (string?)null,
                    error = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("subscription/my/subscriptions")]
        public ContentResult MySubscriptions()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            var subs = PlayerDB.GetSubscribedToIds(account.Id);
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(subs),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        // https://clubs.rec.net/subscription/details/1503269750 return 
        /*
        {
            "clubId": 2065378865047881941,
            "accountId": 1503269750,
            "subscriberCount": 0
        }
        */

        // https://clubs.rec.net/club/2065378865047881941 return
        /*
        {
            "clubId": 2065378865047881941,
            "name": "33c7nhjv7txs1dsitn4v92pb5",
            "category": "CreatorAutoTag",
            "mainImageName": "DefaultClubImage2k.jpg",
            "description": null,
            "creatorAccountId": 1503269750,
            "state": 0,
            "memberCount": 0,
            "isRRO": false,
            "allowJuniors": true,
            "minLevel": 0,
            "visibility": 1,
            "joinability": 0,
            "clubhouseRoomId": null,
            "clubType": 1,
            "createdAt": "2025-08-03T13:18:44.3295131Z",
            "clubChatEnabled": false
        }
        */
    }
}
