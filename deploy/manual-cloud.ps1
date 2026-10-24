#Requires -Version 5.1
<#
.SYNOPSIS
Prepare or deploy the manual mobile-presenter service without changing gcloud defaults.
.DESCRIPTION
PrepareOnly creates a local allowlisted source package and non-secret deployment plan.
The deployment path checks existing resources; it never creates buckets, repositories,
service accounts, secrets, API activations, or additional storage IAM grants.
IAP is the default access mode. Explicit public mode remains subject to organization policy.
Both modes retain application PIN/screen-key checks and preserve existing IAP settings.
.EXAMPLE
.\deploy\manual-cloud.ps1 -Project my-quiz-project -Bucket my-quiz-private -ArtifactRepository quiz-images -ServiceAccount quiz-runtime@my-quiz-project.iam.gserviceaccount.com -HostPinSecret ox-manual-host-pin:1 -ScreenKeySecret ox-manual-screen-key:1 -IapMember user:host@example.com -PrepareOnly
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$Project,
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')]
    [string]$Region = 'asia-northeast3',
    [ValidatePattern('^[a-z][a-z0-9-]{0,47}[a-z0-9]$')]
    [string]$Service = 'ox-manual-quiz',
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$')]
    [string]$Bucket,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{0,61}[a-z0-9]$')]
    [string]$ArtifactRepository,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$')]
    [string]$ServiceAccount,
    [ValidatePattern('^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$')]
    [string]$BuildServiceAccount,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9_-]+:[1-9][0-9]*$')]
    [string]$HostPinSecret,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9_-]+:[1-9][0-9]*$')]
    [string]$ScreenKeySecret,
    [ValidatePattern('^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$')]
    [string]$SourceStagingBucket,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_./-]{0,510}[A-Za-z0-9]$')]
    [string]$GcsObject = 'manual/state-v1.json',
    [ValidateSet('public', 'iap')]
    [string]$AccessMode = 'iap',
    [ValidatePattern('^(user|group):[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')]
    [string]$IapMember,
    [string]$PublicScreenUrl,
    [ValidateRange(0, 1)]
    [int]$MinInstances = 0,
    [switch]$AlwaysOnCpu,
    [switch]$PrepareOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Service -eq 'ox-quiz') { throw 'ox-quiz is reserved for the existing participant game. Choose a new manual service name.' }
if ($ServiceAccount -notlike "*@$Project.iam.gserviceaccount.com") { throw 'Use an existing runtime service account in the explicitly selected project.' }
if ($BuildServiceAccount -and $BuildServiceAccount -notlike "*@$Project.iam.gserviceaccount.com") { throw 'Use a build service account in the explicitly selected project.' }
if ($BuildServiceAccount -and $BuildServiceAccount -eq $ServiceAccount) { throw 'Build and runtime service accounts must be separate.' }
if ($AccessMode -eq 'iap' -and -not $IapMember) { throw 'IapMember must explicitly name the user or group allowed to access this IAP service.' }
if ($AccessMode -eq 'public' -and $IapMember) { throw 'IapMember is only used with AccessMode iap.' }
if ($PublicScreenUrl) {
    $screenOrigin = $null
    if (-not [Uri]::TryCreate($PublicScreenUrl, [UriKind]::Absolute, [ref]$screenOrigin) -or $screenOrigin.Scheme -ne 'https' -or $screenOrigin.UserInfo -or $screenOrigin.Query -or $screenOrigin.Fragment -or $screenOrigin.AbsolutePath -ne '/') { throw 'PublicScreenUrl must be an HTTPS origin without a path, credentials, query, or fragment.' }
    $PublicScreenUrl = $screenOrigin.GetLeftPart([UriPartial]::Authority)
}
if ($GcsObject.Split('/') -contains '..') { throw 'MANUAL_GCS_OBJECT must not contain parent-directory segments.' }
if (-not $SourceStagingBucket) { $SourceStagingBucket = $Bucket }

