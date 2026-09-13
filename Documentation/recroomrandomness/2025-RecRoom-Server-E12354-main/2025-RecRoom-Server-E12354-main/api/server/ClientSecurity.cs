using System.Security.Cryptography;
using System.Text;
using JWT;
using JWT.Algorithms;
using JWT.Exceptions;
using JWT.Serializers;
using Newtonsoft.Json;
using Rec_rewild_live_rewrite.api.dbs;
using Rec_rewild_live_rewrite.api.server.Classes;
using Rec_rewild_live_rewrite.api.server.Classes.db_class;

namespace Rec_rewild_live_rewrite.api.server;

public class ClientSecurity
{

    public static string key = ConfigRewild.Key;

    public static string CreateToken(ulong userId, List<string> roles, string request_url, Platforms platform)
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new Dictionary<string, object>
        {
            { "sub", userId },
            { "role", roles },
            { "iat", now.ToUnixTimeSeconds() },
            { "iss", $"{request_url}" },
            { "client_id", $"recnet" },
            { "exp", now.AddHours(24).ToUnixTimeSeconds() },
            { "platform", platform }
        };

        IJwtAlgorithm algorithm = new HMACSHA256Algorithm();
        IJsonSerializer serializer = new JsonNetSerializer();
        IBase64UrlEncoder urlEncoder = new JwtBase64UrlEncoder();
        IJwtEncoder encoder = new JwtEncoder(algorithm, serializer, urlEncoder);

