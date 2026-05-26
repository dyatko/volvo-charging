#!/usr/bin/env bash
# Create the every-minute Cloud Scheduler tick that drives polling.
# Run this AFTER the first successful Cloud Run deploy — it needs the
# service URL to set the OIDC audience.
#
# Cloud Scheduler's always-free tier is 3 jobs/month per billing account;
# we use 1.

set -euo pipefail

PROJECT_ID="volvocharging"        # must match infra/bootstrap.sh
REGION="europe-north1"
SERVICE="volvo-charging"

gcloud config set project "$PROJECT_ID"

SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
if [ -z "$SERVICE_URL" ]; then
  echo "Cloud Run service '$SERVICE' not found in $REGION. Deploy first."
  exit 1
fi
echo "→ Service URL: $SERVICE_URL"

SCHEDULER_SA="scheduler@$PROJECT_ID.iam.gserviceaccount.com"

echo "→ Granting Cloud Run invoker to scheduler SA on this service"
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:$SCHEDULER_SA" \
  --role="roles/run.invoker" \
  --quiet >/dev/null

echo "→ Upserting tick-1min scheduler job"
if gcloud scheduler jobs describe tick-1min --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http tick-1min \
    --location="$REGION" \
    --schedule="* * * * *" \
    --uri="$SERVICE_URL/api/internal/tick" \
    --http-method=POST \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$SERVICE_URL" \
    --time-zone="Etc/UTC" \
    --attempt-deadline=120s
else
  gcloud scheduler jobs create http tick-1min \
    --location="$REGION" \
    --schedule="* * * * *" \
    --uri="$SERVICE_URL/api/internal/tick" \
    --http-method=POST \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$SERVICE_URL" \
    --time-zone="Etc/UTC" \
    --attempt-deadline=120s
fi

echo "✓ Scheduler configured. First tick fires within the next minute."
