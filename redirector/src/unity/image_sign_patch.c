#include "common.h"
#include "image_sign_patch.h"
#include "logger.h"
#include "detour.h"

//
// Native port of the managed ImageSigningPatch (RecNetPlugin.Patches.ImageSigningPatch).
//
// The managed patch Harmony-prefixes three methods on Il2CppSystem.Security.Cryptography.
// RSACryptoServiceProvider -- VerifyData(byte[], byte[]), VerifyHash(byte[], byte[],
// HashAlgorithmName) and VerifyHash(byte[], byte[], HashAlgorithmName, RSASignaturePadding) --
// skipping the original and setting __result = true.
//
// Native equivalent: resolve mscorlib's RSACryptoServiceProvider, enumerate its methods, and
// replace-only detour every bool-returning method named "VerifyData" or "VerifyHash"
// (regardless of parameter count -- that covers all overloads without depending on exact
// il2cpp signatures, which is in keeping with how the other patches here handle drift).
// The detoured body just returns TRUE; the original is never called, so a blind 14-byte
// overwrite is safe.
//
// Note: an RSA verify that runs on a generic RSA base (System.Security.Cryptography.RSA)
// instead of RSACryptoServiceProvider would not be caught; the managed build observed the
// concrete provider being used, so we match that. If images ever stop loading, check whether
// verification moved to a different class (or to BouncyCastle's RsaDigestSigner/PssSigner --
// the managed comment documents that fallback).

#define METHOD_ATTRIBUTE_MEMBER_ACCESS_MASK 0x0007
#define METHOD_ATTRIBUTE_PUBLIC             0x0006
#define METHOD_ATTRIBUTE_STATIC             0x0010
#define METHOD_ATTRIBUTE_SPECIAL_NAME       0x0800
#define IL2CPP_TYPE_BOOLEAN                 0x02

typedef void*    (*il2cpp_domain_get_t)(void);
typedef int      (*il2cpp_thread_attach_t)(void*);
typedef void**   (*il2cpp_domain_get_assemblies_t)(void*, size_t*);
typedef void*    (*il2cpp_assembly_get_image_t)(void*);
typedef void*    (*il2cpp_class_from_name_t)(void*, const char*, const char*);
typedef void*    (*il2cpp_class_get_methods_t)(void*, void**);
typedef const char* (*il2cpp_method_get_name_t)(void*);
typedef uint32_t (*il2cpp_method_get_flags_t)(void*, uint32_t*);
typedef uint32_t (*il2cpp_method_get_param_count_t)(void*);
typedef void*    (*il2cpp_method_get_return_type_t)(void*);
typedef int      (*il2cpp_type_get_type_t)(void*);

static il2cpp_domain_get_t               p_domain_get;
static il2cpp_thread_attach_t            p_thread_attach;
static il2cpp_domain_get_assemblies_t    p_get_assemblies;
static il2cpp_assembly_get_image_t       p_get_image;
static il2cpp_class_from_name_t          p_class_from_name;
static il2cpp_class_get_methods_t        p_get_methods;
static il2cpp_method_get_name_t          p_method_name;
static il2cpp_method_get_flags_t         p_method_flags;
static il2cpp_method_get_param_count_t   p_param_count;
static il2cpp_method_get_return_type_t   p_return_type;
static il2cpp_type_get_type_t            p_type_kind;

static BYTE backup_verify[8][32];   // room for several overloads
static int  backup_used = 0;

static int patched = 0;

//
// Replace-only hook: force every RSA verification to return true.
//
// il2cpp method pointers are (this, methodInfo) for instance methods and
// (methodInfo, ...) for statics -- but since we never touch the arguments and
// simply return a boolean, the calling convention differences don't matter.
// A bool return is an 8-bit value in AL, so returning 1 as int works for both
// static and instance entries.
//
static void* VerifyHook(void *a, void *b)
{
    (void)a; (void)b;
    return (void*)(size_t)1;   // true
}

