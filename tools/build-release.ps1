param(
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectRoot "release"
}
$releaseDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($releaseDirectory) | Out-Null
$releasePath = Join-Path $releaseDirectory "BareWatch-v$($manifest.version).zip"

if (Test-Path -LiteralPath $releasePath) {
    throw "A release already exists at $releasePath. Choose another -OutputDirectory or move the existing ZIP."
}

$runtimeFiles = @()
foreach ($directory in @("background", "content", "icons", "options", "popup", "shared", "welcome")) {
    $runtimeFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse
}
foreach ($file in @("manifest.json", "LICENSE", "PRIVACY.md")) {
    $runtimeFiles += Get-Item -LiteralPath (Join-Path $projectRoot $file)
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($releasePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $runtimeFiles) {
        $entryName = $file.FullName.Substring($projectRoot.Length + 1).Replace([char]92, [char]47)
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($releasePath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    if ($entryNames -notcontains "manifest.json") {
        throw "The release ZIP is missing manifest.json at its root."
    }
    if ($entryNames | Where-Object { $_.IndexOf([char]92) -ge 0 -or $_ -match "^(tests|tools|docs|store-assets|[.]git|[.]github)/" }) {
        throw "The release ZIP contains development files or non-portable paths."
    }
}
finally {
    $archive.Dispose()
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $releasePath
Write-Output "Created $releasePath"
Write-Output "SHA256 $($hash.Hash)"
