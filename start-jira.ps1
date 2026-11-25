# Start Executive Sprint Dashboard (Frontend + Backend) for Local Network Sharing
$ErrorActionPreference = "Stop"

# Detect primary LAN IPv4 address
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet" -and $_.IPAddress -notmatch "^169\.254\." } |
  Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $lanIp) { $lanIp = "localhost" }

Write-Host ""
Write-Host "Starting Executive Sprint Dashboard..." -ForegroundColor Cyan
Write-Host "  Local URL:   http://localhost:5173/" -ForegroundColor Green
Write-Host "  Network URL: http://$($lanIp):5173/  (Share this with teammates on your LAN)" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray
Write-Host ""

$backend = Start-Process -FilePath "npm" -ArgumentList "--prefix", "backend", "run", "dev" -NoNewWindow -PassThru
$frontend = Start-Process -FilePath "npm" -ArgumentList "--prefix", "frontend", "run", "dev", "--", "--host", "0.0.0.0" -NoNewWindow -PassThru

try {
  Wait-Process -Id $backend.Id, $frontend.Id
} finally {
  if (!$backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
  if (!$frontend.HasExited) { Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue }
}
