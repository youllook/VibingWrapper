# Show / hide ALL desktop icons — the same switch as desktop right-click → 檢視 → 顯示桌面圖示 (2026-09-30).
# Nothing is moved: Explorer only hides the icon layer, so every icon comes back exactly where it was.
# Runs as a small resident helper for tools/desktop-icons.js: one command per stdin line
#   get     → prints 1 (icons visible) or 0 (hidden)
#   toggle  → flips them, then prints the new state
#   covered → 1 when a window covers the whole primary work area (maximized / full screen), else 0 (2026-10-01:
#             the wallpaper pauses then — nobody can see it, and it cost ~47% of the Intel GPU)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DeskIcons {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint a, uint b, out RECT r, uint c);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);

  // the icon host: SHELLDLL_DefView lives under Progman, or under a WorkerW once a live wallpaper split them
  static IntPtr DefView() {
    IntPtr v = FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
    if (v != IntPtr.Zero) return v;
    EnumWindows((h, l) => { IntPtr d = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null); if (d != IntPtr.Zero) v = d; return v == IntPtr.Zero; }, IntPtr.Zero);
    return v;
  }
  public static int Visible() {
    IntPtr list = FindWindowEx(DefView(), IntPtr.Zero, "SysListView32", null);
    return list != IntPtr.Zero && IsWindowVisible(list) ? 1 : 0;
  }
  // Walk the top-level windows front to back until the desktop itself. Covered = one real window whose
  // rectangle holds the whole work area (a maximized window overhangs it by a few px; full screen covers more).
  // Skipped: hidden, minimized, cloaked (other virtual desktops, suspended UWP), tool windows, click-through overlays.
  public static int Covered() {
    RECT wa; SystemParametersInfo(0x0030, 0, out wa, 0);             // SPI_GETWORKAREA (primary monitor)
    var cls = new System.Text.StringBuilder(64);
    for (IntPtr h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero; h = GetWindow(h, 2)) {   // GW_HWNDNEXT
      if (!IsWindowVisible(h) || IsIconic(h)) continue;
      cls.Length = 0; GetClassName(h, cls, 64); string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW") return 0;               // reached the desktop: nothing covers it
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0) continue;                                // WS_EX_TOOLWINDOW
      if ((ex & 0x20) != 0 && (ex & 0x80000) != 0) continue;        // WS_EX_TRANSPARENT + LAYERED: click-through overlay
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) continue;   // DWMWA_CLOAKED
      RECT r; if (!GetWindowRect(h, out r)) continue;
      if (r.L <= wa.L + 2 && r.T <= wa.T + 2 && r.R >= wa.R - 2 && r.B >= wa.B - 2) return 1;
    }
    return 0;
  }
  public static int Toggle() {
    IntPtr v = DefView();
    if (v != IntPtr.Zero) SendMessage(v, 0x0111, new IntPtr(0x7402), IntPtr.Zero);   // WM_COMMAND "show desktop icons"
    return Visible();
  }
}
"@
while ($null -ne ($line = [Console]::In.ReadLine())) {
  switch ($line.Trim()) {
    'get'    { [Console]::Out.WriteLine([DeskIcons]::Visible()) }
    'toggle' { [Console]::Out.WriteLine([DeskIcons]::Toggle()) }
    'covered' { [Console]::Out.WriteLine('c' + [DeskIcons]::Covered()) }
  }
  [Console]::Out.Flush()
}
