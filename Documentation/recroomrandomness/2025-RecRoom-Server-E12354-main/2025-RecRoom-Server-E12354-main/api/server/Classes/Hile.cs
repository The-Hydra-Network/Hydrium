namespace Rec_rewild_live_rewrite.api.server.Classes
{
    public class Hile
    {
        public enum HileTypes
        {
            Obscured = 0,
            Time = 1,
            Inject = 2,
            GiftCount = 3,
            Engine = 4,
            UnknownDll = 5,
            ImageSignature = 6,
            AvatarHack = 7,

            NetworkCertificatePublicKey = 100,
            NetworkCertificateIssuer = 101,
            NetworkCertificateMissing = 102,
            NetworkCertificateMismatch = 103,

            AutosaveChecksumMismatch = 150,
            AutosaveSubRoomIdMismatch = 151,
            AutosaveChecksumException = 152,

            Photon_MissingHash = 200,
            Photon_CorruptHash = 201,
            Photon_DifferentHash = 203,

            AppData_Runtime_LengthMismatch = 300,
            AppData_Runtime_LastWriteTimeMismatch = 301,
            AppData_Runtime_FileModified = 302,

            AppData_Boot_InvalidSignature = 310,
            AppData_Boot_UnableToVerifySignatures = 311,

            Config_MissingHash = 320,
            Config_DifferentHash = 321,

            Photon_InstantiateTool = 400,

            Memory_Hash_Mismatch = 500,

            Driver_Invalid_Signature = 600
        }
    }
}
