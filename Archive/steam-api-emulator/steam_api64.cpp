// steam_api64.cpp
// Build: cl /O2 /LD steam_api64.cpp /OUT:steam_api64.dll
//
// Minimal Steam emulator for Rec Room.
// Intercepts SteamAPI_Init() and returns true.
// Stubs all interfaces Rec Room might call.

#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>


// ============================================================
// Steam Types
// ============================================================

typedef uint64_t CSteamID;
typedef uint32_t HSteamPipe;
typedef uint32_t HSteamUser;
typedef uint32_t SteamAPICall_t;


// ============================================================
// Debug logging
// ============================================================

static FILE* g_log = nullptr;


static void Log(const char* text)
{
    if (!g_log)
        g_log = fopen("steam_api64.log", "a");

    if (g_log)
    {
        fprintf(g_log, "%s\n", text);
        fflush(g_log);
    }
}


// ============================================================
// Steam Objects
// ============================================================

struct SteamObject
{
    void* vtable;
};


// ============================================================
// ISteamUser
// ============================================================

struct ISteamUser_VTable
{
    void* pad[7];

    CSteamID (*GetSteamID)(void*);
};


static CSteamID SteamUser_GetSteamID(void*)
{
    Log("ISteamUser::GetSteamID");

    return 76561198000000000ULL;
}


static ISteamUser_VTable g_user_vtable =
{
    {
        0,0,0,0,0,0,0
    },

    SteamUser_GetSteamID
};


static SteamObject g_user =
{
    &g_user_vtable
};


// ============================================================
// ISteamFriends
// ============================================================

struct ISteamFriends_VTable
{
    void* pad[41];

    const char* (*GetPersonaName)(void*);
};


static const char* SteamFriends_GetPersonaName(void*)
{
    Log("ISteamFriends::GetPersonaName");

    return "Player";
}


static ISteamFriends_VTable g_friends_vtable =
{
    {
        0
    },

    SteamFriends_GetPersonaName
};


static SteamObject g_friends =
{
    &g_friends_vtable
};


// ============================================================
// ISteamApps
// ============================================================

struct ISteamApps_VTable
{
    void* pad[7];

    bool (*BIsSubscribedApp)(void*, uint32_t);

    void* pad2[20];

    const char* (*GetCurrentGameLanguage)(void*);
};


static bool SteamApps_BIsSubscribedApp(void*, uint32_t)
{
    Log("ISteamApps::BIsSubscribedApp");

    return true;
}


static const char* SteamApps_GetLanguage(void*)
{
    return "english";
}


static ISteamApps_VTable g_apps_vtable =
{
    {
        0,0,0,0,0,0,0
    },

    SteamApps_BIsSubscribedApp,

    {
        0
    },

    SteamApps_GetLanguage
};


static SteamObject g_apps =
{
    &g_apps_vtable
};


// ============================================================
// Empty interfaces
// ============================================================

#define MAKE_EMPTY_INTERFACE(name)        \
struct name##_VTable                     \
{                                         \
    void* pad[64];                        \
};                                        \
static name##_VTable g_##name##_vtable={0};\
static SteamObject g_##name={&g_##name##_vtable};


MAKE_EMPTY_INTERFACE(ISteamUtils)
MAKE_EMPTY_INTERFACE(ISteamNetworking)
MAKE_EMPTY_INTERFACE(ISteamMatchmaking)
MAKE_EMPTY_INTERFACE(ISteamHTTP)
MAKE_EMPTY_INTERFACE(ISteamInventory)
MAKE_EMPTY_INTERFACE(ISteamUserStats)
MAKE_EMPTY_INTERFACE(ISteamRemoteStorage)
MAKE_EMPTY_INTERFACE(ISteamMatchmakingServers)


// ============================================================
// ISteamClient
// ============================================================

struct ISteamClient_VTable
{
    void* pad[5];


    void* (*GetISteamUser)
    (
        void*,
        uint32_t,
        uint32_t,
        const char*
    );


    void* (*GetISteamFriends)
    (
        void*,
        uint32_t,
        uint32_t,
        const char*
    );


    void* (*GetISteamUtils)
    (
        void*,
        uint32_t,
        uint32_t,
        const char*
    );


    void* (*GetISteamApps)
    (
        void*,
        uint32_t,
        uint32_t,
        const char*
    );
};


static void* SteamClient_GetInterface
(
    void*,
    uint32_t,
    uint32_t,
    const char* name
)
{
    Log(name);


    if (!strcmp(name,"SteamUser"))
        return &g_user;


    if (!strcmp(name,"SteamFriends"))
        return &g_friends;


    if (!strcmp(name,"SteamApps"))
        return &g_apps;


    if (!strcmp(name,"SteamUtils"))
        return &g_ISteamUtils;


    if (!strcmp(name,"SteamNetworking"))
        return &g_ISteamNetworking;


    if (!strcmp(name,"SteamMatchmaking"))
        return &g_ISteamMatchmaking;


    if (!strcmp(name,"SteamHTTP"))
        return &g_ISteamHTTP;


    if (!strcmp(name,"SteamUserStats"))
        return &g_ISteamUserStats;


    if (!strcmp(name,"SteamInventory"))
        return &g_ISteamInventory;


    Log("Unknown Steam interface");

    return nullptr;
}


static ISteamClient_VTable g_client_vtable =
{
    {
        0,0,0,0,0
    },

    SteamClient_GetInterface,
    SteamClient_GetInterface,
    SteamClient_GetInterface,
    SteamClient_GetInterface
};


