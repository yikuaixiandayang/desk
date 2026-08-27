# fix-sheet.ps1 - align prone-pose frames (row 2) to the cell bottom edge
#
# Sprite sheet layout: 960x900, 4 columns x 3 rows, each cell 240x300.
#   frame8 = (col 0, row 2), cell rect (0,600)-(240,900)
#   frame9 = (col 1, row 2), cell rect (240,600)-(480,900)
# Goal:
#   frame8 content shifts down 73px  -> content bottom at cell-relative y=297
#   frame9 content shifts down 100px -> content bottom at cell-relative y=297
#   (2px of blank space left above the cell bottom edge; horizontal untouched)
# Method: byte-level LockBits copy (lossless, keeps 32bppArgb straight alpha).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root       = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$srcPath    = Join-Path $root 'src\renderer\public\assets\yinyue-sprite-sheet.png'
$resPath    = Join-Path $root 'resources\yinyue-sprite-sheet.png'
$backupPath = Join-Path $PSScriptRoot 'sheet-backup.png'

if (-not (Test-Path -LiteralPath $srcPath)) { throw "source sheet not found: $srcPath" }

$origSrcSize = (Get-Item -LiteralPath $srcPath).Length
Write-Host ('[info] source : {0} ({1} bytes)' -f $srcPath, $origSrcSize)
Write-Host ('[info] target : {0}' -f $resPath)

# 1. backup original (skip if a backup already exists)
if (Test-Path -LiteralPath $backupPath) {
    Write-Host ('[backup] already exists, skipped: {0}' -f $backupPath)
} else {
    Copy-Item -LiteralPath $srcPath -Destination $backupPath
    Write-Host ('[backup] created: {0} ({1} bytes)' -f $backupPath, (Get-Item -LiteralPath $backupPath).Length)
}

# 2. load from a memory stream so the file on disk is not locked
$imgBytes = [System.IO.File]::ReadAllBytes($srcPath)
$stream   = [System.IO.MemoryStream]::new($imgBytes)
$bmp      = [System.Drawing.Bitmap]::new($stream)

