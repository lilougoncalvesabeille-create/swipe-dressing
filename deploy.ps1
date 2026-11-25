# Met en ligne Swipe Dressing sur GitHub Pages.
# 1. Nouvelle version du cache hors connexion (pour que les téléphones récupèrent la mise à jour).
# 2. Commit de tous les changements, puis envoi sur GitHub (branche main) : GitHub Pages republie tout seul.
param([string]$Message = 'Mise à jour de Swipe Dressing')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

# Mise en ligne seulement depuis la branche main, avant de toucher à quoi que ce soit.
$branche = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0 -or "$branche".Trim() -ne 'main') {
  throw "Mise en ligne refusée : la branche actuelle est « $branche », pas « main ». Fusionne ton travail dans main, fais « git checkout main », puis relance deploy.ps1."
}

$sw = Join-Path $root 'sw.js'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$swText = [IO.File]::ReadAllText($sw) -replace "const VERSION = '[^']*';", "const VERSION = 'swipe-dressing-$stamp';"
[IO.File]::WriteAllText($sw, $swText, (New-Object Text.UTF8Encoding $false))

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m $Message -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>' --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Le commit a échoué.' }
}

# Authentification avec la clé GitHub de la variable d'environnement utilisateur,
# passée à git par l'environnement (jamais écrite dans .git/config ni affichée).
$token = $env:GITHUB_PERSONAL_ACCESS_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('GITHUB_PERSONAL_ACCESS_TOKEN', 'User') }
if (-not $token) { throw 'Clé GitHub introuvable : définis GITHUB_PERSONAL_ACCESS_TOKEN.' }
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'; $env:GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic $basic"
$env:GCM_INTERACTIVE = 'never'
try {
  git push -u origin main --quiet
  if ($LASTEXITCODE -ne 0) { throw "L'envoi sur GitHub a échoué." }
} finally {
  Remove-Item Env:GIT_CONFIG_COUNT, Env:GIT_CONFIG_KEY_0, Env:GIT_CONFIG_VALUE_0, Env:GCM_INTERACTIVE -ErrorAction SilentlyContinue
}

$url = git remote get-url origin
if ($url -match 'github\.com[:/]([^/]+)/([^/.]+)') {
  $site = "https://$($Matches[1].ToLower()).github.io/$($Matches[2])/"
  Write-Host "Envoyé. En ligne dans environ 1 minute : $site"
} else { Write-Host 'Envoyé.' }
