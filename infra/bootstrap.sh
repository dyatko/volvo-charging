#!/usr/bin/env bash
# One-shot GCP bootstrap for Volvo Charging.
#
# Run with `bash infra/bootstrap.sh` after editing the variables below.
# Idempotent: every step is safe to re-run.
#
# Region: europe-north1 (Stockholm) for everything that's regional.
# Goal: stay inside GCP's always-free tier. Database lives outside GCP on
# Neon's free plan (eu-north-1 Stockholm) because Cloud SQL has no free
# tier.

set -euo pipefail

# ─── EDIT THESE ────────────────────────────────────────────────────────
PROJECT_ID="volvo-charging-app"      # globally unique
GITHUB_REPO="dyatko/volvo-charging"  # owner/repo
REGION="europe-north1"
AR_REPO="volvo-charging"
# ───────────────────────────────────────────────────────────────────────

echo "→ Setting active project to $PROJECT_ID"
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "→ Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com

echo "→ Creating Artifact Registry repo $AR_REPO in $REGION"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Volvo Charging container images"

echo "→ Creating service accounts"
create_sa() {
  local name="$1" display="$2"
  gcloud iam service-accounts describe "$name@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 || \
    gcloud iam service-accounts create "$name" --display-name="$display"
}
create_sa app       "Cloud Run runtime"
create_sa deployer  "GitHub Actions deployer"
create_sa scheduler "Cloud Scheduler tick caller"

APP_SA="app@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOYER_SA="deployer@$PROJECT_ID.iam.gserviceaccount.com"
SCHEDULER_SA="scheduler@$PROJECT_ID.iam.gserviceaccount.com"

echo "→ Granting roles to deployer (build + deploy + read secrets for migrate)"
for role in \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

echo "→ Granting Secret Manager accessor to app SA"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$APP_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet >/dev/null

echo "→ Setting up Workload Identity Federation for GitHub"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github \
    --location=global \
    --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github-provider \
    --location=global \
    --workload-identity-pool=github \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository_owner == '${GITHUB_REPO%%/*}'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" \
  --quiet >/dev/null

WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-provider"

echo "→ Creating secrets in $REGION (skipping ones that exist)"
create_secret() {
  local name="$1"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo "    $name already exists, skipping"
  else
    gcloud secrets create "$name" \
      --replication-policy=user-managed \
      --locations="$REGION"
    echo "    Created $name (empty — add a version with:"
    echo "      echo -n 'value' | gcloud secrets versions add $name --data-file=-)"
  fi
}
create_secret SESSION_SECRET
create_secret DATA_ENCRYPTION_KEK
create_secret DATABASE_URL

echo ""
echo "✓ Bootstrap complete."
echo ""
echo "Next steps (manual):"
echo ""
echo "  1. Sign up at https://neon.tech, create a project in AWS eu-north-1 (Stockholm),"
echo "     create a database named 'volvo', copy the connection string, then:"
echo ""
echo "       echo -n 'postgres://user:pass@ep-...neon.tech/volvo?sslmode=require' \\"
echo "         | gcloud secrets versions add DATABASE_URL --data-file=-"
echo ""
echo "  2. Generate session/encryption secrets (32+ chars each):"
echo ""
echo "       openssl rand -base64 48 | gcloud secrets versions add SESSION_SECRET --data-file=-"
echo "       openssl rand -base64 48 | gcloud secrets versions add DATA_ENCRYPTION_KEK --data-file=-"
echo ""
echo "  3. Add these as GitHub repository variables (Settings → Secrets and variables → Actions → Variables):"
echo ""
echo "       GCP_PROJECT_ID      = $PROJECT_ID"
echo "       GCP_PROJECT_NUMBER  = $PROJECT_NUMBER"
echo "       GCP_DEPLOYER_SA     = $DEPLOYER_SA"
echo "       GCP_WIF_PROVIDER    = $WIF_PROVIDER"
echo ""
echo "  4. Push to main to trigger the first deploy."
echo ""
echo "  5. After the first deploy succeeds, run infra/scheduler.sh to create the"
echo "     Cloud Scheduler job (it needs the live Cloud Run URL)."
