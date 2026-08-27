$ErrorActionPreference = 'Continue'
$SETTINGS_HWND = 27072988
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint cb, UIntPtr ei);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr ei);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R2,B; }
"@ -Name "SA" -Namespace Wsa

function VK($v){[Wsa.SA]::keybd_event($v,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 20;[Wsa.SA]::keybd_event($v,0,2,[UIntPtr]::Zero)}
function MouseTo($x,$y){[void][Wsa.SA]::SetCursorPos($x,$y);Start-Sleep -Milliseconds 60}
function LClick(){[Wsa.SA]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 20;[Wsa.SA]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 60}
function RClick(){[Wsa.SA]::mouse_event(0x0008,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 20;[Wsa.SA]::mouse_event(0x0010,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 60}
function Snap([string]$name){
    $vs=[System.Windows.Forms.SystemInformation]::VirtualScreen
    $b=New-Object System.Drawing.Bitmap($vs.Width,$vs.Height)
    $g=[System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen($vs.X,$vs.Y,0,0,$b.Size)
    $p="e:/运维之路/desk/.trae/verify/$name"
    $b.Save($p,[System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose();$b.Dispose()
    Write-Host ("[SNAP] " + $name + " (" + (Get-Item $p).Length + "B)")
}
function GetR([IntPtr]$h){$r=New-Object Wsa.SA+RECT;[void][Wsa.SA]::GetWindowRect($h,[ref]$r);return $r}

VK 0x1B; Start-Sleep -Milliseconds 100; VK 0x1B; Start-Sleep -Milliseconds 200
Write-Host "====== STEPS 4-5-6 START ======"

$fg = [Wsa.SA]::GetForegroundWindow()
$rfg = GetR $fg
$fgW = $rfg.R2-$rfg.L; $fgH = $rfg.B-$rfg.T
$PET_CX = 0; $PET_CY = 0
if ($fgW -ge 500 -and $fgW -le 650 -and $fgH -ge 400 -and $fgH -le 550) {
    $PET_CX = $rfg.L + [int]($fgW/2)
    $PET_CY = $rfg.T + [int]($fgH/2)
    Write-Host ("Pet via Foreground: L=" + $rfg.L + " T=" + $rfg.T + " W=" + $fgW + " H=" + $fgH)
} else {
    Write-Host ("Foreground not pet " + $fgW + "x" + $fgH)
    $sh=[IntPtr]$SETTINGS_HWND
    $rs = GetR $sh
    $PET_CX = $rs.L + [int](($rs.R2-$rs.L)/2)
    $PET_CY = $rs.B + 241
}
Write-Host ("Pet center guess: CX=" + $PET_CX + " CY=" + $PET_CY)

Write-Host ("Open Settings: " + ($PET_CX-117) + "," + ($PET_CY+172))
MouseTo $PET_CX $PET_CY; RClick; Start-Sleep -Milliseconds 500
MouseTo ($PET_CX-117) ($PET_CY+172); LClick; Start-Sleep -Seconds 3.5

$script:sh = [IntPtr]$SETTINGS_HWND
$rp = GetR $script:sh
$script:PL=$rp.L; $script:PT=$rp.T; $script:PW=$rp.R2-$rp.L; $script:PH=$rp.B-$rp.T; $script:PCX=$script:PL+[int]($script:PW/2)
Write-Host ("Settings: L=" + $script:PL + " T=" + $script:PT + " W=" + $script:PW + " H=" + $script:PH + " CX=" + $script:PCX)

function GoTab([int]$idx){
    $tx = $script:PL + [int](($script:PW/6) * ($idx + 0.5))
    $ty = $script:PT + 35
    Write-Host ("Tab[" + $idx + "] " + $tx + "," + $ty)
    MouseTo $tx $ty; LClick; Start-Sleep -Seconds 0.8
    $rr = GetR $script:sh
    $script:PL=$rr.L; $script:PT=$rr.T; $script:PW=$rr.R2-$rr.L; $script:PH=$rr.B-$rr.T; $script:PCX=$script:PL+[int]($script:PW/2)
}
function ScrollDeep([int]$pages=10){
    MouseTo ($script:PL+[int]($script:PW/2)) ($script:PT+400); LClick; Start-Sleep -Milliseconds 300
    for ($i=0; $i -lt $pages; $i++) { VK 0x22; Start-Sleep -Milliseconds 150 }
    Start-Sleep -Milliseconds 500
}

Write-Host "--- STEP 4: PEEK 3 directions ---"
GoTab 0
ScrollDeep 5

$peekCandidates = @(
    @(0.50,0.55),@(0.35,0.55),@(0.65,0.55),
    @(0.50,0.60),@(0.35,0.60),@(0.65,0.60),
    @(0.50,0.65),@(0.35,0.65),@(0.65,0.65),
    @(0.50,0.50),@(0.50,0.70),@(0.50,0.75),
    @(0.35,0.50),@(0.65,0.50)
)
$peekX = 0; $peekY = 0
$curCx = $script:PCX
foreach ($pa in $peekCandidates) {
    $px = $script:PL + [int]($script:PW * $pa[0])
    $py = $script:PT + [int]($script:PH * $pa[1])
    Write-Host ("Try peek scr " + $px + "," + $py)
    MouseTo $px $py; LClick; Start-Sleep -Seconds 2
    $rr = GetR $script:sh
    $newCx = $rr.L + [int](($rr.R2-$rr.L)/2)
    $dx = [Math]::Abs($newCx - $curCx)
    Write-Host ("  PanelCX delta=" + $dx + "px")
    if ($dx -gt 150) {
        Write-Host "  >> PEEK confirmed! Cycling back..."
        $peekX = $px; $peekY = $py
        Start-Sleep -Seconds 4
        MouseTo $peekX $peekY; LClick; Start-Sleep -Seconds 7
        MouseTo $peekX $peekY; LClick; Start-Sleep -Seconds 7
        break
    }
    if ($dx -gt 20) { $peekX=$px; $peekY=$py }
}
if ($peekX -eq 0) {
    $peekX = $script:PL + [int]($script:PW*0.50)
    $peekY = $script:PT + [int]($script:PH*0.62)
    Write-Host ("Fallback peek: " + $peekX + "," + $peekY)
} else {
    Write-Host ("Peek btn: " + $peekX + "," + $peekY)
}

GoTab 0; ScrollDeep 3

Write-Host "Round 1 LEFT"
MouseTo $peekX $peekY; LClick; Start-Sleep -Seconds 2
Snap "04-peek-1.png"
Start-Sleep -Seconds 4

Write-Host "Round 2 UP"
MouseTo $peekX $peekY; LClick; Start-Sleep -Seconds 2
Snap "04-peek-2.png"
Start-Sleep -Seconds 4

Write-Host "Round 3 RIGHT"
MouseTo $peekX $peekY; LClick; Start-Sleep -Seconds 2
Snap "04-peek-3.png"
Start-Sleep -Seconds 4
Write-Host "Step 4 Done"

Write-Host "--- STEP 5: AI CHATTER ---"
[void][Wsa.SA]::SetForegroundWindow($script:sh)
Start-Sleep -Milliseconds 300
GoTab 3
ScrollDeep 5

$aiCandidates = @(
    @(0.65,0.65),@(0.50,0.65),@(0.65,0.70),@(0.50,0.70),
    @(0.35,0.70),@(0.65,0.60),@(0.50,0.75),@(0.65,0.75),
    @(0.35,0.65),@(0.50,0.60),@(0.35,0.75),@(0.65,0.80),
    @(0.50,0.80),@(0.35,0.80),@(0.50,0.55),@(0.35,0.55)
)
$origCx = $script:PCX
foreach ($ai in $aiCandidates) {
    $ax = $script:PL + [int]($script:PW * $ai[0])
    $ay = $script:PT + [int]($script:PH * $ai[1])
    Write-Host ("Try AI " + $ax + "," + $ay)
    MouseTo $ax $ay; LClick; Start-Sleep -Seconds 3
    $rr2 = GetR $script:sh
    $newCx2 = $rr2.L + [int](($rr2.R2-$rr2.L)/2)
    $dx2 = [Math]::Abs($newCx2 - $origCx)
    if ($dx2 -gt 200) {
        Write-Host ("  Re-sync (dx=" + $dx2 + ")")
        $script:PL=$rr2.L;$script:PT=$rr2.T;$script:PW=$rr2.R2-$rr2.L;$script:PH=$rr2.B-$rr2.T
        $script:PCX=$newCx2; $origCx = $newCx2
        GoTab 3; ScrollDeep 3
    } else {
        Write-Host "  Click OK"
        break
    }
}

Write-Host "Wait AI 8s"
Start-Sleep -Seconds 8
Snap "05-chatter.png"
Write-Host "Step 5 Done"

Write-Host "--- STEP 6: FINAL ---"
$rFinal = GetR $script:sh
MouseTo ($rFinal.R2 - 30) ($rFinal.T + 35)
LClick
Start-Sleep -Seconds 1.5
Snap "06-final.png"
VK 0x1B; Start-Sleep -Milliseconds 100; VK 0x1B
Write-Host "====== STEPS 4-5-6 DONE ======"
