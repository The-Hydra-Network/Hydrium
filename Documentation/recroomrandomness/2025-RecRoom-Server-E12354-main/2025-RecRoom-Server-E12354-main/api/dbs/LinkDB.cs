using LiteDB;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server.Classes;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public static class LinkDB
    {
        private static readonly string _dbPath = "Data/DBs/Links.db";
        private static readonly string _collection = "actionlinks";

        public static ActionLink Insert(ActionLink link)
        {
            using var db = new LiteDatabase(_dbPath);
            var col = db.GetCollection<ActionLink>(_collection);
            col.Insert(link);
            return link;
        }

        public static ActionLink? Get(string linkIdOrCreatorCode)
        {
            using var db = new LiteDatabase(_dbPath);
            var col = db.GetCollection<ActionLink>(_collection);

            ActionLink? link = col.FindById(linkIdOrCreatorCode);

            // If not found by ID, try as a creator code (case-insensitive)
            if (link == null)
            {
                string code = linkIdOrCreatorCode.Trim().ToLowerInvariant();
                var player = PlayerDB.GetInfluencerByCreatorCode(code);
                return new ActionLink // {"creatorPlayerId":4213153,"data":"{\"Type\":6}","isValid":true}
                {
                    creatorPlayerId = player.player.Id,
                    data = JsonConvert.SerializeObject(new { Type = (int)LinkType.Influencer }),
                    isValid = true
                };
            }

            if (link == null)
                return null;

            // Automatically invalidate expired links
            if (link.ExpiresAt < DateTime.UtcNow && link.isValid)
            {
                link.isValid = false;
                col.Update(link);
            }

            return link;
        }


        public static bool Consume(string linkId, bool alwayValid = false)
        {
            using var db = new LiteDatabase(_dbPath);
            var col = db.GetCollection<ActionLink>(_collection);
            var link = col.FindById(linkId);
            if (link == null || !link.isValid || link.ExpiresAt < DateTime.UtcNow)
                return false;

            if (!alwayValid)
            {
                link.isValid = false;
            }
            col.Update(link);
            return true;
        }

        public static IEnumerable<ActionLink> GetAll()
        {
            using var db = new LiteDatabase(_dbPath);
            var col = db.GetCollection<ActionLink>(_collection);
            return col.FindAll().ToList();
        }

        public static void DeleteLinksFromPlayerId(ulong playerId)
        {
            using var db = new LiteDatabase(_dbPath);
            var col = db.GetCollection<ActionLink>(_collection);
            try
            {
                col.DeleteMany(x => x.creatorPlayerId == playerId);
                Console.WriteLine("deleted links from playerid " + playerId);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
            }
        }
    }
}
