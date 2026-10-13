#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cloudflare R2 bucket setup + CORS policy
# Requires: aws CLI (pip install awscli) with R2 endpoint configured, or
#           the `wrangler` CLI (npm i -g wrangler)
# Usage: ./scripts/setup-r2.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

source "$(dirname "$0")/../.env.local" 2>/dev/null || true

BUCKET="${R2_BUCKET_NAME:-cinema-media}"
ACCOUNT="${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
ACCESS_KEY="${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
SECRET_KEY="${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
ENDPOINT="https://${ACCOUNT}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
export AWS_DEFAULT_REGION="auto"

echo "→ Creating bucket: $BUCKET"
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT" 2>/dev/null || echo "  (bucket may already exist)"

echo "→ Applying CORS policy…"
aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": [
          "https://cinema.growthengine.ai",
          "https://forgecinema.vercel.app",
          "https://*.vercel.app",
          "http://localhost:3000",
          "http://localhost:8081"
        ],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Content-Range", "Accept-Ranges"],
        "MaxAgeSeconds": 86400
      }
    ]
  }'

echo "→ Creating lifecycle rule (delete incomplete multipart uploads after 7 days)…"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "abort-incomplete-multipart",
        "Status": "Enabled",
        "Filter": { "Prefix": "" },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
      },
      {
        "ID": "expire-tmp-uploads",
        "Status": "Enabled",
        "Filter": { "Prefix": "tmp/" },
        "Expiration": { "Days": 1 }
      }
    ]
  }'

echo "→ Setting public access policy for /public/* prefix…"
aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --endpoint-url "$ENDPOINT" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"PublicReadGetObject\",
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::${BUCKET}/public/*\"
      }
    ]
  }"

echo "✓ R2 bucket '${BUCKET}' configured successfully."
echo ""
echo "Next steps:"
echo "  1. In Cloudflare Dashboard → R2 → ${BUCKET} → Settings → Custom Domains"
echo "     Add: media.cinema.growthengine.ai → ${BUCKET}"
echo "  2. Set R2_PUBLIC_URL=https://media.cinema.growthengine.ai in Vercel env"
