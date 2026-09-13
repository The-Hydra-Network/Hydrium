using System.Diagnostics.Metrics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Discord;
using LiteDB;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.RoomDBClasses;
using System.Linq;

namespace Rec_rewild_live_rewrite.api.dbs
{
    public class RoomDB
    {
        public static LiteDatabase rooms_db = new LiteDatabase(Environment.CurrentDirectory + $"/Data/DBs/Rooms.db");
        private static readonly object _roomLock = new();

        public static readonly ILiteCollection<RoomRoot> col = rooms_db.GetCollection<RoomRoot>("Main_rooms");
        public static readonly ILiteCollection<SubRoom> subroom_col = rooms_db.GetCollection<SubRoom>("Main_subrooms");
        public static async Task ImportRooms(string path)
        {
            string jsonData = await File.ReadAllTextAsync(path);

            var hotRooms = JsonConvert.DeserializeObject<Resultslist<RoomDBClasses.RoomRoot>>(jsonData);

            if (hotRooms?.Results == null)
                return;

            foreach (var room in hotRooms.Results)
            {
                AddRoom(room, isImportingFromJson: true);
            }
        }

        public static void ExportRooms()
        {
            var allRooms = col.FindAll().ToList();
            var allSubrooms = subroom_col.FindAll().ToList();

            // Option 1: Export rooms with their subrooms attached
            foreach (var room in allRooms)
            {
                room.SubRooms = allSubrooms.Where(s => s.RoomId == room.RoomId).ToList();
            }

            // Build final result
            var exportData = new Resultslist<RoomDBClasses.RoomRoot>
            {
                Results = allRooms,        // No mapping, just raw rooms
                TotalResults = allRooms.Count
            };

            string outputPath = Path.Combine(Environment.CurrentDirectory, "Data/exported_rooms.json");
            string json = JsonConvert.SerializeObject(exportData, Formatting.Indented);
            File.WriteAllText(outputPath, json);

            Console.WriteLine($"Exported {allRooms.Count} rooms with subrooms → {outputPath}");
        }

        public static void FixDuplicateDorms()
        {
            
            

            // Get all dorm rooms
            var dormRooms = col.Find(x => x.IsDorm).ToList();

            // Group dorms by creator
            var groupedDorms = dormRooms
                .GroupBy(r => r.CreatorAccountId)
                .Where(g => g.Count() > 1);

            foreach (var group in groupedDorms)
            {
                // Load player data to get DormRoomId
                var player = PlayerDB.GetFullAccount(group.FirstOrDefault().CreatorAccountId);
                if (player == null)
                    continue;

                // Try to keep the dorm that matches player.DormRoomId
                var dormToKeep = group.FirstOrDefault(r => r.RoomId == player.player_Extra.DormRoomID);

                // Fallback: keep oldest dorm if DormRoomId is invalid/missing
                if (dormToKeep == null)
                {
                    dormToKeep = group
                        .OrderBy(r => r.CreatedAt)
                        .First();
                }

                // Delete all other dorms
                var roomsToDelete = group
                    .Where(r => r.RoomId != dormToKeep.RoomId)
                    .ToList();

                foreach (var room in roomsToDelete)
                {
                    subroom_col.DeleteMany(x => x.RoomId == room.RoomId);
                    col.DeleteMany(x => x.RoomId == room.RoomId);

                    Console.WriteLine(
                        $"Deleted duplicate dorm room: {room.Name} (ID: {room.RoomId}) for creator {room.CreatorAccountId}"
                    );
                }

                Console.WriteLine(
                    $"Kept dorm room: {dormToKeep.Name} (ID: {dormToKeep.RoomId}) for creator {group.Key}"
                );
            }
        }




        public static string get_subroom_from_id(ulong room_id, ulong subroom_id)
        {
            try
            {
                var subroom = subroom_col.FindOne(x => x.RoomId == room_id && x.SubRoomId == subroom_id);

                return subroom?.Name ?? "Unknown Room";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in get_subroom_from_id: {ex.Message}");
                return "Unknown Room";
            }
        }

