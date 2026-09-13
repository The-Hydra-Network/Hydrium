using LiteDB;
using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Text.Json.Serialization;

public static class ImageMetadataDB
{
    private static readonly string DbPath = Path.Combine("Data", "DBs", "Images.db");

    public class FullSavedImage
    {
        public int Id { get; set; }
        public ImageAccessibility Accessibility { get; set; }
        public bool AccessibilityLocked { get; set; } = false;
        public int CheerCount { get; set; } = 0;
        public int CommentCount { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string? Description { get; set; }
        public string ImageName { get; set; }
        public ulong PlayerEventId { get; set; }
        public ulong PlayerId { get; set; } 
        public int RoomId { get; set; }
        //public string Description { get; set; } = "";
        public SavedImageTypeEnum Type { get; set; }
        public List<ulong> TaggedPlayerIds { get; set; } = new();
    }
    
    public class ImageV6
    {
        public ImageAccessibility Accessibility { get; set; }
        public bool AccessibilityLocked { get; set; } = false;
        public int CheerCount { get; set; } = 0;
        public int CommentCount { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string? Description { get; set; }
        public int Id { get; set; }
        public string ImageName { get; set; }
        public ulong PlayerEventId { get; set; }
        public ulong PlayerId { get; set; } 
        public int RoomId { get; set; }
        public List<ulong> TaggedPlayerIds { get; set; } = new();
        public SavedImageTypeEnum Type { get; set; }
    }

    public class ImagesPlayer
    {
        public ImageAccessibility Accessibility { get; set; }
        public bool AccessibilityLocked { get; set; } = false;
        public int CheerCount { get; set; } = 0;
        public int CommentCount { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string? Description { get; set; }
        public string ImageName { get; set; }
        public ulong PlayerEventId { get; set; }
        public ulong PlayerId { get; set; } 
        public int RoomId { get; set; }
        public int SavedImageId { get; set; }
        public SavedImageTypeEnum SavedImageType { get; set; }
    }

    public class ImageMetadata
    {
        public List<ulong> playerIds { get; set; } = new();
        public SavedImageTypeEnum savedImageType { get; set; }
        public int roomId { get; set; }
        public ImageAccessibility accessibility { get; set; }
        public string? description { get; set; }
    }

    public enum SavedImageTypeEnum
    {
        None, // 0
        ShareCamera, // 1
        OutfitThumbnail, // 2
        RoomThumbnail, // 3
        ProfileThumbnail, // 4
        InventionThumbnail, // 5
        PlayerEventThumbnail, // 6
        RoomLoadScreen // 7
    }

    public enum ImageAccessibility
    {
        Private = 0,
        Public = 1,
    }

    public class Cheer
    {
        public ObjectId Id { get; set; }
        public int SavedImageId { get; set; }
        public ulong PlayerId { get; set; }
    }

    public class CheerRequest
    {
        public int SavedImageId { get; set; }
        public bool Cheer { get; set; }
    }

    // PERF: Keep a thread-safe singleton LiteDatabase instance to avoid reopening files constantly.
    private static readonly Lazy<LiteDatabase> _dbInstance = new(() => new LiteDatabase(DbPath));
    public static LiteDatabase GetDb() => _dbInstance.Value;

    public static FullSavedImage InsertImage(FullSavedImage image)
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");
        col.EnsureIndex(x => x.Id, true);

        // If the image doesn't already have an ID, assign the next sequential ID.
        if (image.Id == 0)
        {
            // Get the highest existing ID and increment by 1.
            // PERF: This uses descending order to get the latest ID efficiently.
            var last = col.Query()
                          .OrderByDescending(x => x.Id)
                          .Limit(1)
                          .FirstOrDefault();

            image.Id = (last?.Id ?? 0) + 1;
        }

        col.Insert(image);
        return image;
    }


    public static List<FullSavedImage> GetRoomImages(
     ulong playerId,
     int roomId,
     int sort = 0,
     int filter = 0,
     int take = 50,
     int skip = 0)
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");

