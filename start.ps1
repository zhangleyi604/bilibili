param(
    [string]$DbUser = 'root',
    [int]$Port = 8080,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$listener = netstat -ano -p tcp |
    Select-String "^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):${Port}\s+\S+\s+LISTENING\s+(\d+)\s*$" |
    Select-Object -First 1
if ($listener) {
    $listenerId = $listener.Matches[0].Groups[1].Value
    Write-Warning "端口 $Port 已被 PID $listenerId 占用。请在原启动终端按 Ctrl+C，或在任务管理器按 PID 结束后台服务，再重试。"
    exit 1
}

$jdk = Get-ChildItem -LiteralPath '.build-tools/jdk' -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } |
    Select-Object -First 1
if ($jdk) {
    $env:JAVA_HOME = $jdk.FullName
}
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { 'java.exe' }

$env:BILI_DB_USER = $DbUser
$env:BILI_PORT = "$Port"
$askedForPassword = -not (Test-Path Env:BILI_DB_PASSWORD) -and -not (Test-Path -LiteralPath '.local/application.properties')
if ($askedForPassword) {
    $secure = Read-Host '请输入 MySQL 密码（输入不会显示）' -AsSecureString
    $env:BILI_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
}

try {
    $jar = 'target/bilibili-home-1.0.0.jar'
    $needsBuild = $Rebuild -or -not (Test-Path -LiteralPath $jar)
    if (-not $needsBuild) {
        $jarTime = (Get-Item -LiteralPath $jar).LastWriteTimeUtc
        $needsBuild = (Get-Item -LiteralPath 'pom.xml').LastWriteTimeUtc -gt $jarTime -or
            [bool](Get-ChildItem -LiteralPath 'src' -File -Recurse | Where-Object { $_.LastWriteTimeUtc -gt $jarTime } | Select-Object -First 1)
    }
    if ($needsBuild) {
        if (Test-Path -LiteralPath $jar) {
            try {
                $jarHandle = [IO.File]::Open((Resolve-Path -LiteralPath $jar).Path, 'Open', 'Read', 'None')
                $jarHandle.Dispose()
            } catch {
                $fileError = $_.Exception.GetBaseException()
                if ($fileError -is [IO.IOException] -and ($fileError.HResult -band 0xffff) -in 32, 33) {
                    Write-Warning "构建文件 $jar 正被占用。请先停止使用它的 Java 服务，再重新打包。"
                    exit 1
                }
                throw
            }
        }
        $localMaven = '.build-tools/apache-maven-3.9.11/bin/mvn.cmd'
        $maven = if (Test-Path -LiteralPath $localMaven) { $localMaven } else { 'mvn.cmd' }
        $repo = Join-Path $PSScriptRoot '.build-tools/repository'
        $buildStartedAt = [DateTime]::UtcNow
        & $maven "-Dmaven.repo.local=$repo" --batch-mode clean package
        if ($LASTEXITCODE -ne 0) { throw "Maven 构建失败（退出码 $LASTEXITCODE）。具体原因见上方首条 [ERROR]。" }
        (Get-Item -LiteralPath $jar).LastWriteTimeUtc = $buildStartedAt
    }
    Write-Host "首页地址 http://127.0.0.1:$Port/"
    & $java -jar $jar
    if ($LASTEXITCODE -ne 0) { throw "Spring Boot 退出，代码 $LASTEXITCODE" }
} finally {
    if ($askedForPassword) { Remove-Item Env:BILI_DB_PASSWORD -ErrorAction SilentlyContinue }
}
