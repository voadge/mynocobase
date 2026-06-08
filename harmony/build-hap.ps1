param(
    [string]$HvigorProjectDir = "E:\my-project\harmony",
    [switch]$SignOnly
)

$ErrorActionPreference = "Continue"
$SignDir = "C:\Users\tsong\sdk\merged\signing"
$Java = "C:\Users\tsong\java\jdk-17.0.19+10\bin\java.exe"
$SignTool = "C:\Users\tsong\sdk\merged\HarmonyOS-6.1.1\openharmony\toolchains\lib\hap-sign-tool.jar"
$HapOutput = "$HvigorProjectDir\entry\build\default\outputs\default"

function Sign-Hap {
    $unsignedHap = Get-ChildItem "$HapOutput\*unsigned*.hap" | Select-Object -First 1
    if (-not $unsignedHap) {
        Write-Host "No unsigned HAP found at $HapOutput" -ForegroundColor Yellow
        return $false
    }
    $signedPath = $unsignedHap.FullName -replace '-unsigned', '-signed'
    Write-Host "Signing: $($unsignedHap.Name)..." -ForegroundColor Cyan
    $result = & $Java -jar $SignTool sign-app -mode localSign -keyAlias app-key -keyPwd 123456 `
        -appCertFile "$SignDir\app-debug-chain.cer" `
        -profileFile "$SignDir\signed-profile.p7b" `
        -inFile $unsignedHap.FullName `
        -signAlg SHA256withECDSA `
        -keystoreFile "$SignDir\app-keypair.p12" `
        -keystorePwd 123456 `
        -outFile $signedPath `
        -compatibleVersion 24 -signCode 1 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SIGNED: $signedPath ($('{0:N0} bytes' -f (Get-Item $signedPath).Length))" -ForegroundColor Green
        return $true
    } else {
        Write-Host "SIGN FAILED" -ForegroundColor Red
        return $false
    }
}

if ($SignOnly) {
    Sign-Hap
    exit
}

# Full build
$env:PATH = "C:\Program Files\Huawei\DevEco Studio\tools\node;$env:PATH"
$env:DEVECO_SDK_HOME = "C:\Users\tsong\sdk\merged"

# Install @ohos packages from local DevEco installation
$wsDir = "$env:USERPROFILE\.hvigor\project_caches\33606bcb07dba9c03b0aeb595e0b00dc\workspace"
New-Item "$wsDir" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
$npmExe = "C:\Program Files\Huawei\DevEco Studio\tools\node\npm.cmd"

# Pre-populate workspace (skip registry fetch for private @ohos packages)
Write-Host "Pre-populating workspace packages..." -ForegroundColor Cyan
cmd /c "`"$npmExe`" install --prefix `"$wsDir`" --no-audit --no-fund file:`"C:/Program Files/Huawei/DevEco Studio/tools/hvigor/hvigor`" file:`"C:/Program Files/Huawei/DevEco Studio/tools/hvigor/hvigor-ohos-plugin`" 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed!" -ForegroundColor Red; exit 1 }

# Build unsigned HAP
$hvigorCli = "$wsDir\node_modules\@ohos\hvigor\bin\hvigor.js"
Set-Location $HvigorProjectDir
Write-Host "Building HAP..." -ForegroundColor Cyan
& "C:\Program Files\Huawei\DevEco Studio\tools\node\node.exe" $hvigorCli assembleHap --mode module -p module=entry@default 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL" -ForegroundColor Green
    # Sign the HAP
    Sign-Hap
} else {
    Write-Host "BUILD FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
}
