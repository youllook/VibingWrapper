# Puts a window BEHIND the desktop icons (the "WorkerW" trick used by live-wallpaper apps).
# 1. Ask Progman (message 0x052C, wParam 0xD / lParam 1, the values Lively sends) to split the desktop.
# 2. Two layouts come out of that:
#    - classic (Windows 10, Windows 11 up to 23H2): two top-level WorkerWs, the first holding SHELLDLL_DefView
#      (the icons), the next one empty behind it → our window goes inside that empty WorkerW.
#    - raised (Windows 11 24H2 and later, 2026-10-16): Progman keeps the icons as a direct child and the WorkerW
#      it makes is ALSO a child of Progman, below the icons, drawing the static wallpaper. The old search then
#      grabbed some unrelated hidden WorkerW and the wallpaper never showed. Our window becomes a layered
#      (alpha 255) child of Progman, placed directly below SHELLDLL_DefView, i.e. above Explorer's WorkerW.
# 3. Size it to the given rectangle (parent client coordinates).
# Usage: attach-wallpaper.ps1 -Hwnd <decimal> -X 0 -Y 0 -W 1920 -H 1080     Prints the parent handle (0 = failed),
# then one "diag ..." line describing what it found (2026-10-22: goes to debug.log for people whose wallpaper won't show).
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
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);

  public static string Info = "";
  static void Note(string s) { Info += (Info.Length > 0 ? "; " : "") + s; }

  static IntPtr Progman() { return FindWindow("Progman", null); }

  // raised layout: the icons AND a WorkerW are both direct children of Progman
  static bool Raised(IntPtr progman) {
    return FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero
        && FindWindowEx(progman, IntPtr.Zero, "WorkerW", null) != IntPtr.Zero;
  }

  // classic layout: the top-level WorkerW right after the WorkerW that holds the icons
  static IntPtr ClassicWorker() {
    IntPtr worker = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
        IntPtr next = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
        if (next != IntPtr.Zero) { worker = next; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return worker;
  }

  static void Split(IntPtr progman, IntPtr w, IntPtr l) {
    IntPtr r;
    SendMessageTimeout(progman, 0x052C, w, l, 0, 1000, out r);
  }

  public static long Attach(long hwnd, int x, int y, int w, int h) {
    IntPtr progman = Progman();
    if (progman == IntPtr.Zero) { Note("no Progman window (is Explorer running?)"); return 0; }
    Note("progman=" + progman.ToInt64() + " icons-in-progman=" + (FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
       + " raised-before=" + Raised(progman) + " classic-before=" + (ClassicWorker() != IntPtr.Zero));
    // send once; Explorer reference-counts the split, so only fall back to the legacy (0, 0) form when nothing came of it
    if (!Raised(progman) && ClassicWorker() == IntPtr.Zero) { Split(progman, new IntPtr(0xD), new IntPtr(1)); Note("sent 0x052C(0xD,1)"); }
    if (!Raised(progman) && ClassicWorker() == IntPtr.Zero) { Split(progman, IntPtr.Zero, IntPtr.Zero); Note("sent 0x052C(0,0)"); }

    IntPtr win = new IntPtr(hwnd), parent, after;
    if (Raised(progman)) {
      parent = progman;
      after = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);   // insert right below the icons
      Note("layout=raised");
    } else {
      parent = ClassicWorker();
      after = IntPtr.Zero;
      if (parent == IntPtr.Zero) { Note("layout=none: no WorkerW behind the icons after the split"); return 0; }
      Note("layout=classic worker=" + parent.ToInt64());
    }

    // Make it a plain child window (2026-09-30): as a top-level style window Windows once re-laid it out
    // like a maximized window (1936×1048 with 8 px invisible borders) → a black strip on the left.
    // Drop POPUP / CAPTION / THICKFRAME / SYSMENU / MIN-MAXBOX / MAXIMIZE, add CHILD.
    int style = GetWindowLong(win, -16);
    style = (int)((uint)style & ~(0x80000000u | 0x00C00000u | 0x00040000u | 0x00080000u | 0x00030000u | 0x01000000u)) | 0x40000000;
    SetWindowLong(win, -16, style);
    if (parent == progman) {
      // Progman has no redirection surface on the raised desktop: children only show if they are layered
      SetWindowLong(win, -20, GetWindowLong(win, -20) | 0x00080000);         // WS_EX_LAYERED
      SetLayeredWindowAttributes(win, 0, 255, 0x2);                           // LWA_ALPHA, fully opaque
    }
    SetParent(win, parent);
    if (GetParent(win) != parent) { Note("SetParent did not take (parent now " + GetParent(win).ToInt64() + ")"); return 0; }
    // classic: SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW; raised: same but with a z-order
    uint flags = 0x0010 | 0x0020 | 0x0040 | (after == IntPtr.Zero ? 0x0004u : 0u);
    SetWindowPos(win, after, x, y, w, h, flags);
    return parent.ToInt64();
  }
}
"@
[DeskAttach]::Attach($Hwnd, $X, $Y, $W, $H)
"diag " + [DeskAttach]::Info
