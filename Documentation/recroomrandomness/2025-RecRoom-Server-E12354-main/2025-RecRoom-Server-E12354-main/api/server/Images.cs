using System;
using System.IO;
using System.Text;
using System.Collections.Generic;

namespace Rec_rewild_live_rewrite.api.server
{
    public class Images
    {
        public static readonly string ImgSavePath = Path.Combine(Environment.CurrentDirectory, "Data", "Images", "player_images");
        public static readonly string InvSavePath = Path.Combine(Environment.CurrentDirectory, "Data", "CDN", "InventionBlobs");
        public static readonly string RoomSavePath = Path.Combine(Environment.CurrentDirectory, "Data", "CDN", "RoomBlobs");
        public static readonly string CdnSavePath = Path.Combine(Environment.CurrentDirectory, "Data", "CDN", "DataBlobs");
        public static readonly string ImgSavePathPolaroid = Path.Combine(Environment.CurrentDirectory, "Data", "Images", "polaroid_images");
        public static readonly string ImgRelativePath = "player_images/";


        private static int IndexOf(byte[] haystack, byte[] needle, int startIndex = 0)
        {
            for (int i = startIndex; i <= haystack.Length - needle.Length; i++)
            {
                bool match = true;
                for (int j = 0; j < needle.Length; j++)
                {
                    if (haystack[i + j] != needle[j])
                    {
                        match = false;
                        break;
                    }
                }
                if (match)
                    return i;
            }
            return -1;
        }

        public static rn_file SaveImageFile(byte[] request)
        {
            try
            {
                bool parsed;
                byte[]? imageBytes = Utils.ParseData(request, "file.bin", out parsed);

                if (!parsed || imageBytes == null || imageBytes.Length == 0)
                {
                    return new rn_file
                    {
                        success = false,
                        saved = false,
                        error = "Failed to parse or empty file data",
                        FileName = "error.png",
                        rawfilename = "error.png"
                    };
                }

                if (!Directory.Exists(ImgSavePath))
                    Directory.CreateDirectory(ImgSavePath);

                string fileName = $"{ClientSecurity.RandomString(30)}.png";
                string fullPath = Path.Combine(ImgSavePath, fileName);

                File.WriteAllBytes(fullPath, imageBytes);

                return new rn_file
                {
                    success = true,
                    saved = true,
                    FileName = fileName,
                    rawfilename = fileName
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Images.SaveImageFile] Error: {ex}");
                return new rn_file
                {
                    success = false,
                    saved = false,
                    error = ex.Message,
                    FileName = "error.png",
                    rawfilename = "error.png"
                };
            }
        }

        public static rn_file SaveFileUnifiedv2(byte[] request, FileType_data fileType)
        {
            try
            {
                if (request == null || request.Length == 0)
                {
                    Console.WriteLine("Empty file data received.");
                    return new rn_file { saved = false, success = false, error = "Empty file data." };
                }

                string extension;
                string basePath;

                switch (fileType)
                {
                    case FileType_data.Image:
                    case FileType_data.Unknown:
                        extension = ".png";
                        basePath = ImgSavePathPolaroid;
                        break;

                    case FileType_data.Invention:
                        extension = ".inv";
                        basePath = InvSavePath;
                        break;

                    case FileType_data.RoomSave:
                        extension = ".room";
                        basePath = RoomSavePath;
                        break;

                    case FileType_data.RoomMetadata:
                        extension = ".META";
                        basePath = RoomSavePath;
                        break;

                    case FileType_data.Holotar:
                        extension = ".htr";
                        basePath = CdnSavePath;
                        break;

                    default:
                        extension = ".dat";
                        basePath = CdnSavePath;
                        break;
                }

                if (!Directory.Exists(basePath))
                    Directory.CreateDirectory(basePath);

                string fname = $"{ClientSecurity.RandomString(40)}{extension}";
                string fullPath = Path.Combine(basePath, fname);

                Console.WriteLine($"[Images] Saving {fileType} file to: {fullPath}");

                using (var fileStream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, useAsync: true))
                {
                    fileStream.Write(request, 0, request.Length);
                }

                return new rn_file
                {
                    success = true,
                    saved = true,
                    FileName = fname,
                    rawfilename = fname,
                    FileType = fileType
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Images.SaveFileUnified_v2] Error saving {fileType}: {ex}");
                return new rn_file
                {
                    success = false,
                    saved = false,
                    error = ex.Message,
                    FileName = "error.file",
                    rawfilename = "error.file"
                };
            }
        }

        public class rn_file
        {
            public bool success { get; set; }
            public bool saved { get; set; }
            public string? error { get; set; }
            public string? FileName { get; set; }
            public string? rawfilename { get; set; }
            public FileType_data FileType { get; set; }
        }

        public enum FileType_data
        {
            Unknown,
            RoomSave,
            Holotar,
            Image,
            Video,
            Invention,
            RoomMetadata
        }

        public class FileUploadModel
        {
            public IFormFile? File { get; set; }
            public FileType_data FileType { get; set; } = FileType_data.Unknown;
        }
    }
}
