param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\dist\reply-monitor-1.3.0.xpi")
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
}

$files = Get-ChildItem -LiteralPath $projectRoot -Recurse -File |
    Where-Object {
        $relativePath = [System.IO.Path]::GetRelativePath($projectRoot, $_.FullName).Replace('\', '/')
        $relativePath -eq 'manifest.json' -or
        $relativePath -match '^(src|popup|options|dashboard|icons)/'
    }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $resolvedOutput,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
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
    $archive.Dispose()
}

Write-Output "Package created at $resolvedOutput"
