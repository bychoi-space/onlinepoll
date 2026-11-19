/**
 * 원자적(Atomic) JSON 파일 저장 유틸리티
 * - 동시 배치 가동(MAX_CONCURRENT_TASKS=2) 또는 API 동시 호출 시
 *   JSON 파일 부분 쓰기(Partial Write) 및 파싱 손상을 원천 방지합니다.
 */
import fs from 'fs';
import path from 'path';

let atomicSeq = 0;

/**
 * 객체를 임시 파일(.tmp)에 기록한 뒤 대상 경로로 원자적 교체(renameSync)합니다.
 * @param {string} targetPath
 * @param {unknown} data
 * @param {number} [indent=2]
 */
export function writeJsonAtomicSync(targetPath, data, indent = 2) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const serialized = indent > 0 ? JSON.stringify(data, null, indent) : JSON.stringify(data);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}_${++atomicSeq}.tmp`;
  try {
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {
      // 임시파일 정리 실패는 무시하고 원본 에러 재전파
    }
    throw err;
  }
}
