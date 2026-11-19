/**
 * 환경변수 및 표준 시간대(KST) 최우선 부트스트랩 모듈
 * - ESM 정적 import 호이스팅보다 먼저 실행되도록 엔트리포인트 최상단에서 import 합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.TZ = 'Asia/Seoul';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '../..');

const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn('[Env] .env 로드 경고:', err.message);
  }
}
