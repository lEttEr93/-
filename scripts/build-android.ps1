param(
    [string]$Sdk = 'D:\AI\tools\android-sdk',
    [string]$Jdk = $env:JAVA_HOME,
    [string]$Output = 'build\android\campus-life-1.4-test.apk',
    [string]$Keystore = '',
    [string]$Alias = 'campus-test'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$build = Join-Path $repo 'build\android'
$android = Join-Path $repo 'android'
$workspace = if($env:AI_ROOT){$env:AI_ROOT}elseif(Test-Path -LiteralPath 'D:\AI'){'D:\AI'}else{''}
$env:TEMP = if($workspace){Join-Path $workspace 'scratch'}else{Join-Path $repo '.build-tmp'}
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$env:TMP = $env:TEMP
if (!$Jdk -or !(Test-Path -LiteralPath "$Jdk\bin\javac.exe")) { throw 'Pass -Jdk with a JDK 17 installation (old D8 is incompatible with JDK 21 class metadata).' }
$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"
$platform = Get-ChildItem -LiteralPath (Join-Path $Sdk 'platforms') -Recurse -Filter android.jar | Select-Object -First 1
$tool = Get-ChildItem -LiteralPath (Join-Path $Sdk 'build-tools') -Recurse -Filter aapt2.exe | Select-Object -First 1
if (!$platform -or !$tool) { throw 'Android SDK platform/build-tools are required.' }
$bt = $tool.Directory.FullName
function Run([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe failed with exit code $LASTEXITCODE" }
}
New-Item -ItemType Directory -Path $build,"$build\gen","$build\obj","$build\dex" -Force | Out-Null
Copy-Item -LiteralPath "$repo\shared\data.js" -Destination "$android\assets\data.js" -Force
Run "$bt\aapt2.exe" @('compile','--dir',"$android\res",'-o',"$build\res.zip")
Run "$bt\aapt2.exe" @('link','-I',$platform.FullName,'--manifest',"$android\AndroidManifest.xml",'-A',"$android\assets",'--java',"$build\gen",'-o',"$build\base.apk","$build\res.zip")
$sources = @(Get-ChildItem -LiteralPath "$android\src","$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
Run "$Jdk\bin\javac.exe" (@('-source','8','-target','8','-encoding','UTF-8','-classpath',$platform.FullName,'-d',"$build\obj") + $sources)
$classes = @(Get-ChildItem -LiteralPath "$build\obj" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
$dexArgs = @('--lib',$platform.FullName,'--min-api','24','--output',"$build\dex") + $classes
$dexArgs | Set-Content -LiteralPath "$build\dex-args.txt" -Encoding ASCII
Run "$Jdk\bin\java.exe" @('-cp',"$bt\lib\d8.jar",'com.android.tools.r8.D8',"@$build\dex-args.txt")
Copy-Item -LiteralPath "$build\base.apk" -Destination "$build\unsigned.apk" -Force
Run "$Jdk\bin\jar.exe" @('uf',"$build\unsigned.apk",'-C',"$build\dex",'classes.dex')
Run "$bt\zipalign.exe" @('-f','4',"$build\unsigned.apk","$build\aligned.apk")
if (!$Keystore) {
    $keyDir = if($workspace){Join-Path $workspace 'runs\campus-life\signing'}else{Join-Path $repo 'build\signing'}
    New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
    $Keystore = "$keyDir\test.keystore"
    $env:CAMPUS_KS_PASS = 'android'
    if (!(Test-Path -LiteralPath $Keystore)) {
        Run "$Jdk\bin\keytool.exe" @('-genkeypair','-keystore',$Keystore,'-alias',$Alias,'-keyalg','RSA','-keysize','2048','-validity','10000','-storepass:env','CAMPUS_KS_PASS','-keypass:env','CAMPUS_KS_PASS','-dname','CN=Campus Life Test')
    }
} elseif (!$env:CAMPUS_KS_PASS) { throw 'Set CAMPUS_KS_PASS to the original signing keystore password.' }
if (![IO.Path]::IsPathRooted($Output)) { $Output = Join-Path $repo $Output }
New-Item -ItemType Directory -Path (Split-Path -Parent $Output) -Force | Out-Null
Run "$Jdk\bin\java.exe" @('-jar',"$bt\lib\apksigner.jar",'sign','--ks',$Keystore,'--ks-key-alias',$Alias,'--ks-pass','env:CAMPUS_KS_PASS','--key-pass','env:CAMPUS_KS_PASS','--out',$Output,"$build\aligned.apk")
Run "$Jdk\bin\java.exe" @('-jar',"$bt\lib\apksigner.jar",'verify','--verbose','--print-certs',$Output)
Run "$bt\aapt2.exe" @('dump','badging',$Output)
Write-Output "APK: $Output"
