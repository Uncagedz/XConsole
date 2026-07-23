param(
    [string]$TrackerPath = 'c:\Users\workw\Downloads\NOT FINALIZED DEALS - Funding Tracker.xlsx',
    [string]$OriginalPath = 'c:\Users\workw\Downloads\NOT FINALIZED DEALS.xlsx',
    [string]$OutputPath = 'd:\cdjrf_fb_flow\tmp\funding_dashboard_data.json',
    [datetime]$ReferenceDate = [datetime]'2026-04-02'
)

$ErrorActionPreference = 'Stop'

function Normalize-Text($value) {
    if ($null -eq $value) { return '' }
    return ([string]$value).Trim()
}

function Convert-ExcelDate($value) {
    if ($null -eq $value -or $value -eq '') { return $null }
    if ($value -is [datetime]) { return $value.Date }

    $parsed = 0.0
    if ([double]::TryParse([string]$value, [ref]$parsed)) {
        return [datetime]::FromOADate($parsed).Date
    }

    try {
        return ([datetime]$value).Date
    } catch {
        return $null
    }
}

function Get-AgeDays($dateValue, [datetime]$asOfDate) {
    if ($null -eq $dateValue) { return $null }
    return [int]($asOfDate.Date - $dateValue.Date).TotalDays
}

if (-not (Test-Path -LiteralPath $TrackerPath)) {
    throw "Tracker workbook not found: $TrackerPath"
}

if (-not (Test-Path -LiteralPath $OriginalPath)) {
    throw "Original workbook not found: $OriginalPath"
}

