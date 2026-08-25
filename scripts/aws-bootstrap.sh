#!/bin/bash
set -euo pipefail

exec > >(tee /var/log/beyondbound-bootstrap.log | logger -t beyondbound-bootstrap -s 2>/dev/console) 2>&1

APP_DIR=/opt/beyondbound
ARCHIVE=/tmp/beyondbound-deploy.tgz
NETWORK=beyondbound-net
CONTAINER=beyondbound
IMAGE=beyondbound:latest

dnf update -y
dnf install -y docker
systemctl enable --now docker

if ! command -v aws >/dev/null 2>&1; then
  dnf install -y awscli2 || dnf install -y awscli
fi

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

IMDS_TOKEN=$(curl --fail --silent --show-error --request PUT \
  --header 'X-aws-ec2-metadata-token-ttl-seconds: 21600' \
  http://169.254.169.254/latest/api/token)
S3_URI=$(curl --fail --silent --show-error \
  --header "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" \
  http://169.254.169.254/latest/meta-data/tags/instance/DeploymentBundle)

aws s3 cp "${S3_URI}" "${ARCHIVE}"
mkdir -p "${APP_DIR}"
tar -xzf "${ARCHIVE}" -C "${APP_DIR}"

docker build --tag "${IMAGE}" "${APP_DIR}"
docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}"
docker volume inspect beyondbound-data >/dev/null 2>&1 || docker volume create beyondbound-data
docker rm --force "${CONTAINER}" >/dev/null 2>&1 || true
docker run --detach \
  --name "${CONTAINER}" \
  --restart unless-stopped \
  --init \
  --network "${NETWORK}" \
  --publish 127.0.0.1:3000:3000 \
  --env NODE_ENV=production \
  --env PORT=3000 \
  --env DATA_DIR=/app/data \
  --env APP_URL=https://abovebound.org \
  --env NODE_ID=abovebound-aws-1 \
  --env API_MUTATION_RATE_LIMIT=120 \
  --env WS_MAX_PAYLOAD_BYTES=1048576 \
  --mount source=beyondbound-data,target=/app/data \
  "${IMAGE}"

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
    touch /var/lib/beyondbound-bootstrap-complete
    exit 0
  fi
  sleep 2
done

docker logs "${CONTAINER}"
exit 1
