using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.server;
using Rec_rewild_live_rewrite.api.server.Classes;

namespace Rec_rewild_live_rewrite.Controllers
{
    [ApiController]
    public class EconController : ControllerBase
    {
        [HttpGet("/econ/customAvatarItems/v1/owned")]
        public IActionResult OwnedCustomAvatarItems()
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            string path = Path.Combine(Environment.CurrentDirectory, "Data", "APIS", "customitems.json");
            var stream = System.IO.File.OpenRead(path);

            return new FileStreamResult(stream, "application/json");
        }

        [HttpGet("/econ/roomInventory/room/{roomId}")]
        public IActionResult GetRoomInventoryForRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/econ/roomInventory/room/{roomId}/player")]
        public IActionResult GetRoomInventoryForPlayer(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/econ/roomInventoryItemTags/room/{roomId}")]
        public IActionResult GetRoomInventoryItemTagsForRoom(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/econ/roomEconConfig/{roomId}")]
        public IActionResult GetRoomEconConfig(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                RoomId = roomId,
                EnableSortingTabs = false
            });
        }

        [HttpGet("/econ/roomOffer/room/{roomId}")]
        public IActionResult GetRoomOffer(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpGet("/econ/roomOffer/room/{roomId}/purchaseCounts")]
        public IActionResult GetRoomOfferPurchaseCounts(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                value = Array.Empty<object>(),
                success = true
            });
        }

        [HttpGet("/econ/roomGiftDropShops/room/{roomId}")]
        public IActionResult GetRoomGiftDropShops(ulong roomId)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(ConfigRewild.Bracket);
        }

        [HttpPost("/econ/roomInventory/v2/award")]
        public IActionResult AwardRoomInventory([FromBody] List<AwardRoomInventoryRequest> request)
        {
            var (account, error) = AuthHelper.ValidateToken(HttpContext);
            if (error != null)
                return error;

            return Ok(new
            {
                Result = 0,
                PlayerRoomInventoryItem = new
                {
                    AccountId = account.Id,
                    RoomInventoryItemId = request.FirstOrDefault().RoomInventoryItemOriginId,
                    RoomId = request.FirstOrDefault().RoomId,
                    RoomInventoryItemOriginId = request.FirstOrDefault().RoomInventoryItemOriginId,
                    Count = 0,
                    ConcurrencyCode = request.FirstOrDefault().ConcurrencyCodes.NewConcurrencyCode,
                    FirstReceivedAt = DateTime.UtcNow,
                    ModifiedAt = DateTime.UtcNow,
                    QuantityAwarded = request.FirstOrDefault().Quantity
                }
            });
        }

        public class AwardRoomInventoryRequest
        {
            public ConcurrencyCodes ConcurrencyCodes { get; set; }
            public int Quantity { get; set; }
            public ulong RoomId { get; set; }
            public string RoomInventoryItemOriginId { get; set; }
        }

        public class ConcurrencyCodes
        {
            public string? CurrentConcurrencyCode { get; set; }
            public string? NewConcurrencyCode { get; set; }
        }
    }
}
