// launcher.c
//
// Build (x64):
// cl /O2 launcher.c /Fe:launcher.exe
//

#define WIN32_LEAN_AND_MEAN

#include <windows.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>



FILE *logFile = NULL;



void InitConsole()
{
    AllocConsole();

    FILE *fp;

    freopen_s(
        &fp,
        "CONOUT$",
        "w",
        stdout
    );
}



void InitLogger()
{
    logFile = fopen(
        "launcher.log",
        "w"
    );


    if(logFile)
    {
        fprintf(
            logFile,
            "===== RR Launcher Log =====\n\n"
        );

        fflush(logFile);
    }
}



void Log(
    const char *fmt,
    ...
)
{

    char timeBuffer[64];

    time_t now =
        time(NULL);


    struct tm localTime;


    localtime_s(
        &localTime,
        &now
    );


    strftime(
        timeBuffer,
        sizeof(timeBuffer),
        "%Y-%m-%d %H:%M:%S",
        &localTime
    );



    printf(
        "[%s] ",
        timeBuffer
    );


    if(logFile)
    {
        fprintf(
            logFile,
            "[%s] ",
            timeBuffer
        );
    }




    va_list args;


    va_start(
        args,
        fmt
    );


    vprintf(
        fmt,
        args
    );


    printf("\n");



    va_list args2;


    va_copy(
        args2,
        args
    );


    if(logFile)
    {
        vfprintf(
            logFile,
            fmt,
            args2
        );


        fprintf(
            logFile,
            "\n"
        );


        fflush(logFile);
    }


    va_end(args2);


    va_end(args);
}





void LogError(
    const char *msg
)
{
    DWORD error =
        GetLastError();


    Log(
        "[ERROR] %s (Windows Error %lu)",
        msg,
        error
    );
}


/**
 * Check if a file exists before trying to use it.
 */
int FileExists(const char *path)
{
    DWORD attrs = GetFileAttributesA(path);
    return (attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY));
}




int main()
{

    InitConsole();

    InitLogger();



    Log(
        "[Launcher] Starting..."
    );



    char basePath[MAX_PATH];


    GetCurrentDirectoryA(
        sizeof(basePath),
        basePath
    );



    char dllPath[MAX_PATH];


    strcpy_s(
        dllPath,
        sizeof(dllPath),
        basePath
    );


    strcat_s(
        dllPath,
        sizeof(dllPath),
        "\\redirector.dll"
    );



    char gamePath[MAX_PATH];


    strcpy_s(
        gamePath,
        sizeof(gamePath),
        basePath
    );


    strcat_s(
        gamePath,
        sizeof(gamePath),
        "\\Hydrium.exe"
    );




    Log(
        "[Launcher] Base: %s",
        basePath
    );


    Log(
        "[Launcher] DLL: %s",
        dllPath
    );


    Log(
        "[Launcher] Game: %s",
        gamePath
    );



    // ─── File existence checks ─────────────────────────────────
    if (!FileExists(gamePath))
    {
        Log(
            "[FATAL] Hydrium.exe not found at: %s",
            gamePath
        );
        system("pause");
        return 1;
    }

    if (!FileExists(dllPath))
    {
        Log(
            "[FATAL] redirector.dll not found at: %s",
            dllPath
        );
        Log(
            "[FATAL] Place redirector.dll next to Hydrium.exe and launcher.exe"
        );
        system("pause");
        return 1;
    }

    Log(
        "[Launcher] All files present, proceeding..."
    );



    STARTUPINFOA si;

    ZeroMemory(
        &si,
        sizeof(si)
    );


    si.cb =
        sizeof(si);




    PROCESS_INFORMATION pi;

    ZeroMemory(
        &pi,
        sizeof(pi)
    );





    Log(
        "[Launcher] Starting Rec Room suspended..."
    );



    if(!CreateProcessA(
        gamePath,
        NULL,
        NULL,
        NULL,
        FALSE,
        CREATE_SUSPENDED,
        NULL,
        basePath,
        &si,
        &pi
    ))
    {

        LogError(
            "CreateProcess failed"
        );


        system("pause");

        return 1;
    }



    Log(
        "[Launcher] Process created PID=%lu",
        pi.dwProcessId
    );





    SIZE_T dllSize =
        strlen(dllPath) + 1;



    LPVOID remoteMemory =
        VirtualAllocEx(
            pi.hProcess,
            NULL,
            dllSize,
            MEM_COMMIT | MEM_RESERVE,
            PAGE_READWRITE
        );



    if(!remoteMemory)
    {
        LogError(
            "VirtualAllocEx failed"
        );

        // Clean up the suspended process
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return 1;
    }





    if(!WriteProcessMemory(
        pi.hProcess,
        remoteMemory,
        dllPath,
        dllSize,
        NULL
    ))
    {

        LogError(
            "WriteProcessMemory failed"
        );

        VirtualFreeEx(pi.hProcess, remoteMemory, 0, MEM_RELEASE);
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return 1;
    }





    LPVOID loadLibrary =
        GetProcAddress(
            GetModuleHandleA(
                "kernel32.dll"
            ),
            "LoadLibraryA"
        );



    if(!loadLibrary)
    {

        LogError(
            "LoadLibraryA not found"
        );

        VirtualFreeEx(pi.hProcess, remoteMemory, 0, MEM_RELEASE);
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return 1;
    }





    Log(
        "[Launcher] Injecting DLL..."
    );



    HANDLE thread =
        CreateRemoteThread(
            pi.hProcess,
            NULL,
            0,
            (LPTHREAD_START_ROUTINE)
            loadLibrary,
            remoteMemory,
            0,
            NULL
        );



    if(!thread)
    {

        LogError(
            "CreateRemoteThread failed"
        );

        VirtualFreeEx(pi.hProcess, remoteMemory, 0, MEM_RELEASE);
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return 1;
    }





    WaitForSingleObject(
        thread,
        INFINITE
    );





    // GetExitCodeThread returns a DWORD (32-bit).
    // LoadLibraryA returns an HMODULE (64-bit on x64).
    // The low 32 bits of the HMODULE are reliable for checking
    // success/failure since DLL base addresses typically fit in
    // the lower 4GB of address space on x64 Windows.
    DWORD dllResult = 0;



    if (!GetExitCodeThread(thread, &dllResult))
    {
        LogError(
            "GetExitCodeThread failed"
        );
        dllResult = 0;
    }



    CloseHandle(
        thread
    );





    VirtualFreeEx(
        pi.hProcess,
        remoteMemory,
        0,
        MEM_RELEASE
    );





    if(dllResult == 0)
    {

        Log(
            "[ERROR] DLL failed to load — LoadLibrary returned NULL"
        );
        Log(
            "[ERROR] Check that redirector.dll is x64 (not x86) and has no missing dependencies"
        );

        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        system("pause");
        return 1;

    }
    else
    {

        Log(
            "[Launcher] DLL loaded successfully at 0x%p (base)",
            (void*)(ULONG_PTR)dllResult
        );

    }






    Log(
        "[Launcher] Resuming Rec Room..."
    );



    ResumeThread(
        pi.hThread
    );



    Log(
        "[Launcher] === LAUNCH SUCCESSFUL ==="
    );

    Log(
        "[Launcher] Rec Room is running with DNS redirect active"
    );

    Log(
        "[Launcher] Close the game console window when done"
    );



    CloseHandle(
        pi.hThread
    );


    CloseHandle(
        pi.hProcess
    );




    Log(
        "[Launcher] Finished"
    );



    if(logFile)
    {
        fclose(
            logFile
        );
    }



    system("pause");


    return 0;
}