static SteamObject g_client =
{
    &g_client_vtable
};

// ============================================================
// Steam API Exports
// ============================================================

extern "C"
{


__declspec(dllexport)
bool SteamAPI_Init()
{
    Log("SteamAPI_Init");

    return true;
}


__declspec(dllexport)
bool SteamAPI_InitSafe()
{
    Log("SteamAPI_InitSafe");

    return true;
}


__declspec(dllexport)
void SteamAPI_Shutdown()
{
    Log("SteamAPI_Shutdown");
}


__declspec(dllexport)
bool SteamAPI_IsSteamRunning()
{
    Log("SteamAPI_IsSteamRunning");

    return true;
}


__declspec(dllexport)
bool SteamAPI_RestartAppIfNecessary(uint32_t)
{
    Log("SteamAPI_RestartAppIfNecessary");

    return false;
}


// ------------------------------------------------------------
// Handles
// ------------------------------------------------------------


__declspec(dllexport)
HSteamUser SteamAPI_GetHSteamUser()
{
    Log("SteamAPI_GetHSteamUser");

    return 1;
}


__declspec(dllexport)
HSteamPipe SteamAPI_GetHSteamPipe()
{
    Log("SteamAPI_GetHSteamPipe");

    return 1;
}



// ------------------------------------------------------------
// Callbacks
// ------------------------------------------------------------


__declspec(dllexport)
void SteamAPI_RunCallbacks()
{
}


__declspec(dllexport)
void SteamAPI_RegisterCallback(void*, int)
{
}


__declspec(dllexport)
void SteamAPI_UnregisterCallback(void*)
{
}


__declspec(dllexport)
void SteamAPI_RegisterCallResult(void*, SteamAPICall_t)
{
}


__declspec(dllexport)
void SteamAPI_UnregisterCallResult(void*, SteamAPICall_t)
{
}



// ------------------------------------------------------------
// Interface getters
// ------------------------------------------------------------


__declspec(dllexport)
void* SteamClient()
{
    Log("SteamClient");

    return &g_client;
}


__declspec(dllexport)
void* SteamUser()
{
    Log("SteamUser");

    return &g_user;
}


__declspec(dllexport)
void* SteamFriends()
{
    Log("SteamFriends");

    return &g_friends;
}


__declspec(dllexport)
void* SteamApps()
{
    Log("SteamApps");

    return &g_apps;
}


__declspec(dllexport)
void* SteamUtils()
{
    Log("SteamUtils");

    return &g_ISteamUtils;
}


__declspec(dllexport)
void* SteamNetworking()
{
    return &g_ISteamNetworking;
}


__declspec(dllexport)
void* SteamMatchmaking()
{
    return &g_ISteamMatchmaking;
}


__declspec(dllexport)
void* SteamHTTP()
{
    return &g_ISteamHTTP;
}


__declspec(dllexport)
void* SteamInventory()
{
    return &g_ISteamInventory;
}


__declspec(dllexport)
void* SteamUserStats()
{
    return &g_ISteamUserStats;
}


__declspec(dllexport)
void* SteamRemoteStorage()
{
    return &g_ISteamRemoteStorage;
}


__declspec(dllexport)
void* SteamMatchmakingServers()
{
    return &g_ISteamMatchmakingServers;
}



// ------------------------------------------------------------
// Internal Unity/Steam exports
// ------------------------------------------------------------


__declspec(dllexport)
void* SteamInternal_CreateInterface(const char* name)
{
    Log(name);


    if (!strcmp(name,"SteamClient"))
        return &g_client;


    if (!strcmp(name,"SteamUser"))
        return &g_user;


    if (!strcmp(name,"SteamFriends"))
        return &g_friends;


    if (!strcmp(name,"SteamApps"))
        return &g_apps;


    return nullptr;
}



__declspec(dllexport)
void* SteamInternal_FindOrCreateUserInterface
(
    HSteamUser,
    const char* name
)
{
    Log(name);

    return SteamInternal_CreateInterface(name);
}



__declspec(dllexport)
void* SteamInternal_FindOrCreateSteamPipe()
{
    Log("SteamInternal_FindOrCreateSteamPipe");

    return (void*)1;
}



// ------------------------------------------------------------
// Common Apps functions
// ------------------------------------------------------------


__declspec(dllexport)
bool SteamAPI_ISteamApps_BIsSubscribedApp
(
    void*,
    uint32_t
)
{
    return true;
}



__declspec(dllexport)
bool SteamAPI_ISteamApps_BIsDlcEnabled
(
    void*,
    uint32_t
)
{
    return true;
}



__declspec(dllexport)
bool SteamAPI_ISteamApps_BIsAppInstalled
(
    void*,
    uint32_t
)
{
    return true;
}



__declspec(dllexport)
const char* SteamAPI_ISteamApps_GetCurrentGameLanguage(void*)
{
    return "english";
}



__declspec(dllexport)
const char* SteamAPI_ISteamApps_GetAvailableGameLanguages(void*)
{
    return "english";
}



}



// ============================================================
// DLL Entry
// ============================================================


BOOL WINAPI DllMain
(
    HINSTANCE hinst,
    DWORD reason,
    LPVOID
)
{
    if(reason == DLL_PROCESS_ATTACH)
    {
        DisableThreadLibraryCalls(hinst);

        Log("steam_api64.dll loaded");
    }

    return TRUE;
}