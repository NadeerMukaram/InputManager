# 🖱️ Input Manager

A lightweight Windows desktop app built with **Electron** that lets you selectively lock and unlock your mouse and keyboard inputs — instantly, with a single click.

## ✨ Features

- **Freeze Cursor Movement** — lock the mouse pointer in place
- **Block Left Click (M1)** — prevent left mouse button events
- **Block Right Click (M2)** — prevent right mouse button events
- **Block Keyboard** — suppress all key presses system-wide
- **Disable All / Enable All** — one-click master toggle
- **Emergency Shortcut** — press `Alt`+`Shift`+`U` at any time to instantly re-enable all input, even if the keyboard is blocked
- **Auto-restore** — a 60-second countdown automatically re-enables input as a safety net
- **Frameless UI** — clean, minimal floating window with a custom title bar

## 🔧 How It Works

Input Manager dynamically compiles and runs a small **C# helper executable** (`MouseBlocker.exe`) using the .NET Framework's `csc.exe` compiler included with Windows. This helper installs low-level Windows hooks (`WH_MOUSE_LL` / `WH_KEYBOARD_LL`) to intercept and suppress the selected input events system-wide.

The compiled exe is cached in `%TEMP%\MouseManager` and only recompiled if the source changes.

```
Electron App (UI + IPC)
       │
       ▼
  main.js (Node.js / Electron main process)
       │  spawns
       ▼
  MouseBlocker.exe (compiled C# — Windows low-level hooks)
```

The Electron renderer communicates with the main process via a secure **context-isolated IPC bridge** (`preload.js`), so the UI never has direct Node.js access.

## 📋 Prerequisites

| Requirement | Details |
|---|---|
| **Windows** | Windows 10 or later (required for Windows hooks) |
| **.NET Framework 4.x** | Must have `csc.exe` at `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\` — included with most Windows installs |
| **Node.js** | v18+ recommended |

## 🚀 Getting Started

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd ElecProj

# 2. Install dependencies
npm install

# 3. Run in development
npm start
```

## 📦 Building

```bash
# Package the app (no installer)
npm run package

# Create a distributable installer (Squirrel/NSIS)
npm run make
```

Built artifacts will appear in the `out/` directory.

## 🗂️ Project Structure

```
ElecProj/
├── main.js          # Electron main process — IPC handlers, C# compilation & process management
├── preload.js       # Secure IPC bridge exposed to the renderer
├── renderer.js      # UI logic — state management, toggles, countdown
├── index.html       # App layout — custom titlebar, toggle controls, safety banner
├── styles.css       # App styles
├── forge.config.js  # Electron Forge build configuration
└── package.json
```

## ⌨️ Keyboard Shortcut

| Shortcut | Action |
|---|---|
| `Alt` + `Shift` + `U` | Re-enable all input (works even when keyboard is blocked) |

> [!IMPORTANT]
> The `Alt`+`Shift`+`U` shortcut is **always** forwarded by the keyboard hook, so you can never permanently lock yourself out.

## ⚠️ Safety Notes

- Closing the app window **always** restores full mouse and keyboard input.
- The **60-second auto-restore** timer triggers automatically whenever any input is blocked.
- Input is restored if the internal blocker process exits unexpectedly.

## 🛠️ Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop shell
- [Electron Forge](https://www.electronforge.io/) — build & packaging
- **C# / .NET Framework** — low-level Windows input hooks via `SetWindowsHookEx`

## 📄 License

MIT
