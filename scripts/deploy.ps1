# Builds the site for its real address and publishes the result to the gh-pages branch.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;$env:Path"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$env:SITE_URL = 'https://ahmedmah1989.github.io'
$env:BASE_PATH = '/dahabology'
$env:SOURCE_REV = git rev-parse --short HEAD
npm test
if ($LASTEXITCODE -ne 0) { throw 'tests failed; nothing was published' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'build failed; nothing was published' }

$remote = git remote get-url origin
$rev = git rev-parse --short HEAD
Set-Location (Join-Path $root 'dist')
New-Item -ItemType File -Name '.nojekyll' -Force | Out-Null      # serve folders that start with "_" as they are
if (Test-Path .git) { Remove-Item -Recurse -Force .git }
git init -q -b gh-pages
git config user.name 'ahmedmah1989'
git config user.email 'ahmedmah1989@users.noreply.github.com'
git add -A
git commit -q -m "Publish site from $rev"
git push -f $remote gh-pages
Remove-Item -Recurse -Force .git
Set-Location $root
Write-Output "published $rev to gh-pages"
