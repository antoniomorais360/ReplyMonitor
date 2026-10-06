param([string]$OutputPath)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot "dist\reply-monitor-$($manifest.version).xpi"
}
$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
}

$files = Get-ChildItem -LiteralPath $projectRoot -Recurse -File |
    Where-Object {
        $relativePath = [System.IO.Path]::GetRelativePath($projectRoot, $_.FullName).Replace('\', '/')
        $relativePath -in @('manifest.json', 'LICENSE') -or
        $relativePath -match '^(src|popup|compose|options|dashboard|icons)/'
    }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = $null

try {
    $archive = [System.IO.Compression.ZipFile]::Open(
        $resolvedOutput,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    foreach ($file in $files) {
        $entryName = [System.IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    if ($null -ne $archive) {
        $archive.Dispose()
    }
}

$verification = [System.IO.Compression.ZipFile]::OpenRead($resolvedOutput)
try {
    foreach ($file in $files) {
        $name = [System.IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
        $entry = $verification.GetEntry($name)
        if ($null -eq $entry) { throw "Missing packaged file: $name" }
        $stream = $entry.Open()
        $sourceStream = [System.IO.File]::OpenRead($file.FullName)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $actual = [System.BitConverter]::ToString($sha.ComputeHash($stream))
            $expected = [System.BitConverter]::ToString($sha.ComputeHash($sourceStream))
            if ($actual -ne $expected) { throw "Packaged content mismatch: $name" }
        } finally { $stream.Dispose(); $sourceStream.Dispose(); $sha.Dispose() }
    }
} finally { $verification.Dispose() }
Write-Output "Package created and verified at $resolvedOutput"
