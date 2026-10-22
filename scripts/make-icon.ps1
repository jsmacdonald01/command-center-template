# Draws the Command Center orbital mark and packs it into build/icon.ico.
#
# Written with GDI+ rather than a rasteriser so it needs no extra
# dependencies — this machine has no native build toolchain.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icon.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()

function New-MarkBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = [double]$size
    $pad = $s * 0.06
    $rect = New-Object System.Drawing.RectangleF($pad, $pad, ($s - 2*$pad), ($s - 2*$pad))

    # rounded-square tile
    $r = $s * 0.22
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
    $path.AddArc(($rect.Right - $r), $rect.Y, $r, $r, 270, 90)
    $path.AddArc(($rect.Right - $r), ($rect.Bottom - $r), $r, $r, 0, 90)
    $path.AddArc($rect.X, ($rect.Bottom - $r), $r, $r, 90, 90)
    $path.CloseFigure()
    $tile = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 8, 11, 15))
    $g.FillPath($tile, $path)
    $edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 255, 255, 255)), ([float]([Math]::Max(1, $s*0.006)))
    $g.DrawPath($edge, $path)

    # three inclined orbits
    $cx = $s / 2.0
    $cy = $s / 2.0
    $rx = $s * 0.33
    $ry = $s * 0.128
    $penW = [float]([Math]::Max(1.0, $s * 0.026))
    $orbit = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(215, 214, 223, 233)), $penW
    $orbit.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $orbit.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    foreach ($angle in @(0, 60, -60)) {
        $state = $g.Save()
        $g.TranslateTransform([float]$cx, [float]$cy)
        $g.RotateTransform([float]$angle)
        $g.DrawEllipse($orbit, [float](-$rx), [float](-$ry), [float]($rx*2), [float]($ry*2))
        $g.Restore($state)
    }

    # core glow, then core
    $glowR = $s * 0.17
    $glowRect = New-Object System.Drawing.RectangleF(($cx-$glowR), ($cy-$glowR), ($glowR*2), ($glowR*2))
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse($glowRect)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(230, 255, 255, 255)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 203, 213, 225))
    $g.FillEllipse($glow, $glowRect)

    $coreR = $s * 0.062
    $core = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillEllipse($core, [float]($cx-$coreR), [float]($cy-$coreR), [float]($coreR*2), [float]($coreR*2))

    $g.Dispose()
    return $bmp
}

foreach ($size in $sizes) {
    $bmp = New-MarkBitmap $size
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += ,($ms.ToArray())
    $bmp.Dispose()
    $ms.Dispose()
}

# ICO container: 6-byte header, 16 bytes per entry, then the PNG payloads.
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = $sizes[$i]
    $w.Write([Byte]($(if ($dim -ge 256) { 0 } else { $dim })))
    $w.Write([Byte]($(if ($dim -ge 256) { 0 } else { $dim })))
    $w.Write([Byte]0); $w.Write([Byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$pngs[$i].Length)
    $w.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $w.Write($png) }
$w.Flush()

$dest = Join-Path $root 'build\icon.ico'
[System.IO.File]::WriteAllBytes($dest, $out.ToArray())
$w.Dispose(); $out.Dispose()

Write-Output "wrote $dest ($([Math]::Round((Get-Item $dest).Length/1kb,1)) KB, $($sizes.Count) sizes)"
