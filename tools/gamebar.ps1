# "錄目前視窗" (2026-09-30): hand the recording to Xbox Game Bar (Win+Alt+R).
# Clicking the gear menu makes 星圖 the foreground window, and Game Bar records the foreground app —
# so first bring back the window the user was working in (the first real app window below ours in
# z-order), then press Win+Alt+R. Pressing it again (menu or keyboard) stops Game Bar's recording.
# Prints the title of the window it handed over (or "(none)").
param([int]$OwnPid, [switch]$DryRun)   # -DryRun: only report which window would be recorded
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class GB {
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);

  public static string Run(uint ownPid, bool dry) {
    IntPtr target = IntPtr.Zero; string title = "(none)";
    for (IntPtr h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero; h = GetWindow(h, 2 /*GW_HWNDNEXT*/)) {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) continue;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == ownPid) continue;                                        // 星圖's own windows
      if ((GetWindowLong(h, -20) & 0x80) != 0) continue;                  // WS_EX_TOOLWINDOW
      if (GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) continue;          // owned popups
      int cloaked; if (DwmGetWindowAttribute(h, 14 /*DWMWA_CLOAKED*/, out cloaked, 4) == 0 && cloaked != 0) continue;
      var cls = new StringBuilder(64); GetClassName(h, cls, 64);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") continue;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      target = h; title = sb.ToString(); break;
    }
    if (dry) return title;
    if (target != IntPtr.Zero) { SetForegroundWindow(target); System.Threading.Thread.Sleep(150); }
    const uint UP = 2;
    keybd_event(0x5B, 0, 0, UIntPtr.Zero);      // LWin
    keybd_event(0x12, 0, 0, UIntPtr.Zero);      // Alt
    keybd_event(0x52, 0, 0, UIntPtr.Zero);      // R
    keybd_event(0x52, 0, UP, UIntPtr.Zero);
    keybd_event(0x12, 0, UP, UIntPtr.Zero);
    keybd_event(0x5B, 0, UP, UIntPtr.Zero);
    return title;
  }
}
"@
[GB]::Run([uint32]$OwnPid, $DryRun.IsPresent)
