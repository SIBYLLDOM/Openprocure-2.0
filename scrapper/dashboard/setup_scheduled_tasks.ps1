<#
Run this in an ELEVATED PowerShell (Run as Administrator).

Sets up 3 dashboards as boot-time Scheduled Tasks, each running under its own
dedicated local account (S4U logon — no password stored):

  Gem Scrappers         -> dashboard\gem_app\app.py     (port 7001)
  Open Diagno Scrapper  -> dashboard\diagno_app\app.py   (port 7002)
  Open Endo Scrapper    -> dashboard\endo_app\app.py     (port 7003)

Steps performed:
  1. Grant "Log on as a batch job" (SeBatchLogonRight) to the 3 accounts.
  2. Grant NTFS Modify access on the scrapper folder to the 2 non-admin accounts
     ("Gem Scrappers" is already a local Administrator, so it already has access).
  3. Register 3 Scheduled Tasks (trigger: At system startup, LogonType S4U).
#>

$ErrorActionPreference = "Stop"

$ScrapperRoot = "C:\Users\Administrator\Desktop\participated_tenders\scrapper"
$Python       = Join-Path $ScrapperRoot "venv\Scripts\python.exe"

$Apps = @(
    @{ Account = "Gem Scrappers";         AppDir = Join-Path $ScrapperRoot "dashboard\gem_app";    TaskName = "Dashboard - GeM Tenders" },
    @{ Account = "Open Diagno Scrapper";  AppDir = Join-Path $ScrapperRoot "dashboard\diagno_app"; TaskName = "Dashboard - Open Diagno (CPPP)" },
    @{ Account = "Open Endo Scrapper";    AppDir = Join-Path $ScrapperRoot "dashboard\endo_app";   TaskName = "Dashboard - Open Endo (CPPP)" }
)

# ── 1. Grant "Log on as a batch job" right via secedit ──────────────────────────
Write-Host "== Granting 'Log on as a batch job' right ==" -ForegroundColor Cyan

$sids = $Apps | ForEach-Object { (Get-LocalUser -Name $_.Account).SID.Value }

$cfgPath = Join-Path $env:TEMP "secpol_export.cfg"
$dbPath  = Join-Path $env:TEMP "secpol_import.sdb"
secedit /export /cfg $cfgPath /areas USER_RIGHTS | Out-Null

$lines = Get-Content $cfgPath
$existingLine = $lines | Where-Object { $_ -match '^SeBatchLogonRight' }

if ($existingLine) {
    $existingSids = ($existingLine -split '=')[1].Trim()
    $allSids = ($existingSids.Split(',') + $sids | Select-Object -Unique) -join ','
    $newLine = "SeBatchLogonRight = $allSids"
    $lines = $lines -replace '^SeBatchLogonRight.*', $newLine
} else {
    $newLine = "SeBatchLogonRight = " + ($sids -join ',')
    # insert after the [Privilege Rights] section header
    $idx = ($lines | Select-String -Pattern '^\[Privilege Rights\]').LineNumber
    $lines = $lines[0..($idx-1)] + $newLine + $lines[$idx..($lines.Length-1)]
}
$lines | Set-Content $cfgPath

secedit /configure /db $dbPath /cfg $cfgPath /areas USER_RIGHTS | Out-Null
Remove-Item $cfgPath, $dbPath -ErrorAction SilentlyContinue
Write-Host "  Done." -ForegroundColor Green

# ── 2. Grant NTFS access on the scrapper folder ──────────────────────────────────
Write-Host "== Granting folder access ==" -ForegroundColor Cyan
foreach ($app in $Apps) {
    if ($app.Account -eq "Gem Scrappers") {
        Write-Host "  Skipping $($app.Account) (already a local Administrator)"
        continue
    }
    Write-Host "  Granting Modify on $ScrapperRoot to $($app.Account)"
    icacls $ScrapperRoot /grant ("$($app.Account):(OI)(CI)M") /T /Q | Out-Null
}
Write-Host "  Done." -ForegroundColor Green

# ── 3. Register scheduled tasks ──────────────────────────────────────────────────
Write-Host "== Registering scheduled tasks ==" -ForegroundColor Cyan
foreach ($app in $Apps) {
    $action = New-ScheduledTaskAction -Execute $Python -Argument "app.py" -WorkingDirectory $app.AppDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId $app.Account -LogonType S4U -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask -TaskName $app.TaskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "  Registered '$($app.TaskName)' (runs as $($app.Account) at startup)"
}
Write-Host "  Done." -ForegroundColor Green

Write-Host ""
Write-Host "All set. To start them right now without rebooting, run:" -ForegroundColor Yellow
foreach ($app in $Apps) {
    Write-Host "  Start-ScheduledTask -TaskName '$($app.TaskName)'"
}
