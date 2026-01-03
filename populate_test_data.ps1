# Configuration
$baseUrl = "http://localhost:9000"
$className = "server"
$tlName = "production_db_01"

# Time settings
$daysToSimulate = 7
$pointsToGenerate = 1000
$intervalMinutes = [math]::Round(($daysToSimulate * 24 * 60) / $pointsToGenerate)

$endTime = (Get-Date).ToUniversalTime()
$startTime = $endTime.AddDays(-$daysToSimulate)

# Metric Thresholds
$cpuYellowAt = 75
$cpuRedAt = 90
$memYellowAt = 80
$memRedAt = 95

Write-Host "Generating ~$pointsToGenerate data points for $className/$tlName over last $daysToSimulate days..."
Write-Host "Interval: ~$intervalMinutes minutes"

$currentTime = $startTime
$pointCount = 0

# Random generator
$rand = New-Object System.Random

# Simulation state
$baseLoad = 30
$trend = 0

while ($currentTime -lt $endTime) {
    $pointCount++
    
    # 1. Daily Cycle (Sine wave)
    # Peak at 14:00 (2PM), Trough at 02:00 (2AM)
    # Period = 24 hours
    # Hour of day (0-24)
    $hour = $currentTime.Hour + ($currentTime.Minute / 60.0)
    # Shift sine wave so peak is at 14
    # sin(x) peaks at PI/2.
    # We want peak at hour 14.
    # 2*PI * (h - shift) / 24 = PI/2
    # h - shift = 6 => shift = 8.
    $dailyCycle = [math]::Sin((2 * [math]::PI * ($hour - 8)) / 24) 
    # Amplitude +/- 20%
    $cycleVal = $dailyCycle * 20
    
    # 2. Random Noise (+/- 5%)
    $noise = ($rand.NextDouble() * 10) - 5
    
    # 3. Random Spikes (5% chance of spike)
    $spike = 0
    if ($rand.NextDouble() -gt 0.95) {
        $spike = $rand.Next(15, 40)
    }

    # 4. Long term trend (drift)
    # Slow random walk
    $trend += ($rand.NextDouble() * 0.4) - 0.2
    # Clamp trend
    if ($trend -gt 15) { $trend = 15 }
    if ($trend -lt -10) { $trend = -10 }

    # Calculate CPU
    $cpu = $baseLoad + $cycleVal + $noise + $spike + $trend
    
    # Clamp CPU 0-100
    if ($cpu -lt 0) { $cpu = 0 }
    if ($cpu -gt 100) { $cpu = 100 }
    
    # Calculate Memory (Correlated but smoother and higher base)
    $memBase = 40
    $mem = $memBase + ($cycleVal * 0.5) + ($trend * 0.8) + ($rand.NextDouble() * 5)
    if ($mem -lt 10) { $mem = 10 }
    if ($mem -gt 98) { $mem = 98 }

    # Calculate Run Queue (Correlated with CPU but more volatile)
    # Base it on CPU/2 + random noise
    $runQueue = ($cpu / 2) + ($rand.Next(-10, 30))
    if ($runQueue -lt 1) { $runQueue = 1 }
    if ($runQueue -gt 100) { $runQueue = 100 }

    # Prepare payload
    $timestamp = $currentTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $expiresAt = $currentTime.AddMinutes($intervalMinutes * 3).ToString("yyyy-MM-ddTHH:mm:ssZ")

    $payload = @{
        class = $className
        group = "default"
        tl = $tlName
        colour = "inferred"
        expires_at = $expiresAt
        description = "Load: $([math]::Round($cpu, 1))% | Mem: $([math]::Round($mem, 1))% | RQ: $([math]::Round($runQueue, 0))"
        timestamp = $timestamp
        tags = @("simulation", "production", "high_traffic")
        data = @{
            cpu_usage = @{
                key = "cpu_usage"
                value = [math]::Round($cpu, 2)
                type = "gauge"
                unit = "%"
                "yellow at" = $cpuYellowAt
                "red at" = $cpuRedAt
            }
            memory_usage = @{
                key = "memory_usage"
                value = [math]::Round($mem, 2)
                type = "gauge"
                unit = "%"
                "yellow at" = $memYellowAt
                "red at" = $memRedAt
            }
            run_queue = @{
                key = "run_queue"
                value = [math]::Round($runQueue, 0)
                type = "gauge"
                unit = ""
                "yellow at" = 40
                "red at" = 70
            }
        }
    }

    $jsonPayload = $payload | ConvertTo-Json -Depth 5
    
    # Send batch or single? Single for simplicity with script, 
    # but strictly speaking 1000 requests in a loop might take a moment.
    # It's fine for local testing.
    
    try {
        $null = Invoke-RestMethod -Uri $baseUrl -Method Post -Body $jsonPayload -ContentType "application/json"
        
        # Progress indicator every 50 points
        if ($pointCount % 50 -eq 0) {
            Write-Host "Progress: $pointCount / ~$pointsToGenerate ($([math]::Round(($pointCount/$pointsToGenerate)*100))%) - Current Date: $timestamp"
        }
    } catch {
        Write-Warning "Failed to send at $timestamp : $($_.Exception.Message)"
    }

    $currentTime = $currentTime.AddMinutes($intervalMinutes)
}

Write-Host "Simulation complete. Total points: $pointCount"
