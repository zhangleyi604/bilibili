param(
    [string]$DbUser = 'root',
    [int]$Port = 8080,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$jdk = Get-ChildItem -LiteralPath '.build-tools/jdk' -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } |
    Select-Object -First 1
if ($jdk) {
    $env:JAVA_HOME = $jdk.FullName
}
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { 'java.exe' }

$env:BILI_DB_USER = $DbUser
$env:BILI_PORT = "$Port"
$askedForPassword = -not (Test-Path Env:BILI_DB_PASSWORD)
if ($askedForPassword) {
    $secure = Read-Host '请输入 MySQL 密码（输入不会显示）' -AsSecureString
    $env:BILI_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
}

try {
    $jar = 'target/bilibili-home-1.0.0.jar'
    if ($Rebuild -or -not (Test-Path -LiteralPath $jar)) {
        $localMaven = '.build-tools/apache-maven-3.9.11/bin/mvn.cmd'
        $maven = if (Test-Path -LiteralPath $localMaven) { $localMaven } else { 'mvn.cmd' }
        $repo = Join-Path $PSScriptRoot '.build-tools/repository'
        & $maven "-Dmaven.repo.local=$repo" --batch-mode clean package
        if ($LASTEXITCODE -ne 0) { throw 'Maven 构建失败，请检查 JDK 版本与网络连接。' }
    }
    Write-Host "首页地址 http://127.0.0.1:$Port/"
    & $java -jar $jar
    if ($LASTEXITCODE -ne 0) { throw "Spring Boot 退出，代码 $LASTEXITCODE" }
} finally {
    if ($askedForPassword) { Remove-Item Env:BILI_DB_PASSWORD -ErrorAction SilentlyContinue }
}
