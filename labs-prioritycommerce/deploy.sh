#!/usr/bin/env bash
set -euo pipefail

# ── config ───────────────────────────────────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO="${ECR_REPO:-labs-prioritycommerce}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
NAMESPACE="labs"
# ─────────────────────────────────────────────────────────────────────────────

IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▸ ECR login"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "▸ Creating ECR repo (idempotent)"
aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null || true

echo "▸ Build → ${IMAGE_URI}"
docker build --platform linux/amd64 -t "$IMAGE_URI" "$SCRIPT_DIR"

echo "▸ Push"
docker push "$IMAGE_URI"

echo "▸ Namespace"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo "▸ Apply manifests"
for f in deployment service ingress; do
  sed "s|IMAGE_URI|${IMAGE_URI}|g" "$SCRIPT_DIR/k8s/${f}.yaml" | kubectl apply -f -
done

echo "▸ Rollout status"
kubectl rollout status deployment/labs-prioritycommerce -n "$NAMESPACE" --timeout=120s

echo ""
echo "✓ Deployed ${IMAGE_URI}"
echo "  ALB provisioning takes ~2min. Check:"
echo "  kubectl get ingress labs-prioritycommerce -n ${NAMESPACE}"
