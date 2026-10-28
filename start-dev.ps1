Set-Location 'C:\Users\sinde\Documents\work\projects\icenter-work'

# Ждём готовности PostgreSQL
while (-not (Test-NetConnection 127.0.0.1 -Port 5434 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    Start-Sleep -Seconds 5
}

npm run dev -- -p 3000
