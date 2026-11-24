# Première mise en ligne de Swipe Dressing sur GitHub Pages : une seule commande.
#   .\premiere-mise-en-ligne.ps1
# 1. Vérifie la clé GitHub (variable d'environnement GITHUB_PERSONAL_ACCESS_TOKEN,
#    passée à GitHub par un en-tête en mémoire : jamais affichée ni écrite dans un fichier).
# 2. Crée le dépôt PUBLIC « swipe-dressing » s'il n'existe pas encore.
# 3. Ajoute le dépôt distant « origin » s'il manque.
# 4. Envoie le code avec deploy.ps1.
# 5. Active GitHub Pages (branche main, racine du dépôt).
# 6. Affiche l'adresse du site.
# Peut être relancé sans risque : chaque étape déjà faite est sautée.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$Proprietaire = 'lilougoncalvesabeille-create'
$Depot = 'swipe-dressing'
$Description = 'Swipe Dressing : appli perso de swipe de vêtements'
$UrlDepot = "https://github.com/$Proprietaire/$Depot.git"
$Site = "https://$Proprietaire.github.io/$Depot/"
$Api = 'https://api.github.com'

# Appelle l'API REST de GitHub. Renvoie le code HTTP et le contenu (JSON décodé) sans jamais
# lever d'erreur pour une réponse HTTP : c'est l'appelant qui décide quoi faire de chaque code.
function Invoke-ApiGitHub([string]$Methode, [string]$Chemin, $Corps = $null) {
  $params = @{
    Method          = $Methode
    Uri             = "$Api$Chemin"
    Headers         = $script:Entetes
    UseBasicParsing = $true
  }
  if ($null -ne $Corps) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Corps | ConvertTo-Json -Depth 5 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  try {
    $reponse = Invoke-WebRequest @params
    $contenu = $null
    if ($reponse.Content) { $contenu = $reponse.Content | ConvertFrom-Json }
    return @{ Statut = [int]$reponse.StatusCode; Contenu = $contenu; Texte = '' }
  } catch {
    $rep = $_.Exception.Response
    if ($null -eq $rep) { throw "GitHub est injoignable ($($_.Exception.Message)). Vérifie la connexion internet." }
    return @{ Statut = [int]$rep.StatusCode; Contenu = $null; Texte = "$($_.ErrorDetails.Message)" }
  }
}

function Assert-Git([string]$quoi) {
  if ($LASTEXITCODE -ne 0) { throw "La commande git a échoué : $quoi." }
}