        // Base query: only images in this room
        var query = col.Query()
                       .Where(x => x.RoomId == roomId);

        // Apply filter conditions
        switch (filter)
        {
            case 2: // Only show player's private images
                query = query.Where(x => x.PlayerId == playerId);
                break;

            case 3: // Only images that have been cheered
                query = query.Where(x => x.CheerCount > 0);
                break;

                // filter == 1 will be handled in sorting
        }

        // Apply sorting
        if (sort == 0 && filter == 1)
        {
            // Special case: newest first when sort=0 & filter=1
            query = query.OrderByDescending(x => x.CreatedAt);
        }
        else
        {
            query = sort switch
            {
                1 => query.OrderByDescending(x => x.CreatedAt),   // Newest first
                2 => query.OrderByDescending(x => x.CheerCount),  // Most cheered
                3 => query.OrderByDescending(x => x.CommentCount),// Most commented
                _ => query.OrderBy(x => x.CreatedAt),             // Default: oldest first
            };
        }

        // Apply pagination
        return query
               .Skip(skip)
               .Limit(take)
               .ToList();
    }


    public static List<FullSavedImage> GetGlobalImages()
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");

        return col.Query()
                  .Where(x => x.Accessibility == ImageAccessibility.Public)    
                  .OrderByDescending(x => x.CheerCount) 
                  .ToList();
    }


    public static List<ImagesPlayer> GetPlayerImages(ulong playeridthatrequesting, ulong playerid)
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");

        var query = col.Query().Where(x => x.PlayerId == playerid);

        if (playeridthatrequesting != playerid)
        {
            query = query.Where(x => x.Accessibility == ImageAccessibility.Public);
        }

