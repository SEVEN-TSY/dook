# Rebuild Windows icon assets from the supplied transparent brand image.
Add-Type -AssemblyName System.Drawing
$resourceDirectory = Join-Path $PSScriptRoot '../resources'
$sourceLogo = [System.Drawing.Bitmap]::new((Join-Path $resourceDirectory 'brand.png'))
# Trim transparent margins so the supplied mark stays visually centered.
$left = $sourceLogo.Width
$top = $sourceLogo.Height
$right = -1
$bottom = -1
for ($y = 0; $y -lt $sourceLogo.Height; $y++) {
  for ($x = 0; $x -lt $sourceLogo.Width; $x++) {
    if ($sourceLogo.GetPixel($x, $y).A -gt 0) {
      $left = [Math]::Min($left, $x)
      $top = [Math]::Min($top, $y)
      $right = [Math]::Max($right, $x)
      $bottom = [Math]::Max($bottom, $y)
    }
  }
}
$bounds = [System.Drawing.Rectangle]::new($left, $top, $right - $left + 1, $bottom - $top + 1)
$mark = $sourceLogo.Clone($bounds, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$mark.Save((Join-Path $resourceDirectory 'brand-mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$iconImage = [System.Drawing.Bitmap]::new(256, 256)
$canvas = [System.Drawing.Graphics]::FromImage($iconImage)
$canvas.Clear([System.Drawing.Color]::Transparent)
$canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
# A superellipse keeps the square proportions with continuously rounded corners.
$outline = [System.Drawing.Drawing2D.GraphicsPath]::new()
$points = [System.Drawing.PointF[]]::new(720)
for ($index = 0; $index -lt $points.Length; $index++) {
  $angle = 2 * [Math]::PI * $index / $points.Length
  $cosine = [Math]::Cos($angle)
  $sine = [Math]::Sin($angle)
  $x = 128 + 127 * [Math]::Sign($cosine) * [Math]::Pow([Math]::Abs($cosine), 2.0 / 3)
  $y = 128 + 127 * [Math]::Sign($sine) * [Math]::Pow([Math]::Abs($sine), 2.0 / 3)
  $points[$index] = [System.Drawing.PointF]::new($x, $y)
}
$outline.AddPolygon($points)
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Black)
$canvas.FillPath($background, $outline)
$background.Dispose()
$outline.Dispose()
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$scale = 236.0 / [Math]::Max($mark.Width, $mark.Height)
$width = [single]($mark.Width * $scale)
$height = [single]($mark.Height * $scale)
$canvas.DrawImage($mark, [System.Drawing.RectangleF]::new((256 - $width) / 2, (256 - $height) / 2, $width, $height))
$iconImage.Save((Join-Path $resourceDirectory 'app-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$sourceLogo.Dispose()
$mark.Dispose()

# ICO entries contain PNGs at each Windows shell size.
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$entries = @()
foreach ($size in $sizes) {
  $scaled = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($scaled)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($iconImage, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
  $stream = [System.IO.MemoryStream]::new()
  $scaled.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $entries += ,$stream.ToArray()
  $stream.Dispose()
  $graphics.Dispose()
  $scaled.Dispose()
}
$iconImage.Dispose()
$file = [System.IO.File]::Create((Join-Path $resourceDirectory 'app-icon.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Length)
$offset = 6 + 16 * $sizes.Length
for ($index = 0; $index -lt $sizes.Length; $index++) {
  $dimension = $sizes[$index] % 256
  $writer.Write([byte]$dimension)
  $writer.Write([byte]$dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$entries[$index].Length)
  $writer.Write([uint32]$offset)
  $offset += $entries[$index].Length
}
foreach ($entry in $entries) { $writer.Write([byte[]]$entry) }
$writer.Dispose()
