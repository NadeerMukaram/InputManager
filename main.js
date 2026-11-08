const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// ADD THIS BLOCK RIGHT HERE
if (require('electron-squirrel-startup')) {
  app.quit();
}

const FEATURE_KEYS = ['move', 'm1', 'm2', 'keys'];
const START_TIMEOUT_MS = 15000;
const UNBLOCK_SHORTCUT = 'Alt+Shift+U';
const CSC = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

let mainWindow;
let blockerProcess = null;
let blockerGeneration = 0;
let restartChain = Promise.resolve();

let blockState = { move: false, m1: false, m2: false, keys: false };

// Accepts --move  --m1  --m2  --keys. Only blocks the events whose flags are passed.
// Alt, Shift, and U are always forwarded so Alt+Shift+U can re-enable input.
const CSHARP_SOURCE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class MouseBlocker {
    private static IntPtr mouseHook = IntPtr.Zero;
    private static IntPtr keyHook = IntPtr.Zero;
    private static LowLevelProc mouseProc = MouseHookCallback;
    private static LowLevelProc keyProc = KeyboardHookCallback;

    private static bool blockMove = false;
    private static bool blockM1   = false;
    private static bool blockM2   = false;
    private static bool blockKeys = false;

    private static bool altHeld = false;
    private static bool shiftHeld = false;
    private static bool passedU = false;

    private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL    = 14;
    private const int WM_KEYDOWN     = 0x0100;
    private const int WM_KEYUP       = 0x0101;
    private const int WM_SYSKEYDOWN  = 0x0104;
    private const int WM_SYSKEYUP    = 0x0105;
    private const int WM_MOUSEMOVE   = 0x0200;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP   = 0x0202;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_RBUTTONUP   = 0x0205;

    private const int VK_SHIFT  = 0x10;
    private const int VK_MENU   = 0x12;
    private const int VK_U      = 0x55;
    private const int VK_LSHIFT = 0xA0;
    private const int VK_RSHIFT = 0xA1;
    private const int VK_LMENU  = 0xA4;
    private const int VK_RMENU  = 0xA5;

    private static bool IsAlt(uint vk) {
        return vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU;
    }

    private static bool IsShift(uint vk) {
        return vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT;
    }

    private static bool IsKeyDown(int msg) {
        return msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    }

    private static bool IsKeyMessage(int msg) {
        return msg == WM_KEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYDOWN || msg == WM_SYSKEYUP;
    }

    private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int msg = (int)wParam;
            if (blockMove && msg == WM_MOUSEMOVE) return new IntPtr(1);
            if (blockM1 && (msg == WM_LBUTTONDOWN || msg == WM_LBUTTONUP)) return new IntPtr(1);
            if (blockM2 && (msg == WM_RBUTTONDOWN || msg == WM_RBUTTONUP)) return new IntPtr(1);
        }
        return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && blockKeys) {
            int msg = (int)wParam;
            if (IsKeyMessage(msg)) {
                KBDLLHOOKSTRUCT info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                uint vk = info.vkCode;
                bool down = IsKeyDown(msg);

                if (IsAlt(vk) || IsShift(vk)) {
                    if (IsAlt(vk)) altHeld = down;
                    if (IsShift(vk)) shiftHeld = down;
                    return CallNextHookEx(keyHook, nCode, wParam, lParam);
                }

                if (vk == VK_U) {
                    bool allow = (down && altHeld && shiftHeld) || (!down && passedU);
                    if (down) passedU = allow;
                    else if (allow) passedU = false;
                    if (allow) return CallNextHookEx(keyHook, nCode, wParam, lParam);
                }

                return new IntPtr(1);
            }
        }
        return CallNextHookEx(keyHook, nCode, wParam, lParam);
    }

    private static void RemoveHooks() {
        if (mouseHook != IntPtr.Zero) {
            UnhookWindowsHookEx(mouseHook);
            mouseHook = IntPtr.Zero;
        }
        if (keyHook != IntPtr.Zero) {
            UnhookWindowsHookEx(keyHook);
            keyHook = IntPtr.Zero;
        }
    }

    [STAThread]
    public static void Main(string[] args) {
        var argList = new List<string>(args);
        blockMove = argList.Contains("--move");
        blockM1   = argList.Contains("--m1");
        blockM2   = argList.Contains("--m2");
        blockKeys = argList.Contains("--keys");

        bool wantMouse = blockMove || blockM1 || blockM2;
        if (!wantMouse && !blockKeys) {
            Console.Error.WriteLine("HOOK_FAILED");
            Environment.Exit(1);
        }

        IntPtr hMod = GetModuleHandle(null);
        if (wantMouse) {
            mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, hMod, 0);
            if (mouseHook == IntPtr.Zero) {
                Console.Error.WriteLine("HOOK_FAILED");
                Environment.Exit(1);
            }
        }
        if (blockKeys) {
            keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyProc, hMod, 0);
            if (keyHook == IntPtr.Zero) {
                RemoveHooks();
                Console.Error.WriteLine("HOOK_FAILED");
                Environment.Exit(1);
            }
        }

        Console.WriteLine("HOOK_ACTIVE");
        Console.Out.Flush();
        Application.Run();
        RemoveHooks();
    }
}
`;

function emptyState() {
    return { move: false, m1: false, m2: false, keys: false };
}

function snapshotState() {
    return { ...blockState };
}

function killProcess(proc) {
    try { proc.kill(); } catch (err) { /* already exited */ }
}

function normalizeState(state) {
    return {
        move: !!(state && state.move),
        m1: !!(state && state.m1),
        m2: !!(state && state.m2),
        keys: !!(state && state.keys),
    };
}

function enqueue(task) {
    const run = restartChain.then(task, task);
    restartChain = run.then(() => {}, () => {});
    return run;
}

function broadcastState() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state-update', snapshotState());
    }
}

function setIdleState() {
    blockState = emptyState();
    broadcastState();
}

function ensureBlockerExe() {
    if (!fs.existsSync(CSC)) {
        throw new Error('The .NET Framework C# compiler was not found.');
    }

    const dir = path.join(os.tmpdir(), 'MouseManager');
    fs.mkdirSync(dir, { recursive: true });
    const csPath = path.join(dir, 'MouseBlocker.cs');
    const exePath = path.join(dir, 'MouseBlocker.exe');
    const current = fs.existsSync(csPath) ? fs.readFileSync(csPath, 'utf8') : '';

    if (current === CSHARP_SOURCE && fs.existsSync(exePath)) {
        return exePath;
    }

    fs.writeFileSync(csPath, CSHARP_SOURCE, 'utf8');
    const compiled = spawnSync(CSC, [
        '/nologo',
        '/target:exe',
        '/r:System.Windows.Forms.dll',
        `/out:${exePath}`,
        csPath,
    ], { encoding: 'utf8' });

    if (compiled.status !== 0 || !fs.existsSync(exePath)) {
        const detail = `${compiled.stdout || ''}\n${compiled.stderr || ''}`.trim();
        throw new Error(detail || 'Failed to compile the input blocker.');
    }

    return exePath;
}

function stopCurrentBlocker() {
    const proc = blockerProcess;
    blockerProcess = null;
    blockerGeneration += 1;
    if (!proc) return Promise.resolve();

    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        killProcess(proc);
    });
}

function flagsFor(state) {
    const flags = [];
    if (state.move) flags.push('--move');
    if (state.m1) flags.push('--m1');
    if (state.m2) flags.push('--m2');
    if (state.keys) flags.push('--keys');
    return flags;
}

function startBlocker(state) {
    const exePath = ensureBlockerExe();
    const generation = ++blockerGeneration;
    const proc = spawn(exePath, flagsFor(state), {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    blockerProcess = proc;

    return new Promise((resolve) => {
        let settled = false;
        let started = false;
        const stderrChunks = [];

        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        const timer = setTimeout(() => {
            const detail = stderrChunks.join('').trim();
            killProcess(proc);
            finish({ success: false, error: detail || 'Input blocker timed out.' });
        }, START_TIMEOUT_MS);

        proc.stdout.on('data', (data) => {
            if (data.toString().includes('HOOK_ACTIVE')) {
                started = true;
                finish({ success: true });
            }
        });

        proc.stderr.on('data', (chunk) => {
            stderrChunks.push(chunk.toString());
        });

        proc.on('error', (err) => {
            finish({ success: false, error: err.message });
        });

        proc.on('exit', () => {
            if (generation !== blockerGeneration) return;
            if (blockerProcess === proc) blockerProcess = null;

            if (!started) {
                const detail = stderrChunks.join('').trim();
                finish({ success: false, error: detail || 'Input blocker exited before the hook started.' });
                return;
            }

            blockState = emptyState();
            broadcastState();
        });
    });
}

async function restartBlocker(nextState) {
    await stopCurrentBlocker();
    const next = normalizeState(nextState);

    if (!next.move && !next.m1 && !next.m2 && !next.keys) {
        blockState = emptyState();
        broadcastState();
        return { success: true, state: snapshotState() };
    }

    try {
        const result = await startBlocker(next);
        if (result.success && blockerProcess) {
            blockState = next;
            broadcastState();
            return { success: true, state: snapshotState() };
        }

        if (blockerProcess) {
            const proc = blockerProcess;
            blockerProcess = null;
            blockerGeneration += 1;
            killProcess(proc);
        }
        blockState = emptyState();
        broadcastState();
        return { success: false, error: result.error || 'Failed to start the input blocker.', state: snapshotState() };
    } catch (err) {
        blockState = emptyState();
        broadcastState();
        return { success: false, error: err.message, state: snapshotState() };
    }
}

function stopBlocker() {
    if (blockerProcess) {
        const proc = blockerProcess;
        blockerProcess = null;
        blockerGeneration += 1;
        killProcess(proc);
    }
    blockState = emptyState();
}

ipcMain.handle('get-state', () => snapshotState());

ipcMain.handle('set-feature', (_, payload) => enqueue(async () => {
    const key = payload && payload.key;
    const value = payload && payload.value;
    if (!FEATURE_KEYS.includes(key) || typeof value !== 'boolean') {
        return { success: false, error: 'Unknown input control.', state: snapshotState() };
    }
    return restartBlocker({ ...blockState, [key]: value });
}));

ipcMain.handle('block-all', () => enqueue(() => restartBlocker({ move: true, m1: true, m2: true, keys: true })));

ipcMain.handle('unblock-all', () => enqueue(() => restartBlocker(emptyState())));

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 560,
        frame: false,
        resizable: false,
        transparent: true,
        backgroundColor: '#00000000', // 👈 ADD THIS (fixes the green box)
        show: false,                  // 👈 ADD THIS (prevents the box from flashing)
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    // ADD THIS BLOCK (shows the window only when it's ready)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    globalShortcut.register(UNBLOCK_SHORTCUT, () => {
        enqueue(() => restartBlocker(emptyState()));
    });

    mainWindow.on('closed', () => {
        stopBlocker();
        app.quit();
    });
});

app.on('window-all-closed', () => { stopBlocker(); app.quit(); });
app.on('before-quit', () => stopBlocker());
app.on('will-quit', () => globalShortcut.unregisterAll());

ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('close-window', () => { stopBlocker(); app.quit(); });
