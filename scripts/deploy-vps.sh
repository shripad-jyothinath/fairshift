#!/usr/bin/env bash
# Deploy FairShift Docker container to remote VPS or locally
set -euo pipefail

TARGET_HOST="${1:-root@69.62.81.172}"
SSH_PORT="${PORT:-22}"
APP_DIR="/opt/fairshift"
CONTAINER_NAME="fairshift"
IMAGE_NAME="fairshift:latest"
HOST_PORT="${HOST_PORT:-8080}"
DATA_DIR="${DATA_DIR:-/var/lib/fairshift}"

deploy_local() {
  echo "=== Deploying FairShift locally ==="
  mkdir -p "${DATA_DIR}"
  chmod 777 "${DATA_DIR}"
  
  echo "Building Docker image..."
  docker build -t "${IMAGE_NAME}" .

  echo "Stopping previous container if running..."
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}" 2>/dev/null || true

  echo "Running container..."
  docker run -d \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    -p "${HOST_PORT}:8080" \
    -v "${DATA_DIR}:/tmp/fairshift" \
    $(test -f .env && echo "--env-file .env") \
    "${IMAGE_NAME}"

  echo "Waiting for healthcheck..."
  sleep 3
  curl -fsS "http://localhost:${HOST_PORT}/api/health" || {
    echo "Healthcheck failed. Showing logs:"
    docker logs "${CONTAINER_NAME}" --tail 50
    exit 1
  }

  echo "=== Deployment successful on port ${HOST_PORT} ==="
}

deploy_remote() {
  echo "=== Deploying FairShift to ${TARGET_HOST}:${SSH_PORT} ==="

  # Test SSH connection
  if ! ssh -p "${SSH_PORT}" -o ConnectTimeout=10 -o BatchMode=yes "${TARGET_HOST}" "echo 'SSH connection verified'"; then
    echo "ERROR: Unable to connect to ${TARGET_HOST} on port ${SSH_PORT}"
    exit 1
  fi

  echo "Preparing remote directory ${APP_DIR}..."
  ssh -p "${SSH_PORT}" "${TARGET_HOST}" "mkdir -p ${APP_DIR} ${DATA_DIR} && chmod 777 ${DATA_DIR}"

  echo "Syncing repository files to remote..."
  rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude 'public/zk' \
    -e "ssh -p ${SSH_PORT}" ./ "${TARGET_HOST}:${APP_DIR}/"

  echo "Executing remote build and container start..."
  ssh -p "${SSH_PORT}" "${TARGET_HOST}" "bash -s" <<'REMOTE_SCRIPT'
reset_env=1
set -euo pipefail
cd "/opt/fairshift"

if ! command -v docker &> /dev/null; then
  echo "Docker not found. Installing docker..."
  curl -fsSL https://get.docker.com | sh
fi

echo "Building docker image..."
docker build -t "fairshift:latest" .

echo "Restarting container..."
docker stop "fairshift" 2>/dev/null || true
docker rm "fairshift" 2>/dev/null || true

docker run -d \
  --name "fairshift" \
  --restart unless-stopped \
  -p "8080:8080" \
  -v "/var/lib/fairshift:/tmp/fairshift" \
  $(test -f .env && echo "--env-file .env") \
  "fairshift:latest"

sleep 5
echo "Testing health..."
curl -fsS "http://localhost:8080/api/health" && echo "FairShift is healthy!"
REMOTE_SCRIPT

  echo "=== Remote deployment complete! ==="
}

if [[ "${1:-}" == "--local" ]]; then
  deploy_local
else
  deploy_remote
fi
