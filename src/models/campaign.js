/**
 * 설문 캠페인 및 조사 쿼터 DB 관리 모델 (Campaign Store)
 * data/campaigns.json 파일에 설문 캠페인과 수집된 실존 사업자 DB를 영구 저장합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const dataDir = path.join(rootDir, 'data');
const campaignsFile = path.join(dataDir, 'campaigns.json');

// data 디렉터리 및 파일 초기화
function initStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(campaignsFile)) {
    // 기본 샘플 캠페인 1개 포함하여 초기화
    const initialData = [
      {
        id: 'camp_' + Date.now(),
        title: '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 실태조사',
        description: '국내 소프트웨어 개발 기업 대상 경영 현황 및 규제 개선 건의 설문',
        quotaType: 'b2b', // 'b2c' | 'b2b'
        status: 'ready', // 'ready' | 'building' | 'running' | 'completed'
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        quotaConfig: {
          b2bKeyword: '소프트웨어',
          targetCount: 2,
          selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
        },
        quotaDatabase: [], // MarketBz에서 수집된 실제 사업자 객체 배열
        guidelineConfig: {
          surveyUrl: 'http://localhost:3000/mock-survey-b2b.html',
          topic: '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 지원 설문',
          positiveRatio: 70,
          neutralRatio: 20,
          negativeRatio: 10,
          textGuidelines: '클라우드 인프라 지원과 R&D 세액 공제 확대가 절실하다는 의견',
          iterations: 1,
          headless: true
        },
        results: []
      }
    ];
    fs.writeFileSync(campaignsFile, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

initStore();

/**
 * 전체 캠페인 목록 조회
 */
export function getAllCampaigns() {
  initStore();
  try {
    const content = fs.readFileSync(campaignsFile, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('[CampaignStore] 읽기 실패:', err);
    return [];
  }
}

/**
 * 특정 캠페인 상세 조회
 */
export function getCampaignById(id) {
  const campaigns = getAllCampaigns();
  return campaigns.find(c => c.id === id) || null;
}

/**
 * 새 캠페인 생성
 */
export function createCampaign(data = {}) {
  const campaigns = getAllCampaigns();
  const newCampaign = {
    id: 'camp_' + Date.now(),
    title: data.title || '새로운 설문조사 캠페인',
    description: data.description || '',
    quotaType: data.quotaType || 'b2c',
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quotaConfig: data.quotaConfig || {
      b2bKeyword: '소프트웨어',
      targetCount: 1,
      selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
    },
    quotaDatabase: [],
    guidelineConfig: data.guidelineConfig || {
      surveyUrl: '',
      topic: '',
      positiveRatio: 70,
      neutralRatio: 20,
      negativeRatio: 10,
      textGuidelines: '',
      iterations: 1,
      headless: true
    },
    results: []
  };

  campaigns.unshift(newCampaign);
  fs.writeFileSync(campaignsFile, JSON.stringify(campaigns, null, 2), 'utf-8');
  return newCampaign;
}

/**
 * 캠페인 정보 업데이트
 */
export function updateCampaign(id, updateData = {}) {
  const campaigns = getAllCampaigns();
  const index = campaigns.findIndex(c => c.id === id);
  if (index === -1) return null;

  campaigns[index] = {
    ...campaigns[index],
    ...updateData,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(campaignsFile, JSON.stringify(campaigns, null, 2), 'utf-8');
  return campaigns[index];
}

/**
 * 캠페인 삭제
 */
export function deleteCampaign(id) {
  const campaigns = getAllCampaigns();
  const filtered = campaigns.filter(c => c.id !== id);
  fs.writeFileSync(campaignsFile, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}