        public static ulong AddRoom(RoomDBClasses.RoomRoot room, bool isImportingFromJson = false)
        {
            try
            {
                if (room == null)
                    throw new ArgumentNullException(nameof(room));

                lock (_roomLock)
                {
                    // Skip duplicate check if DormRoom
                    if (room.Name != "DormRoom")
                    {
                        var existingRoom = col.FindOne(x => x.Name == room.Name);
                        if (existingRoom != null)
                            return 0;
                    }

                    var highest = col.Query().OrderByDescending(x => x.RoomId).Limit(1).FirstOrDefault();
                    room.RoomId = highest != null ? highest.RoomId + 1 : 1;

                    if (room.RoomId == 0)
                    {
                        throw new Exception($"Imported room '{room.Name}' has RoomId = 0");
                    }
                    //room.DataBlobHash = null;
                    if (string.IsNullOrEmpty(room.RankedEntityId))
                        room.RankedEntityId = room.RoomId.ToString();
                    if (room.UgcVersion == null)
                    {
                        room.UgcVersion = 1;
                    }

                    if (room.PersistenceVersion == null)
                    {
                        room.PersistenceVersion = 0;
                    }
                    if (room.NeedsSnapshotId == false)
                    {
                        room.CurrentSnapshotId = null;
                    }
                    // Ensure required fields exist
                    if (room.LoadScreens == null) throw new Exception("room.LoadScreens is null!");
                    if (room.Stats == null) throw new Exception("room.Stats is null!");

                    // --- Insert the room directly, no mapping ---
                    col.Insert(room);

                    // --- Insert subrooms directly, no mapping ---
                    if (room.SubRooms != null && room.SubRooms.Count > 0)
                    {
                        // ----------------------------
                        // Get next SubRoomId safely
                        // ----------------------------
                        var lastSubroom = subroom_col.Query()
                            .OrderByDescending(x => x.SubRoomId)
                            .Limit(1)
                            .FirstOrDefault();

                        ulong nextSubId = lastSubroom?.SubRoomId + 1 ?? 1;


                        // ----------------------------
                        // Get next SubRoomDataSaveId globally
                        // ----------------------------
                        ulong nextSaveId = 1;

                        var allExistingSubrooms = subroom_col.FindAll().ToList();

                        var maxSaveId = allExistingSubrooms
                            .SelectMany(x =>
                            {
                                var saves = new List<RoomDBClasses.CurrentSave>();

                                if (x.CurrentSave != null)
                                    saves.Add(x.CurrentSave);

                                if (x.AllSaves != null)
                                    saves.AddRange(x.AllSaves);

                                return saves;
                            })
                            .Select(x => x.SubRoomDataSaveId)
                            .DefaultIfEmpty(0UL)
                            .Max();

                        nextSaveId = maxSaveId + 1;


                        // ----------------------------
                        // Insert SubRooms
                        // ----------------------------
                        foreach (var sub in room.SubRooms)
                        {
                            try
                            {
                                ulong subId = nextSubId++;

                                if (isImportingFromJson && subId == 0)
                                    throw new Exception($"Imported subroom '{sub.Name}' has SubRoomId = 0");

                                sub.SubRoomId = subId;
                                sub.RoomId = room.RoomId;

                                // Fix CurrentSave
                                if (sub.CurrentSave != null)
                                {
                                    sub.CurrentSave.SubRoomDataSaveId = nextSaveId++;
                                    sub.CurrentSave.SubRoomId = sub.SubRoomId;
                                    sub.CurrentSave.UgcSubVersion = 0;
                                    sub.CurrentSave.PersistenceVersion = 0;
                                }

                                subroom_col.Insert(sub);

                                Console.WriteLine($"Added subroom: {sub.Name} ({sub.SubRoomId})");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Error adding subroom '{sub.Name}' for room '{room.Name}': {ex.Message}");
                            }
                        }
                    }

                    Console.WriteLine($"added room: {room.Name} ({room.RoomId})");
                    return room.RoomId;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error adding room '{room.Name}': {ex.Message}");
                return 0;
            }
        }

        public static RoomDBClasses.RoomRoot? GetRoom(ulong room_id)
        {
            // Find the main room
            var room = col.FindOne(x => x.RoomId == room_id);
            if (room == null) return null;

            // Fetch subrooms and attach them directly
            var subrooms = subroom_col.Find(x => x.RoomId == room_id).ToList();

            // Attach subrooms directly, no new object mapping
            room.SubRooms = subrooms;

            // Return the database object as-is
            return room;
        }

        public static bool DoesPlayerDormExist(ulong playerId)
        {
            var playercol = PlayerDB.PlayerDBFile.GetCollection<player_data>("players");
            var player = playercol.FindOne(x => x.player.Id == playerId);

            if (player?.player_Extra == null)
                return false;

            ulong dormId = (ulong)player.player_Extra.DormRoomID;

            if (dormId == 0 || dormId == 1)
                return false;

            var dormRoom = RoomDB.GetRoom(dormId);
            return dormRoom != null;
        }

        public static RoomDBClasses.RoomRoot? GetRoomByName(string roomName)
        {
            if (!string.IsNullOrEmpty(roomName))
            {
                
                foreach (RoomDBClasses.RoomRoot subroom in col.FindAll())
                {
                    if (roomName.Equals(subroom.Name, StringComparison.OrdinalIgnoreCase))
                    {
                        var room = GetRoom(subroom.RoomId);
                        if (room.DataBlob is null)
                        {
                            room.DataBlob = "";
                        }
                        return room;
                    }
                }
            }
            return null;
        }

        public static ulong clone_dorm_room(ulong player_id)
        {
            RoomDBClasses.RoomRoot room_data = GetRoom(1);
            var deep = JsonConvert.SerializeObject(room_data);
            var room_data2 = JsonConvert.DeserializeObject<RoomDBClasses.RoomRoot>(deep);
            if (room_data2 == null)
            {
                throw new Exception("Base dorm room not found.");
            }
            if (room_data2.SubRooms == null || room_data2.SubRooms.Count == 0)
            {
                throw new Exception("Base dorm room has no subrooms.");
            }
            if (room_data2.Stats == null)
            {
                throw new Exception("Base dorm room stats are null.");
            }
            room_data2.CreatorAccountId = player_id;
            room_data2.CloningAllowed = false;
            room_data2.Name = "DormRoom";
            room_data2.CreatedAt = DateTime.Now;
            room_data2.Accessibility = RoomDBClasses.RoomAccessibility.Private;
            room_data2.IsRRO = false;
            room_data2.IsDorm = true;
            room_data2.Stats.CheerCount = 0;
            room_data2.Stats.FavoriteCount = 0;
            room_data2.Stats.VisitorCount = 0;
            room_data2.Stats.VisitCount = 0;
            room_data2.Roles = new List<RoomDBClasses.RoleClass>
            {
                new RoomDBClasses.RoleClass
                {
                    AccountId = (int)player_id,
                    InvitedRole = 0,
                    Role = RoomDBClasses.Role_data.Creator
                }
            };
            ulong id = AddRoom(room_data2);
            return id;
        }

        public static void GiveCoOwnerToAllRooms(ulong playerId)
        {
            var allRooms = col.FindAll().ToList();

            foreach (var room in allRooms)
            {
                if (room.CreatorAccountId == playerId)
                    continue;

                if (room.Roles == null)
                    room.Roles = new List<RoleClass>();

                var existingRole = room.Roles.FirstOrDefault(r => (ulong)r.AccountId == playerId);

                if (existingRole != null)
                {
                    if (existingRole.Role != RoomDBClasses.Role_data.Creator)
                    {
                        existingRole.Role = RoomDBClasses.Role_data.CoOwner;
                    }
                }
                else
                {
                    room.Roles.Add(new RoleClass
                    {
                        AccountId = (int)playerId,
                        InvitedRole = 0,
                        Role = RoomDBClasses.Role_data.CoOwner
                    });
                }

                col.Update(room);
            }

            Console.WriteLine($"Updated all rooms to grant Co-Owner to player {playerId}.");
        }

        public static RoomDBClasses.RoomRoot? IncreaseRoomVisit(ulong roomid)
        {
            
            var room = col.FindOne(x => x.RoomId == roomid);

            if (room != null)
            {
                if (room.Stats == null)
                    room.Stats = new Stats();

                if (room.Stats.VisitCount == 0)
                    room.Stats.VisitCount = 1;
                else
                    room.Stats.VisitCount++;

                col.Update(room);
                return room;
            }

            return null;
        }

        public static List<RoomDBClasses.RoomRoot> GetHotRooms()
        {
            // Pull all non-dorm rooms from the database
            var mainRooms = col.Query()
                .Where(r => !r.IsDorm)
                .ToList();

            foreach (var room in mainRooms)
            {
                var subrooms = subroom_col.Find(s => s.RoomId == room.RoomId).ToList();

                room.SubRooms = subrooms;
            }

            return mainRooms;
        }

        public static List<RoomDBClasses.RoomRoot> GetAllRooms()
        {
            var mainRooms = col.Query()
                .Where(r => !r.IsDorm)
                .ToList();

            foreach (var room in mainRooms)
            {
                var subrooms = subroom_col.Find(s => s.RoomId == room.RoomId).ToList();

                room.SubRooms = subrooms;
            }

            return mainRooms;
        }


        public static void UpdateRoomCheerCount(ulong roomid, int delta)
        {
            
            var room = col.FindOne(x => x.RoomId == roomid);
            if (room != null)
            {
                room.Stats.CheerCount = Math.Max(0, room.Stats.CheerCount + delta);
                col.Update(room);
            }
        }

        public static void UpdateRoomFavoriteCount(ulong roomid, int delta)
        {
            
            var room = col.FindOne(x => x.RoomId == roomid);
            if (room != null)
            {
                room.Stats.FavoriteCount = Math.Max(0, room.Stats.FavoriteCount + delta);
                col.Update(room);
            }
        }



        public static List<RoomDBClasses.RoomRoot> GetRoomsByCreator(ulong playerId)
        {
            
            var rooms = col.Find(x => x.CreatorAccountId == playerId).ToList();

            return rooms;
        }

        public static List<RoomDBClasses.RoomRoot> Search(string p0, bool isBase = false)
        {
            if (string.IsNullOrWhiteSpace(p0))
                return new List<RoomDBClasses.RoomRoot>();

            var terms = p0.ToLowerInvariant()
                        .Split(new char[] { ' ', '+' }, StringSplitOptions.RemoveEmptyEntries);

            // Start with the basic "Not a Dorm" filter
            var query = col.Query().Where(r => !r.IsDorm);

            // Only enforce Public accessibility if isBase is false
            if (!isBase)
            {
                query = query.Where(r => r.Accessibility == RoomDBClasses.RoomAccessibility.Public);
            }

            foreach (var term in terms)
            {
                if (term.StartsWith("#"))
                {
                    string tag = term.Substring(1);
                    
                    // Using BsonExpression ensures LiteDB looks directly into the array
                    // This looks for any element in the 'Tags' array where the 'Tag' field matches
                    query = query.Where("$.Tags[*].Tag ANY = @0", tag);
                }
                else
                {
                    string nameTerm = term;
                    query = query.Where(r => r.Name.ToLower().Contains(nameTerm));
                }
            }

            return query.ToList();
        }

        public static ulong GetAllRoomsCount()
        {
            
            return (ulong)col.Count();
        }

        public static void DeleteAllRoomsFromPlayerId(ulong creatorId)
        {

            var roomsToDelete = col.Find(x => x.CreatorAccountId == creatorId).ToList();

            foreach (var room in roomsToDelete)
            {
                subroom_col.DeleteMany(x => x.RoomId == room.RoomId);
                col.DeleteMany(x => x.RoomId == room.RoomId);
            }

            Console.WriteLine($"Deleted {roomsToDelete.Count} rooms and their subrooms for creator {creatorId}.");
        }

        public static RoomDBClasses.RoomRoot? SetRoomName(ulong roomId, string roomName)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            var existingRoom = col.FindOne(x => x.Name == roomName && x.RoomId != roomId);
            if (existingRoom != null)
            {
                return null;
            }
            if (room != null)
            {
                try
                {
                    room.Name = roomName;
                    col.Update(room);
                    
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

      public static RoomDBClasses.RoomRoot? es()
        {
            
            var room = col.FindOne(x => x.RoomId == 53);
            if (room != null)
            {
                try
                {
                    room.CurrentSnapshotId = "98cfdcad-b680-4b33-e94c-08dd76d7c12b";
                    col.Update(room);
                    
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static RoomDBClasses.RoomRoot? SetRoomDescription(ulong roomId, string NewDescription)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.Description = NewDescription;
                    col.Update(room);

                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static RoomDBClasses.RoomRoot? SetRoomImageName(ulong roomId, string imageName)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.ImageName = imageName;
                    col.Update(room);
                }
                catch (Exception ex)
                { 
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static RoomDBClasses.RoomRoot? SetRoomAccessibility(ulong roomId, RoomDBClasses.RoomAccessibility roomAccessibility)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.Accessibility = roomAccessibility;
                    col.Update(room);

                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static RoomDBClasses.RoomRoot? SetRoomCloning(ulong roomId, bool cloningEnabled)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.CloningAllowed = cloningEnabled;
                    col.Update(room);

                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }
        // supportsScreens=True&supportsWalkVR=False&supportsTeleportVR=True&supportsJuniors=True  
        public static RoomDBClasses.RoomRoot? SetRoomRestrictions(ulong roomId, bool supportsScreens, bool supportsWalkVR, bool supportsTeleportVR, bool supportsJuniors)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.SupportsScreens = supportsScreens;
                    room.SupportsWalkVR = supportsWalkVR;
                    room.SupportsTeleportVR = supportsTeleportVR;
                    room.SupportsJuniors = supportsJuniors;
                    col.Update(room);

                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static bool UserCanEditRoom(ulong roomId, ulong accountId)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room == null)
                return false;

            if (room.CreatorAccountId == accountId)
                return true;

            return room.Roles?.Any(r =>
                (ulong)r.AccountId == accountId &&
                (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)
            ) ?? false;
        }


        public static RoomDBClasses.RoomRoot? SetRoomLoadscreen(ulong roomid, string? imageName, string? title, string? subtitle)
        {
            
            var room = col.FindOne(x => x.RoomId == roomid);
            if (room == null)
                return null;

            room.LoadScreens = new List<LoadScreen>
            {
                new LoadScreen
                {
                    ImageName = imageName ?? "",
                    Title = title ?? "",
                    Subtitle = subtitle ?? ""
                }
            };

            col.Update(room);
            return room;
        }

        public static RoomDBClasses.RoomRoot SetRoomWarningMask(ulong roomId, WarningMaskType warningMask)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                try
                {
                    room.WarningMask = warningMask;
                    col.Update(room);

                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.ToString());
                }
            }
            return room;
        }