$excel = $null
$origWb = $null
$trackWb = $null
$origWs = $null
$trackWs = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    $origWb = $excel.Workbooks.Open($OriginalPath, $null, $true)
    $trackWb = $excel.Workbooks.Open($TrackerPath, $null, $true)
    $origWs = $origWb.Worksheets.Item(1)
    $trackWs = $trackWb.Worksheets.Item(1)

    $trackerMap = @{}
    $trackLastRow = $trackWs.UsedRange.Rows.Count
    for ($r = 2; $r -le $trackLastRow; $r++) {
        $dealNumber = Normalize-Text ($trackWs.Cells.Item($r, 4).Value2)
        if ([string]::IsNullOrWhiteSpace($dealNumber)) { continue }

        $trackerMap[$dealNumber] = [ordered]@{
            priority = Normalize-Text ($trackWs.Cells.Item($r, 1).Value2)
            stage = Normalize-Text ($trackWs.Cells.Item($r, 2).Value2)
            mainBlocker = Normalize-Text ($trackWs.Cells.Item($r, 3).Value2)
            nextOwner = Normalize-Text ($trackWs.Cells.Item($r, 12).Value2)
            nextAction = Normalize-Text ($trackWs.Cells.Item($r, 13).Value2)
            lastContact = Normalize-Text ($trackWs.Cells.Item($r, 14).Text)
            callStatus = Normalize-Text ($trackWs.Cells.Item($r, 15).Value2)
            stipsNeeded = Normalize-Text ($trackWs.Cells.Item($r, 16).Value2)
            stipsIn = Normalize-Text ($trackWs.Cells.Item($r, 17).Value2)
            downPayment = Normalize-Text ($trackWs.Cells.Item($r, 18).Value2)
            routeOne = Normalize-Text ($trackWs.Cells.Item($r, 19).Value2)
            reynolds = Normalize-Text ($trackWs.Cells.Item($r, 20).Value2)
            readyToFund = Normalize-Text ($trackWs.Cells.Item($r, 21).Value2)
            funded = Normalize-Text ($trackWs.Cells.Item($r, 22).Value2)
            notes = Normalize-Text ($trackWs.Cells.Item($r, 23).Value2)
        }
    }

    $rows = @()
    $origLastRow = $origWs.UsedRange.Rows.Count
    for ($r = 2; $r -le $origLastRow; $r++) {
        $dealNumber = Normalize-Text ($origWs.Cells.Item($r, 1).Value2)
        $dealType = Normalize-Text ($origWs.Cells.Item($r, 2).Value2)
        $dealStatus = Normalize-Text ($origWs.Cells.Item($r, 3).Value2)
        $stockNumber = Normalize-Text ($origWs.Cells.Item($r, 4).Value2)
        $dealCategory = Normalize-Text ($origWs.Cells.Item($r, 5).Value2)
        $dealDate = Convert-ExcelDate ($origWs.Cells.Item($r, 6).Value2)
        $financeManager = Normalize-Text ($origWs.Cells.Item($r, 7).Value2)
        $salesManager = Normalize-Text ($origWs.Cells.Item($r, 8).Value2)
        $deskManager = Normalize-Text ($origWs.Cells.Item($r, 9).Value2)
        $lender = Normalize-Text ($origWs.Cells.Item($r, 10).Value2)
        $buyerName = Normalize-Text ($origWs.Cells.Item($r, 11).Value2)
        $year = Normalize-Text ($origWs.Cells.Item($r, 12).Value2)
        $make = Normalize-Text ($origWs.Cells.Item($r, 13).Value2)
        $model = Normalize-Text ($origWs.Cells.Item($r, 14).Value2)
        $daysInStockRaw = Normalize-Text ($origWs.Cells.Item($r, 15).Value2)
        $newUsed = Normalize-Text ($origWs.Cells.Item($r, 16).Value2)
        $salesperson = Normalize-Text ($origWs.Cells.Item($r, 17).Value2)

        if ([string]::IsNullOrWhiteSpace($dealNumber) -and [string]::IsNullOrWhiteSpace($buyerName)) {
            continue
        }

        $ageDays = Get-AgeDays $dealDate $ReferenceDate
        $priority = if ($ageDays -ge 14) { 'Critical' } elseif ($ageDays -ge 7) { 'High' } else { 'Normal' }
        $ageBucket = if ($null -eq $ageDays) {
            'Unknown'
        } elseif ($ageDays -ge 21) {
            '21+ days'
        } elseif ($ageDays -ge 14) {
            '14-20 days'
        } elseif ($ageDays -ge 7) {
            '7-13 days'
        } else {
            '0-6 days'
        }

        $stockBucket = 'Unknown'
        if ($daysInStockRaw -match '^-?\d+$') {
            $stockDays = [int]$daysInStockRaw
            if ($stockDays -gt 3650 -or $stockDays -lt 0) {
                $stockBucket = 'Outlier'
            } elseif ($stockDays -ge 90) {
                $stockBucket = '90+ days'
            } elseif ($stockDays -ge 60) {
                $stockBucket = '60-89 days'
            } elseif ($stockDays -ge 30) {
                $stockBucket = '30-59 days'
            } else {
                $stockBucket = '0-29 days'
            }
        }

        $tracker = if ($trackerMap.ContainsKey($dealNumber)) { $trackerMap[$dealNumber] } else { $null }

        $rows += [ordered]@{
            dealNumber = $dealNumber
            dealType = $dealType
            dealStatus = $dealStatus
            stockNumber = $stockNumber
            dealCategory = $dealCategory
            dealDate = if ($dealDate) { $dealDate.ToString('yyyy-MM-dd') } else { '' }
            ageDays = $ageDays
            ageBucket = $ageBucket
            priority = if ($tracker) { $tracker.priority } else { $priority }
            financeManager = $financeManager
            salesManager = $salesManager
            deskManager = $deskManager
            lender = $lender
            buyerName = $buyerName
            year = $year
            make = $make
            model = $model
            vehicle = (($year, $make, $model | Where-Object { $_ -and $_ -ne '' }) -join ' ')
            daysInStockRaw = $daysInStockRaw
            stockBucket = $stockBucket
            newUsed = $newUsed
            salesperson = $salesperson
            trackerStage = if ($tracker) { $tracker.stage } else { 'Needs Contact' }
            mainBlocker = if ($tracker) { $tracker.mainBlocker } else { 'Customer Contact' }
            nextOwner = if ($tracker) { $tracker.nextOwner } else { 'Me' }
            nextAction = if ($tracker) { $tracker.nextAction } else { '' }
            lastContact = if ($tracker) { $tracker.lastContact } else { '' }
            callStatus = if ($tracker) { $tracker.callStatus } else { 'Not Called' }
            stipsNeeded = if ($tracker) { $tracker.stipsNeeded } else { '' }
            stipsIn = if ($tracker) { $tracker.stipsIn } else { '' }
            downPayment = if ($tracker) { $tracker.downPayment } else { '' }
            routeOne = if ($tracker) { $tracker.routeOne } else { '' }
            reynolds = if ($tracker) { $tracker.reynolds } else { '' }
            readyToFund = if ($tracker) { $tracker.readyToFund } else { 'No' }
            funded = if ($tracker) { $tracker.funded } else { 'No' }
            notes = if ($tracker) { $tracker.notes } else { '' }
        }
    }

    $directory = Split-Path -Parent $OutputPath
    if ($directory -and -not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    $payload = [ordered]@{
        generatedAt = (Get-Date).ToString('s')
        referenceDate = $ReferenceDate.ToString('yyyy-MM-dd')
        sourceWorkbook = $OriginalPath
        trackerWorkbook = $TrackerPath
        dealCount = $rows.Count
        deals = $rows
    }

    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

    Write-Output "Exported $($rows.Count) deals to $OutputPath"
}
finally {
    if ($origWb) { $origWb.Close($false) }
    if ($trackWb) { $trackWb.Close($false) }
    if ($excel) { $excel.Quit() }

    foreach ($obj in @($trackWs, $origWs, $trackWb, $origWb, $excel)) {
        if ($null -ne $obj) {
            try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) } catch {}
        }
    }

    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}
