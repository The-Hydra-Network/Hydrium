const express = require("express");
const router = express.Router();

// =========================================================
// GET /rooms
// Orientation / DormRoom bootstrap
// Build: 20231207
// =========================================================

router.get("/rooms", (req, res) => {
    const {name,id,roomId,include,unityAssetTarget,unityAssetVersion
} = req.query;

    console.log("========================================");
    console.log("[ROOMS] Room lookup");
    console.log("[ROOMS] name:", name);
    console.log("[ROOMS] include:", include);
    console.log("[ROOMS] unityAssetTarget:", unityAssetTarget);
    console.log("[ROOMS] unityAssetVersion:", unityAssetVersion);
    console.log("========================================");

    // -----------------------------------------------------
    // ORIENTATION
    // -----------------------------------------------------

     if (name === "Orientation") {
    return res.status(200).json({
        RoomId: 13,
        Name: "Orientation",
        Description:
            "An introductory tour of Rec Room!",
        CreatorAccountId: 2,
        State: 0,
        Accessibility: 1,
        SupportsLevelVoting: false,
        IsRRO: true,
        IsDorm: false,
        SupportsScreens: true,
        SupportsWalkVR: true,
        SupportsTeleportVR: true,
        SupportsVRLow: true,
        SupportsQuest2: true,
        SupportsMobile: true,
        SupportsJuniors: true,
        MaxPlayers: 1,
        CloningAllowed: false,
        DisableRoomComments: true,
        ToxmodEnabled: true,
        UgcVersion: 1,
        PersistenceVersion: 0,
        RankedEntityId: "13",

        SubRooms: [
            {
                SubRoomId: 23,
                RoomId: 13,
                UnitySceneId:
                    "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
                Name: "Home",
                IsSandbox: false,
                MaxPlayers: 1,
                Accessibility: 1
            }
        ],

        Scenes: [
            {
                RoomSceneId: 23,
                RoomId: 13,
                RoomSceneLocationId:
                    "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
                Name: "Home",
                IsSandbox: false,
                MaxPlayers: 1,
                CanMatchmakeInto: true
            }
        ],

        Roles: [],
        Tags: [
            {
                Tag: "rro",
                Type: 0
            }
        ]
    });
}

    // -----------------------------------------------------
    // DORMROOM
    // -----------------------------------------------------

    if (
        name === "DormRoom" ||
        name === "Dorm Room"
    ) {
        return res.status(200).json({
            RoomId: 2,
            Name: "DormRoom",
            IsDormRoom: true,

            UnityAssetId: 1001,
            UnityAssetVersion: 1,
            UnityAssetTarget: Number(unityAssetTarget || 0),

            Capacity: 1,
            MaxCapacity: 1,

            CreatedByPlayerId: Number(include || 0),

            Roles: [],
            Tags: ["dormroom"],

            Settings: {
                IsPublic: false,
                AllowVoiceChat: true,
                AllowTeleport: true
            }
        });
    }

    console.log("[ROOMS] Unknown room:", name);

    return res.status(404).json({
        error: "Room not found",
        room: name
    });
});

// =========================================================
// ORIENTATION ROOM — BUILD 20231207
// =========================================================

const ORIENTATION_ROOM = {
    RoomId: 13,
    Name: "Orientation",
    Description: "An introductory tour of Rec Room!",
    CreatorAccountId: 2,
    ImageName: "Orientation.jpg",

    State: 0,
    Accessibility: 1,
    SupportsLevelVoting: false,

    IsAGRoom: true,
    IsRRO: true,
    IsDorm: false,

    CloningAllowed: false,
    SupportsScreens: true,
    SupportsWalkVR: true,
    SupportsTeleportVR: true,
    SupportsVRLow: true,
    SupportsQuest2: true,
    SupportsMobile: true,
    SupportsJuniors: true,

    MaxPlayers: 1,
    MinLevel: 0,

    DisableRoomComments: true,
    ToxmodEnabled: true,

    UgcVersion: 1,
    PersistenceVersion: 0,

    RankedEntityId: "13",
    ReplicationId: "Orientation",
    ReleaseStatus: 2,

    Scenes: [
        {
            RoomSceneId: 23,
            RoomId: 13,
            RoomSceneLocationId:
                "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

            Name: "Home",
            IsSandbox: false,
            DataBlobName: "",
            MaxPlayers: 1,

            CanMatchmakeInto: true,
            ReplicationId: "Orientation",

            UseLevelBasedMatchmaking: false,
            UseAgeBasedMatchmaking: false,
            UseRecRoyaleMatchmaking: false,

            ReleaseStatus: 2,
            SupportsJoinInProgress: true
        }
    ],

    SubRooms: [
        {
            SubRoomId: 23,
            RoomId: 13,
            UnitySceneId:
                "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

            Name: "Home",
            DataBlob: "",
            IsSandbox: false,
            MaxPlayers: 1,
            Accessibility: 1
        }
    ],

    Roles: [],
    CoOwners: [],
    InvitedCoOwners: [],
    Hosts: [],
    InvitedHosts: [],

    Tags: [
        {
            Tag: "rro",
            Type: 0
        }
    ]
};

// =========================================================
// GET /rooms/bulk?id=13
// Esta rota precisa ficar antes de /rooms/:roomId
// =========================================================

router.get("/rooms/bulk", (req, res) => {
    const rawIds = Array.isArray(req.query.id)
        ? req.query.id
        : String(req.query.id || "").split(",");

    const ids = rawIds
        .map(value => Number(value))
        .filter(Number.isSafeInteger);

    console.log(
        `[ROOMS] Bulk room lookup - ids=${ids.join(",")}`
    );

    const rooms = [];

    if (ids.includes(13)) {
        rooms.push(ORIENTATION_ROOM);
    }

    return res.status(200).json(rooms);
});

// =========================================================
// GET /rooms/13
// =========================================================

router.get("/rooms/:roomId", (req, res) => {
    const roomId = Number(req.params.roomId);

    console.log(
        `[ROOMS] Room requested by ID - roomId=${roomId}`
    );

    if (roomId === 13) {
        return res
            .status(200)
            .json(ORIENTATION_ROOM);
    }

    return res.status(404).json({
        error: "Room not found",
        roomId
    });
});

module.exports = router;