        public static RoomDBClasses.RoomRoot? SetRoomTags(List<string> tags, ulong roomId, int type = 0)
        {
            
            col.EnsureIndex(x => x.RoomId);

            var room = col.FindOne(x => x.RoomId == roomId);
            if (room == null)
                return null;

            if (tags == null || tags.Count == 0)
                return room;

            // Normalize input tags: trim, lowercase, remove empty, distinct
            var newTags = tags
                .Select(t => t.Trim().ToLowerInvariant())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
                .ToList();

            if (room.Tags == null)
                room.Tags = new List<TagClass>();

            foreach (var newTag in newTags)
            {
                var existingTag = room.Tags.FirstOrDefault(t =>
                    t.Tag.Equals(newTag, StringComparison.OrdinalIgnoreCase));

                if (existingTag != null)
                {
                    // TagClass exists -> remove it
                    room.Tags.Remove(existingTag);
                }
                else
                {
                    // TagClass does not exist -> add it
                    room.Tags.Add(new TagClass
                    {
                        Tag = newTag,
                        Type = type
                    });
                }
            }

            col.Update(room);
            return room;
        }



        public static bool DoesRoomExist(ulong roomId)
        {
            
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room != null)
            {
                return true;
            }
            else
            {
                return false;
            }
        }

        public static ulong? CloneRoom(ulong roomId, string RoomName, ulong playerId)
        {
            

            // ✅ Deep clone to detach from DB references
            RoomDBClasses.RoomRoot? original = GetRoom(roomId);
            RoomDBClasses.RoomRoot? room_data = JsonConvert.DeserializeObject<RoomDBClasses.RoomRoot>(JsonConvert.SerializeObject(original));

            if (room_data?.Name == "MakerRoom")
                goto clone_room_data;

            if (room_data?.Name == "TheBackDoor")
                return null;

            if (room_data?.Name == "DormRoom")
                return null;

            if (room_data.CloningAllowed &&
                (room_data.Accessibility == RoomDBClasses.RoomAccessibility.Public ||
                 room_data.Accessibility == RoomDBClasses.RoomAccessibility.Unlisted))
                goto clone_room_data;

            if (RoomName == "MakerRoom")
                goto clone_room_data;

            if (!room_data.CloningAllowed && room_data.CreatorAccountId != playerId && !room_data.IsDorm)
                return null;

            var existingRoom = col.FindOne(x => x.Name == room_data.Name && x.RoomId != room_data.RoomId);
            if (existingRoom != null)
                return null;

            clone_room_data:
            room_data.RoomId = 0;
            room_data.CreatorAccountId = playerId;
            room_data.CloningAllowed = false;
            room_data.Name = RoomName;
            room_data.ImageName = "DefaultRoomImage.jpg";
            room_data.CreatedAt = DateTime.Now;
            room_data.Accessibility = RoomDBClasses.RoomAccessibility.Private;
            room_data.IsRRO = false;
            room_data.IsDorm = false;
            room_data.Stats.CheerCount = 0;
            room_data.Stats.FavoriteCount = 0;
            room_data.Stats.VisitorCount = 0;
            room_data.Stats.VisitCount = 0;
            room_data.Tags = new List<TagClass>();
            room_data.Roles = new List<RoleClass>
            {
                new RoleClass
                {
                    AccountId = (int)playerId,
                    InvitedRole = 0,
                    Role = RoomDBClasses.Role_data.Creator
                }
            };

            ulong NewRoomId = RoomDB.AddRoom(room_data);
            Console.WriteLine($"[clone_room] New room ID returned from add_room: {NewRoomId}");

            return NewRoomId;
        }

