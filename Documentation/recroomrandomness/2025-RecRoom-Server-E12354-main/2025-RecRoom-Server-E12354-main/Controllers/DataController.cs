using System.Text;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("/data/")]
    public class DataController : ControllerBase
    {
        [HttpPost("event")]
        public IActionResult CollectEvent()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok();
        }

        [HttpPost("heartbeat")]
        public IActionResult CollectHeartbeat()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok();
        }
    }
}
