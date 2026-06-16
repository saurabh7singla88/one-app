#!/usr/bin/env bash
set -euo pipefail

# ── config ───────────────────────────────────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO="${ECR_REPO:-the-manager}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
NAMESPACE="one-app"

EKS_CLUSTER_NAME="${EKS_CLUSTER_NAME:?set EKS_CLUSTER_NAME}"
ACM_CERT_ARN="${ACM_CERT_ARN:?set ACM_CERT_ARN}"
APP_DOMAIN="${APP_DOMAIN:?set APP_DOMAIN}"

# Build-time args forwarded to the Docker multi-stage build
VITE_API_URL="${VITE_API_URL:-/api}"
VITE_APP_AUTHOR="${VITE_APP_AUTHOR:-Nebrix}"
# ─────────────────────────────────────────────────────────────────────────────

IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▸ ECR login"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "▸ Creating ECR repo (idempotent)"
aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null || true

echo "▸ Ensure buildx builder with multi-platform support"
docker buildx inspect multiplatform-builder &>/dev/null \
  || docker buildx create --name multiplatform-builder --use
docker buildx use multiplatform-builder

echo "▸ Build + push → ${IMAGE_URI} (linux/amd64 + linux/arm64)"
docker buildx build --platform linux/amd64,linux/arm64 \
  --build-arg VITE_API_URL="$VITE_API_URL" \
  --build-arg VITE_APP_AUTHOR="$VITE_APP_AUTHOR" \
  -t "$IMAGE_URI" --push "$SCRIPT_DIR"

echo "▸ EKS kubeconfig"
aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER_NAME"

echo "▸ Namespace"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo "▸ Secrets (requires TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET in env)"
kubectl create secret generic the-manager-secrets \
  --namespace "$NAMESPACE" \
  --from-literal=TURSO_DATABASE_URL="${TURSO_DATABASE_URL:?set TURSO_DATABASE_URL}" \
  --from-literal=TURSO_AUTH_TOKEN="${TURSO_AUTH_TOKEN:?set TURSO_AUTH_TOKEN}" \
  --from-literal=JWT_SECRET="${JWT_SECRET:?set JWT_SECRET}" \
  --from-literal=TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY:-}" \
  --save-config \
  --dry-run=client -o yaml | kubectl apply -f -

echo "▸ Apply manifests"
for f in deployment service ingress; do
  sed -e "s|IMAGE_URI|${IMAGE_URI}|g" \
      -e "s|ACM_CERT_ARN|${ACM_CERT_ARN}|g" \
      -e "s|themanager\.example\.com|${APP_DOMAIN}|g" \
      "$SCRIPT_DIR/k8s/${f}.yaml" | kubectl apply -f -
done

echo "▸ Rollout status"
kubectl rollout status deployment/the-manager -n "$NAMESPACE" --timeout=180s

echo ""
echo "✓ Deployed ${IMAGE_URI}"
echo "  ALB provisioning takes ~2min. Check:"
echo "  kubectl get ingress the-manager -n ${NAMESPACE}"