        return encoder.Encode(payload, key);
    }

    public static string Createphotonacesstoken(ulong userId)
    {
        var now = DateTimeOffset.UtcNow;
        var heartbeat = HeartbeatDB.GetPlayerHeartbeat(userId);
        string photonRoomId = heartbeat.roomInstance.photonRoomIdYeee ?? "recrewild2025";
        var payload = new Dictionary<string, object>
        {
            { "sub", userId.ToString() },
            { "scope", "makerpen" },
            { "aud", photonRoomId },
        };

        IJwtAlgorithm algorithm = new HMACSHA256Algorithm();
        IJsonSerializer serializer = new JsonNetSerializer();
        IBase64UrlEncoder urlEncoder = new JwtBase64UrlEncoder();
        IJwtEncoder encoder = new JwtEncoder(algorithm, serializer, urlEncoder);

        return encoder.Encode(payload, key);
    }

    public static string Createphotonauthtoken(ulong userId)
    {
        var now = DateTimeOffset.UtcNow;
        var heartbeat = HeartbeatDB.GetPlayerHeartbeat(userId);
        string photonRoomId = heartbeat.roomInstance.photonRoomIdYeee ?? "recrewild2025";
        var payload = new Dictionary<string, object>
        {
            { "sub", userId.ToString() },
            { "rn.platid", "76561199000000000" },
            { "rn.plat", "0" },
            { "rn.deviceclass", "2" },
            { "rn.env", "prod" },
            { "exp", "1754316353" },
            { "aud", photonRoomId },
        };

        IJwtAlgorithm algorithm = new HMACSHA256Algorithm();
        IJsonSerializer serializer = new JsonNetSerializer();
        IBase64UrlEncoder urlEncoder = new JwtBase64UrlEncoder();
        IJwtEncoder encoder = new JwtEncoder(algorithm, serializer, urlEncoder);

        return encoder.Encode(payload, key);
    }

    public static string RefreshToken(string temp_val, ulong accid, int platform, ulong platform_id, ulong ticketid, string request_url, Platforms currentplatform)
    {
        var account = PlayerDB.getfullaccount_token(accid, ticketid, 0);
        if (account == null)
            return "";

        List<string> roles = new List<string> { "gameclient" };
        if ((account.dev_Flag & DevFlag.dev) == DevFlag.dev)
        {
            roles.Add("developer");
            roles.Add("moderator");
            roles.Add("screenshare");
        }
        if (account.player.Id == 314)
        {
            roles.Add("developer");
            roles.Add("moderator");
            roles.Add("screenshare");
        }

        return CreateToken(accid, roles, request_url, currentplatform);
    }


    public static string RefreshToken_Web(ulong userId)
    {
        var account = PlayerDB.GetFullAccount(userId);
        if (account == null)
            return "";

        List<string> roles = new List<string> { "gameclient" };
        if ((account.dev_Flag & DevFlag.dev) == DevFlag.dev)
        {
            roles.Add("developer");
            roles.Add("moderator");
            roles.Add("screenshare");
        }

        var now = DateTimeOffset.UtcNow;
        var payload = new Dictionary<string, object>
        {
            { "sub", userId },
            { "role", roles },
            { "iat", now.ToUnixTimeSeconds() },
            { "exp", now.AddDays(30).ToUnixTimeSeconds() },
            { "iss", "https://recrewild.oldrec.net" }
        };

        string key = ClientSecurity.key;
        IJwtAlgorithm algorithm = new HMACSHA256Algorithm();
        IJsonSerializer serializer = new JsonNetSerializer();
        IBase64UrlEncoder urlEncoder = new JwtBase64UrlEncoder();
        IJwtEncoder encoder = new JwtEncoder(algorithm, serializer, urlEncoder);
        string tokenString = encoder.Encode(payload, key);

        return tokenString;
    }
    public static string HashPassword(string password)
    {
        using (var rng = new RNGCryptoServiceProvider())
        {
            byte[] salt = new byte[16];
            rng.GetBytes(salt);

            using (var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100_000, System.Security.Cryptography.HashAlgorithmName.SHA256))
            {
                byte[] hash = pbkdf2.GetBytes(32);
                byte[] hashBytes = new byte[48];
                Array.Copy(salt, 0, hashBytes, 0, 16);
                Array.Copy(hash, 0, hashBytes, 16, 32);
                return Convert.ToBase64String(hashBytes);
            }
        }
    }

    public static bool VerifyPassword(string enteredPassword, string storedHash)
    {
        byte[] hashBytes = Convert.FromBase64String(storedHash);
        byte[] salt = new byte[16];
        Array.Copy(hashBytes, 0, salt, 0, 16);

        using (var pbkdf2 = new Rfc2898DeriveBytes(enteredPassword, salt, 100_000, System.Security.Cryptography.HashAlgorithmName.SHA256))
        {
            byte[] hash = pbkdf2.GetBytes(32);
            for (int i = 0; i < 32; i++)
            {
                if (hashBytes[i + 16] != hash[i])
                    return false;
            }
            return true;
        }
    }

    public static string DecodeToken(string token)
    {
        if (string.IsNullOrEmpty(token))
            return "error_token_not_found";

        string tokenString = token.Replace("Bearer ", "");

        try
        {
            IJsonSerializer serializer = new JsonNetSerializer();
            IDateTimeProvider provider = new UtcDateTimeProvider();
            IJwtValidator validator = new JwtValidator(serializer, provider);
            IBase64UrlEncoder urlEncoder = new JwtBase64UrlEncoder();
            IJwtAlgorithm algorithm = new HMACSHA256Algorithm();
            IJwtDecoder decoder = new JwtDecoder(serializer, validator, urlEncoder, algorithm);

            var jsonPayload = decoder.Decode(tokenString, key, verify: true);
            var payload = JsonConvert.DeserializeObject<Dictionary<string, object>>(jsonPayload);

            if (payload.TryGetValue("exp", out var expObj))
            {
                var expUnix = Convert.ToInt64(expObj);
                var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (nowUnix > expUnix)
                {
                    return "error_token_expired";
                }
            }
            else
            {
                return "error_token_no_expiration";
            }


            if (payload.TryGetValue("sub", out var subObj))
            {
                if (ulong.TryParse(subObj.ToString(), out ulong userId))
                {
                    var playerData = PlayerDB.GetAccountById(userId);
                    if (playerData != null)
                    {
                        Console.WriteLine($"player username: {playerData.Username}");
                        return JsonConvert.SerializeObject(playerData);
                    }
                    else
                    {
                        Console.WriteLine($"player not found: {userId}");
                        return "error_token_user_not_found";
                    }
                }
                else
                {
                    return "error_token_invalid_sub";
                }
            }
            else
            {
                return "error_token_no_sub";
            }
        }
        catch (SignatureVerificationException)
        {
            return "error_token_tampered";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error decoding token: {ex.Message}");
            return "error_token";
        }
    }


    public static byte[] GetHash(string inputString)
    {
        using (HashAlgorithm algorithm = SHA256.Create())
            return algorithm.ComputeHash(Encoding.UTF8.GetBytes(inputString));
    }

    public static string GetHashString(string inputString)
    {
        StringBuilder sb = new StringBuilder();
        foreach (byte b in GetHash(inputString))
            sb.Append(b.ToString("X2"));

        return sb.ToString();
    }

    private static Random random = new Random();

    public static string RandomString(int length)
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        return new string(Enumerable.Repeat(chars, length)
            .Select(s => s[random.Next(s.Length)]).ToArray());
    }
}