$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$deployTag = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$planDirectory = Join-Path $workspaceRoot "data/manual-cloud-deploy/$deployTag"
$sourceDirectory = Join-Path $planDirectory 'source'
$imageBase = "$Region-docker.pkg.dev/$Project/$ArtifactRepository/$Service"
$imageTag = "${imageBase}:$deployTag"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8File {
    param([string]$Path, [string]$Value)
    [System.IO.File]::WriteAllText($Path, $Value, $script:utf8)
}

function Copy-SourceFile {
    param([string]$RelativePath)
    $sourcePath = (Resolve-Path -LiteralPath (Join-Path $script:workspaceRoot $RelativePath)).Path
    $rootPrefix = $script:workspaceRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $sourcePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Source escaped the workspace: $RelativePath" }
    $destination = Join-Path $script:sourceDirectory $RelativePath
    $destinationParent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationParent)) { $null = New-Item -ItemType Directory -Path $destinationParent -Confirm:$false }
    Copy-Item -LiteralPath $sourcePath -Destination $destination -Confirm:$false
}

function Copy-SourceTree {
    param([string]$RelativePath, [string[]]$Extensions)
    $directoryPath = (Resolve-Path -LiteralPath (Join-Path $script:workspaceRoot $RelativePath)).Path
    $rootPrefix = $script:workspaceRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    foreach ($file in Get-ChildItem -LiteralPath $directoryPath -File -Recurse) {
        if ($file.FullName -match '[\\/](?:node_modules|data|dist|\.git)[\\/]') { continue }
        if ($file.Name.StartsWith('.') -or $Extensions -notcontains $file.Extension.ToLowerInvariant()) { continue }
        Copy-SourceFile -RelativePath $file.FullName.Substring($rootPrefix.Length)
    }
}

# Check the cloud-only build/runtime contract before packaging or invoking gcloud.
$requiredFiles = @(
    'package.json', 'package-lock.json', 'Dockerfile', 'cloud/Dockerfile',
    'cloud/server.mjs', 'cloud/manual-service.mjs', 'cloud/store.mjs', 'cloud/screen-server.mjs',
    'tools/build-cloud.mjs', 'web/host-shell.html', 'web/cloud-login.html', 'web/cloud-screen.html',
    'web/src/quiz/presenter.js', 'web/src/quiz/manual-model.js', 'web/src/quiz/presentation.js',
    'web/src/quiz/event-info.js', 'web/src/quiz/prize-tiers.js', 'web/src/quiz/runbook.js',
    'web/src/quiz/recipients.js', 'web/src/quiz/sound.js', 'web/src/quiz/youtube-bgm.js',
    'web/src/quiz/question-storage.js', 'web/src/quiz/question-assets.js',
    'web/src/cloud/transport.js', 'web/src/cloud/screen.js',
    'questions/default.json', 'questions/bonus-quiz-2026.json',
    'questions/assets/quiz-prizes.png', 'questions/assets/kepco-happy.gif'
)
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot $relativePath) -PathType Leaf)) { throw "Required manual-cloud source is missing: $relativePath" }
}
if (-not $WhatIfPreference) {
    $null = New-Item -ItemType Directory -Path $sourceDirectory -Confirm:$false
    foreach ($relativePath in @('package.json', 'package-lock.json', 'Dockerfile', 'cloud/Dockerfile', 'tools/build-cloud.mjs', 'web/host-shell.html', 'web/cloud-login.html', 'web/cloud-screen.html', 'questions/default.json', 'questions/bonus-quiz-2026.json')) {
        Copy-SourceFile -RelativePath $relativePath
    }
    Copy-SourceTree -RelativePath 'cloud' -Extensions @('.mjs', '.js', '.html', '.css')
    Copy-SourceTree -RelativePath 'web/src/quiz' -Extensions @('.mjs', '.js', '.html', '.css')
    Copy-SourceTree -RelativePath 'web/src/cloud' -Extensions @('.mjs', '.js', '.html', '.css')
    Copy-SourceTree -RelativePath 'questions/assets' -Extensions @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.json', '.md')
    Write-Utf8File -Path (Join-Path $sourceDirectory '.gcloudignore') -Value "# Generated allowlisted manual-cloud source only.`n.git`nnode_modules`n**/node_modules`ndata`n.env`n.env.*`n**/.env`n**/.env.*`n*.sqlite*`n*.log`n"
}