        public static object? GetRoomSaveById(
    ulong roomId,
    ulong subroomId,
    ulong subRoomDataSaveId, int target, int version)
        {
            var subroom = subroom_col.FindOne(x =>
                x.RoomId == roomId &&
                x.SubRoomId == subroomId);

            if (subroom == null)
                return null;

            var save =
                (subroom.CurrentSave != null &&
                 subroom.CurrentSave.SubRoomDataSaveId == subRoomDataSaveId)
                ? subroom.CurrentSave
                : subroom.AllSaves?
                    .FirstOrDefault(x => x.SubRoomDataSaveId == subRoomDataSaveId);

            if (save == null)
                return null;

            return MapSave(save, subroomId, target, version);
        }

        private class UnityAssetInfo
        {
            public string UnityAssetId { get; set; }
            public int Target { get; set; }
            public int Version { get; set; }
            public string Filename { get; set; }
            public string Hash { get; set; }
        }

        private static object MapSave(RoomDBClasses.CurrentSave save, ulong subroomid, int target, int version)
        {
            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "BakedBulk", $"{save.UnityAssetId}_assets.json");

            UnityAssetInfo matchingAsset = null;

            if (!string.IsNullOrEmpty(save.UnityAssetId) && System.IO.File.Exists(path))
            {
                var unityAssets = JsonConvert.DeserializeObject<List<UnityAssetInfo>>(System.IO.File.ReadAllText(path));
                matchingAsset = unityAssets.FirstOrDefault(u => u.Target == target && u.Version == version);
            }

