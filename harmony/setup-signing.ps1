param(
    [string]$SdkRoot = "C:\Users\tsong\sdk\merged",
    [string]$SignDir = "C:\Users\tsong\sdk\merged\signing",
    [string]$StorePass = "123456",
    [string]$KeyPass = "123456"
)

$ErrorActionPreference = "Stop"
$Java = "C:\Users\tsong\java\jdk-17.0.19+10\bin\java.exe"
$SignTool = "$SdkRoot\HarmonyOS-6.1.1\openharmony\toolchains\lib\hap-sign-tool.jar"
$HapUnsigned = "E:\my-project\harmony\entry\build\default\outputs\default\entry-default-unsigned.hap"
$HapSigned = "E:\my-project\harmony\entry\build\default\outputs\default\entry-default-signed.hap"
$BuildProfile = "E:\my-project\harmony\build-profile.json5"

New-Item -ItemType Directory -Path $SignDir -Force | Out-Null

function Run-Tool {
    param([string]$Args)
    $p = Start-Process -FilePath $Java -ArgumentList "-jar `"$SignTool`" $Args" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$SignDir\tool_out.txt" -RedirectStandardError "$SignDir\tool_err.txt"
    Get-Content "$SignDir\tool_out.txt" | Write-Output
    if ($LASTEXITCODE -ne 0) { throw "Tool failed with exit code $LASTEXITCODE" }
}

Write-Output "=== Step 1: Generate Root CA ==="
Run-Tool "generate-ca -keyAlias root-ca -keyAlg ECC -keySize NIST-P-256 -subject `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Root CA`" -validity 3650 -signAlg SHA384withECDSA -keystoreFile `"$SignDir\root-ca.jks`" -keystorePwd $StorePass -outFile `"$SignDir\root-ca.cer`""

Write-Output "=== Step 2: Generate Sub App Signing CA ==="
Run-Tool "generate-ca -keyAlias sub-app-ca -keyAlg ECC -keySize NIST-P-256 -issuer `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Root CA`" -issuerKeyAlias root-ca -subject `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Application Debug Signature Service CA`" -validity 3650 -signAlg SHA384withECDSA -keystoreFile `"$SignDir\root-ca.jks`" -keystorePwd $StorePass -outFile `"$SignDir\sub-app-ca.cer`" -issuerKeystoreFile `"$SignDir\root-ca.jks`" -issuerKeystorePwd $StorePass"

Write-Output "=== Step 3: Generate Sub Profile Signing CA ==="
Run-Tool "generate-ca -keyAlias sub-profile-ca -keyAlg ECC -keySize NIST-P-256 -issuer `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Root CA`" -issuerKeyAlias root-ca -subject `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Profile Debug Signature Service CA`" -validity 3650 -signAlg SHA384withECDSA -keystoreFile `"$SignDir\root-ca.jks`" -keystorePwd $StorePass -outFile `"$SignDir\sub-profile-ca.cer`" -issuerKeystoreFile `"$SignDir\root-ca.jks`" -issuerKeystorePwd $StorePass"

Write-Output "=== Step 4: Generate App Key Pair ==="
Run-Tool "generate-keypair -keyAlias app-key -keyPwd $KeyPass -keyAlg ECC -keySize NIST-P-256 -keystoreFile `"$SignDir\app-keypair.p12`" -keystorePwd $StorePass"

Write-Output "=== Step 5: Generate App Debug Certificate ==="
Run-Tool "generate-app-cert -keyAlias app-key -keyPwd $KeyPass -issuer `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Application Debug Signature Service CA`" -issuerKeyAlias sub-app-ca -issuerKeyPwd $KeyPass -subject `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Dashboard Debug`" -validity 365 -signAlg SHA256withECDSA -rootCaCertFile `"$SignDir\root-ca.cer`" -subCaCertFile `"$SignDir\sub-app-ca.cer`" -keystoreFile `"$SignDir\root-ca.jks`" -keystorePwd $StorePass -outForm certChain -outFile `"$SignDir\app-debug-cert.cer`" -issuerKeystoreFile `"$SignDir\root-ca.jks`" -issuerKeystorePwd $StorePass"

Write-Output "=== Step 6: Generate Profile Key Pair ==="
Run-Tool "generate-keypair -keyAlias profile-key -keyPwd $KeyPass -keyAlg ECC -keySize NIST-P-256 -keystoreFile `"$SignDir\profile-keypair.p12`" -keystorePwd $StorePass"

Write-Output "=== Step 7: Generate Profile Debug Certificate ==="
Run-Tool "generate-profile-cert -keyAlias profile-key -keyPwd $KeyPass -issuer `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Profile Debug Signature Service CA`" -issuerKeyAlias sub-profile-ca -issuerKeyPwd $KeyPass -subject `"C=CN,O=OpenHarmony,OU=OpenHarmony Community,CN=Provision Profile Debug`" -validity 365 -signAlg SHA256withECDSA -rootCaCertFile `"$SignDir\root-ca.cer`" -subCaCertFile `"$SignDir\sub-profile-ca.cer`" -keystoreFile `"$SignDir\root-ca.jks`" -keystorePwd $StorePass -outForm certChain -outFile `"$SignDir\profile-debug-cert.cer`" -issuerKeystoreFile `"$SignDir\root-ca.jks`" -issuerKeystorePwd $StorePass"

Write-Output "=== Step 8: Create Provision Profile JSON ==="
$profileJson = @{
    version = 1
    validity = @{
        notBefore = (Get-Date).ToString("yyyy-MM-dd")
        notAfter = (Get-Date).AddYears(1).ToString("yyyy-MM-dd")
    }
    bundleName = "com.dashboard.app"
    debug = $true
    deviceTypes = @("smartphone", "tablet")
    appDistributionType = "none"
    apl = "normal"
} | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$SignDir\profile.json", $profileJson, [System.Text.UTF8Encoding]::new($false))

Write-Output "=== Step 9: Sign Provision Profile ==="
Run-Tool "sign-profile -mode localSign -keyAlias profile-key -keyPwd $KeyPass -profileCertFile `"$SignDir\profile-debug-cert.cer`" -inFile `"$SignDir\profile.json`" -signAlg SHA256withECDSA -keystoreFile `"$SignDir\profile-keypair.p12`" -keystorePwd $StorePass -outFile `"$SignDir\signed-profile.p7b`""

Write-Output "=== Step 10: Sign HAP ==="
Run-Tool "sign-app -mode localSign -keyAlias app-key -keyPwd $KeyPass -appCertFile `"$SignDir\app-debug-cert.cer`" -profileFile `"$SignDir\signed-profile.p7b`" -inFile `"$HapUnsigned`" -signAlg SHA256withECDSA -keystoreFile `"$SignDir\app-keypair.p12`" -keystorePwd $StorePass -outFile `"$HapSigned`" -compatibleVersion 24 -signCode 1"

Write-Output "=== Signing complete! ==="
Write-Output "Signed HAP: $HapSigned"

Write-Output "=== Step 11: Configure build-profile.json5 ==="
$signConfig = @"
  {
    "name": "debug-dev",
    "material": {
      "storeFile": "$(($SignDir + '\app-keypair.p12').Replace('\', '\\\\'))",
      "storePassword": "$StorePass",
      "keyAlias": "app-key",
      "keyPassword": "$KeyPass",
      "signAlg": "SHA256withECDSA",
      "profile": "$(($SignDir + '\signed-profile.p7b').Replace('\', '\\\\'))",
      "certpath": "$(($SignDir + '\app-debug-cert.cer').Replace('\', '\\\\'))"
    },
    "type": "HarmonyOS"
  }
"@

Write-Output "Add the following signingConfig to build-profile.json5:"
Write-Output $signConfig
