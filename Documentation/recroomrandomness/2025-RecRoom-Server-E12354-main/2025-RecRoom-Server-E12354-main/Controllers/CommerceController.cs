using Microsoft.AspNetCore.Mvc;
using Rec_rewild_live_rewrite.api.server;

namespace Rec_rewild_live_rewrite.Controllers
{
    [Route("Commerce")]
    public class CommerceController : Controller
    {
        [HttpGet("purchasecampaign/allcurrent/v2")]
        public IActionResult GetAllCurrentPurchaseCampaignsV2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpPost("purchase/v1/cleanuppending")]
        public IActionResult CleanUpPendingPurchases()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("api/catalog/v1/all")]
        public async Task<IActionResult> GetAllCatalogItemsV1(bool onlyAvailableSkus = true)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "AllCatalog.json");
            string content = await System.IO.File.ReadAllTextAsync(path);
            return Ok(content);
        }

        [HttpGet("reminder/currentTokenBundles/v2")]
        public IActionResult GetCurrentTokenBundlesV2()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("purchaseRestriction/isplayerrestricted")]
        public IActionResult IsPlayerRestricted()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Content("false", "application/json");
        }
    }
}
