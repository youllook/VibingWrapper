# Creates a desktop shortcut that launches the pet directly with electron.exe (no console window).
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "electron.exe not found - run npm install first" }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'VibingWrapper.lnk'   # renamed from 星圖.lnk 2026-10-01
# remove the shortcut from the old name
$old = Join-Path $desktop ([string][char]0x684C + [char]0x9762 + [char]0x51B0 + [char]0x6676 + '.lnk')  # 桌面冰晶.lnk
if (Test-Path $old) { Remove-Item $old }

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $electron
$lnk.Arguments = '"' + $root + '"'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = (Join-Path $root 'assets\icon.ico') + ',0'
$lnk.Description = 'Star map desktop pet'
$lnk.Save()
Write-Output "shortcut: $lnkPath"
