using System.Runtime.CompilerServices;

namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class CustomAvatarItems
    {
        public List<object>? Results { get; set; }
        public int TotalResults { get; set; }
    }

    public class CreateCustomAvatarItemResponse
    {
        // {"name":"eeeeeeeeeeeeeeeeeeeee","Description":"eawwwwwwwwwwweweawewaewa","Price":1000,"BaseAvatarItemId":2184,"BaseAvatarItemColor":"#F55C1A","Accessibility":1}
        public string? Name { get; set; } // Custom shirt name 
        public string? Description { get; set; } // Custom shirt description
        public int Price { get; set; } // This range from 1000 to 10,000
        public int BaseAvatarItemId { get; set; } // the avatar id from the avatar db
        public string? BaseAvatarItemColor { get; set; } // Hex color code default is #F55C1A
        public int Accessibility { get; set; } // enum 0 for me only, 1 for everyone
    }
}