try {
  # GitHub n'accepte que TLS 1.2 ou plus (Windows PowerShell 5.1 ne l'active pas toujours).
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  # --- 0. Vérifications locales, avant de toucher à GitHub ---
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git est introuvable sur cet ordinateur.' }
  if (-not (Test-Path (Join-Path $root 'deploy.ps1'))) { throw 'deploy.ps1 est introuvable à côté de ce script.' }
  $branche = (git rev-parse --abbrev-ref HEAD)
  Assert-Git 'lecture de la branche'
  if ($branche -ne 'main') {
    throw "Tu es sur la branche « $branche » : GitHub Pages publie la branche main. Fusionne d'abord ton travail dans main (git checkout main, puis git merge $branche), puis relance ce script."
  }
  if (-not (Test-Path (Join-Path $root 'index.html')) -or -not (Test-Path (Join-Path $root 'sw.js'))) {
    throw 'index.html ou sw.js manque à la racine : ce n''est pas le dossier de l''appli.'
  }

  # --- 1. Clé GitHub ---
  $token = $env:GITHUB_PERSONAL_ACCESS_TOKEN
  if (-not $token) { $token = [Environment]::GetEnvironmentVariable('GITHUB_PERSONAL_ACCESS_TOKEN', 'User') }
  if (-not $token) { throw 'Clé GitHub introuvable : définis la variable d''environnement GITHUB_PERSONAL_ACCESS_TOKEN.' }
  $script:Entetes = @{
    Authorization          = "Bearer $token"
    Accept                 = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'swipe-dressing-mise-en-ligne'
  }
  Remove-Variable token

  $moi = Invoke-ApiGitHub 'GET' '/user'
  if ($moi.Statut -eq 401) { throw 'GitHub refuse la clé (401) : elle est peut-être expirée ou révoquée.' }
  if ($moi.Statut -ne 200) { throw "Impossible de lire le compte GitHub (code $($moi.Statut)) : $($moi.Texte)" }
  if ($moi.Contenu.login -ne $Proprietaire) {
    throw "La clé GitHub appartient au compte « $($moi.Contenu.login) », pas à « $Proprietaire »."
  }
  Write-Host "1/6 Clé GitHub valide pour $Proprietaire."

  # --- 2. Dépôt public ---
  $depotExistant = Invoke-ApiGitHub 'GET' "/repos/$Proprietaire/$Depot"
  if ($depotExistant.Statut -eq 200) {
    if ($depotExistant.Contenu.private) {
      throw "Le dépôt $Proprietaire/$Depot existe déjà mais il est privé : GitHub Pages gratuit demande un dépôt public."
    }
    Write-Host "2/6 Le dépôt public $Proprietaire/$Depot existe déjà."
  } elseif ($depotExistant.Statut -eq 404) {
    $creation = Invoke-ApiGitHub 'POST' '/user/repos' @{ name = $Depot; private = $false; description = $Description }
    if ($creation.Statut -eq 201) {
      Write-Host "2/6 Dépôt public $Proprietaire/$Depot créé."
    } elseif ($creation.Statut -eq 422 -and $creation.Texte -match 'already exists') {
      Write-Host "2/6 Le dépôt $Proprietaire/$Depot existe déjà."
    } else {
      throw "La création du dépôt a échoué (code $($creation.Statut)) : $($creation.Texte)"
    }
  } else {
    throw "Impossible de vérifier le dépôt (code $($depotExistant.Statut)) : $($depotExistant.Texte)"
  }

  # --- 3. Dépôt distant « origin » ---
  $distants = @(git remote)
  Assert-Git 'liste des dépôts distants'
  if ($distants -contains 'origin') {
    $urlActuelle = (git remote get-url origin)
    Assert-Git 'lecture de origin'
    $normaliser = { param($u) ($u.Trim().TrimEnd('/') -replace '\.git$', '').ToLower() }
    if ((& $normaliser $urlActuelle) -ne (& $normaliser $UrlDepot)) {
      throw "Le dépôt distant origin pointe ailleurs ($urlActuelle). Attendu : $UrlDepot."
    }
    Write-Host '3/6 Le dépôt distant origin est déjà en place.'
  } else {
    git remote add origin $UrlDepot
    Assert-Git 'ajout de origin'
    Write-Host "3/6 Dépôt distant origin ajouté : $UrlDepot"
  }

  # --- 4. Envoi du code (deploy.ps1 lit lui-même la clé dans l'environnement) ---
  Write-Host '4/6 Envoi du code sur GitHub...'
  & (Join-Path $root 'deploy.ps1') -Message 'Première mise en ligne'

  # --- 5. GitHub Pages (branche main, racine) ---
  $pages = Invoke-ApiGitHub 'GET' "/repos/$Proprietaire/$Depot/pages"
  if ($pages.Statut -eq 200) {
    Write-Host '5/6 GitHub Pages est déjà activé.'
  } else {
    $active = $false
    for ($essai = 1; $essai -le 4 -and -not $active; $essai++) {
      $activation = Invoke-ApiGitHub 'POST' "/repos/$Proprietaire/$Depot/pages" @{ source = @{ branch = 'main'; path = '/' } }
      if ($activation.Statut -eq 201) {
        Write-Host '5/6 GitHub Pages activé (branche main, racine).'
        $active = $true
      } elseif ($activation.Statut -eq 409) {
        Write-Host '5/6 GitHub Pages était déjà activé.'
        $active = $true
      } elseif (($activation.Statut -eq 422 -or $activation.Statut -eq 404) -and $essai -lt 4) {
        # La branche main vient d'arriver : GitHub met parfois quelques secondes à la voir.
        Start-Sleep -Seconds 5
      } else {
        throw "L'activation de GitHub Pages a échoué (code $($activation.Statut)) : $($activation.Texte)"
      }
    }
  }

  # --- 6. Adresse du site ---
  Write-Host ''
  Write-Host "6/6 C'est fait. Le site sera en ligne dans 1 à 2 minutes : $Site" -ForegroundColor Green
  Write-Host 'Sur le téléphone : ouvre cette adresse dans le navigateur, puis « Ajouter à l''écran d''accueil ».'
} catch {
  Write-Host ''
  Write-Host "Échec de la mise en ligne : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Rien n''est perdu : corrige le problème puis relance .\premiere-mise-en-ligne.ps1 (les étapes déjà faites seront sautées).'
  exit 1
} finally {
  Remove-Variable -Name Entetes -Scope Script -ErrorAction SilentlyContinue
}
