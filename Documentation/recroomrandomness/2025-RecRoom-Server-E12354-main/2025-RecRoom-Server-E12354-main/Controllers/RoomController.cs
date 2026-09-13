using System.Security.Principal;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using System.IdentityModel.Tokens.Jwt;
using static Rec_rewild_live_rewrite.api.server.Moderation_Detail;
using Microsoft.AspNetCore.Http.HttpResults;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.RoomDBClasses;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Nodes;


namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("Room_server")]
    public class RoomController : ControllerBase
    {
        [HttpGet("rooms")]
        public ContentResult Room_server_rooms([FromQuery] ulong? roomid = null, [FromQuery] string? name = null, [FromQuery] ulong? include = null, [FromQuery] int? unityAssetTarget = null, [FromQuery] int? unityAssetVersion = null)
        {
            try
            {
                // DELETE by roomid
                if (HttpContext.Request.Method == HttpMethods.Delete && roomid.HasValue)
                {
                    var (account, error) = AuthHelper.ValidateToken(HttpContext);
                    if (error != null)
                        return error;

                    RoomDBClasses.RoomRoot room = RoomDB.GetRoom(roomid.Value);
                    if (room == null)
                    {
                        return new ContentResult()
                        {
                            Content = JsonConvert.SerializeObject(new
                            {
                                Success = false,
                                Value = (string?)null,
                                ErrorId = "Rooms.DoesntExist",
                                Error = "This room does not exist!"
                            }),
                            ContentType = "application/json",
                            StatusCode = 200
                        };
                    }

                    if (room.CreatorAccountId != account.Id)
                    {
                        return new ContentResult()
                        {
                            Content = JsonConvert.SerializeObject(new
                            {
                                Success = false,
                                Value = (string?)null,
                                ErrorId = "Rooms.PermissionDenied",
                                Error = "You are not the owner of this room!"
                            }),
                            ContentType = "application/json",
                            StatusCode = 200
                        };
                    }

                    RoomDB.DeleteRoom(roomid.Value);

                    return new ContentResult()
                    {
                        Content = "[]",
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                // Lookup by roomid
                if (roomid.HasValue)
                {
                    RoomDBClasses.RoomRoot existingRoom = RoomDB.GetRoom(roomid.Value);
                    if (existingRoom == null)
                    {
                        return new ContentResult()
                        {
                            Content = "[]",
                            ContentType = "application/json",
                            StatusCode = 200
                        };
                    }

                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(existingRoom),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                // Lookup by name
                if (!string.IsNullOrEmpty(name))
                {
                    RoomDBClasses.RoomRoot room = RoomDB.GetRoomByName(name);
                    if (room == null)
                    {
                        return new ContentResult()
                        {
                            Content = "",
                            ContentType = "application/json",
                            StatusCode = 404
                        };
                    }

                    return new ContentResult()
                    {
                        Content = JsonConvert.SerializeObject(room),
                        ContentType = "application/json",
                        StatusCode = 200
                    };
                }

                // Neither roomid nor name provided
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }
        }

        [HttpGet("rooms/{roomid}")]
        public ContentResult GetRoomById(ulong roomid)
        {
            var room = RoomDB.GetRoom(roomid);
            if (room == null)
            {
                return new ContentResult
                {
                    Content = "[]",
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(room),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpDelete("rooms/{roomid}")]
        public ContentResult DeleteRoomById(ulong roomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var room = RoomDB.GetRoom(roomid);
            if (room == null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        Success = false,
                        Value = (string?)null,
                        ErrorId = "Rooms.DoesntExist",
                        Error = "This room does not exist!"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            if (room.CreatorAccountId != account.Id)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        Success = false,
                        Value = (string?)null,
                        ErrorId = "Rooms.PermissionDenied",
                        Error = "You are not the owner of this room!"
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            RoomDB.DeleteRoom(roomid);
            PlayerDB.Set_moderation_block(
                    account.Id,
                    ReportCategory.Moderator,
                    duration: 1,
                    gameSessionId: -1,
                    isHostKick: false,
                    message: "Deleted room.",
                    playerIdReporter: null,
                    isBan: true,
                    bannedByPlayerId: 0
                );
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = "",
                    value = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/bulk")]
        public IActionResult Room_server_rooms_bulk([FromQuery(Name = "id")] ulong roomId, [FromQuery] string? name, [FromQuery] ulong? include, [FromQuery] bool? excludePrivateRooms)
        {
            RoomDBClasses.RoomRoot room = RoomDB.GetRoomByName(name);
            if (room == null)
            {
                RoomDBClasses.RoomRoot room2 = RoomDB.GetRoom(roomId);
                if (room2 == null)
                {
                    return Ok(ConfigRewild.Bracket);
                }
                return Content($"[{JsonConvert.SerializeObject(room2)}]", "application/json");
            }

            return Content($"[{JsonConvert.SerializeObject(room)}]", "application/json");
        }

        [HttpGet("rooms/createdby/me")]
        public ContentResult roomscreatedbyme()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("photon_access_token")]
        public IActionResult photon_access_token()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var heartbeat = HeartbeatDB.GetPlayerHeartbeat(account.Id);

            var permissions = new List<object>
            {
                new { Override = true, Permission = "CAN_USE_ROOM_RESET_BUTTON", Role = 0, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_USE_DELETE_ALL_BUTTON", Role = 0, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_SAVE_INVENTIONS", Role = 0, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_SPAWN_INVENTIONS", Role = 0, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_USE_PLAY_GIZMOS_TOGGLE", Role = 0, Type = 0, Value = "True" },
                new { Override = false, Permission = "CAN_USE_MAKER_PEN", Role = 30, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_USE_ROOM_RESET_BUTTON", Role = 30, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_USE_DELETE_ALL_BUTTON", Role = 30, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_SAVE_INVENTIONS", Role = 30, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_SPAWN_INVENTIONS", Role = 30, Type = 0, Value = "True" },
                new { Override = true, Permission = "CAN_USE_PLAY_GIZMOS_TOGGLE", Role = 30, Type = 0, Value = "True" }
            };

            if (account.Id == 2 || account.Id == 3 || account.Id == 1)
            {
                permissions.Insert(0, new { Override = true, Permission = "CAN_USE_MAKER_PEN", Role = 0, Type = 0, Value = "True" });
            }

            return Ok(new
            {
                RoomInstanceId = heartbeat?.roomInstance?.roomInstanceId,
                PhotonAccessToken = ClientSecurity.Createphotonacesstoken(account.Id),
                Permissions = permissions.ToArray()
            });
        }


        [HttpGet("rooms/hot")]
        public ContentResult HotRooms(string tag, int skip = 0, int take = 30)
        {
            var rooms = RoomDB.GetHotRooms();

            if (rooms == null || rooms.Count == 0)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(new Resultslist<RoomDBClasses.RoomRoot>
                    {
                        Results = new List<RoomDBClasses.RoomRoot>(),
                        TotalResults = 0
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            IEnumerable<RoomDBClasses.RoomRoot> query = rooms;

            bool isRRO = false;

            if (!string.IsNullOrEmpty(tag))
            {
                string t = tag.ToLower();

                // --- RRO Filter ---
                if (t == "rro" || t == "recroomoriginal")
                {
                    isRRO = true;

                    query = query.Where(r =>
                        r.Tags != null &&
                        r.Tags.Any(x =>
                        {
                            string tt = x.Tag?.ToLower();
                            return tt == "rro" || tt == "recroomoriginal";
                        })
                    );
                }
                else if (t == "new")
                {
                    query = query.OrderByDescending(r => r.CreatedAt)
                                 .Take(30);
                }
            }
            else
            {
                // Default mode: EXCLUDE rro + base
                query = query.Where(r =>
                    r.Tags == null ||
                    !r.Tags.Any(x =>
                    {
                        string tt = x.Tag?.ToLower();
                        return tt == "base" || tt == "rro" || tt == "recroomoriginal";
                    })
                );
            }

            // Only public rooms when NOT requesting RRO
            if (!isRRO)
            {
                query = query.Where(r => r.Accessibility == RoomDBClasses.RoomAccessibility.Public);
            }

            // Order by popularity
            query = query.OrderByDescending(r => r.Stats?.VisitCount ?? 0)
                         .ThenByDescending(r => r.Stats?.CheerCount ?? 0);

            // Pagination
            int totalCount = query.Count();
            var paged = query.Skip(skip).Take(take).ToList();
            int countTotal = rooms.Count;
            int countRRO = rooms.Count(r =>
                r?.Tags != null &&
                r.Tags.Any(t =>
                {
                    var x = t.Tag?.ToLower();
                    return x == "rro" || x == "recroomoriginal";
                })
            );

            Console.WriteLine($"HOT TOTAL ROOMS: {countTotal}");
            Console.WriteLine($"HOT RRO ROOMS: {countRRO}");
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new Resultslist<RoomDBClasses.RoomRoot>
                {
                    Results = paged,
                    TotalResults = totalCount
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }





        [HttpGet("rooms/{roomid}/interactionby/me")]
        public IActionResult Room_server_room_interactionby_me(ulong roomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var interaction = PlayerDB.GetInteraction(account.Id, roomid);

            return Ok(JsonConvert.SerializeObject(new
            {
                Cheered = interaction.Cheered,
                Favorited = interaction.Favorited,
                LastVisitedAt = DateTime.Now // could persist if you want
            }));
        }

        [Route("rooms/{roomid}/interactionby/me/cheer")]
        public IActionResult Room_server_room_interactionby_me_cheer(ulong roomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            bool cheered = PlayerDB.ToggleCheer(account.Id, roomid);
            var favorited = PlayerDB.GetInteraction(account.Id, roomid).Favorited;

            return Ok(JsonConvert.SerializeObject(new
            {
                Cheered = cheered,
                Favorited = favorited,
                LastVisitedAt = DateTime.Now
            }));
        }

        [Route("rooms/{roomid}/interactionby/me/favorite")]
        public IActionResult Room_server_room_interactionby_me_favorite(ulong roomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            bool favorited = PlayerDB.ToggleFavorite(account.Id, roomid);
            var cheered = PlayerDB.GetInteraction(account.Id, roomid).Cheered;

            return Ok(JsonConvert.SerializeObject(new
            {
                Cheered = cheered,
                Favorited = favorited,
                LastVisitedAt = DateTime.Now
            }));
        }

        [HttpGet("rooms/ownedby/{PlayerId}")]
        public ContentResult RoomsOwnedBy(ulong PlayerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(RoomDB.GetRoomsByCreator(PlayerId)),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/search")]
        public ContentResult RoomSearch(string query, int skip = 0, int take = 30)
        {
            var rooms = RoomDB.Search(query);

            if (rooms == null || rooms.Count == 0)
            {
                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(
                        new RoomDBClasses.Resultslist<RoomDBClasses.RoomRoot>
                        {
                            Results = new List<RoomDBClasses.RoomRoot>(),
                            TotalResults = 0
                        }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }

            int total = rooms.Count;
            var paged = rooms.Skip(skip).Take(take).ToList();

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(
                    new RoomDBClasses.Resultslist<RoomDBClasses.RoomRoot>
                    {
                        Results = paged,
                        TotalResults = total
                    }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }


        [HttpGet("rooms/visitedby/me")]
        public ContentResult RoomsVisitedByMe(int skip = 0, int take = 20)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = PlayerDB.GetRecentRooms(account.Id, skip, take),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("showcase/{playerid}")]
        public ContentResult RoomsVisitedByMe(ulong playerid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            //todo: make it return a list of room ids 
            // [1, 2, 3]
            return new ContentResult()
            {
                Content = "[]",
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/base")]
        public ContentResult BaseRooms()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            List<RoomDBClasses.RoomRoot> room = RoomDB.Search("#base", isBase: true);
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(room),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("rooms/{roomId}/clone")]
        public ContentResult CloneRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string RoomName = HttpContext.Request.Form["name"];
            if (string.IsNullOrEmpty(RoomName))
            {
                return Utils.Error("You must enter a name for your room.");
            }
            var checkifroomexists = RoomDB.GetRoomByName(RoomName);
            if (checkifroomexists != null)
            {
                return Utils.Error("A room with that name already exists!");
            }
            bool CheckSwears = !string.IsNullOrEmpty(RoomName) && Sanitize.ContainsSwears(RoomName);
            if (CheckSwears)
            {
                return Utils.Error("Room name contains swear words!");
            }
            ulong? temp = RoomDB.CloneRoom(roomId, RoomName, account.Id);
            if (temp == null)
            {
                return Utils.Error("You can't clone this room!");
            }
            var NewRoom = RoomDB.GetRoom(temp.Value);
            if (NewRoom == null)
            {
                Console.WriteLine($"[Room_server_room_clone] get_room({temp.Value}) returned null");
            }
            Console.WriteLine($"[Room_server_room_clone] clone_room returned id: {temp}");

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = "",
                    value = NewRoom
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        // set room stuff

        [HttpPut("rooms/{roomId}/name")]
        public ContentResult SetRoomName(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string NewRoomName = HttpContext.Request.Form["name"].ToString();

            RoomDBClasses.RoomRoot? room_data = RoomDB.GetRoom(roomId);
            Uri.UnescapeDataString(NewRoomName);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }

            if (room_data.CreatorAccountId != account?.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account?.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            if (room_data.IsDorm == true)
            {
                return Utils.ErrorRoom("Rooms.Dorm", "You cannot edit your dorm room's name!");
            }

            if (NewRoomName.Contains(" "))
            {
                return Utils.ErrorRoom("Rooms.NoSpaces", "Your room name must not contain spaces!");
            }

            if (Regex.IsMatch(NewRoomName, @"[^\u0000-\u007F]"))
            {
                return Utils.ErrorRoom("Rooms.NoUnicodeCharacters", "Your room name contains Unicode characters!");
            }

            bool CheckSwears = !string.IsNullOrEmpty(NewRoomName) && Sanitize.ContainsSwears(NewRoomName);
            if (CheckSwears)
            {
                return Utils.ErrorRoom("Rooms.NoSwearWords", "Your room name contains swear words!");
            }

            RoomDBClasses.RoomRoot? temp = RoomDB.SetRoomName(roomId, NewRoomName);
            RoomDBClasses.RoomRoot? UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DuplicateName", "A room with the same name already exists!");
            }
        }

        [HttpPut("rooms/{roomId}/description")]
        public ContentResult SetRoomDescriptionAPI(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string NewDescription = HttpContext.Request.Form["description"].ToString();
            Uri.UnescapeDataString(NewDescription);

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            bool CheckSwears = !string.IsNullOrEmpty(NewDescription) && Sanitize.ContainsSwears(NewDescription);
            if (CheckSwears)
            {
                return Utils.ErrorRoom("Rooms.NoSwearWords", "Your room description contains swear words!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.SetRoomDescription(roomId, NewDescription);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/accessibility")]
        public ContentResult SetRoomAccessibility(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string NewAccessibilityString = HttpContext.Request.Form["accessibility"].ToString();
            RoomDBClasses.RoomAccessibility accessibility = RoomDBClasses.RoomAccessibility.Private;
            if (int.TryParse(NewAccessibilityString, out int accessibilityValue) && Enum.IsDefined(typeof(RoomDBClasses.RoomAccessibility), accessibilityValue))
            {
                accessibility = (RoomDBClasses.RoomAccessibility)accessibilityValue;
            }
            else
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "",
                        value = (object?)null
                    }),
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }
            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.SetRoomAccessibility(roomId, accessibility);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/image")]
        public ContentResult SetRoomImageName(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string NewImageName = HttpContext.Request.Form["imageName"].ToString();

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.SetRoomImageName(roomId, NewImageName);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPost("rooms/{roomId}/subrooms/{subroomId}/data")]
        public async Task<ContentResult> SetRoomData(ulong roomId, ulong subroomId, [FromBody] RoomFileData request)
        {
            string authtoken = HttpContext.Request.Headers["Authorization"].ToString();

            if (string.IsNullOrEmpty(authtoken))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            }
            string playerdata = ClientSecurity.DecodeToken(authtoken);
            if (playerdata == null)
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            if (playerdata.Contains("error_token"))
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 401
                };
            player_info account = JsonConvert.DeserializeObject<player_info>(playerdata);

            string token = authtoken.ToString().Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);

            var handler = new JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(token);

            string currentplatformstr = jwt.Payload["platform"].ToString();
            int currentplatform = int.Parse(currentplatformstr);
            Platforms platformparsed = Enum.IsDefined(typeof(Platforms), currentplatform) ? (Platforms)currentplatform : Platforms.All;

            string mainFilename = request.SubRoomData?.Filename ?? "";
            string subroomFilename = request.SubRoomData?.Filename ?? "";

            string RoomDesc = request.Description ?? "";

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot room = RoomDB.SetRoomSubroomRoomFile(roomId, subroomId, mainFilename, RoomDesc, account.Id, platformparsed);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/cloning")]
        public ContentResult SetRoomCloning(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string? cloningAllowedStr = HttpContext.Request.Form["cloningAllowed"];
            if (!bool.TryParse(cloningAllowedStr, out bool cloningAllowed))
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 400
                };
            }

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);
            if (room_data.IsDorm == true)
            {
                return Utils.ErrorRoom("Rooms.DormNotAllowed", "You cannot edit that in this dorm.");
            }
            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.SetRoomCloning(roomId, cloningAllowed);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/restrictions")]
        public ContentResult SetRoomRestrictions(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            bool ParseBool(string key, bool defaultValue = false)
            {
                string? str = HttpContext.Request.Form[key];
                return bool.TryParse(str, out bool result) ? result : defaultValue;
            }

            bool supportsScreens = ParseBool("supportsScreens");
            bool supportsWalkVR = ParseBool("supportsWalkVR");
            bool supportsTeleportVR = ParseBool("supportsTeleportVR");
            bool supportsJuniors = ParseBool("supportsJuniors");

            RoomDBClasses.RoomRoot? room_data = RoomDB.GetRoom(roomId);
            if (room_data?.IsDorm == true)
            {
                return Utils.ErrorRoom("Rooms.DormNotAllowed", "You cannot edit that in dorms.");
            }
            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot? temp = RoomDB.SetRoomRestrictions(roomId, supportsScreens, supportsWalkVR, supportsTeleportVR, supportsJuniors);
            RoomDBClasses.RoomRoot? UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/loadscreen")]
        public ContentResult SetRoomLoadingScreen(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string imageName = HttpContext.Request.Form["imageName"].ToString();
            string title = HttpContext.Request.Form["title"].ToString();
            string subtitle = HttpContext.Request.Form["subtitle"].ToString();

            RoomDBClasses.RoomRoot? room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account?.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account?.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            if (!string.IsNullOrEmpty(title) && title.Length > 24)
            {
                return Utils.ErrorRoom("Room.LoadScreen.Title", "Title cannot exceed 24 characters!");
            }

            if (!string.IsNullOrEmpty(subtitle) && subtitle.Length > 150)
            {
                return Utils.ErrorRoom("Room.LoadScreen.Subtitle", "Subtitle cannot exceed 150 characters!");
            }

            RoomDBClasses.RoomRoot? temp = RoomDB.SetRoomLoadscreen(roomId, imageName, title, subtitle);
            RoomDBClasses.RoomRoot? UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/warning")]
        public ContentResult SetRoomWarning(ulong roomId, [FromForm] WarningMaskType warningMask)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomId);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.SetRoomWarningMask(roomId, warningMask);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomId);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomId}/tags")]
        public IActionResult SetRoomTags(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var room = RoomDB.GetRoom(roomId);
            if (room == null)
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");

            if (!RoomDB.UserCanEditRoom(roomId, account.Id))
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");

            var restricted = new HashSet<string>
            {
                "rro",
                "recroomoriginal",
                "featured",
                "base"
            };

            // Parse + sanitize tags inline
            var tags = Request.Form["tag"]
                .Select(t => Uri.UnescapeDataString(t).Trim().ToLowerInvariant())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
                .ToList();

            if (tags.Count == 0)
                return Utils.ErrorRoom("Rooms.InvalidTag", "No valid tags provided.");

            if (tags.Any(t => restricted.Contains(t)))
                return Utils.ErrorRoom("Rooms.TagNotAllowed", "One or more tags are not allowed!");

            // Auto beta override
            if (Request.Form.TryGetValue("autoTag", out var autoTag) && string.Equals(autoTag, "beta", StringComparison.OrdinalIgnoreCase))
            {
                tags = new List<string> { "beta" };
            }

            RoomDB.SetRoomTags(tags, roomId);
            var updatedRoom = RoomDB.GetRoom(roomId);
            if (updatedRoom == null)
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");

            return Ok(new
            {
                success = true,
                error = "",
                value = updatedRoom
            });
        }



        [HttpGet("rooms/favoritedby/me")]
        public ContentResult MyFavoritedRooms()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(PlayerDB.GetFavoritedRooms(account.Id)),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/{roomId}/subrooms/{subroomId}/saves")] // SCUFFED CODE fix later
        public ContentResult GetRoomSaves(ulong roomId, ulong subroomId, int unityAssetTarget = 0, int unityAssetVersion = 1, int skip = 0, int take = 20)
        {


            var save = RoomDB.GetRoomSaves(roomId, subroomId, skip, take);

            if (save == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Results = save.Results,
                    TotalResults = save.TotalCount
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/{roomId}/subrooms/{subroomId}/saves/no_unity_assets")] // SCUFFED CODE fix later
        public ContentResult GetRoomSaves2(ulong roomId, ulong subroomId, int unityAssetTarget = 0, int unityAssetVersion = 1, int skip = 0, int take = 20)
        {


            var save = RoomDB.GetRoomSaves(roomId, subroomId, skip, take);

            if (save == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Results = save.Results,
                    TotalResults = save.TotalCount
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("rooms/{roomId}/subrooms/{subroomId}/saves/{subRoomDataSaveId}")]
        public IActionResult GetRoomSave(ulong roomId, ulong subroomId, ulong subRoomDataSaveId, [FromQuery] int unityAssetTarget, [FromQuery] int unityAssetVersion)
        {
            var save = RoomDB.GetRoomSaveById(roomId, subroomId, subRoomDataSaveId, unityAssetTarget, unityAssetVersion);

            if (save == null)
            {
                return new ContentResult()
                {
                    Content = "",
                    ContentType = "application/json",
                    StatusCode = 404
                };
            }

            return Ok(save);
        }


        [HttpGet("rooms/carousel/rising")]
        public ContentResult RisingRooms()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }



        [HttpGet("featuredrooms/current")]
        public ContentResult CurrentFeaturedRooms()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            /*
              Response:
              {
                  "FeaturedRoomGroupId": 1,
                  "name": "Featured Rooms",
                  "StartAt": "2025-12-01T11:01:00Z",
                  "EndAt": "9999-12-08T11:00:00Z",
                  "Rooms": [
                    {
                      "RoomId": 7243703403195289000,
                      "RoomName": "WinterAlmonds",
                      "ImageName": "96w7irfsiucisrei9fsmhipqn.jpg",
                      "IsRecRoomApproved": false,
                      "ExcludeFromLists": false,
                      "ExcludeFromSearch": false
                    }
                  ]
                }
            */

            return new ContentResult()
            {
                Content = "[]", // todo db
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("rooms/{roomid}/subrooms")]
        public ContentResult CreateSubroomForRoom(ulong roomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string SubroomName = HttpContext.Request.Form["name"].ToString();
            Uri.UnescapeDataString(SubroomName);

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomid);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }
            if (room_data.IsDorm == true)
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You cannot create a subroom for your dorm room!");
            }

            bool CheckSwears = !string.IsNullOrEmpty(SubroomName) && Sanitize.ContainsSwears(SubroomName);
            if (CheckSwears)
            {
                return Utils.ErrorRoom("Rooms.NoSwearWords", "Your subroom name contains swear words!");
            }

            RoomDBClasses.RoomRoot temp = RoomDB.CreateSubroomForRoom(roomid, SubroomName);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomid);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpDelete("rooms/{roomid}/subrooms/{subroomid}")]
        public ContentResult DeleteSubroom(ulong roomid, ulong subroomid)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomid);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            bool success = RoomDB.DeleteSubroom(roomid, subroomid);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomid);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [HttpPut("rooms/{roomid}/subrooms/{subroomid}/modify")]
        public ContentResult ModifySubroom(ulong roomid, ulong subroomid, [FromForm] string name, RoomDBClasses.RoomAccessibility accessibility, int maxPlayers = 32)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            RoomDBClasses.RoomRoot room_data = RoomDB.GetRoom(roomid);

            if (room_data == null)
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
            if (room_data.CreatorAccountId != account.Id && !(room_data.Roles?.Any(r => (ulong)r.AccountId == account.Id && (r.Role == RoomDBClasses.Role_data.CoOwner || r.Role == RoomDBClasses.Role_data.Creator)) ?? false))
            {
                return Utils.ErrorRoom("Rooms.PermissionDenied", "You are not the owner of this room!");
            }

            bool success = RoomDB.ModifySubroom(roomid, subroomid, name, accessibility, maxPlayers);
            RoomDBClasses.RoomRoot UpdatedRoom = RoomDB.GetRoom(roomid);
            if (UpdatedRoom != null)
            {
                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject(new
                    {
                        success = true,
                        error = "",
                        value = UpdatedRoom
                    }),
                    ContentType = "application/json",
                    StatusCode = 200
                };
            }
            else
            {
                return Utils.ErrorRoom("Rooms.DoesntExist", "This room does not exist!");
            }
        }

        [Route("unity_assets/{guid}/{target}/{version}")]
        public IActionResult GetUnityAssets(string guid, int target, int version)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                UnityAssetId = guid,
                Target = target,
                Version = version,
                Filename = $"{guid}.assetbundle",
                Hash = (string?)null
            });
        }

        [Route("/Room_server/unity_assets/baked/bulk")]
        public IActionResult GetUnityAssets([FromForm] string id)
        {
            if (id == null)
            {
                id = HttpContext.Request.Query["id"]; // let web browser access it for debugging cause the game unhappy :skull:
            }

            string path = Path.Combine(
                Environment.CurrentDirectory,
                "Data",
                "APIS",
                "BakedBulk",
                $"{id}_assets.json"
            );

            if (!System.IO.File.Exists(path))
                return NotFound();

            var jsonText = System.IO.File.ReadAllText(path);

            var bakedAssets = JsonNode.Parse(jsonText) as JsonArray;

            if (bakedAssets == null)
                return StatusCode(404, "");

            /*foreach (var item in bakedAssets)
            {
                if (item is JsonObject obj)
                {
                    obj["Hash"] = null;
                }
            }*/

            return Ok(new
            {
                UnityAssetId = id,
                CreatedByAccountId = 1,
                BakedUnityAssets = bakedAssets,
                SubAssets = new List<object>(),
                SourceAssetId = (string?)null
            });
        }

        [HttpGet("/Room_server/publishState/configs")]
        public IActionResult GetPublishStateConfigs()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            /*
             {
                  "value": {
                    "UpdateMaxCount": 3,
                    "UpdateRollingWindowInDays": 365,
                    "UpdateExpirationInDays": 30,
                    "UpdateCooldownInDays": 45
                  },
                  "success": true,
                  "error_id": null,
                  "error": null
                } 
             */

            return Ok(new
            {
                value = new
                {
                    UpdateMaxCount = 3,
                    UpdateRollingWindowInDays = 365,
                    UpdateExpirationInDays = 30,
                    UpdateCooldownInDays = 45
                },
                success = true,
                error_id = (string?)null,
                error = (string?)null
            });
        }

        [HttpGet("/Room_server/dormroom/me")]
        public IActionResult GetMyDormRoom()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var FullAccount = PlayerDB.GetFullAccount(account.Id);

            return Ok(FullAccount.player_Extra.DormRoomID);
        }

        [HttpGet("/Room_server/rooms/{roomId}/experience")]
        public IActionResult GetExperienceForRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                DailyLimit = 1000000,
                Enabled = false,
                RoomExperienceId = 0
            });
        }

        [HttpGet("/Room_server/rooms/{roomId}/experience/player")]
        public IActionResult GetPlayerExperienceInRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                Enabled = false,
                Experience = (object?)null,
                ConcurrencyCode = (string?)null
            });
        }

        [HttpGet("/Room_server/rooms/{roomId}/bans/{playerId}/isBanned")]
        public IActionResult GetIsBanned(ulong roomId, ulong playerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = true,
                error = (string?)null,
                error_id = (string?)null,
                value = false
            });
        }

        [HttpGet("/Room_server/rooms/{roomId}/playerdata/me")]
        public IActionResult GetMyPlayerData(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var data = PlayerDB.GetPlayerData(account.Id, roomId);

            if (string.IsNullOrEmpty(data))
            {
                return NotFound();
            }

            return Ok(new
            {
                Data = data
            });
        }

        [HttpPut("/Room_server/rooms/{roomId}/playerdata/me")]
        public IActionResult SetMyPlayerData(ulong roomId, [FromForm] string data)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            bool success = PlayerDB.SetPlayerData(account.Id, roomId, data);
            if (!success)
            {
                return BadRequest();
            }
            
            Console.WriteLine("Was updating playerdata successful: " + success);

            return NoContent();
        }

        [HttpGet("/Room_server/rooms/{roomId}/boosts/{playerId}/count")]
        public IActionResult GetBoostCountForRoom(ulong roomId, ulong playerId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            
            return Ok("0");
        }

        [HttpGet("/Room_server/rooms/{roomId}/assets")]
        public IActionResult GetRoomAssets(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            
            return Ok(new
            {
                success = true,
                error = (string?)null,
                error_id = (string?)null,
                value = Array.Empty<object>()
            });
        }

        // https://rooms.rec.net/rooms/1089513655118942017/snapshots/ade3aee2-e469-4445-728b-08de39979f5f/loadinfo?subRoomId=1384652020053214301
        [HttpGet("/Room_server/rooms/{roomId}/snapshots/{snapshotId}/loadinfo")]
        public IActionResult GetRoomAssets(ulong roomId, string snapshotId, [FromQuery] ulong subRoomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var room = RoomDB.GetRoom(roomId);
            var subRoom = room.SubRooms.FirstOrDefault(sr => sr.SubRoomId == subRoomId);
            
            return Ok(new
            {
                success = true,
                error = (string?)null,
                error_id = (string?)null,
                value = new
                {
                    Assets = Array.Empty<object>(),
                    RoomId = roomId,
                    SnapshotId = snapshotId,
                    SubRoom = new
                    {
                        SubRoomDataSaveId = subRoom?.CurrentSave.SubRoomDataSaveId
                    },
                    SubRoomId = subRoomId,
                    UgcSubVersion = room.UgcSubVersion,
                    UgcVersion = room.UgcVersion
                }
            });
        }
    }
}