        return query.ToEnumerable()
                    .Select(MapToImagesPlayer)
                    .ToList();
    }

    private static ImagesPlayer MapToImagesPlayer(FullSavedImage x)
    {
        return new ImagesPlayer
        {
            Accessibility = x.Accessibility,
            AccessibilityLocked = x.AccessibilityLocked,
            CheerCount = x.CheerCount,
            CommentCount = x.CommentCount,
            CreatedAt = x.CreatedAt,
            Description = x.Description,
            ImageName = x.ImageName,
            PlayerEventId = x.PlayerEventId,
            PlayerId = x.PlayerId,
            RoomId = x.RoomId,
            SavedImageId = x.Id,
            SavedImageType = x.Type
        };
    }

    public static void UpdateImageCheerCount(int savedImageId, int cheerCount)
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");
        var img = col.FindById(savedImageId);
        if (img != null)
        {
            img.CheerCount = cheerCount;
            col.Update(img);
        }
    }

    public static bool ToggleCheer(int savedImageId, ulong playerId, bool cheer)
    {
        var db = GetDb();
        var col = db.GetCollection<Cheer>("cheers");

        var existing = col.FindOne(x => x.SavedImageId == savedImageId && x.PlayerId == playerId);

        if (cheer && existing == null)
        {
            col.Insert(new Cheer { SavedImageId = savedImageId, PlayerId = playerId });
        }
        else if (!cheer && existing != null)
        {
            col.Delete(existing.Id);
        }

        return col.Exists(x => x.SavedImageId == savedImageId && x.PlayerId == playerId);
    }

    public static int GetCheerCount(int savedImageId)
    {
        var db = GetDb();
        return db.GetCollection<Cheer>("cheers").Count(x => x.SavedImageId == savedImageId);
    }

    public static bool HasUserCheered(int savedImageId, ulong playerId)
    {
        var db = GetDb();
        return db.GetCollection<Cheer>("cheers")
                 .Exists(x => x.SavedImageId == savedImageId && x.PlayerId == playerId);
    }

    private static readonly string OldDir = Path.Combine("Data", "images_metadata");

    public static ImageV6 GetImageByName(string name)
    {
        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");
        var record = col.FindOne(x => x.ImageName == name);

        if (record == null) return null;

        return new ImageV6
        {
            Accessibility = record.Accessibility,
            AccessibilityLocked = record.AccessibilityLocked,
            CheerCount = record.CheerCount,
            CommentCount = record.CommentCount,
            CreatedAt = record.CreatedAt,
            Description = record.Description,
            Id  = record.Id,
            ImageName  = record.ImageName,
            PlayerEventId  = record.PlayerEventId,
            PlayerId  = record.PlayerId,
            RoomId  = record.RoomId,
            TaggedPlayerIds  = record.TaggedPlayerIds,
            Type  = record.Type,
        };
    }

    public static void DeleteImagesFromPlayerId(ulong playerId)
    {
        var db = GetDb();
        var imageCol = db.GetCollection<FullSavedImage>("images");
        var cheerCol = db.GetCollection<Cheer>("cheers");

        var imagesToDelete = imageCol.Query().Where(x => x.PlayerId == playerId).ToList();

        if (imagesToDelete.Count == 0)
            return;

        foreach (var img in imagesToDelete)
        {
            imageCol.Delete(img.Id);
            cheerCol.DeleteMany(c => c.SavedImageId == img.Id);
        }

        Console.WriteLine($"[Delete] Removed {imagesToDelete.Count} images and their cheers for PlayerId {playerId}");
    }

    public static List<FullSavedImage> GetImagesByIds(List<int> ids)
    {
        if (ids == null || ids.Count == 0)
            return new List<FullSavedImage>();

        var db = GetDb();
        var col = db.GetCollection<FullSavedImage>("images");

        // Efficient LiteDB WHERE query using Contains()
        return col.Query()
                  .Where(x => ids.Contains(x.Id))
                  .ToList();
    }


    public static void ImportOldJson()
    {
        if (!Directory.Exists(OldDir))
        {
            Console.WriteLine($"[Import] Old directory not found: {OldDir}");
            return;
        }

        var db = GetDb();
        var imageCol = db.GetCollection<FullSavedImage>("images");
        var cheerCol = db.GetCollection<Cheer>("cheers");
        imageCol.EnsureIndex(x => x.Id, true);

        // PERF: Parallelize JSON import for multiple files.
        var files = Directory.GetFiles(OldDir, "*.json");
        var cheerFiles = files.Where(f => f.EndsWith("_cheers.json")).ToArray();
        var imageFiles = files.Except(cheerFiles).ToArray();

        Parallel.ForEach(imageFiles, file =>
        {
            string fileName = Path.GetFileName(file);
            try
            {
                string json = File.ReadAllText(file);
                var images = JsonConvert.DeserializeObject<List<FullSavedImage>>(json);
                if (images == null) return;

                foreach (var img in images)
                {
                    if (!imageCol.Exists(x => x.Id == img.Id))
                    {
                        imageCol.Insert(img);
                        Console.WriteLine($"[Import] Imported image {img.Id} from {fileName}");
                    }
                    else
                    {
                        Console.WriteLine($"[Import] Skipped duplicate image {img.Id}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Import] Failed to import {fileName}: {ex.Message}");
            }
        });

        Parallel.ForEach(cheerFiles, file =>
        {
            try
            {
                string fileName = Path.GetFileName(file);
                int savedImageId = int.Parse(fileName.Replace("_cheers.json", ""));

                string json = File.ReadAllText(file);
                var cheerList = JsonConvert.DeserializeObject<List<ulong>>(json);
                if (cheerList == null) return;

                foreach (var pid in cheerList)
                {
                    if (!cheerCol.Exists(x => x.SavedImageId == savedImageId && x.PlayerId == pid))
                    {
                        cheerCol.Insert(new Cheer { SavedImageId = savedImageId, PlayerId = pid });
                    }
                }

                Console.WriteLine($"[Import] Imported {cheerList.Count} cheers for image {savedImageId}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Import] Failed to import cheers from {file}: {ex.Message}");
            }
        });
    }
}
