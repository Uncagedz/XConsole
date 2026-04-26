param(
    [string]$PdfPath = 'c:\Users\workw\OneDrive\Pictures\Screenshots 1\30 closed deals need to be finalized.pdf',
    [string]$WorkbookPath = 'c:\Users\workw\Downloads\NOT FINALIZED DEALS - Funding Tracker.xlsx',
    [string]$AsOfDate = '2026-04-03'
)

$ErrorActionPreference = 'Stop'

function Get-OleColor([int]$r, [int]$g, [int]$b) {
    return $r + ($g * 256) + ($b * 65536)
}

function Normalize-Text($value) {
    if ($null -eq $value) { return '' }
    return ([string]$value).Trim()
}

function Add-ListValidation($worksheet, [string]$rangeAddress, [string]$listValues) {
    $range = $worksheet.Range($rangeAddress)
    try { $range.Validation.Delete() } catch {}
    $range.Validation.Add(3, 1, 1, $listValues)
    $range.Validation.IgnoreBlank = $true
    $range.Validation.InCellDropdown = $true
    $range.Validation.ShowError = $true
    $range.Validation.ErrorTitle = 'Use dropdown value'
    $range.Validation.ErrorMessage = 'Choose one of the allowed values from the dropdown.'
}

if (-not (Test-Path -LiteralPath $PdfPath)) {
    throw "PDF not found: $PdfPath"
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$pythonScript = @'
from pypdf import PdfReader
import json
import re
import sys
from datetime import datetime

pdf_path = sys.argv[1]
text = PdfReader(pdf_path).pages[0].extract_text() or ""
rows = []
for raw_line in text.splitlines():
    line = raw_line.strip()
    if not re.match(r"^\d{2}/\d{2}/\d{2}\s+", line):
        continue
    match = re.match(r"^(\d{2}/\d{2}/\d{2})\s+(\S+)\s+([NU])\s+(.+?)\s+1\.00\s+", line)
    if not match:
        continue
    date_text, stock_number, new_used_flag, customer_name = match.groups()
    rows.append({
        "dealDate": datetime.strptime(date_text, "%m/%d/%y").strftime("%Y-%m-%d"),
        "stockNumber": stock_number.strip(),
        "customerName": customer_name.strip(),
        "newUsed": "New" if new_used_flag == "N" else "Used",
    })
print(json.dumps(rows))
'@

$pdfDealsJson = $pythonScript | python - $PdfPath
$pdfDeals = $pdfDealsJson | ConvertFrom-Json

if (-not $pdfDeals -or $pdfDeals.Count -eq 0) {
    throw 'No deals were parsed from the PDF.'
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupPath = Join-Path (Split-Path -Parent $WorkbookPath) ("NOT FINALIZED DEALS - Funding Tracker backup before pdf merge $timestamp.xlsx")

$excel = $null
$workbook = $null
$worksheet = $null
$table = $null
$openedViaBind = $false
$createdExcelInstance = $false

try {
    try {
        $workbook = [System.Runtime.InteropServices.Marshal]::BindToMoniker($WorkbookPath)
        $excel = $workbook.Application
        $openedViaBind = $true
    } catch {
        $excel = New-Object -ComObject Excel.Application
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
        $excel.ScreenUpdating = $false
        $excel.EnableEvents = $false
        $workbook = $excel.Workbooks.Open($WorkbookPath)
        $createdExcelInstance = $true
    }

    if ($openedViaBind) {
        $workbook.SaveCopyAs($backupPath)
    } else {
        Copy-Item -LiteralPath $WorkbookPath -Destination $backupPath -Force
    }

    $worksheet = $workbook.Worksheets.Item(1)
    if ($worksheet.ListObjects.Count -gt 0) {
        $table = $worksheet.ListObjects.Item(1)
    }

    $headerMap = @{}
    $usedCols = $worksheet.UsedRange.Columns.Count
    for ($c = 1; $c -le $usedCols; $c++) {
        $headerName = Normalize-Text ($worksheet.Cells.Item(1, $c).Value2)
        if ($headerName) {
            $headerMap[$headerName] = $c
        }
    }

    $logicalColumns = @{
        Priority = @('Priority')
        Stage = @('Stage')
        DealNumber = @('Deal #')
        CustomerName = @('Customer Name')
        StockNumber = @('Stock #')
        FIManager = @('FI Manager', 'Finance Manager')
        Salesman = @('Salesman', 'Salesperson')
        Lender = @('Lender')
        DealDate = @('Deal Date')
        DealAge = @('Deal Age')
        NextAction = @('Next Action')
        ReadyFlag = @('ready to fianlize', 'Ready to Finalize', 'Ready to Fund')
        Funded = @('Funded')
        MainBlocker = @('Main Blocker')
        NextOwner = @('Next Owner')
        LastContact = @('Last Contact')
        CallStatus = @('Call Status')
        StipsNeeded = @('Stips Needed')
        StipsIn = @('Stips In')
        DownPayment = @('Down Payment')
        RouteOne = @('RouteOne')
        Reynolds = @('Reynolds')
        Notes = @('Notes')
    }

    $resolvedColumns = @{}
    foreach ($logicalName in $logicalColumns.Keys) {
        foreach ($candidate in $logicalColumns[$logicalName]) {
            $candidateKey = $headerMap.Keys | Where-Object { $_ -ieq $candidate } | Select-Object -First 1
            if ($candidateKey) {
                $resolvedColumns[$logicalName] = [int]$headerMap[$candidateKey]
                break
            }
        }
    }

    function Get-Col([string]$logicalName, [bool]$Required = $true) {
        if ($resolvedColumns.ContainsKey($logicalName)) {
            return [int]$resolvedColumns[$logicalName]
        }
        if ($Required) {
            throw "Required logical column missing: $logicalName"
        }
        return $null
    }

    function Get-CellText([int]$rowIndex, [string]$logicalName) {
        $colIndex = Get-Col $logicalName $false
        if ($null -eq $colIndex) { return '' }
        return Normalize-Text ($worksheet.Cells.Item($rowIndex, $colIndex).Text)
    }

    function Set-CellValue([int]$rowIndex, [string]$logicalName, $value) {
        $colIndex = Get-Col $logicalName $false
        if ($null -eq $colIndex) { return }
        $worksheet.Cells.Item($rowIndex, $colIndex).Value2 = $value
    }

    function Set-CellDate([int]$rowIndex, [string]$logicalName, [datetime]$value) {
        $colIndex = Get-Col $logicalName $false
        if ($null -eq $colIndex) { return }
        $worksheet.Cells.Item($rowIndex, $colIndex).Value = $value
    }

    function Append-Note([string]$existingText, [string]$noteText) {
        $existingTrimmed = Normalize-Text $existingText
        if (-not $existingTrimmed) { return $noteText }
        if ($existingTrimmed -like "*$noteText*") { return $existingTrimmed }
        return "$existingTrimmed | $noteText"
    }

    function Flag-BadRow([int]$rowIndex) {
        $range = $worksheet.Range($worksheet.Cells.Item($rowIndex, 1), $worksheet.Cells.Item($rowIndex, $usedCols))
        $range.Interior.Color = Get-OleColor 255 199 206
        $range.Font.Color = Get-OleColor 156 0 6
    }

    function Get-RowScore([int]$rowIndex) {
        $score = 0
        if (Get-CellText $rowIndex 'DealNumber') { $score += 8 }
        if (Get-CellText $rowIndex 'FIManager') { $score += 6 }
        if (Get-CellText $rowIndex 'Salesman') { $score += 6 }
        $lenderText = Get-CellText $rowIndex 'Lender'
        if ($lenderText -and $lenderText -ne 'LOOK UP') { $score += 6 }
        $nextActionText = Get-CellText $rowIndex 'NextAction'
        if ($nextActionText -and $nextActionText -notlike 'Added from 30 closed deals PDF*') { $score += 3 }
        if (Get-CellText $rowIndex 'CustomerName') { $score += 2 }
        if (Get-CellText $rowIndex 'DealDate') { $score += 2 }
        return $score
    }

    $lastDataRow = $worksheet.UsedRange.Rows.Count

    $allRowsByStock = @{}
    for ($r = 2; $r -le $lastDataRow; $r++) {
        $stockKey = (Get-CellText $r 'StockNumber').ToUpper()
        if (-not $stockKey) { continue }
        if (-not $allRowsByStock.ContainsKey($stockKey)) {
            $allRowsByStock[$stockKey] = New-Object System.Collections.ArrayList
        }
        [void]$allRowsByStock[$stockKey].Add($r)
    }

    $existingByStock = @{}
    $duplicateRowsByStock = @{}
    foreach ($stockKey in $allRowsByStock.Keys) {
        $bestRow = $null
        $bestScore = -1
        foreach ($candidateRow in $allRowsByStock[$stockKey]) {
            $candidateScore = Get-RowScore $candidateRow
            if ($candidateScore -gt $bestScore -or ($candidateScore -eq $bestScore -and $candidateRow -lt $bestRow)) {
                $bestRow = $candidateRow
                $bestScore = $candidateScore
            }
        }
        $existingByStock[$stockKey] = $bestRow
        $duplicateRows = @($allRowsByStock[$stockKey] | Where-Object { $_ -ne $bestRow })
        if ($duplicateRows.Count -gt 0) {
            $duplicateRowsByStock[$stockKey] = $duplicateRows
        }
    }

    $noteStamp = 'NOT READY TO FINALIZE - added from 30 closed deals PDF 04/03/2026'
    $addedDeals = New-Object System.Collections.Generic.List[string]
    $updatedDeals = New-Object System.Collections.Generic.List[string]

    foreach ($pdfDeal in $pdfDeals) {
        $stockKey = (Normalize-Text $pdfDeal.stockNumber).ToUpper()
        $customerName = Normalize-Text $pdfDeal.customerName
        $dealDate = [datetime]::ParseExact($pdfDeal.dealDate, 'yyyy-MM-dd', $null)
        $rowIndex = $null
        $isNewRow = $false

        if ($existingByStock.ContainsKey($stockKey)) {
            $rowIndex = [int]$existingByStock[$stockKey]
            $updatedDeals.Add($stockKey) | Out-Null
        } else {
            if ($table) {
                $listRow = $table.ListRows.Add()
                $rowIndex = $listRow.Range.Row
            } else {
                $rowIndex = $worksheet.UsedRange.Rows.Count + 1
            }
            $existingByStock[$stockKey] = $rowIndex
            $isNewRow = $true
            $addedDeals.Add($stockKey) | Out-Null
        }

        if ($isNewRow -or -not (Get-CellText $rowIndex 'CustomerName')) { Set-CellValue $rowIndex 'CustomerName' $customerName }
        if ($isNewRow -or -not (Get-CellText $rowIndex 'StockNumber')) { Set-CellValue $rowIndex 'StockNumber' $pdfDeal.stockNumber }
        if ($isNewRow -or -not (Get-CellText $rowIndex 'DealDate')) { Set-CellDate $rowIndex 'DealDate' $dealDate }

        Set-CellValue $rowIndex 'Priority' 'Critical'
        Set-CellValue $rowIndex 'ReadyFlag' 'No'
        Set-CellValue $rowIndex 'Funded' 'No'

        $stage = Get-CellText $rowIndex 'Stage'
        if ($isNewRow -or $stage -eq '' -or $stage -eq 'Ready to Fund' -or $stage -eq 'Funded') {
            Set-CellValue $rowIndex 'Stage' 'Needs Contact'
        }

        $blocker = Get-CellText $rowIndex 'MainBlocker'
        if ($isNewRow -or $blocker -eq '' -or $blocker -eq 'None' -or $blocker -eq 'Customer Contact') {
            Set-CellValue $rowIndex 'MainBlocker' 'Funding'
        }

        if ($isNewRow) {
            Set-CellValue $rowIndex 'DealNumber' ''
            Set-CellValue $rowIndex 'FIManager' ''
            Set-CellValue $rowIndex 'Salesman' ''
            Set-CellValue $rowIndex 'Lender' 'LOOK UP'
            Set-CellValue $rowIndex 'NextOwner' 'Me'
            Set-CellValue $rowIndex 'NextAction' 'Added from 30 closed deals PDF - look up issue'
            Set-CellValue $rowIndex 'LastContact' ''
            Set-CellValue $rowIndex 'CallStatus' 'Not Called'
            Set-CellValue $rowIndex 'StipsNeeded' ''
            Set-CellValue $rowIndex 'StipsIn' ''
            Set-CellValue $rowIndex 'DownPayment' ''
            Set-CellValue $rowIndex 'RouteOne' ''
            Set-CellValue $rowIndex 'Reynolds' ''
        }

        if (-not (Get-CellText $rowIndex 'NextOwner')) {
            Set-CellValue $rowIndex 'NextOwner' 'Me'
        }

        if (-not (Get-CellText $rowIndex 'NextAction')) {
            Set-CellValue $rowIndex 'NextAction' 'Finalize from 30 closed deals PDF'
        }

        $existingNotes = Get-CellText $rowIndex 'Notes'
        if ($existingNotes -ne '') {
            Set-CellValue $rowIndex 'Notes' (Append-Note $existingNotes $noteStamp)
        } elseif ($isNewRow) {
            Set-CellValue $rowIndex 'Notes' $noteStamp
        }

        $dealDateCol = Get-Col 'DealDate' $false
        $dealAgeCol = Get-Col 'DealAge' $false
        if ($null -ne $dealDateCol -and $null -ne $dealAgeCol) {
            $dateAddress = $worksheet.Cells.Item($rowIndex, $dealDateCol).Address($false, $false)
            $worksheet.Cells.Item($rowIndex, $dealAgeCol).Formula = ('=IF({0}="","",TODAY()-{0})' -f $dateAddress)
        }

        Flag-BadRow $rowIndex
    }

    $rowsToDelete = New-Object System.Collections.Generic.List[int]
    foreach ($pdfDeal in $pdfDeals) {
        $stockKey = (Normalize-Text $pdfDeal.stockNumber).ToUpper()
        if ($duplicateRowsByStock.ContainsKey($stockKey)) {
            foreach ($duplicateRow in $duplicateRowsByStock[$stockKey]) {
                if (-not $rowsToDelete.Contains([int]$duplicateRow)) {
                    $rowsToDelete.Add([int]$duplicateRow)
                }
            }
        }
    }

    foreach ($rowToDelete in ($rowsToDelete | Sort-Object -Descending)) {
        $worksheet.Rows.Item($rowToDelete).Delete()
    }

    $lastDataRow = $worksheet.UsedRange.Rows.Count

    $dealDateCol = Get-Col 'DealDate' $false
    $dealAgeCol = Get-Col 'DealAge' $false
    if ($null -ne $dealDateCol) {
        $worksheet.Range($worksheet.Cells.Item(2, $dealDateCol), $worksheet.Cells.Item($lastDataRow, $dealDateCol)).NumberFormat = 'm/d/yyyy'
    }
    if ($null -ne $dealAgeCol) {
        $worksheet.Range($worksheet.Cells.Item(2, $dealAgeCol), $worksheet.Cells.Item($lastDataRow, $dealAgeCol)).NumberFormat = '0'
    }

    $priorityCol = Get-Col 'Priority' $false
    $stageCol = Get-Col 'Stage' $false
    $readyCol = Get-Col 'ReadyFlag' $false
    $nextOwnerCol = Get-Col 'NextOwner' $false
    $callStatusCol = Get-Col 'CallStatus' $false
    $mainBlockerCol = Get-Col 'MainBlocker' $false
    $stipsNeededCol = Get-Col 'StipsNeeded' $false
    $stipsInCol = Get-Col 'StipsIn' $false
    $downPaymentCol = Get-Col 'DownPayment' $false
    $routeOneCol = Get-Col 'RouteOne' $false
    $reynoldsCol = Get-Col 'Reynolds' $false
    $fundedCol = Get-Col 'Funded' $false

    if ($null -ne $priorityCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $priorityCol), $worksheet.Cells.Item($lastDataRow, $priorityCol)).Address()) 'Critical,High,Normal' }
    if ($null -ne $stageCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $stageCol), $worksheet.Cells.Item($lastDataRow, $stageCol)).Address()) 'Needs Contact,Waiting Customer,Waiting Internal,Ready to Fund,Funded' }
    if ($null -ne $mainBlockerCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $mainBlockerCol), $worksheet.Cells.Item($lastDataRow, $mainBlockerCol)).Address()) 'Stips,Down Payment,Customer Contact,RouteOne,Reynolds,Bank,Funding,None' }
    if ($null -ne $nextOwnerCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $nextOwnerCol), $worksheet.Cells.Item($lastDataRow, $nextOwnerCol)).Address()) 'Me,FI,Sales,Customer,Bank' }
    if ($null -ne $callStatusCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $callStatusCol), $worksheet.Cells.Item($lastDataRow, $callStatusCol)).Address()) 'Not Called,Voicemail,Texted,Spoke,Bad Number' }
    if ($null -ne $stipsNeededCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $stipsNeededCol), $worksheet.Cells.Item($lastDataRow, $stipsNeededCol)).Address()) 'No,Yes' }
    if ($null -ne $stipsInCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $stipsInCol), $worksheet.Cells.Item($lastDataRow, $stipsInCol)).Address()) 'No,Partial,Yes' }
    if ($null -ne $downPaymentCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $downPaymentCol), $worksheet.Cells.Item($lastDataRow, $downPaymentCol)).Address()) 'Pending,Set,Received' }
    if ($null -ne $routeOneCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $routeOneCol), $worksheet.Cells.Item($lastDataRow, $routeOneCol)).Address()) 'Not Started,In Progress,Done,N/A' }
    if ($null -ne $reynoldsCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $reynoldsCol), $worksheet.Cells.Item($lastDataRow, $reynoldsCol)).Address()) 'Not Started,In Progress,Done,N/A' }
    if ($null -ne $readyCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $readyCol), $worksheet.Cells.Item($lastDataRow, $readyCol)).Address()) 'No,Yes' }
    if ($null -ne $fundedCol) { Add-ListValidation $worksheet ($worksheet.Range($worksheet.Cells.Item(2, $fundedCol), $worksheet.Cells.Item($lastDataRow, $fundedCol)).Address()) 'No,Yes' }

    $workbook.Save()

    Write-Output ("backup=" + $backupPath)
    Write-Output ("pdf_count=" + $pdfDeals.Count)
    Write-Output ("updated=" + $updatedDeals.Count)
    Write-Output ("added=" + $addedDeals.Count)
    Write-Output ("final_rows=" + ($lastDataRow - 1))
    Write-Output ("updated_stocks=" + (($updatedDeals | Sort-Object) -join ','))
    Write-Output ("added_stocks=" + (($addedDeals | Sort-Object) -join ','))
}
finally {
    if ($workbook -and -not $openedViaBind) { $workbook.Close($true) }
    if ($excel -and $createdExcelInstance) {
        $excel.DisplayAlerts = $true
        $excel.ScreenUpdating = $true
        $excel.EnableEvents = $true
        $excel.Quit()
    }

    foreach ($obj in @($table, $worksheet, $workbook, $excel)) {
        if ($null -ne $obj) {
            try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) } catch {}
        }
    }

    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}
