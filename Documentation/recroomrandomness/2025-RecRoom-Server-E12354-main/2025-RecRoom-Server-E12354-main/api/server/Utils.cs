using System;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using static Rec_rewild_live_rewrite.api.server.Classes.db_class.EventDBClasses;

namespace Rec_rewild_live_rewrite.api.server
{

    public class Utils
    {
        private static readonly Random rng = new Random();
        private static readonly char[] _chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray();
        private static readonly byte[] Key = Convert.FromBase64String("f8Z7Xgkz7PzBvZ93YjNfYpNfwysNMLA5xkKYY+6IE1s=");
        private static readonly byte[] IV = Convert.FromBase64String("GxCptCkqNh8W2MnA7bAYzA==");

        public static string EncryptAes(string plainText)
        {
            using var aes = Aes.Create();
            aes.Key = Key;
            aes.IV = IV;
            using var encryptor = aes.CreateEncryptor();
            using var ms = new MemoryStream();
            using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
            using (var sw = new StreamWriter(cs))
                sw.Write(plainText);
            return Convert.ToBase64String(ms.ToArray());
        }

        public static string DecryptAes(string encryptedBase64)
        {
            using var aes = Aes.Create();
            aes.Key = Key;
            aes.IV = IV;
            using var decryptor = aes.CreateDecryptor();
            using var ms = new MemoryStream(Convert.FromBase64String(encryptedBase64));
            using var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read);
            using var sr = new StreamReader(cs);
            return sr.ReadToEnd();
        }

        public static int Next(int min, int max)
        {
            byte[] randomBytes = new byte[4];
            RandomNumberGenerator.Fill(randomBytes);
            int secureRandomNumber = BitConverter.ToInt32(randomBytes, 0);
            while (secureRandomNumber < min && secureRandomNumber >= max)
            {
                secureRandomNumber = BitConverter.ToInt32(randomBytes, 0);
            }
            int randomNumber = Guid.NewGuid().ToByteArray().Sum(b => b) % max;
            while (randomNumber < min && randomNumber >= max)
            {
                randomNumber = Guid.NewGuid().ToByteArray().Sum(b => b) % max;
            }
            int randomNumber1 = Math.Abs(Environment.TickCount % max);
            int output = randomNumber1 + randomNumber + secureRandomNumber;
            output = Math.Min(output, min);
            output = Math.Max(output, max);
            return output;
        }

        public static string GenerateShortCode(int length = 6)
        {
            return new string(Enumerable.Range(0, length)
                .Select(_ => _chars[rng.Next(_chars.Length)]).ToArray());
        }
        public static string GetRandomString(int len = 16)
        {
            const string chars = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789";
            return new string(Enumerable.Repeat(chars, len)
                .Select(s => s[rng.Next(s.Length)]).ToArray());
        }


        public static int IndexOf(byte[] haystack, byte[] needle, int startIndex = 0)
        {
            for (int i = startIndex; i <= haystack.Length - needle.Length; i++)
            {
                bool match = true;
                for (int j = 0; j < needle.Length; j++)
                {
                    if (haystack[i + j] != needle[j])
                    {
                        match = false;
                        break;
                    }
                }
                if (match)
                    return i;
            }
            return -1;
        }

