# Ejecutar como Administrador en PowerShell
# Reenvía el puerto 80 de Windows hacia WSL2 para que sea accesible en la red local

$wslIp = (wsl hostname -I).Trim().Split(" ")[0]

Write-Host "IP de WSL2: $wslIp"

# Eliminar regla anterior si existe
netsh interface portproxy delete v4tov4 listenport=80 listenaddress=0.0.0.0 2>$null

# Crear portproxy: cualquier IP de Windows:80 -> WSL2:80
netsh interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=80 connectaddress=$wslIp

# Abrir puerto 80 en el firewall de Windows
netsh advfirewall firewall delete rule name="GrandCasino HTTP" 2>$null
netsh advfirewall firewall add rule name="GrandCasino HTTP" dir=in action=allow protocol=TCP localport=80

$winIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*WSL*" } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Listo. Accede desde la red local en: http://$winIp"
Write-Host "Para deshacer: netsh interface portproxy delete v4tov4 listenport=80 listenaddress=0.0.0.0"
