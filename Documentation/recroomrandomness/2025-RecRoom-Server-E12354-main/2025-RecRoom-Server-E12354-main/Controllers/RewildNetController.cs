using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.dbs;
using Newtonsoft.Json.Linq;

namespace Rec_rewild_live_rewrite.Controllers
{
    public class RewildNetController : Controller
    {
        [Route("/rewild_net/online_players")]
        public ContentResult online_players()
        {
            return new ContentResult
            {
                Content = System.IO.File.ReadAllText("Web\\Rewild_Net\\OnlinePlayers.html"),
                ContentType = "text/html"
            };
        }

        [Route("/rewild_net/home")]
        public ContentResult RewildNetHome()
        {
            try
            {
                string authtoken = HttpContext.Request.Headers["Authorization"].ToString();

                if (string.IsNullOrEmpty(authtoken))
                {
                    authtoken = HttpContext.Request.Cookies["Authorization"];
                }

                if (string.IsNullOrEmpty(authtoken))
                {
                    Redirect("/rewild_net/login");
                }

                string playerdata = ClientSecurity.DecodeToken(authtoken);

                if (playerdata == null)
                    Redirect("/rewild_net/login");
                if (playerdata.Contains("error_token"))
                    Redirect("/rewild_net/login");

                player_info? account = JsonConvert.DeserializeObject<player_info>(playerdata);

                return new ContentResult
                {
                    Content = System.IO.File.ReadAllText("Web\\Rewild_Net\\Home.html"),
                    ContentType = "text/html"
                };
            }
            catch
            {
                return new ContentResult
                {
                    Content = System.IO.File.ReadAllText("Web\\Rewild_Net\\Login.html"),
                    ContentType = "text/html"
                };
            }
        }

        [Route("/rewild_net/login")]
        public ContentResult login()
        {
            return new ContentResult
            {
                Content = System.IO.File.ReadAllText("Web\\Rewild_Net\\Login.html"),
                ContentType = "text/html"
            };
        }

        [Route("/rewild_net/logout")]
        public ContentResult logout()
        {
            Response.Cookies.Append("Authorization", "", new Microsoft.AspNetCore.Http.CookieOptions
            {
                Expires = DateTime.Now,
                HttpOnly = true,
                Secure = true,
                SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict
            });
            return new ContentResult
            {
                Content = System.IO.File.ReadAllText("Web\\Rewild_Net\\Login.html"),
                ContentType = "text/html"
            };
        }


        /*[HttpPost("/api/login")]
        public ContentResult Login()
        {
            try
            {
                string? username = Request.Form["username"];
                string? password = Request.Form["password"];


                if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
                {
                    return new ContentResult
                    {
                        Content = "Your username or password is empty, please enter a username and password",
                        ContentType = "text/html"
                    };
                }


                var loginResult = PlayerDB.GetAccountPassword(username, password);

                if (loginResult == null)
                {
                    return new ContentResult
                    {
                        Content = "Invalid password or username, please use your @ name to login.",
                        ContentType = "text/html"
                    };
                }

                account_login<account_data> temp = PlayerDB.GetAccountPassword(username, password);

                string token = ClientSecurity.RefreshToken_Web(temp.Value.accountId);

                Response.Cookies.Append("Authorization", token, new Microsoft.AspNetCore.Http.CookieOptions
                {
                    Expires = DateTime.Now.AddDays(1),
                    HttpOnly = true,
                    Secure = true,
                    SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict
                });

                Response.Redirect($"/rewild_net/home");

                return new ContentResult
                {
                    Content = JsonConvert.SerializeObject(temp),
                    ContentType = "text/html"
                };
            }
            catch
            {
                return new ContentResult
                {
                    Content = "Invalid username or password. Please try again.",
                    ContentType = "text/html"
                };
            }
        }*/

        [HttpGet("/api/images/v3/feed/global")]
        public ContentResult GetGlobalFeedImages()
        {
            var images = ImageMetadataDB.GetGlobalImages();
            return new ContentResult
            {
                Content = JsonConvert.SerializeObject(images),
                ContentType = "application/json",
                StatusCode = 200
            };
        }
    }
}
