#!/usr/bin/env bash
# ==============================================================================
# AutoSurvey AI — Google Cloud 서울 리전(asia-northeast3) VM 원클릭 초기 세팅 스크립트
# 대상 OS: Ubuntu 22.04 / 24.04 LTS 또는 Debian 12
# 사용법 (서울 VM SSH 접속 후):
#   git clone https://github.com/bychoi-space/onlinepoll.git ~/onlinepoll
#   bash ~/onlinepoll/scripts/setup-seoul-vm.sh
# ==============================================================================
set -euo pipefail

echo "🌏 [1/6] 타임존(Asia/Seoul) 및 4GB 스왑 메모리 구성..."
sudo timedatectl set-timezone Asia/Seoul || true
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "📦 [2/6] 필수 시스템 패키지 및 한글 폰트 설치..."
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates gnupg fonts-nanum build-essential

echo "🟢 [3/6] Node.js 22 LTS 및 PM2 설치..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "🔑 [4/6] GitHub Actions 자동 배포용 SSH 공개키 등록..."
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
PUB_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPRoUMDz/EQ7f7KdvQIRwFrfD2ioX2PJkpoQgnPndlF3 online_advertising_deploy"
grep -qxF "$PUB_KEY" "$HOME/.ssh/authorized_keys" || echo "$PUB_KEY" >> "$HOME/.ssh/authorized_keys"

echo "🎭 [5/6] AutoSurvey AI 의존성 및 Playwright Chromium 설치..."
cd "$HOME/onlinepoll"
npm install --no-audit --no-fund
npx playwright install --with-deps chromium

echo "🚀 [6/6] PM2 데몬 기동 및 부팅 자동시작 등록..."
if pm2 describe onlinepoll >/dev/null 2>&1; then
  node scripts/safe-pm2-restart.js
else
  pm2 start src/server.js --name onlinepoll --time
fi
pm2 save

echo "🔍 KMA Research (isurvey.kmaresearch.co.kr) 서울 리전 접속 테스트..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 8 https://isurvey.kmaresearch.co.kr/sy/login || echo "ERR")
echo "   ➔ 응답 코드: $HTTP_CODE (200/302 이면 국내 망 정상 연결 완료!)"
echo "✅ 서울 리전 AutoSurvey AI 인스턴스 준비가 완료되었습니다! (포트: 3000)"
