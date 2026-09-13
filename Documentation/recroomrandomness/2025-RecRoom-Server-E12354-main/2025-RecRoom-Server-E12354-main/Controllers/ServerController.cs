using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using System.ComponentModel.DataAnnotations;
using System.Text;
using static Rec_rewild_live_rewrite.api.dbs.HeartbeatDB;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.LeaderboardDBClasses;
using static Rec_rewild_live_rewrite.api.server.Images;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("server")]
    public class PlayerSettingsController : ControllerBase
    {
        [HttpGet("PlayerSettings/playersettings")]
        public IActionResult GetPlayerSettings()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var settings = SettingsDB.LoadSettings(account.Id);
            return Ok(JsonConvert.SerializeObject(settings));
        }

        [HttpPut("PlayerSettings/playersettings")]
        public IActionResult UpdatePlayerSetting([FromForm, Required] string key, [FromForm, Required] string value)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (string.IsNullOrWhiteSpace(key))
                return BadRequest("");

            SettingsDB.SetPlayerSetting(key, value ?? "", account.Id);

            return Ok(new 
            {
                success = true,
                errorId = (string?)null,
                error = (string?)null
            });
        }

        [HttpDelete("PlayerSettings/playersettings")]
        public IActionResult UpdatePlayerSetting([FromForm, Required] string key)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            if (string.IsNullOrWhiteSpace(key))
                return BadRequest("");

            SettingsDB.DeletePlayerKey(key ?? "", account.Id);

            return Ok(new
            {
                success = true,
                errorId = (string?)null,
                error = (string?)null
            });
        }


        [HttpPost("Storage/upload")]
        public async Task<ContentResult> server_storage_upload([FromForm] FileUploadModel model)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var ua = Request.Headers["User-Agent"].ToString();

            if (ua.Contains("PostmanRuntime"))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            if (PlayerDB.HasActiveModerationBlock(account.Id))
            {
                return new ContentResult
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 403
                };
            }

            try
            {
                if (model?.File == null || model.File.Length <= 0)
                {
                    return new ContentResult()
                    {
                        Content = "",
                        ContentType = "application/json",
                        StatusCode = 400
                    };
                }
                byte[] array = Array.Empty<byte>();
                MemoryStream stream = new MemoryStream();
                await model.File.CopyToAsync(stream);
                array = stream.ToArray();

                FileType_data data_type = model.FileType;

                try
                {
                    var fileResult = Images.SaveFileUnifiedv2(array, data_type);

                    if (fileResult != null && fileResult.saved)
                    {
                        if (fileResult.FileType == FileType_data.Image)
                        {
                            _ = Task.Run(() => Webhook.Send(
                            account.Id, "prod", "Server info",
                            $"({account.Id}) @{account.Username} has uploaded an polaroid image",
                            5898927, $"https://recrewild.oldrec.net/img/{fileResult.rawfilename}"
                        ));
                        }
                        return new ContentResult()
                        {
                            Content = JsonConvert.SerializeObject(new
                            {
                                filename = fileResult.FileName,
                                Hash = "e", // Not needed for game, game expect it so hardcode 
                                OwnershipProof = "e" // Not needed for game, game expect it so hardcode 

                            }, Formatting.Indented),
                            ContentType = "application/json",
                            StatusCode = 200
                        };
                    }

                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            success = false,
                            error = "Failed to upload!",
                            value = (string?)null
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };

                }
                catch (Exception e)
                {
                    Console.WriteLine(e.Message);
                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            filename = (string?)null,
                            Hash = (string?)null,
                            OwnershipProof = (string?)null,
                        }, Formatting.Indented),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        filename = (string?)null,
                        Hash = (string?)null,
                        OwnershipProof = (string?)null,
                    }, Formatting.Indented),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
        }

        [HttpPost("Leaderboard/leaderboard/GetNearbyScores")]
        public async Task<ContentResult> GetNearbyScores()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string body = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

            try
            {
                var req = JsonConvert.DeserializeObject<GetNearbyScoresRequest>(body);
                if (req == null)
                    throw new Exception("Invalid");

                var rows = LeaderboardDB.GetNearbyScores(
                    req.PlayerId,
                    req.StatChannel,
                    req.RoomId,
                    req.WindowSize
                );

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new { Rows = rows }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new { Rows = new List<Entry>() }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
        }


        [HttpPost("Leaderboard/leaderboard/GetPlayerRank")]
        public async Task<ContentResult> GetPlayerRank()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string body = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

            try
            {
                var req = JsonConvert.DeserializeObject<GetNearbyScoresRequest>(body);
                if (req == null)
                    throw new Exception("Invalid");

                var rank = LeaderboardDB.GetPlayerRank(
                    req.PlayerId,
                    req.StatChannel,
                    req.RoomId
                );

                if (rank == null)
                {
                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(new
                        {
                            PlayerId = account.Id,
                            Score = (string?)null,
                            Rank = (string?)null,
                        }),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(rank),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    { 
                        PlayerId = account.Id, 
                        Score = (string?)null,
                        Rank = (string?)null,
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
        }


        [HttpPost("Leaderboard/leaderboard/CheckAndSetStat")]
        public async Task<ContentResult> CheckAndSetStat()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string body = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

            try
            {
                var req = JsonConvert.DeserializeObject<CheckAndSetStatRequest>(body);
                if (req == null)
                    throw new Exception("Invalid");

                var room = RoomDB.GetRoom(req.RoomId);

                var result = LeaderboardDB.SetStat(
                    account.Id,
                    req.StatChannel,
                    req.RoomId,
                    req.StatValue
                );

                Webhook.Send(
                    account.Id,
                    "prod",
                    "Leaderboard Info",
                    $"Player @{account.Username} ({account.Id}) has updated their score to {req.StatValue} in {(room != null ? room.Name : "Unknown Room")}",
                    5898927
                );

                // Rec Room returns simple enum int back. We'll return Success = 2.
                return new ContentResult()
                {
                    Content = ((int)result).ToString(),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }
        }


        [HttpPost("Leaderboard/leaderboard/GetRanks")]
        public async Task<ContentResult> GetRanks()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string body = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

            try
            {
                var req = JsonConvert.DeserializeObject<GetRanksRequest>(body);
                if (req == null)
                    throw new Exception("Invalid");

                var rows = LeaderboardDB.GetRanks(
                    req.StatChannel,
                    req.RoomId,
                    req.RankStart,
                    req.RankEnd
                );

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new { Rows = rows }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            catch (Exception ex) 
            {

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new { Rows = new List<Entry>() }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
        }

    }
}
