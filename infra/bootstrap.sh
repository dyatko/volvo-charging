#!/usr/bin/env bash
# One-shot GCP bootstrap for Volvo Charging — Stockholm (europe-north1).
#
# Run with `bash infra/bootstrap.sh` after editing the variables below.
# Idempotent: every step is safe to re-run.
#
# All resources stay in GCP. Postgres lives on Cloud SQL (db-f1-micro,
# zonal, no HA, no backups) — that's the only Postgres option on GCP and
# it costs ~$9/month in europe-north1. Everything else (Cloud Run,
# Artifact Registry, Scheduler, Secret Manager, WIF) sits comfortably
# inside the always-free tier at hobby scale.

set -euo pipefail

# ─── EDIT THESE ────────────────────────────────────────────────────────
PROJECT_ID="volvocharging"           # globally unique
GITHUB_REPO="dyatko/volvo-charging"  # owner/repo
REGION="europe-north1"
AR_REPO="volvo-charging"
SQL_INSTANCE="volvo-db"
DB_NAME="volvo"
DB_USER="volvo"
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
  sqladmin.googleapis.com \
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
create_sa cloud-run-app "Cloud Run runtime"
create_sa deployer      "GitHub Actions deployer"
create_sa scheduler     "Cloud Scheduler tick caller"

APP_SA="cloud-run-app@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOYER_SA="deployer@$PROJECT_ID.iam.gserviceaccount.com"
SCHEDULER_SA="scheduler@$PROJECT_ID.iam.gserviceaccount.com"

echo "→ Granting roles"
grant() {
  local sa="$1" role="$2"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$sa" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
}
# deployer: build + push + deploy + read secrets + connect to Cloud SQL for migrations
for r in roles/artifactregistry.writer roles/run.admin roles/iam.serviceAccountUser \
         roles/secretmanager.secretAccessor roles/cloudsql.client; do
  grant "$DEPLOYER_SA" "$r"
done
# cloud-run-app: read secrets at runtime + connect to Cloud SQL via the built-in proxy
grant "$APP_SA" roles/secretmanager.secretAccessor
grant "$APP_SA" roles/cloudsql.client

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

echo "→ Provisioning Cloud SQL ($SQL_INSTANCE, Postgres 16, db-f1-micro, zonal)"
echo "    NOTE: first-time creation takes 5–10 minutes."
if gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  echo "    $SQL_INSTANCE already exists, skipping"
else
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="$REGION" \
    --availability-type=zonal \
    --storage-size=10GB \
    --storage-type=SSD \
    --no-storage-auto-increase \
    --no-backup \
    --deletion-protection
fi

echo "→ Ensuring database '$DB_NAME' exists"
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 || \
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

# Auto-generate password and create/reset user. We do this only when the
# DB_PASSWORD secret doesn't already exist — re-running the script is
# non-destructive.
INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"

ensure_secret_text() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=user-managed --locations="$REGION" >/dev/null
  fi
  if ! gcloud secrets versions access latest --secret="$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
    echo "    Wrote $name (new version)"
  else
    echo "    $name already has a version, leaving as-is"
  fi
}

if gcloud secrets describe DB_PASSWORD >/dev/null 2>&1 && \
   gcloud secrets versions access latest --secret=DB_PASSWORD >/dev/null 2>&1; then
  echo "→ DB_PASSWORD secret already set, reusing"
  DB_PASSWORD=$(gcloud secrets versions access latest --secret=DB_PASSWORD)
else
  echo "→ Generating Postgres user password (32 hex chars)"
  # openssl rand -hex emits exactly N*2 chars to stdout with no pipe → no
  # SIGPIPE for `tr | head` to trip set -o pipefail.
  DB_PASSWORD=$(openssl rand -hex 16)
  ensure_secret_text DB_PASSWORD "$DB_PASSWORD"
fi

# Create or update the user. `users create` errors if it exists; we set
# password unconditionally via `users set-password` to be safe.
if ! gcloud sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
else
  echo "    User $DB_USER already exists — leaving its password as-is (re-set manually if you regenerated DB_PASSWORD)"
fi

echo "→ Populating Secret Manager"
ensure_secret_text SESSION_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
ensure_secret_text DATA_ENCRYPTION_KEK "$(openssl rand -base64 48 | tr -d '\n')"
# Runtime DATABASE_URL — Cloud Run will mount Cloud SQL at /cloudsql/<instance>
# via --add-cloudsql-instances, and node-postgres connects via that Unix
# socket using the `host` query param.
ensure_secret_text DATABASE_URL "postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}"

echo ""
echo "✓ Bootstrap complete."
echo ""
echo "Add these as GitHub repository variables"
echo "  (Settings → Secrets and variables → Actions → Variables):"
echo ""
echo "    GCP_PROJECT_ID      = $PROJECT_ID"
echo "    GCP_PROJECT_NUMBER  = $PROJECT_NUMBER"
echo "    GCP_DEPLOYER_SA     = $DEPLOYER_SA"
echo "    GCP_WIF_PROVIDER    = $WIF_PROVIDER"
echo ""
echo "Then push any commit to main — the Deploy workflow will build, run"
echo "drizzle migrations against Cloud SQL via cloud-sql-proxy, deploy to"
echo "Cloud Run with --add-cloudsql-instances, smoke-test /healthz, and"
echo "flip traffic."
echo ""
echo "After the first deploy succeeds, run infra/scheduler.sh to create"
echo "the per-minute Cloud Scheduler tick."