        public static byte[]? ParseData(byte[] data, string fieldName, out bool parsed)
        {
            parsed = false;

            try
            {
                var boundaryStart = Encoding.ASCII.GetString(data, 0, Math.Min(200, data.Length))
                    .Split('\n')[0]
                    .Trim();

                if (string.IsNullOrEmpty(boundaryStart))
                {
                    Console.WriteLine("Failed to detect boundary");
                    return null;
                }

                string boundary = boundaryStart;
                string header = $"name=\"{fieldName}\"";
                int headerIndex = Utils.IndexOf(data, Encoding.ASCII.GetBytes(header));

                if (headerIndex == -1)
                {
                    Console.WriteLine($"Field {fieldName} not found in multipart data");
                    return null;
                }

                int startOfFile = IndexOf(data, new byte[] { 13, 10, 13, 10 }, headerIndex); 
                if (startOfFile == -1)
                {
                    Console.WriteLine("Malformed multipart content, missing CRLF after headers");
                    return null;
                }

                startOfFile += 4;

                byte[] boundaryBytes = Encoding.ASCII.GetBytes("\r\n" + boundary);
                int endOfFile = Utils.IndexOf(data, boundaryBytes, startOfFile);
                if (endOfFile == -1)
                {
                    Console.WriteLine("Failed to locate boundary end");
                    return null;
                }

                int fileLength = endOfFile - startOfFile;
                if (fileLength <= 0)
                {
                    Console.WriteLine("File length invalid");
                    return null;
                }

                byte[] fileBytes = new byte[fileLength];
                Buffer.BlockCopy(data, startOfFile, fileBytes, 0, fileLength);

                parsed = true;
                return fileBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Images.ParseData] Exception: {ex}");
                parsed = false;
                return null;
            }
        }

        public static ContentResult Error(string error)
        {
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    success = false,
                    error = error,
                    value = (string?)null
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }
        public static ContentResult ErrorRoom(string errorId, string error)
        {
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Success = false,
                    Value = (string?)null,
                    ErrorId = errorId,
                    Error = error,
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        public static ContentResult ErrorEvent(EventResults errorresult)
        {
            return new ContentResult()
            {
                Content = JsonConvert.SerializeObject(new
                {
                    Result = errorresult,
                    TagModifyResult = (string?)null,
                    PlayerEvent = (string?)null,
                }),
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        public static List<string> Nouns = new List<string>()
        {
            "Erm", "Admin", "AuraPoints", "Fortniter", "RecCon", "Bat", "Bear", "Bee", "Buffalo", "Butterfly",
            "Capybara", "Cat", "Caterpillar", "Chameleon", "Cheetah", "Chicken", "Chimpanzee", "Cobra", "Coyote",
            "Crane", "Cricket", "Crow", "Deer", "Boi", "Dolphin", "Donkey", "Windows98", "pingul", "Eagle", "Echidna",
            "Elephant", "Elk", "dic", "Ferret", "Flamingo", "Fish", "memey", "Frog", "Gazelle", "Giraffe", "e12354",
            "Meme", "GorillaTag", "Hamster", "Jit", "Hippo", "Horse", "Hyena", "Iguana", "Jumbotron", "Jellyfish",
            "Gyat", "Kitten", "Top10BestFeet", "Youtube", "mac_os", "AAAAAAAAAA", "Blud", "Llama", "RecNet", "Monkey",
            "Moose", "Mouse", "Mule", "Newt", "VBucks", "Opposum", "Ostrich", "Otter", "Owl", "Oyster", "Panda",
            "Panther", "Parrot", "Penguin", "P34", "Pigeon", "Piranha", "Platypus", "Pony", "Minecraft", "Puppy",
            "Quail", "Emo", "bena.png", "Salmon", "Scorpion", "Seal", "Shark", "Sheep", "Sloth", "Snail", "Bozo",
            "Squirrel", "urmum", "NintendoSwitch", "Wii", "wat_time", "Roach", "Turtle", "Turkey", "Wii_U", "helpme",
            "Walrus", "Whale", "Github", "Yes_fade", "Zone"
        };

        public static List<string> Adjectives = new List<string>()
        {
            "Adorable", "BitCoin", ":3", "Underground", "Aimless", "Alert", "FanumTaxed", "Alone", "Broken",
            "Beautiful", "Bored", "Brave", "Scratched", "Busy", "Calm", "Carefree", "Careless", "Caring", "Charming",
            "Cheerful", "Clever", "Clumsy", "Bugcrowd", "Cowardly", "Cozy", "Crabby", "Cranky", "Crawling",
            "Creaky", "Creative", "Crispy", "DexCryptic", "Doxxed", "Delightful", "Determined", "Burning", "Dull",
            "Eager", "Elated", "Emotional", "Enchanting", "Encouraging", "Endless", "Energetic", "Enthusiastic",
            "Excited", "FNAF", "Fantastic", "Fastidious", "Fine", "Fluttering", "Fragrant",
            "Friendly", "AAAAAAAAA", "Funny", "Fussy", "Fuzzy", "Generous", "Gentle", "Drunk", "Splooty", "Glorious",
            "Glowing", "Good", "Grand", "Great", "Greedy", "Grimy", "Happy", "Hardworking", "Hasty", "Healthy",
            "Heavy", "Helpful", "Hilarious", "Hopeful", "Icy", "Important", "Inquisitive", "Jolly", "Joyful",
            "Joyous", "Kind", "Lazy", "Lively", "Loud", "Lovely", "Loyal", "Lucky", "Luminous", "Lumpy", "Majestic",
            "Meek", "Melodic", "Mighty", "Moody", "Nice", "Nimble", "Odd", "Optimistic", "Perfect", "Pervasive",
            "Pleasant", "Plucky", "Plush", "Polite", "Practical", "Proud", "Quick", "Quiet", "Rapid", "Redolent",
            "Reliable", "Relieved", "Royal", "Skid", "Scared", "Hangar", "Sensible", "Sensitive", "Shining",
            "Shrill", "Silly", "Sincere", "Sizzling", "Sleepy", "Smiling", "Smooth", "Snug", "Soaring", "Sparkling",
            "Speedy", "Spiky", "Splendid", "Spoiled", "Steaming", "Still", "Strict", "Stuffed", "Sturdy",
            "Successful", "Surprised", "Swift", "Taciturn", "Tense", "Gay", "Trans", "Thrifty", "Tough",
            "Tricky", "Godly", "Twerking", "Racist", "Rec", "Victorious", "Wild", "Wise", "W",
            "Wonderful", "Worried", "Skibidi", "Zesty", "Zealous", "Skibiti", "Hot"
        };

        public static List<string> imgs = new List<string>()
        {
            "DefaultProfileImage"
            /*"DefaultImg.png",
            "DefaultImgPink.png",
            "DefaultImgPurple.png",
            "DefaultImgRed.png",
            "DefaultImgRainbow.png",
            "DefaultImgGreen.png",
            "DefaultImgOrange.png",
            "DefaultImgYellow.png",
            "DefaultImgLight.png"*/
        };

        public static string GetRandomName()
        {
            string adjective = Adjectives[rng.Next(Adjectives.Count)];
            string noun = Nouns[rng.Next(Nouns.Count)];
            int number = rng.Next(1000, 9999);
            return adjective + noun + number;
        }
        
        public static string GetRandomImageName()
        {
            string img = imgs[rng.Next(imgs.Count)];
            return img;
        }
    }
}