            var result = new Dictionary<string, object>
            {
                ["UnitySubAssets"] = new List<object>(),
                ["ReferencedUnityAssets"] = new List<object>(),
                ["SubRoomDataSaveId"] = save.SubRoomDataSaveId,
                ["SubRoomId"] = subroomid,
                ["DataBlob"] = save.DataBlob,
                ["ReferencedUnityAssetIds"] = save.ReferencedUnityAssetIds ?? new List<string>(),
                ["PersistenceVersion"] = save.PersistenceVersion,
                ["OMVersion"] = save.OMVersion,
                ["UgcSubVersion"] = save.UgcSubVersion,
                ["SavedByAccountId"] = save.SavedByAccountId,
                ["SavedOnPlatform"] = save.SavedOnPlatform,
                ["SavedOnDeviceClass"] = save.SavedOnDeviceClass,
                ["Description"] = save.Description,
                ["Tags"] = new List<object>(),
                ["ModerationState"] = save.ModerationState,
                ["CreatedAt"] = save.CreatedAt
            };

            // Only include UnityAssetId if it exists
            if (!string.IsNullOrEmpty(save.UnityAssetId))
            {
                result["UnityAssetId"] = save.UnityAssetId;
            }

            // Only include UnityAsset if matching asset exists
            if (matchingAsset != null)
            {
                result["UnityAsset"] = matchingAsset.Filename;
            }

