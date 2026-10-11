$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconsDirectory = Join-Path $projectRoot "icons"
[System.IO.Directory]::CreateDirectory($iconsDirectory) | Out-Null

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

foreach ($size in @(16, 32, 48, 128)) {
    $scale = 4
    $renderSize = $size * $scale
    $bitmap = [System.Drawing.Bitmap]::new($renderSize, $renderSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $inset = $renderSize * 0.04
    $backgroundPath = New-RoundedRectanglePath -X $inset -Y $inset -Width ($renderSize - (2 * $inset)) -Height ($renderSize - (2 * $inset)) -Radius ($renderSize * 0.255)
    $startPoint = [System.Drawing.PointF]::new($renderSize * 0.14, $renderSize * 0.1)
    $endPoint = [System.Drawing.PointF]::new($renderSize * 0.9, $renderSize * 0.92)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $startPoint,
        $endPoint,
        [System.Drawing.ColorTranslator]::FromHtml("#ff2454"),
        [System.Drawing.ColorTranslator]::FromHtml("#ff7a36")
    )
    $graphics.FillPath($gradient, $backgroundPath)

    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $font = [System.Drawing.Font]::new("Segoe UI", $renderSize * 0.64, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $letterBounds = [System.Drawing.RectangleF]::new(0, -($renderSize * 0.025), $renderSize, $renderSize)
    $graphics.DrawString("B", $font, $white, $letterBounds, $format)

    $output = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $outputGraphics = [System.Drawing.Graphics]::FromImage($output)
    $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $outputGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $outputGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $outputGraphics.DrawImage($bitmap, 0, 0, $size, $size)

    $outputPath = Join-Path $iconsDirectory "icon$size.png"
    $output.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $outputGraphics.Dispose()
    $output.Dispose()
    $format.Dispose()
    $font.Dispose()
    $white.Dispose()
    $gradient.Dispose()
    $backgroundPath.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output "Generated BareWatch icons in $iconsDirectory"
