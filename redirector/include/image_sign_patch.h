#pragma once

#include "common.h"

// Image-signing bypass. The client verifies downloaded images against an RSA public key whose
// modulus is baked into Rec Room's metadata; images served by Hydrium are not signed with that
// key, so verification fails and images never load. Ports the managed ImageSigningPatch
// (RecNetPlugin): instead of patching the embedded modulus, we force the framework-level RSA
// verify to succeed -- mscorlib's RSACryptoServiceProvider.VerifyData / VerifyHash.
//
// Scope warning (same as the managed patch): this forces EVERY mscorlib RSA verification to
// pass, not just image signatures. BestHTTP's TLS is unaffected (it uses its own bundled
// BouncyCastle, not mscorlib RSA). Replace-only detours; runs on its own thread.
void PatchImageSigning(void);