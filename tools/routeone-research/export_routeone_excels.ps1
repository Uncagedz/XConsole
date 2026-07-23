param(
    [Parameter(Mandatory = $true)]
    [string]$DecisionFundingWorkbook,
    [Parameter(Mandatory = $true)]
    [string]$TsaWorkbook,
    [Parameter(Mandatory = $true)]
    [string]$TrendWorkbook,
    [string]$OutDir = (Join-Path (Get-Location) "outputs\routeone\excel-exports")
)

New-Item -ItemType Directory -Force $OutDir | Out-Null

$Files = @(
    @{ Name = "decision_funding.csv"; Path = $DecisionFundingWorkbook },
    @{ Name = "tsa.csv"; Path = $TsaWorkbook },
    @{ Name = "trend.csv"; Path = $TrendWorkbook }
)

$Excel = New-Object -ComObject Excel.Application
$Excel.Visible = $false
$Excel.DisplayAlerts = $false

try {
    foreach ($File in $Files) {
        $Dest = Join-Path $OutDir $File.Name
        Remove-Item -LiteralPath $Dest -Force -ErrorAction SilentlyContinue
        $Workbook = $Excel.Workbooks.Open($File.Path, $null, $true)
        $Worksheet = $Workbook.Worksheets.Item(1)
        $Worksheet.SaveAs($Dest, 6)
        $Workbook.Close($false)
        Write-Output $Dest
    }
}
finally {
    $Excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($Excel) | Out-Null
}