            return result;
        }

        public static RoomDBClasses.RoomRoot? SetRoomSubroomRoomFile(
    ulong roomId,
    ulong subRoomId,
    string roomFile,
    string roomDesc,
    ulong playerId,
    Platforms currentplatform)
        {

            var room = col.FindOne(x => x.RoomId == roomId);
            if (room == null)
                return null;

            var subroom = subroom_col.FindOne(x =>
                x.RoomId == roomId &&
                x.SubRoomId == subRoomId);

            if (subroom == null)
                return room;

            subroom.AllSaves ??= new List<CurrentSave>();

            // 💡 Archive current save if it exists AND not already in history
            if (subroom.CurrentSave != null)
            {
                bool alreadyStored = subroom.AllSaves.Any(s =>
                    s.DataBlob == subroom.CurrentSave.DataBlob &&
                    s.CreatedAt == subroom.CurrentSave.CreatedAt);

                if (!alreadyStored)
                    subroom.AllSaves.Add(subroom.CurrentSave);
            }

            // 💡 Create fresh save object (current)
            var newSave = new CurrentSave
            {
                SubRoomDataSaveId = (ulong)((subroom.AllSaves.Count > 0)
                    ? (int)(subroom.AllSaves.Max(s => (long)s.SubRoomDataSaveId) + 1)
                    : 1),
                SubRoomId = subroom.SubRoomId,
                DataBlob = roomFile,
                Description = roomDesc ?? "",
                SavedByAccountId = playerId,
                SavedOnPlatform = currentplatform,
                SavedOnDeviceClass = DeviceClasses.Screen,
                CreatedAt = DateTime.UtcNow
            };

            // Update parent subroom metadata
            subroom.CurrentSave = newSave;

            subroom_col.Update(subroom);

            return room;
        }

        public static RoomDBClasses.RoomRoot? d(
    ulong roomId,
    ulong subRoomId,
    string roomFile)
        {

            var room = col.FindOne(x => x.RoomId == roomId);
            if (room == null)
                return null;

            var subroom = subroom_col.FindOne(x =>
                x.RoomId == roomId &&
                x.SubRoomId == subRoomId);

            subroom.CurrentSave.DataBlob = "80c450a999404dbcb792d6d3d2f62a56.room";

            subroom_col.Update(subroom);

            return room;
        }

        public static RoomDBClasses.RoomRoot? CreateSubroomForRoom(ulong roomId, string newSubroomName)
        {
            var room = col.FindOne(x => x.RoomId == roomId);
            if (room == null)
            {
                Console.WriteLine("Room not found.");
                return null;
            }

            var roomSubrooms = subroom_col.Find(x => x.RoomId == roomId).ToList();
            ulong nextSubRoomId = roomSubrooms.Count == 0 ? 1 : roomSubrooms.Max(sr => sr.SubRoomId) + 1;
            var lastSubroom = roomSubrooms
                .OrderByDescending(sr => sr.SubRoomId)
                .FirstOrDefault();
            var newSubroom = new SubRoom
            {
                RoomId = roomId,
                Name = newSubroomName,
                SubRoomId = nextSubRoomId,
                AllSaves = new List<CurrentSave>(), 
                CurrentSave = null,
                Accessibility = RoomDBClasses.RoomAccessibility.Public,
                UnitySceneId = lastSubroom.UnitySceneId,
                MaxPlayers = lastSubroom.MaxPlayers,
            };

            subroom_col.Insert(newSubroom);

            roomSubrooms.Add(newSubroom); 
            col.Update(room); 

            return room;
        }

        public static bool DeleteSubroom(ulong roomId, ulong subRoomId)
        {

            var subroom = subroom_col.FindOne(x =>
                x.RoomId == roomId &&
                x.SubRoomId == subRoomId);

            if (subroom == null)
                return false;

            subroom_col.Delete(subroom.Id); 

            return true;
        }

        public static bool ModifySubroom(
    ulong roomId,
    ulong subRoomId,
    string name,
    RoomDBClasses.RoomAccessibility accessibility,
    int maxPlayers)
        {

            var subroom = subroom_col.FindOne(x =>
                x.RoomId == roomId &&
                x.SubRoomId == subRoomId);

            if (subroom == null)
                return false;

            subroom.Name = name;
            subroom.Accessibility = accessibility;
            subroom.MaxPlayers = maxPlayers;

            subroom_col.Update(subroom);
            return true;
        }

        public static void DeleteRoom(ulong roomId)
        {  
            subroom_col.DeleteMany(x => x.RoomId == roomId);
            col.DeleteMany(x => x.RoomId == roomId);
        }

        public static RoomDBClasses.SubroomSaveResults? GetRoomSaves(ulong roomId, ulong subroomId, int skip = 0, int take = 20)
        {

            var subroom = subroom_col.FindOne(x => x.RoomId == roomId && x.SubRoomId == subroomId);
            if (subroom == null)
                return null;

            var saves = new List<RoomDBClasses.CurrentSave>();

            if (subroom.CurrentSave != null)
                saves.Add(subroom.CurrentSave);

            if (subroom.AllSaves != null && subroom.AllSaves.Count > 0)
                saves.AddRange(subroom.AllSaves);

            saves = saves
                .OrderByDescending(x => x.CreatedAt)
                .ToList();

            var paged = saves
                .Skip(skip)
                .Take(take)
                .ToList();

            return new SubroomSaveResults
            {
                Results = paged,
                TotalCount = saves.Count
            };
        }


        public static bool AddRoleToRoom(string name, int accountId, RoomDBClasses.Role_data roleData, int invitedRole = 0)
        {
            
            var room = col.FindOne(x => x.Name == name);
            if (room == null)
                return false;

            room.Roles ??= new List<RoleClass>();

            room.Roles.Add(new RoleClass
            {
                AccountId = accountId,
                Role = roleData,
                InvitedRole = invitedRole
            });

            col.Update(room);
            return true;
        }

        public static bool RemoveRoleFromRoom(string name, int accountId)
        {
            

            var room = col.FindOne(x => x.Name == name);
            if (room == null)
                return false;

            if (room.Roles == null || room.Roles.Count == 0)
                return false;


            room.Roles.RemoveAll(r => r.AccountId == accountId);

            col.Update(room);
            return true;
        }

        public static RoomDBClasses.RoomRoot SetRoomCreatorId(ulong playerid, string roomname)
        {
            col.EnsureIndex(x => x.Name);

            var room = col.FindOne(x => x.Name == roomname);
            
            if (room != null)
            {
                room.CreatorAccountId = playerid;

                var ownerRole = room.Roles.FirstOrDefault(r => r.Role == Role_data.Creator);

                if (ownerRole != null)
                {
                    ownerRole.AccountId = (long)playerid;
                }
                else
                {
                    
                }

                Console.WriteLine($"Setting the creator id to {playerid}...");
                col.Update(room);
                Console.WriteLine($"Success!");
                return room;
            }

            return null;
        }

        public static void Setup()
        {
            col.EnsureIndex(x => x.CreatorAccountId);
            col.EnsureIndex(x => x.RoomId);
            subroom_col.EnsureIndex(x => x.SubRoomId);
            col.EnsureIndex(x => x.Name);
            col.EnsureIndex("TagIndex", "$.Tags[*].Tag");
        }
    }
}
