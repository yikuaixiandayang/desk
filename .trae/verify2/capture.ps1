Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Write-Host "VS: X=$($vs.X) Y=$($vs.Y) W=$($vs.Width) H=$($vs.Height)"
$bmp = New-Object System.Drawing.Bitmap $vs.Width, $vs.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $bmp.Size)
$path = 'E:\运维之路\desk\.trae\verify2\00-initial.png'
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Saved: $path"