if ($bmp.Width -ne 960 -or $bmp.Height -ne 900) {
    throw ('unexpected sheet size: {0}x{1}' -f $bmp.Width, $bmp.Height)
}
if ($bmp.PixelFormat -ne [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) {
    throw ('unexpected pixel format: {0}' -f $bmp.PixelFormat)
}
Write-Host '[load] 960x900 Format32bppArgb'

$CELL_W        = 240
$CELL_H        = 300
$TARGET_BOTTOM = 297   # cell-relative last content row (cell bottom edge = absolute row 899)

function Get-CellBounds {
    param($bmp, $cellX, $cellY, $w, $h)
    $rect = [System.Drawing.Rectangle]::new($cellX, $cellY, $w, $h)
    $d = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $d.Stride
    $buf = [byte[]]::new($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $buf, 0, $buf.Length)
    $bmp.UnlockBits($d)
    $minX = [int]::MaxValue; $maxX = -1
    $minY = [int]::MaxValue; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        $row = $y * $stride
        for ($x = 0; $x -lt $w; $x++) {
            if ($buf[$row + ($x * 4) + 3] -gt 10) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { return $null }
    return [pscustomobject]@{ MinX = $minX; MaxX = $maxX; MinY = $minY; MaxY = $maxY }
}

function Format-Bounds {
    param($b)
    if ($null -eq $b) { return '(empty)' }
    return ('x[{0}..{1}] y[{2}..{3}]' -f $b.MinX, $b.MaxX, $b.MinY, $b.MaxY)
}

function Test-Bounds {
    param($b, $e)
    if ($null -eq $b) { return $false }
    return ($b.MinX -eq $e.MinX -and $b.MaxX -eq $e.MaxX -and $b.MinY -eq $e.MinY -and $b.MaxY -eq $e.MaxY)
}

$frames = @(
    @{ Name = 'frame8'; CellX = 0;   CellY = 600; Dy = 73  }
    @{ Name = 'frame9'; CellX = 240; CellY = 600; Dy = 100 }
)
$expBefore = @{
    frame8 = @{ MinX = 19; MaxX = 219; MinY = 93;  MaxY = 224 }
    frame9 = @{ MinX = 19; MaxX = 219; MinY = 29;  MaxY = 197 }
}
$expAfter = @{
    frame8 = @{ MinX = 19; MaxX = 219; MinY = 166; MaxY = 297 }
    frame9 = @{ MinX = 19; MaxX = 219; MinY = 129; MaxY = 297 }
}

# 3. measure current bounds and decide the shift for each frame
$before = @{}
$jobs = @()
foreach ($f in $frames) {
    $b = Get-CellBounds -bmp $bmp -cellX $f.CellX -cellY $f.CellY -w $CELL_W -h $CELL_H
    $before[$f.Name] = $b
    Write-Host ('[before] {0}: {1}' -f $f.Name, (Format-Bounds $b))
    if (Test-Bounds $b $expBefore[$f.Name]) {
        $dy = $f.Dy
    } elseif (Test-Bounds $b $expAfter[$f.Name]) {
        $dy = 0   # already fixed by a previous run
    } else {
        throw ('{0}: unexpected content bounds {1}' -f $f.Name, (Format-Bounds $b))
    }
    $jobs += @{ Name = $f.Name; CellX = $f.CellX; CellY = $f.CellY; Dy = $dy }
    Write-Host ('[plan] {0}: shift down {1}px' -f $f.Name, $dy)
}

# 4. apply the shifts (byte-exact copy inside each cell)
$needWork = $false
foreach ($j in $jobs) { if ($j.Dy -ne 0) { $needWork = $true } }

if ($needWork) {
    $rectAll = [System.Drawing.Rectangle]::new(0, 0, $bmp.Width, $bmp.Height)
    $d = $bmp.LockBits($rectAll, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $d.Stride
    $px = [byte[]]::new($stride * $bmp.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $px, 0, $px.Length)

    $rowBytes = $CELL_W * 4
    foreach ($j in $jobs) {
        if ($j.Dy -eq 0) { continue }
        $x0 = $j.CellX; $y0 = $j.CellY; $dy = $j.Dy
        # snapshot the whole cell
        $cell = [byte[]]::new($rowBytes * $CELL_H)
        for ($yy = 0; $yy -lt $CELL_H; $yy++) {
            [Array]::Copy($px, ($y0 + $yy) * $stride + ($x0 * 4), $cell, $yy * $rowBytes, $rowBytes)
        }
        # clear the cell (ARGB all zero = fully transparent, no black background)
        for ($yy = 0; $yy -lt $CELL_H; $yy++) {
            [Array]::Clear($px, ($y0 + $yy) * $stride + ($x0 * 4), $rowBytes)
        }
        # write the cell back shifted down, clipped at the cell bottom
        for ($yy = 0; $yy -lt $CELL_H; $yy++) {
            $ty = $yy + $dy
            if ($ty -lt 0 -or $ty -ge $CELL_H) { continue }
            [Array]::Copy($cell, $yy * $rowBytes, $px, ($y0 + $ty) * $stride + ($x0 * 4), $rowBytes)
        }
        Write-Host ('[apply] {0}: moved down {1}px' -f $j.Name, $dy)
    }

    [System.Runtime.InteropServices.Marshal]::Copy($px, 0, $d.Scan0, $px.Length)
    $bmp.UnlockBits($d)
    $bmp.Save($srcPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host ('[save] {0} ({1} bytes)' -f $srcPath, (Get-Item -LiteralPath $srcPath).Length)
} else {
    Write-Host '[apply] nothing to do (sheet already fixed)'
}
$bmp.Dispose()
$stream.Dispose()

# 5. make the resources copy identical
Copy-Item -LiteralPath $srcPath -Destination $resPath -Force
Write-Host ('[copy] {0} ({1} bytes)' -f $resPath, (Get-Item -LiteralPath $resPath).Length)

# 6. verify by re-loading the saved file from disk
$vBytes  = [System.IO.File]::ReadAllBytes($srcPath)
$vStream = [System.IO.MemoryStream]::new($vBytes)
$vBmp    = [System.Drawing.Bitmap]::new($vStream)
$fail = @()

if ($vBmp.Width -eq 960 -and $vBmp.Height -eq 900) {
    Write-Host '[verify] sheet size OK: 960x900'
} else {
    $fail += ('sheet size is {0}x{1}, expected 960x900' -f $vBmp.Width, $vBmp.Height)
}
if ($vBmp.PixelFormat -eq [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) {
    Write-Host '[verify] pixel format OK: Format32bppArgb'
} else {
    $fail += ('pixel format is {0}, expected Format32bppArgb' -f $vBmp.PixelFormat)
}

$checkFrames = @(
    @{ Name = 'frame0'; CellX = 0;   CellY = 0   }
    @{ Name = 'frame8'; CellX = 0;   CellY = 600 }
    @{ Name = 'frame9'; CellX = 240; CellY = 600 }
)
$expVerify = @{
    frame0 = @{ MinX = 57; MaxX = 181; MinY = 19;  MaxY = 282 }
    frame8 = @{ MinX = 19; MaxX = 219; MinY = 166; MaxY = 297 }
    frame9 = @{ MinX = 19; MaxX = 219; MinY = 129; MaxY = 297 }
}
$after = @{}
foreach ($c in $checkFrames) {
    $b = Get-CellBounds -bmp $vBmp -cellX $c.CellX -cellY $c.CellY -w $CELL_W -h $CELL_H
    $after[$c.Name] = $b
    if (Test-Bounds $b $expVerify[$c.Name]) {
        Write-Host ('[verify] {0} OK  : {1}' -f $c.Name, (Format-Bounds $b))
    } else {
        $e = $expVerify[$c.Name]
        $msg = ('{0} bounds are {1}, expected x[{2}..{3}] y[{4}..{5}]' -f $c.Name, (Format-Bounds $b), $e.MinX, $e.MaxX, $e.MinY, $e.MaxY)
        Write-Host ('[verify] {0} FAIL' -f $c.Name)
        $fail += $msg
    }
}
$vBmp.Dispose()
$vStream.Dispose()

$h1 = (Get-FileHash -LiteralPath $srcPath -Algorithm MD5).Hash
$h2 = (Get-FileHash -LiteralPath $resPath -Algorithm MD5).Hash
if ($h1 -eq $h2) {
    Write-Host ('[verify] src and resources copies identical OK (MD5 {0})' -f $h1)
} else {
    Write-Host '[verify] FAIL: src and resources copies differ'
    $fail += 'src and resources copies differ'
}

# 7. summary
Write-Host ''
Write-Host '--- summary ---'
Write-Host ('frame8: {0}  ->  {1}   (down 73px)'  -f (Format-Bounds $before['frame8']), (Format-Bounds $after['frame8']))
Write-Host ('frame9: {0}  ->  {1}  (down 100px)' -f (Format-Bounds $before['frame9']), (Format-Bounds $after['frame9']))
Write-Host ('frame0: {0}   (unchanged, row 0 untouched)' -f (Format-Bounds $after['frame0']))
Write-Host ('file size: {0} -> {1} bytes (backup: {2} bytes)' -f $origSrcSize, (Get-Item -LiteralPath $srcPath).Length, (Get-Item -LiteralPath $backupPath).Length)

if ($fail.Count -gt 0) {
    Write-Host ''
    Write-Host 'RESULT: FAILED'
    foreach ($m in $fail) { Write-Host ('  - {0}' -f $m) }
    exit 1
}
Write-Host ''
Write-Host 'RESULT: ALL CHECKS PASSED'
exit 0
