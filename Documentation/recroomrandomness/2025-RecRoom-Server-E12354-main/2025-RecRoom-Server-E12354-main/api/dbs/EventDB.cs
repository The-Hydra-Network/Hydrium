using Discord;
using LiteDB;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.EventDBClasses;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class EventDB
    {
        public static LiteDatabase EventDBFile = new LiteDatabase(Environment.CurrentDirectory + "/Data/DBs/Events.db");
        private static ILiteCollection<FullPlayerEvent> Events => EventDBFile.GetCollection<FullPlayerEvent>("events");

        private static ulong GetNextId()
        {
            var last = Events.Query()
                .OrderByDescending(x => x.PlayerEventId)
                .FirstOrDefault();

            return last == null ? 1UL : last.PlayerEventId + 1;
        }

        public static FullPlayerEvent? GetFullEventById(ulong eventId)
        {
            return Events.FindById(eventId);
        }

        public static FullPlayerEvent? SetEventName(ulong eventId, string NewName)
        {
            var ev = Events.FindById(eventId);
            if (ev == null)
                return null;

            ev.Name = NewName;
            Events.Update(ev);

            return ev;
        }

        public static FullPlayerEvent? SetEventImageName(ulong eventId, string NewImageName)
        {
            var ev = Events.FindById(eventId);
            if (ev == null)
                return null;

            ev.ImageName = NewImageName;
            Events.Update(ev);

            return ev;
        }

        public static List<FullPlayerEvent> SearchEventByQuery(string? query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return Events.Query()
                    .OrderBy(e => e.StartTime)
                    .ToList();
            }

            query = query.Trim();

            bool isTagSearch =
                query.StartsWith("#") ||
                query.StartsWith("%23");

            if (isTagSearch)
            {
                string tag = query
                    .Replace("%23", "")
                    .TrimStart('#')
                    .ToLower();

                return Events
                    .Find(Query.EQ("Tags.Tag", tag))
                    .OrderBy(e => e.StartTime)
                    .ToList();
            }

            string nameQuery = query.ToLower();

            return Events.Query()
                .Where(e =>
                    e.Name != null &&
                    e.Name.ToLower().Contains(nameQuery))
                .OrderBy(e => e.StartTime)
                .ToList();
        }



        public static FullPlayerEvent CreateEvent(ulong creatorPlayerId, EventDBClasses.CreateEventRequest request)
        {
            var ev = new FullPlayerEvent
            {
                PlayerEventId = GetNextId(),
                CreatorPlayerId = creatorPlayerId,
                RoomId = request.RoomId,
                SubRoomId = request.SubRoomId,
                ClubId = request.ClubId,
                Name = request.Name,
                Description = request.Description,
                ImageName = request.ImageName,
                Tags = request.Tags?.Select(t => new EventDBClasses.FullTag
                {
                    Tag = t,
                    Type = EventDBClasses.TagType.Unknown1
                }).ToList(),
                StartTime = request.StartTime,
                EndTime = request.EndTime,
                AttendeeCount = 0,
                State = 0,
                Accessibility = request.Accessibility,
                IsMultiInstance = request.IsMultiInstance,
                SupportMultiInstanceRoomChat = request.SupportMultiInstanceRoomChat,
                DefaultBroadcastPermissions = (EventDBClasses.BroadcastPermissionsEnum)request.DefaultBroadcastPermissions,
                CanRequestBroadcastPermissions = (EventDBClasses.BroadcastPermissionsEnum)request.CanRequestBroadcastPermissions,
                Responses = new List<EventDBClasses.FullEventResponses>()
            };

            Events.Insert(ev);
            return ev;
        }
    }
}
