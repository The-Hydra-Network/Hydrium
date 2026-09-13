using Microsoft.AspNetCore.Mvc;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class ImagesController : Controller
    {
        [Route("/img/{*img_path}")]
        public async Task<IActionResult> ImgServer(string img_path, int width = 0, int height = 0, string sig = "p1")
        {
            img_path = Uri.UnescapeDataString(img_path ?? "").TrimStart('/');

            HttpContext.Response.Headers.Append("content-signature", "key-id=KEY:RSA:p1.rec.net; data=IWwe/pZ5vWWqNSkSM/54isgDxlZkdrP0sUrppKCbNktO2yCOTjq746xWiiLsueGuVcAGQqkjeRTimxolHckS/YXSYkEJxtiCXbLlsRia2DyAqtWVkGWsfczzFhp/56U66FVzolTspPCvjScOVlGO7dDIK7sJ+ndcRauWjsQsC6g3e7rUc6uwY099a6gy7sw6xr5BFZQSz8wg+fqyHYD/Sc4nQQVOTFZNNASqbJYhpNhEMXRnafCMuLl8a3mkGwvy3t4q2D/7SM48xrGZjEV47qNx1A91KCe28XVToFh4BzwEUU8nZ0d+KwV79MGarLo1cY8igc8FcoThKcovI4ClOg==");
            HttpContext.Response.Headers.Append("Content-Disposition", $"inline; filename=\"{Path.GetFileName(img_path)}\"");
            HttpContext.Response.Headers.Append("Access-Control-Allow-Origin", "*");
            HttpContext.Response.Headers.Append("Access-Control-Allow-Headers", "*");
            Response.Headers["Cache-Control"] = "public, max-age=14400";

            HttpContext.Response.Headers.Append("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control");
            HttpContext.Response.Headers.Append("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

            var etag = $"\"{img_path.GetHashCode()}\"";
            HttpContext.Response.Headers.Append("ETag", etag);

            //return File(await System.IO.File.ReadAllBytesAsync(Path.Combine(Environment.CurrentDirectory, "Data", "Images",  "imageee.jpg")), "image/png");

            bool cropSquare = HttpContext.Request.Query.ContainsKey("cropsquare") &&
                (HttpContext.Request.Query["cropsquare"].ToString().ToLower() == "true" ||
                 HttpContext.Request.Query["cropsquare"].ToString() == "1");

            string[] paths = new[]
            {
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "rro_images", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "rro_images", "base_rros", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "player_images", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "polaroid_images", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "DefaultImgs", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "rec_net", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "custom_shirt_imgs", img_path),
                Path.Combine(Environment.CurrentDirectory, "Data", "Images", "LoadingScreenTips", img_path)
                //Path.Combine(Environment.CurrentDirectory, "Data", "cdn_rooms", img_path)
            };

            foreach (var path in paths)
            {
                if (System.IO.File.Exists(path))
                {
                    try
                    {
                        var imageBytes = await System.IO.File.ReadAllBytesAsync(path);
                        imageBytes = await ProcessImageAsync(imageBytes, cropSquare, width, height);
                        return File(imageBytes, "image/png");
                    }
                    catch
                    {
                        var fallbackBytes = await System.IO.File.ReadAllBytesAsync(path);
                        return File(fallbackBytes, "image/png");
                    }
                }
            }

            string recNetLocalPath = Path.Combine(Environment.CurrentDirectory, "Data", "Images", "rec_net", img_path);
            if (!System.IO.File.Exists(recNetLocalPath))
            {
                try
                {
                    using HttpClient client = new();
                    byte[] data = await client.GetByteArrayAsync($"https://img.rec.net/{img_path}");
                    Directory.CreateDirectory(Path.GetDirectoryName(recNetLocalPath)!);
                    await System.IO.File.WriteAllBytesAsync(recNetLocalPath, data);

                    try
                    {
                        var processed = await ProcessImageAsync(data, cropSquare, width, height);
                        return File(processed, GetMimeType(img_path));
                    }
                    catch
                    {
                        return File(data, GetMimeType(img_path));
                    }
                }
                catch (HttpRequestException ex)
                {
                    Console.WriteLine($"[rec_net fetch failed] {ex.Message}");
                }
            }
            else
            {
                var data = await System.IO.File.ReadAllBytesAsync(recNetLocalPath);
                try
                {
                    var processed = await ProcessImageAsync(data, cropSquare, width, height);
                    return File(processed, GetMimeType(img_path));
                }
                catch
                {
                    return File(data, GetMimeType(img_path));
                }
            }

            var notFoundImagePath = Path.Combine(Environment.CurrentDirectory, "Data", "Images", "rro_image", "DefaultRoomImage.jpg");
            if (System.IO.File.Exists(notFoundImagePath))
            {
                var notFoundImageBytes = await System.IO.File.ReadAllBytesAsync(notFoundImagePath);
                return File(notFoundImageBytes, "image/png");
            }

            return NotFound();
        }

        private static string GetMimeType(string filePath)
        {
            var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(filePath, out var contentType))
            {
                contentType = "image/png";
            }
            return contentType;
        }

        private static async Task<byte[]> ProcessImageAsync(byte[] imageBytes, bool cropSquare, int width, int height)
        {
            using var ms = new MemoryStream(imageBytes);
            using var image = await Image.LoadAsync<Rgba32>(ms);

            if (cropSquare)
            {
                int size = Math.Min(image.Width, image.Height);
                int x = (image.Width - size) / 2;
                int y = (image.Height - size) / 2;
                image.Mutate(ctx => ctx.Crop(new Rectangle(x, y, size, size)));

                int targetSize = width > 0 ? width : height;
                if (targetSize > 0)
                {
                    image.Mutate(ctx => ctx.Resize(targetSize, targetSize));
                }
            }
            else if (width > 0 || height > 0)
            {
                int resizeWidth = width;
                int resizeHeight = height;

                if (width > 0 && height == 0)
                {
                    resizeHeight = (int)((double)image.Height / image.Width * width);
                }
                else if (height > 0 && width == 0)
                {
                    resizeWidth = (int)((double)image.Width / image.Height * height);
                }

                image.Mutate(ctx => ctx.Resize(resizeWidth, resizeHeight));
            }

            using var output = new MemoryStream();
            await image.SaveAsync(output, new PngEncoder());
            return output.ToArray();
        }
    }
}