static BOOL ResolveApi(HMODULE ga)
{
    p_domain_get     = (il2cpp_domain_get_t)             GetProcAddress(ga, "il2cpp_domain_get");
    p_thread_attach  = (il2cpp_thread_attach_t)          GetProcAddress(ga, "il2cpp_thread_attach");
    p_get_assemblies = (il2cpp_domain_get_assemblies_t)  GetProcAddress(ga, "il2cpp_domain_get_assemblies");
    p_get_image      = (il2cpp_assembly_get_image_t)     GetProcAddress(ga, "il2cpp_assembly_get_image");
    p_class_from_name= (il2cpp_class_from_name_t)        GetProcAddress(ga, "il2cpp_class_from_name");
    p_get_methods    = (il2cpp_class_get_methods_t)      GetProcAddress(ga, "il2cpp_class_get_methods");
    p_method_name    = (il2cpp_method_get_name_t)        GetProcAddress(ga, "il2cpp_method_get_name");
    p_method_flags   = (il2cpp_method_get_flags_t)       GetProcAddress(ga, "il2cpp_method_get_flags");
    p_param_count    = (il2cpp_method_get_param_count_t) GetProcAddress(ga, "il2cpp_method_get_param_count");
    p_return_type    = (il2cpp_method_get_return_type_t) GetProcAddress(ga, "il2cpp_method_get_return_type");
    p_type_kind      = (il2cpp_type_get_type_t)          GetProcAddress(ga, "il2cpp_type_get_type");

    return p_domain_get && p_get_assemblies && p_get_image && p_class_from_name &&
           p_get_methods && p_method_name && p_method_flags && p_param_count &&
           p_return_type && p_type_kind;
}

static BOOL name_is(const char *n, const char *target)
{
    return n && strcmp(n, target) == 0;
}

static void TryHookMethod(void *m, const char *what)
{
    if (backup_used >= (int)ARRAYSIZE(backup_verify)) return;

    void *code = *(void **)m;   // MethodInfo.methodPointer (compiled entry)
    if (!code) { Log("[SIG] %s has no compiled body", what); return; }

    int slot = backup_used++;
    if (InstallDetour(code, VerifyHook, backup_verify[slot], NULL))
    {
        patched++;
        Log("[SIG] %s -> forced true", what);
    }
    else
    {
        backup_used--;   // slot unused, let the next method retry
        Log("[SIG] failed to hook %s", what);
    }
}

static void* FindClass(void *domain, const char *ns, const char *name)
{
    size_t n = 0;
    void **asms = p_get_assemblies(domain, &n);
    for (size_t i = 0; i < n; i++)
    {
        void *img = p_get_image(asms[i]);
        if (!img) continue;
        void *k = p_class_from_name(img, ns, name);
        if (k) return k;
    }
    return NULL;
}

void PatchImageSigning(void)
{
    HMODULE ga = NULL;
    while (!ga) { ga = GetModuleHandleA("GameAssembly.dll"); if (!ga) Sleep(100); }

    if (!ResolveApi(ga)) { Log("[SIG] missing il2cpp exports -- aborting image-signing patch"); return; }

    void *domain = NULL;
    for (int i = 0; i < 600 && !domain; i++) { domain = p_domain_get(); if (!domain) Sleep(100); }
    if (!domain) { Log("[SIG] il2cpp domain never came up"); return; }
    if (p_thread_attach) p_thread_attach(domain);

    // RSACryptoServiceProvider lives in mscorlib. Retry through early init.
    void *cls = NULL;
    for (int i = 0; i < 100 && !cls; i++)
    {
        cls = FindClass(domain, "System.Security.Cryptography", "RSACryptoServiceProvider");
        if (!cls) cls = FindClass(domain, "", "RSACryptoServiceProvider");  // some builds drop the ns
        if (!cls) Sleep(100);
    }
    if (!cls) { Log("[SIG] RSACryptoServiceProvider not found -- images will NOT load"); return; }

    //
    // Hook every bool-returning VerifyData / VerifyHash (all overloads, static or instance).
    //
    void *iter = NULL, *m;
    while ((m = p_get_methods(cls, &iter)) != NULL)
    {
        const char *mn = p_method_name(m);
        if (!name_is(mn, "VerifyData") && !name_is(mn, "VerifyHash")) continue;

        void *rt = p_return_type(m);
        if (!rt || p_type_kind(rt) != IL2CPP_TYPE_BOOLEAN) continue;
        if (p_param_count(m) == 0) continue;   // not a real overload shape; skip

        uint32_t iflags = 0;
        uint32_t f = p_method_flags(m, &iflags);
        char label[64];
        _snprintf(label, sizeof(label), "%s(%d param, %s)",
                  mn, p_param_count(m), (f & METHOD_ATTRIBUTE_STATIC) ? "static" : "instance");
        Log("[SIG] verify candidate: %s", label);

        TryHookMethod(m, label);
    }

    if (patched > 0)
        Log("[SIG] signature verification disabled -- %d RSA verify method(s) forced true", patched);
    else
        Log("[SIG] no VerifyData/VerifyHash methods hooked -- signature verification still active");
}