$buildPath = Join-Path $planDirectory 'cloudbuild.json'
$environmentPath = Join-Path $planDirectory 'run-env.yaml'
$planPath = Join-Path $planDirectory 'deploy-plan.json'

function New-ManualDeployArguments {
    param([string]$ImageReference)
    $secretBindings = "MANUAL_HOST_PIN=$HostPinSecret,MANUAL_SCREEN_KEY=$ScreenKeySecret"
    $arguments = @(
        'run', 'deploy', $Service, '--project', $Project, '--region', $Region, '--platform', 'managed',
        '--image', $ImageReference, '--service-account', $ServiceAccount,
        '--env-vars-file', $environmentPath, '--set-secrets', $secretBindings,
        '--labels', 'managed-by=ox-manual-quiz,component=manual-presenter',
        '--ingress', 'all', '--port', '8080', '--invoker-iam-check',
        '--min', [string]$MinInstances, '--max', '1',
        '--min-instances', [string]$MinInstances, '--max-instances', '1', '--cpu', '1', '--memory', '512Mi',
        '--concurrency', '80', '--timeout', '60s', '--quiet'
    )
    if ($AlwaysOnCpu) { $arguments += '--no-cpu-throttling' } else { $arguments += '--cpu-throttling' }
    if ($AccessMode -eq 'iap') { $arguments += @('--iap', '--no-allow-unauthenticated') } else { $arguments += '--allow-unauthenticated' }
    return $arguments
}

$buildConfiguration = @{
    steps = @(@{ name = 'gcr.io/cloud-builders/docker'; args = @('build', '-f', 'cloud/Dockerfile', '-t', $imageTag, '.') })
    images = @($imageTag)
    timeout = '1200s'
    options = @{ logging = 'CLOUD_LOGGING_ONLY' }
}
if ($BuildServiceAccount) { $buildConfiguration.serviceAccount = "projects/$Project/serviceAccounts/$BuildServiceAccount" }
if (-not $WhatIfPreference) {
    Write-Utf8File -Path $buildPath -Value (($buildConfiguration | ConvertTo-Json -Depth 8) + "`n")
    Write-Utf8File -Path $environmentPath -Value (@(
        'NODE_ENV: "production"'
        ('MANUAL_GCS_BUCKET: ' + ($Bucket | ConvertTo-Json -Compress))
        ('MANUAL_GCS_OBJECT: ' + ($GcsObject | ConvertTo-Json -Compress))
        $(if ($PublicScreenUrl) { 'PUBLIC_SCREEN_URL: ' + ($PublicScreenUrl | ConvertTo-Json -Compress) })
    ) -join "`n")
}
$deployConfiguration = @{
    project = $Project; region = $Region; service = $Service; runtimeServiceAccount = $ServiceAccount
    buildServiceAccount = $BuildServiceAccount
    bucket = $Bucket; object = $GcsObject; sourceStagingBucket = $SourceStagingBucket
    imageTag = $imageTag; dockerfile = 'cloud/Dockerfile'; sourceDirectory = $sourceDirectory
    cloudBuildConfig = $buildPath; environmentFile = $environmentPath
    secretReferences = @{ MANUAL_HOST_PIN = $HostPinSecret; MANUAL_SCREEN_KEY = $ScreenKeySecret }
    deployArguments = @(New-ManualDeployArguments -ImageReference $imageTag)
    minInstances = $MinInstances; serviceMinInstances = $MinInstances; revisionMinInstances = $MinInstances
    maxInstances = 1; cpu = 1; memory = '512Mi'; concurrency = 80; requestTimeout = '60s'
    accessMode = $AccessMode; iapMember = $IapMember; alwaysOnCpu = [bool]$AlwaysOnCpu
    invokerIamCheck = $true; preservesExistingIap = $true; browserVerificationRequired = ($AccessMode -eq 'iap')
    publicIngressWithApplicationAuth = ($AccessMode -eq 'public')
    includesLocalRecipientRecords = $false; changesGcloudDefaults = $false
}
if (-not $WhatIfPreference) {
    Write-Utf8File -Path $planPath -Value (($deployConfiguration | ConvertTo-Json -Depth 8) + "`n")
    Write-Host "Manual cloud plan: $planPath"
    Write-Host "Source package: $sourceDirectory"
} else { Write-Host 'WhatIf: no local source package or plan files are written.' }
Write-Host "Target: $Project / $Region / $Service"
if ($PrepareOnly) { Write-Host 'PrepareOnly: no gcloud commands or cloud writes were performed.'; return }

$gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $gcloudCommand) { $gcloudCommand = Get-Command gcloud -ErrorAction SilentlyContinue }
if (-not $gcloudCommand) { throw 'Google Cloud CLI is required. Install it and log in before deployment.' }
$script:cloudCli = $gcloudCommand.Source

function Invoke-CloudCommand {
    param([string[]]$Arguments, [switch]$AllowNotFound)
    $previousErrorPreference = $ErrorActionPreference
    try {
        # Handle the native exit code ourselves, including expected first-deploy NOT_FOUND.
        $ErrorActionPreference = 'Continue'
        $commandOutput = @(& $script:cloudCli @Arguments 2>&1)
        $commandExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    $outputText = ($commandOutput | ForEach-Object { [string]$_ }) -join "`n"
    if ($commandExitCode -ne 0) {
        if ($AllowNotFound -and $outputText -match '(?i)(NOT_FOUND|was not found|could not be found|does not exist|\(gcloud\.run\.services\.describe\) Cannot find service \[)') { return $null }
        throw "gcloud $($Arguments[0]) $($Arguments[1]) failed: $outputText"
    }
    # Native gcloud status messages (for example Artifact Registry Encryption)
    # arrive on stderr even for successful JSON commands. Keep them in failures,
    # but never feed their PowerShell ErrorRecords into ConvertFrom-Json.
    return (($commandOutput | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { [string]$_ }) -join "`n")
}

# This emits no access token and does not mutate the active account/project selection.
& $script:cloudCli auth print-access-token --project $Project --quiet *> $null
if ($LASTEXITCODE -ne 0) { throw 'gcloud authentication could not refresh. Complete gcloud auth login, then retry with the same explicit project.' }
$projectMetadata = Invoke-CloudCommand -Arguments @('projects', 'describe', $Project, '--project', $Project, '--format=json(projectId,projectNumber,lifecycleState)') | ConvertFrom-Json
if ($projectMetadata.lifecycleState -ne 'ACTIVE') { throw 'The explicitly selected project is not ACTIVE.' }
if ($AccessMode -eq 'iap') {
    $iapApi = (Invoke-CloudCommand -Arguments @('services', 'list', '--enabled', '--filter=config.name=iap.googleapis.com', '--project', $Project, '--format=value(config.name)', '--quiet')).Trim()
    if ($iapApi -ne 'iap.googleapis.com') { throw 'Enable the IAP API in the selected project before this deployment. This script never enables APIs.' }
}
$repository = Invoke-CloudCommand -Arguments @('artifacts', 'repositories', 'describe', $ArtifactRepository, '--project', $Project, '--location', $Region, '--format=json(format)') | ConvertFrom-Json
if ($repository.format -ne 'DOCKER') { throw 'The existing Artifact Registry repository must use DOCKER format.' }
$null = Invoke-CloudCommand -Arguments @('iam', 'service-accounts', 'describe', $ServiceAccount, '--project', $Project, '--format=value(email)')
if ($BuildServiceAccount) { $null = Invoke-CloudCommand -Arguments @('iam', 'service-accounts', 'describe', $BuildServiceAccount, '--project', $Project, '--format=value(email)') }

foreach ($bucketName in @($Bucket, $SourceStagingBucket) | Select-Object -Unique) {
    $bucketMetadata = Invoke-CloudCommand -Arguments @('storage', 'buckets', 'describe', "gs://$bucketName", '--project', $Project, '--raw', '--format=json') | ConvertFrom-Json
    if ([string]$bucketMetadata.projectNumber -ne [string]$projectMetadata.projectNumber) { throw "Bucket belongs to another project: $bucketName" }
    if ($bucketMetadata.location -ine $Region) { throw "Bucket must use the selected region: $bucketName" }
    if ($bucketMetadata.iamConfiguration.uniformBucketLevelAccess.enabled -ne $true) { throw "Bucket requires uniform bucket-level access: $bucketName" }
    if ($bucketMetadata.iamConfiguration.publicAccessPrevention -ne 'enforced') { throw "Bucket requires explicit public access prevention: $bucketName" }
    $bucketPolicy = Invoke-CloudCommand -Arguments @('storage', 'buckets', 'get-iam-policy', "gs://$bucketName", '--project', $Project, '--format=json') | ConvertFrom-Json
    $bindingsProperty = $bucketPolicy.PSObject.Properties['bindings']
    $bindings = if ($bindingsProperty) { @($bindingsProperty.Value) } else { @() }
    foreach ($binding in $bindings) {
        if (@($binding.members) -contains 'allUsers' -or @($binding.members) -contains 'allAuthenticatedUsers') { throw "The bucket must not have a public IAM binding: $bucketName" }
    }
    if ($bucketName -eq $Bucket) {
        $directGrant = @($bindings | Where-Object {
            $hasCondition = $null -ne $_.PSObject.Properties['condition']
            -not $hasCondition -and @($_.members) -contains "serviceAccount:$ServiceAccount" -and $_.role -in @('roles/storage.objectUser', 'roles/storage.objectAdmin', 'roles/storage.admin')
        })
        if (-not $directGrant.Count) { throw 'Runtime bucket object access could not be verified from an existing direct unconditional IAM grant. Review the dedicated bucket policy; this script never grants permissions.' }
    }
}

foreach ($secretReference in @($HostPinSecret, $ScreenKeySecret)) {
    $secretParts = $secretReference.Split(':')
    $secretVersion = Invoke-CloudCommand -Arguments @('secrets', 'versions', 'describe', $secretParts[1], '--secret', $secretParts[0], '--project', $Project, '--format=json(state)') | ConvertFrom-Json
    if ($secretVersion.state -ne 'ENABLED') { throw "Secret version is not ENABLED: $secretReference" }
}
$existingService = Invoke-CloudCommand -Arguments @('run', 'services', 'describe', $Service, '--project', $Project, '--region', $Region, '--format=json(metadata.labels)') -AllowNotFound
if ($existingService) {
    $existingMetadata = $existingService | ConvertFrom-Json
    $metadataProperty = $existingMetadata.PSObject.Properties['metadata']
    $labelsProperty = if ($metadataProperty) { $metadataProperty.Value.PSObject.Properties['labels'] } else { $null }
    $managedLabel = if ($labelsProperty -and $labelsProperty.Value) { $labelsProperty.Value.PSObject.Properties['managed-by'] } else { $null }
    if (-not $managedLabel -or $managedLabel.Value -ne 'ox-manual-quiz') { throw 'The existing service is not labelled as this manual presenter. Choose a new name instead of overwriting it.' }
}
Write-Host 'Read-only resource preflight passed. No bucket/repository/account/secret or storage IAM policy was created or changed.'
if (-not $PSCmdlet.ShouldProcess("$Project/$Region/$Service", 'Submit the allowlisted source to Cloud Build and deploy the manual presenter HTTPS service')) { return }

$null = Invoke-CloudCommand -Arguments @('builds', 'submit', $sourceDirectory, '--project', $Project, '--region', $Region, '--config', $buildPath, '--gcs-source-staging-dir', "gs://$SourceStagingBucket/manual-cloud-build/source", '--quiet')
$imageDigest = (Invoke-CloudCommand -Arguments @('artifacts', 'docker', 'images', 'describe', $imageTag, '--project', $Project, '--format=value(image_summary.digest)')).Trim()
if ($imageDigest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Cloud Build finished but the pushed image digest could not be resolved. Deployment was not attempted.' }
$imageReference = "${imageBase}@$imageDigest"
$deployArguments = @(New-ManualDeployArguments -ImageReference $imageReference)
$null = Invoke-CloudCommand -Arguments $deployArguments
if ($AccessMode -eq 'iap') {
    $iapServiceAgent = "service-$($projectMetadata.projectNumber)@gcp-sa-iap.iam.gserviceaccount.com"
    $null = Invoke-CloudCommand -Arguments @('run', 'services', 'add-iam-policy-binding', $Service, '--project', $Project, '--region', $Region, '--member', "serviceAccount:$iapServiceAgent", '--role', 'roles/run.invoker', '--quiet')
    $null = Invoke-CloudCommand -Arguments @('iap', 'web', 'add-iam-policy-binding', '--project', $Project, '--region', $Region, '--resource-type', 'cloud-run', '--service', $Service, '--member', $IapMember, '--role', 'roles/iap.httpsResourceAccessor', '--quiet')
}
$serviceDetails = Invoke-CloudCommand -Arguments @('run', 'services', 'describe', $Service, '--project', $Project, '--region', $Region, '--format=json(status.url,status.conditions,metadata.annotations)') | ConvertFrom-Json
$ready = @($serviceDetails.status.conditions | Where-Object { $_.type -eq 'Ready' -and $_.status -eq 'True' })
if (-not $ready.Count -or -not $serviceDetails.status.url) { throw 'Deployment returned without a Ready service URL. Check the Cloud Run revision before using it.' }
$serviceUrl = $serviceDetails.status.url.TrimEnd('/')
$serviceMetadataProperty = $serviceDetails.PSObject.Properties['metadata']
$annotationsProperty = if ($serviceMetadataProperty -and $serviceMetadataProperty.Value) { $serviceMetadataProperty.Value.PSObject.Properties['annotations'] } else { $null }
$iapEnabledProperty = if ($annotationsProperty -and $annotationsProperty.Value) { $annotationsProperty.Value.PSObject.Properties['run.googleapis.com/iap-enabled'] } else { $null }
$iapEnabled = $AccessMode -eq 'iap' -or ($iapEnabledProperty -and $iapEnabledProperty.Value -eq 'true')
$health = $null
$browserVerificationRequired = [bool]$iapEnabled
if (-not $browserVerificationRequired) {
    $health = Invoke-RestMethod -Uri "$serviceUrl/api/health" -Method Get -TimeoutSec 30
    if ($health.ok -ne $true) { throw 'The Ready service did not return a healthy manual backend response.' }
}
$result = @{
    project = $Project; region = $Region; service = $Service; image = $imageReference; url = $serviceUrl
    ready = $true; accessMode = $AccessMode; iapEnabled = [bool]$iapEnabled
    health = $health; browserVerificationRequired = $browserVerificationRequired
    minInstances = $MinInstances; alwaysOnCpu = [bool]$AlwaysOnCpu
}
Write-Utf8File -Path (Join-Path $planDirectory 'deployment-result.json') -Value (($result | ConvertTo-Json -Depth 8) + "`n")
Write-Host "Deployed HTTPS URL: $serviceUrl"
if ($browserVerificationRequired) { Write-Host 'Cloud Run is Ready. Google sign-in and application health/host/screen browser verification remain required; anonymous health was not attempted.' }
Write-Host 'Complete the host/screen, cloud-save, reconnect and real-phone checks in DOCS/planning/manual-cloud-deploy.md.'
