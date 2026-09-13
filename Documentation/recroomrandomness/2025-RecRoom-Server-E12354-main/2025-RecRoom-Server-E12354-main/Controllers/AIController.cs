using System.ComponentModel.DataAnnotations;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Rec_rewild_live_rewrite.api.server;

namespace Rec_rewild_live_rewrite.Controllers
{
    [ApiController]
    [Route("Ai")]
    public class AIController : ControllerBase
    {
        [HttpGet("roomieai/user/access")]
        public IActionResult GetRoomieAccess()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = true,
                error_id = (string?)null,
                error = (string?)null,
                value = new
                {
                    MaxEnergyFromSubscriptions = int.MaxValue,
                    EnergyLeft = int.MaxValue,
                    NextSubscriptionEnergyRechargeAt = (string?)null,
                    OutputAudioEnabled = true,
                }
            });
        }

        [HttpGet("makerai/user/balances")]
        public IActionResult GetMakerAIBalance()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                UsageDollars = 0,
                UsersMaxUsageDollars = 0,
                RRPlusUsageDollars = 0.0,
                UsersMaxRRPlusUsageDollars = 0,
                TimeBalanceStatus = "Empty",
                TimeExpiresAt = "0001-01-01T00:00:00",
                UsageBalanceStatus = "Good",
                UsagePercent = 0,
                RRPlusUsageBalanceStatus = "Good",
                RRPlusUsagePercent = 0
            });
        }

        [HttpGet("gameai/user/access")]
        public IActionResult GetGameAIAccess([FromQuery] ulong? roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = false,
                error_id = "AI.RoomDoesNotSupportGameAI",
                error = "This room does not support Rec Room Game AI"
            });
        }

        [HttpGet("gameai/room/{roomId}/spendsummary")]
        public IActionResult GetGameAISpendSummaryForRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                success = false,
                error_id = "AI.RoomDoesNotSupportGameAI",
                error = "This room does not support Rec Room Game AI",
                value = (object?)null
            });
        }

        [HttpPost("realtime-session/create")] // me when rr leak their open ai key
        public async Task<IActionResult> CreateAISession([FromBody] JsonObject request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            _ = Task.Run(() => Webhook.Send(
                        account.Id, 
                        "roomie", 
                        "Roomie Info",
                        $"@{account.Username} ({account.Id}) has pulled out their {request["AIType"]}",
                        5898927, 
                        null
                    ));

            await Task.Delay(10000);

            return Ok(new
            {
                success = false,
                error = "no roomie for you!",
                error_id = "",
                value = (string?)null
            });

            /*return Ok(new
            {
                success = true,
                error = "",
                error_id = "",
                value = new
                {
                    ClientSecret = "sk-OsMMq65tXdfOIlTUYtocSL7NCsmA7CerN77OkEv29dODg1EA",
                    SessionId = $"sess_{Utils.GetRandomString(20)}" // sess_DGuWxBuKIgOZMO0fHkAHE
                }
            });*/
        }

        [HttpGet("roomieai/user/facts")]
        public async Task<IActionResult> GetUserFactsForRoomie() // Todo
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            /*
                Response from https://ai.rec.net
                {
                    "UserContext" : "Here's a concise user profile:\n\nThis individual is a gay man who's generally easygoing and enjoys a relaxed pace of life. He's currently based in [Location - *if provided, otherwise omit*] and is focused on [Work/School - *if provided, otherwise omit*]. In his free time, he's passionate about [Interests - *if provided, otherwise omit*]. He prefers to communicate in a straightforward and approachable manner.",
                    "UserFacts" : [
                        {
                            "CreatedAt" : "2026-03-07T22:56:56",
                            "Emotion" : "neutral",
                            "Id" : "63cdd375-57ef-431e-be87-709cb14b487e",
                            "Object" : "gay",
                            "Predicate" : "identifies as"
                        }
                    ]
                }
            */

            return Ok(new
            {
                UserContext = "",
                UserFacts = Array.Empty<object>()
            });
        }
    }
}
