$token = (Get-Content "$env:USERPROFILE\.gemini\config\mcp_config.json" -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue).mcpServers.'github-mcp-server'.env.GITHUB_PERSONAL_ACCESS_TOKEN
if (-not $token) {
    Write-Error "No se encontró el token de GitHub. Por favor, configúrelo en mcp_config.json."
    exit 1
}

$owner = "josegabvaras-spec"
$repo = "vetora"
$basePath = "c:\Users\Fable\Desktop\vetora"

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$filesToPushFull = Get-ChildItem -Path $basePath -Recurse -File | Where-Object {
    $_.LastWriteTime -ge (Get-Date).AddDays(-2) -and 
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.FullName -notmatch "\\\.gemini\\" -and
    $_.FullName -notmatch "\\\.git\\"
} | Select-Object -ExpandProperty FullName

$filesToPush = $filesToPushFull | ForEach-Object { $_.Substring($basePath.Length + 1) -replace '\\', '/' }

# Get latest commit
$refUrl = "https://api.github.com/repos/$owner/$repo/git/ref/heads/main"
$refResponse = Invoke-RestMethod -Uri $refUrl -Method Get -Headers $headers
$latestCommitSha = $refResponse.object.sha
Write-Host "Latest commit: $latestCommitSha"

# Get base tree
$commitUrl = "https://api.github.com/repos/$owner/$repo/git/commits/$latestCommitSha"
$commitResponse = Invoke-RestMethod -Uri $commitUrl -Method Get -Headers $headers
$baseTreeSha = $commitResponse.tree.sha

$treeItems = @()

foreach ($relPath in $filesToPush) {
    $fullPath = Join-Path $basePath $relPath
    $contentBytes = [System.IO.File]::ReadAllBytes($fullPath)
    $base64Content = [System.Convert]::ToBase64String($contentBytes)
    
    $body = @{
        content = $base64Content
        encoding = "base64"
    } | ConvertTo-Json
    
    $blobUrl = "https://api.github.com/repos/$owner/$repo/git/blobs"
    $blobResponse = Invoke-RestMethod -Uri $blobUrl -Method Post -Headers $headers -Body $body -ContentType "application/json"
    
    $treeItems += @{
        path = $relPath
        mode = "100644"
        type = "blob"
        sha = $blobResponse.sha
    }
    Write-Host "Blob created for: $relPath"
}

# Create tree
$treeBody = @{
    base_tree = $baseTreeSha
    tree = $treeItems
} | ConvertTo-Json -Depth 5

$treeUrl = "https://api.github.com/repos/$owner/$repo/git/trees"
$treeResponse = Invoke-RestMethod -Uri $treeUrl -Method Post -Headers $headers -Body $treeBody -ContentType "application/json"

# Create commit
$newCommitBody = @{
    message = "feat: implementacion PWA, logo Vetora y refactor UI/UX"
    tree = $treeResponse.sha
    parents = @($latestCommitSha)
} | ConvertTo-Json -Depth 3

$newCommitUrl = "https://api.github.com/repos/$owner/$repo/git/commits"
$newCommitResponse = Invoke-RestMethod -Uri $newCommitUrl -Method Post -Headers $headers -Body $newCommitBody -ContentType "application/json"

# Update ref
$updateRefBody = @{
    sha = $newCommitResponse.sha
    force = $true
} | ConvertTo-Json

$updateRefUrl = "https://api.github.com/repos/$owner/$repo/git/refs/heads/main"
$updateRefResponse = Invoke-RestMethod -Uri $updateRefUrl -Method Patch -Headers $headers -Body $updateRefBody -ContentType "application/json"

Write-Host "Push successful! SHA: $($newCommitResponse.sha)"
