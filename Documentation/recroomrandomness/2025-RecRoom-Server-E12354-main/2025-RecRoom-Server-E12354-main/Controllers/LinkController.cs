using LiteDB;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server.Classes;

namespace Rec_rewild_live_rewrite.Controllers
{
    [ApiController]
    [Route("link")]
    public class LinkController : ControllerBase
    {
        [HttpPost("actionlink")]
        public ContentResult CreateActionLink()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;
            // data={"ExtraJson":"{"RoomId":9,"SubRoomId":10}","Platform":0,"Type":2}&validHours=2160&codeType=2&extraDataId=9

            var data = Request.Form["data"].ToString();
            var validHours = int.TryParse(Request.Form["validHours"], out var vh) ? vh : 24;
            var codeType = int.TryParse(Request.Form["codeType"], out var ct) ? (LinkType)ct : LinkType.Unknown;
            var extraDataId = int.TryParse(Request.Form["extraDataId"], out var edid) ? edid : 0;

            var link = new ActionLink
            {
                creatorPlayerId = account.Id, 
                data = data,
                CodeType = codeType,
                ValidHours = vh,
                ExtraDataId = edid,
                isValid = true,
            };

            var actionlink = LinkDB.Insert(link);
            string url = $"{Request.Scheme}://{Request.Host}";
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = true,
                    error = "",
                    value = url + "/link?code=" + actionlink.LinkId
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpGet("actionlink/{link}")]
        public ContentResult GetActionLink(string link)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            var found = LinkDB.Get(link);
            if (found == null)
            {
                return new ContentResult
                { 
                    Content = "", 
                    ContentType = "application/json",
                    StatusCode = 404,
                };
            }

            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(found),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        [HttpPost("actionlink/{link}/consume")]
        public ContentResult ConsumeActionLink(string link)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string formlink = Request.Form["id"].ToString(); // should be the same as link param
            string codeTypestring = Request.Form["codeType"].ToString(); // enum
            string newPlayer = Request.Form["newPlayer"].ToString(); // Can be False or True
            string newInstall = Request.Form["newInstall"].ToString(); // Can be False or True
            LinkType CodeType;

            if (int.TryParse(codeTypestring, out int numericValue))
            {
                if (Enum.IsDefined(typeof(LinkType), numericValue))
                {
                    CodeType = (LinkType)numericValue;
                }
                else
                {

                }
            }
            // Welp. This is very crappy. Redo this code when the game actually wants it.
            var player = PlayerDB.GetInfluencerByCreatorCode(link);
            if (player != null)
            {
                PlayerDB.SupportInfluencer(account.Id, player.player.Id);
            }

            return new ContentResult
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
    }
}
