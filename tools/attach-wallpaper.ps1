# Puts a window BEHIND the desktop icons (the classic "WorkerW" trick used by live-wallpaper apps).
# 1. Ask Progman (message 0x052C) to spawn a WorkerW between the icons and the static wallpaper.
# 2. Find the WorkerW that sits right after the one hosting SHELLDLL_DefView (the icons).
# 3. SetParent our window into it and size it to the given rectangle (WorkerW client coordinates).
# Usage: attach-wallpaper.ps1 -Hwnd <decimal> -X 0 -Y 0 -W 1920 -H 1080     Prints the WorkerW handle (0 = failed).
param([Int64]$Hwnd, [int]$X, [int]$Y, [int]$W, [int]$H)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DeskAttach {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

  public static IntPtr WorkerW() {
    IntPtr progman = FindWindow("Progman", null), r;
    SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out r);
    IntPtr worker = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
        worker = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
      return true;
    }, IntPtr.Zero);
    return worker;
  }

  public static long Attach(long hwnd, int x, int y, int w, int h) {
    IntPtr worker = WorkerW();
    if (worker == IntPtr.Zero) return 0;
    IntPtr win = new IntPtr(hwnd);
    SetParent(win, worker);
    // Make it a plain child window (2026-09-30): as a top-level style window Windows once re-laid it out
    // like a maximized window (1936×1048 with 8 px invisible borders) → a black strip on the left.
    // Drop POPUP / CAPTION / THICKFRAME / SYSMENU / MIN-MAXBOX / MAXIMIZE, add CHILD.
    int style = GetWindowLong(win, -16);
    style = (int)((uint)style & ~(0x80000000u | 0x00C00000u | 0x00040000u | 0x00080000u | 0x00030000u | 0x01000000u)) | 0x40000000;
    SetWindowLong(win, -16, style);
    // SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
    SetWindowPos(win, IntPtr.Zero, x, y, w, h, 0x0004 | 0x0010 | 0x0020 | 0x0040);
    return worker.ToInt64();
  }
}
"@
[DeskAttach]::Attach($Hwnd, $X, $Y, $W, $H)
