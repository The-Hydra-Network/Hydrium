using System.Security.Principal;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;

public static class AuthHelper
{
    public static (player_info? account, ContentResult? error) ValidateToken(HttpContext httpContext)
    {
        string token = httpContext.Request.Headers["Authorization"].ToString();
        string playerData = ClientSecurity.DecodeToken(token);

        if (string.IsNullOrEmpty(playerData) || playerData.StartsWith("error_"))
        {
            return (null, new ContentResult
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 401
            });
        }


        player_info account = JsonConvert.DeserializeObject<player_info>(playerData);
        return (account, null);
    }

    public static (player_info? account, ContentResult? error) ValidateTokenDev(HttpContext httpContext)
    {
        string? temp2 = httpContext.Request.Cookies["Authorization"];
        string playerData = ClientSecurity.DecodeToken(temp2);
        if (string.IsNullOrEmpty(playerData) || playerData.StartsWith("error_"))
        {
            return (null, new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 401
            });
        }

        player_info account = JsonConvert.DeserializeObject<player_info>(playerData);

        bool flag = PlayerDB.CheckDevFlag(account.Id);
        if (!flag)
            return (null, new ContentResult()
            {
                Content = "",
                ContentType = "application/json",
                StatusCode = 401
            });


        return (account, null);
    }
}
