$ErrorActionPreference = 'Stop'
$d = (Get-Location).Path
$port = 8811
$srv = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$srv.Start()
Write-Host "PID=$PID port=$port dir=$d"
while ($true) {
  $cl = $srv.AcceptTcpClient()
  try {
    $st = $cl.GetStream()
    $rd = New-Object IO.StreamReader($st)
    $line = $rd.ReadLine()
    while ($true) { $h = $rd.ReadLine(); if ($h -eq $null -or $h -eq '') { break } }
    if ($line) {
      $path = ($line -split ' ')[1]
      $path = $path.Split('?')[0].TrimStart('/')
      if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
      $f = Join-Path $d ([Uri]::UnescapeDataString($path))
      if (Test-Path -LiteralPath $f -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($f).ToLower()
        switch ($ext) {
          '.html' { $ct = 'text/html; charset=utf-8' }
          '.css'  { $ct = 'text/css; charset=utf-8' }
          '.js'   { $ct = 'application/javascript; charset=utf-8' }
          '.png'  { $ct = 'image/png' }
          '.json' { $ct = 'application/json' }
          default { $ct = 'application/octet-stream' }
        }
        $bytes = [IO.File]::ReadAllBytes($f)
        $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $hb = [Text.Encoding]::ASCII.GetBytes($head)
        $st.Write($hb, 0, $hb.Length)
        $st.Write($bytes, 0, $bytes.Length)
      } else {
        $bytes = [Text.Encoding]::UTF8.GetBytes('not found')
        $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
        $hb = [Text.Encoding]::ASCII.GetBytes($head)
        $st.Write($hb, 0, $hb.Length)
        $st.Write($bytes, 0, $bytes.Length)
      }
      $st.Flush()
    }
    $st.Close()
  } catch { }
  $cl.Close()
}
