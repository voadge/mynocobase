param(
    [Parameter(Position=0,Mandatory=$true)][string]$Action,
    [Parameter(Position=1)][string]$Resource,
    [Parameter(Position=2)][string]$RawValues,
    [string]$FilterByTk,
    [string]$Filter,
    [string]$Fields,
    [string]$Appends,
    [string]$Sort,
    [string]$Measures,
    [string]$Dimensions,
    [string]$Orders,
    [string]$SourceId,
    [int]$Page,
    [int]$PageSize,
    [int]$Limit
)

$ErrorActionPreference = "Stop"
$token = $env:NOCOBASE_TOKEN
if (-not $token) {
    Write-Error "请设置环境变量 NOCOBASE_TOKEN`n示例: `$env:NOCOBASE_TOKEN='your-token-here'"
    exit 1
}

$mcpMethod = switch ($Action) {
    "list"   { "resource_list" }
    "get"    { "resource_get" }
    "create" { "resource_create" }
    "update" { "resource_update" }
    "delete" { "resource_destroy" }
    "query"  { "resource_query" }
    default { Write-Error "Unknown action: $Action. Use: list, get, create, update, delete, query"; exit 1 }
}

$arguments = [ordered]@{resource=$Resource}
if ($FilterByTk) { $arguments.filterByTk = $FilterByTk }
if ($SourceId)   { $arguments.sourceId = $SourceId }
if ($Page)       { $arguments.page = $Page }
if ($PageSize)   { $arguments.pageSize = $PageSize }
if ($Limit)      { $arguments.limit = $Limit }
if ($Fields)     { $arguments.fields = @($Fields -split ',' | ForEach-Object { $_.Trim() }) }
if ($Appends)    { $arguments.appends = @($Appends -split ',' | ForEach-Object { $_.Trim() }) }
if ($Sort)       { $arguments.sort = @($Sort -split ',' | ForEach-Object { $_.Trim() }) }
if ($Filter)     { $arguments.filter = $Filter | ConvertFrom-Json }
if ($Measures)   { $arguments.measures = $Measures | ConvertFrom-Json }
if ($Dimensions) { $arguments.dimensions = $Dimensions | ConvertFrom-Json }
if ($Orders)     { $arguments.orders = $Orders | ConvertFrom-Json }
if ($RawValues)  { $arguments.values = $RawValues | ConvertFrom-Json }

$mcpParams = [ordered]@{name=$mcpMethod; arguments=$arguments}
$body = [ordered]@{jsonrpc="2.0"; id=[guid]::NewGuid().ToString("N").Substring(0,8); method="tools/call"; params=$mcpParams} | ConvertTo-Json -Compress -Depth 10

$tmpFile = "E:\my-project\.tmp-mcp.json"
try {
    Set-Content -NoNewline -Encoding ASCII -Path $tmpFile -Value $body
    $auth = "Authorization: Bearer $token"
    $raw = curl.exe -s -X POST "https://voadge.top:668/api/mcp" -H $auth -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "@E:\my-project\.tmp-mcp.json" -k 2>&1
    if ($raw -match 'data:\s*(\{.*\})') {
        Write-Output $Matches[1]
    } else {
        Write-Output "$raw"
    }
}
finally { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
