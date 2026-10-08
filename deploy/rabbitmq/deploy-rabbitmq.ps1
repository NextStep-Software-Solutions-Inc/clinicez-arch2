# deploy/rabbitmq/deploy-rabbitmq.ps1
# Script to copy docker-compose.yml and run RabbitMQ on the DigitalOcean droplet in a single connection.

$dropletName = "ubuntu-s-1vcpu-1gb-amd-sgp1-02"
$dropletIp = "128.199.99.124"
$remoteDir = "/root/rabbitmq"
$localFile = Join-Path $PSScriptRoot "docker-compose.yml"
$sshKey = "$env:USERPROFILE\.ssh\id_rsa"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Deploying RabbitMQ to DigitalOcean Droplet" -ForegroundColor Cyan
Write-Host "Droplet: $dropletName ($dropletIp)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

if (-not (Test-Path $localFile)) {
    Write-Error "Could not find $localFile."
    exit 1
}

# The remote command to execute on the droplet
$remoteCommand = "mkdir -p $remoteDir && cat > $remoteDir/docker-compose.yml && cd $remoteDir && (docker compose up -d || docker-compose up -d)"

Write-Host "`nDeploying via doctl ssh..." -ForegroundColor Yellow
Write-Host "You may be prompted for your SSH key passphrase once." -ForegroundColor Yellow
Write-Host "---------------------------------------------" -ForegroundColor Gray

# Run the deployment by piping docker-compose.yml content to doctl ssh
Get-Content $localFile -Raw | doctl compute ssh $dropletName --ssh-command $remoteCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=============================================" -ForegroundColor Green
    Write-Host "Success! RabbitMQ container spin-up completed." -ForegroundColor Green
    Write-Host "Management UI: http://${dropletIp}:15672" -ForegroundColor Green
    Write-Host "Connection Port: ${dropletIp}:5672" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
} else {
    Write-Host "`nDeployment via doctl failed. Trying direct ssh..." -ForegroundColor Yellow
    Write-Host "---------------------------------------------" -ForegroundColor Gray
    
    # Fallback to direct ssh using the IP address
    Get-Content $localFile -Raw | ssh -i $sshKey -o ConnectTimeout=10 "root@${dropletIp}" $remoteCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n=============================================" -ForegroundColor Green
        Write-Host "Success! RabbitMQ container spin-up completed." -ForegroundColor Green
        Write-Host "Management UI: http://${dropletIp}:15672" -ForegroundColor Green
        Write-Host "Connection Port: ${dropletIp}:5672" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
    } else {
        Write-Error "`nDeployment failed."
        exit 1
    }
}
