/**
 * AutoSurvey AI - 온누리 가맹점 + 마켓비즈 2단계 하이브리드 쿼터 엔진 (hybrid-quota.js)
 * 1차: 온누리상품권 공인 플랫폼(ongift.or.kr)에서 전통시장 가맹점 팩트 데이터 추출
 * 2차: 마켓비즈(marketbz.com)에서 사업자번호 기반 상세 기업정보 1:1 결합(Enrichment)
 */

import { chromium } from 'playwright';
import { getMarketMerchants } from './onnuri.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';

const MARKETBZ_LOGIN_URL = 'https://marketbz.com/loginPage?redirectUrl=%2Findex';
const MARKETBZ_CREDENTIALS = {
  username: process.env.MARKETBZ_USER || 'hyuk112@naver.com',
  password: process.env.MARKETBZ_PASSWORD || 'mini112!'
};

/**
 * 전화번호 포맷팅 (02-xxx-xxxx, 02-xxxx-xxxx, 010-xxxx-xxxx 등)
 */
function formatPhoneNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (cleaned.includes('-')) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;

  // 02 서울 지역번호
  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    } else if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
  }

  // 010, 031, 032, 051 등
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return cleaned;
}

/**
 * 온누리 + 마켓비즈 2단계 하이브리드 쿼터 생성 함수
 * @param {Object} options
 * @param {string} options.regionCode - 온누리 시도 코드 (예: '01')
 * @param {string} options.districtCode - 온누리 시군구 코드 (예: '01018')
 * @param {string} options.marketName - 대상 시장명 (예: '풍납시장')
 * @param {string} [options.statusFilter='ACTIVE'] - 가맹 상태 필터 ('ACTIVE'|'ALL')
 * @param {string} [options.paymentFilter='ALL'] - 온누리 취급 유형 ('ALL'|'PAPER'|'DIGITAL')
 * @param {number} [options.targetCount=10] - 수집 목표 수량
 * @param {Array<string>} [options.customFields=[]] - 추가 결합할 커스텀 항목 목록
 * @returns {Promise<Array<Object>>} 실존 데이터로 결합된 쿼터 목록
 */
export async function buildHybridOnnuriQuota({
  regionCode,
  districtCode,
  marketName,
  statusFilter = 'ACTIVE',
  paymentFilter = 'ALL',
  targetCount = 10,
  customFields = []
}) {
  logger.info(`[Hybrid Quota] === 온누리 연계 조사 쿼터 수집 시작 ===`);
  logger.info(`[Hybrid Quota] 대상: "${marketName}" | 목표: ${targetCount}개 | 커스텀 필드: ${customFields.join(', ') || '없음'}`);

  // 1단계: 온누리 플랫폼에서 대상 가맹점 1차 팩트 수집
  logger.info(`[Step 1/2] 온누리상품권 공인 플랫폼에서 "${marketName}" 가맹점 목록을 조회합니다...`);
  const onnuriList = await getMarketMerchants({
    regionCode,
    districtCode,
    marketName,
    statusFilter,
    paymentFilter,
    limit: targetCount
  });

  if (onnuriList.length === 0) {
    logger.warn(`[Hybrid Quota] "${marketName}" 조건에 부합하는 온누리 가맹점을 찾지 못했습니다.`);
    return [];
  }

  logger.success(`[Step 1/2 완료] 온누리 가맹점 ${onnuriList.length}건 1차 확보 완료. 마켓비즈 2차 정보 결합을 시작합니다.`);

  // 2단계: 마켓비즈 플랫폼 로그인 및 1:1 결합(Enrichment)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const finalQuotaList = [];

  try {
    logger.info(`[Step 2/2] 마켓비즈 플랫폼 인증 진행 중 (${MARKETBZ_CREDENTIALS.username})...`);
    await page.goto(MARKETBZ_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#username', MARKETBZ_CREDENTIALS.username);
    await page.fill('#password', MARKETBZ_CREDENTIALS.password);
    await page.click('button.btn-login');
    await page.waitForTimeout(2000);

    const okBtn = await page.$('#successButton');
    if (okBtn) {
      await okBtn.click();
      await page.waitForTimeout(1500);
    }
    logger.success(`[Step 2/2] 마켓비즈 인증 완료. 가맹점별 1:1 상세 크로스체크를 진행합니다.`);

    for (let i = 0; i < onnuriList.length; i++) {
      const merchant = onnuriList[i];
      const seqStr = `(${i + 1}/${onnuriList.length})`;
      logger.info(`[Hybrid Quota] ${seqStr} "${merchant.companyName}" (사업자: ${merchant.bizNumber || '미기재'}) 마켓비즈 상세 연동 중...`);

      let marketBzDetail = {};

      if (merchant.rawBizNumber && merchant.rawBizNumber.length === 10) {
        try {
          const detailUrl = `https://marketbz.com/companyDetail/${merchant.rawBizNumber}`;
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
          await sleep(800, 1500);

          marketBzDetail = await page.evaluate((dynamicFields) => {
            const bodyText = document.body.innerText;
            const res = {
              mbzIndustry: null,
              mbzOpenDate: null,
              mbzCeoName: null,
              mbzAddress: null,
              mbzRoadAddress: null,
              mbzPhone: null
            };

            // 1. '기업 핵심정보' 블록에서 기본 속성 추출
            const coreIdx = bodyText.indexOf('기업 핵심정보');
            const coreText = coreIdx !== -1 ? bodyText.slice(coreIdx, coreIdx + 1200) : bodyText;

            // 등록 산업분류 (취급품목)
            const indM = coreText.match(/등록 산업분류\s*[:\n\|]?\s*([^\n\|]+)/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)개인사업자/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)법인사업자/);
            if (indM) {
              const val = indM[1].trim();
              if (val && !val.includes('메뉴') && !val.includes('로그아웃')) {
                res.mbzIndustry = val;
              }
            }

            // 설립일 (개업연월)
            const dateM = coreText.match(/설립일[^\d]*(\d{4}[\.\-\s/]\d{1,2}[\.\-\s/]\d{1,2})/);
            if (dateM) {
              res.mbzOpenDate = dateM[1].trim();
            }

            // 대표자 (핵심정보 영역 내에서 탐색, 마스킹(***) 또는 메뉴 오염 배제)
            const ceoM = coreText.match(/대표자\s*[:\n\|]?\s*([가-힣A-Za-z]{2,10})(?=\s*\||\n|$)/);
            if (ceoM) {
              const val = ceoM[1].trim();
              if (!['연락처', '대표자', '서비스', '소재지', '사업자', '설립일', '등록'].includes(val)) {
                res.mbzCeoName = val;
              }
            }

            // 2. [사용자 지정 핵심 위치] '연락처·주소·사업장 정보' 테이블 내 대표전화번호 및 주소(도로명) 추출
            const ths = Array.from(document.querySelectorAll('th, td, dt, dd'));
            for (let el of ths) {
              const txt = el.innerText.trim();
              // 대표전화번호
              if (txt === '대표전화번호' || txt.startsWith('대표전화번호')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) {
                  res.mbzPhone = next.innerText.trim();
                }
              }
              // 주소(도로명)
              if (txt === '주소(도로명)' || txt.startsWith('주소(도로명)')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) {
                  res.mbzRoadAddress = next.innerText.trim();
                }
              }
            }

            // 만약 DOM에서 놓쳤을 경우 정규식 백업 탐색
            if (!res.mbzPhone) {
              const pMatch = bodyText.match(/대표전화번호\s*[\t\:\n]?\s*([\d-]{8,14})/);
              if (pMatch) res.mbzPhone = pMatch[1].trim();
            }

            // 소재지 (기본 주소)
            const addrM = coreText.match(/소재지\s*[:\n\|]?\s*([^\n]+)/);
            if (addrM) {
              const val = addrM[1].trim();
              if (val && !val.includes('메뉴')) res.mbzAddress = val;
            }

            // 3. 동적 커스텀 필드 탐색 (없으면 null 처리)
            if (dynamicFields && Array.isArray(dynamicFields)) {
              dynamicFields.forEach(fieldName => {
                const safeField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`${safeField}\\s*[:\\|]?\\s*([^\\n\\|]+)`);
                const match = bodyText.match(regex);
                if (match) {
                  res[fieldName] = match[1].trim().slice(0, 50);
                } else {
                  res[fieldName] = null;
                }
              });
            }

            return res;
          }, customFields);

        } catch (subErr) {
          logger.warn(`[Hybrid Quota] 마켓비즈 상세 조회 실패/미등록 (${subErr.message}) - 온누리 공인 데이터 유지`);
        }
      }

      // 개업연월 정제 (마켓비즈 설립일 우선 -> 온누리 가맹등록일 -> 없으면 null)
      let formattedOpenDate = null;
      if (marketBzDetail.mbzOpenDate) {
        formattedOpenDate = marketBzDetail.mbzOpenDate;
      } else if (merchant.regDate) {
        formattedOpenDate = merchant.regDate;
      }

      // 취급품목 정제 (마켓비즈 등록산업분류 + 온누리 업종 결합)
      let handledItems = null;
      if (marketBzDetail.mbzIndustry && merchant.industry) {
        handledItems = `${merchant.industry} (${marketBzDetail.mbzIndustry})`;
      } else if (marketBzDetail.mbzIndustry) {
        handledItems = marketBzDetail.mbzIndustry;
      } else if (merchant.industry) {
        handledItems = merchant.industry;
      }

      // 연락처 정제 (대표전화번호 포맷팅, 없으면 null)
      const finalPhone = formatPhoneNumber(marketBzDetail.mbzPhone);

      // 대표자명 정제 (실제 데이터 없으면 null)
      const finalCeoName = marketBzDetail.mbzCeoName || null;

      // 주소 (마켓비즈 도로명주소 우선 -> 온누리 주소 -> 마켓비즈 소재지 -> 없으면 null)
      const finalAddress = marketBzDetail.mbzRoadAddress || merchant.address || marketBzDetail.mbzAddress || null;

      // 온누리 팩트 + 마켓비즈 팩트 1:1 병합
      const mergedItem = {
        seq: i + 1,
        source: 'ONNURI_MARKETBZ_HYBRID',
        marketName: merchant.marketName || '풍납시장',
        companyName: merchant.companyName,
        bizNumber: merchant.bizNumber || null,
        ceoName: finalCeoName,                       // 대표자명 (없으면 null)
        phone: finalPhone,                           // 연락처 (대표전화번호, 없으면 null)
        openDate: formattedOpenDate,                 // 개업연월 (없으면 null)
        handledItems: handledItems,                 // 취급품목 (없으면 null)
        address: finalAddress,                       // 사업장 주소 (도로명 우선, 없으면 null)
        status: merchant.status || '정상가맹',       // 가맹상태
        paperAccepted: merchant.paperAccepted,       // 온누리지류
        digitalAccepted: merchant.digitalAccepted,   // 온누리디지털
        ...marketBzDetail
      };

      // 불필요한 내부 임시 키 정리
      delete mergedItem.mbzCeoName;
      delete mergedItem.mbzIndustry;
      delete mergedItem.mbzOpenDate;
      delete mergedItem.mbzAddress;
      delete mergedItem.mbzRoadAddress;
      delete mergedItem.mbzPhone;

      finalQuotaList.push(mergedItem);
      logger.success(`[Hybrid Quota] [결합 완료] ${mergedItem.companyName} | 시장: ${mergedItem.marketName} | 연락처: ${mergedItem.phone || 'null'} | 주소: ${mergedItem.address || 'null'} | 취급품목: ${mergedItem.handledItems || 'null'}`);
    }

    logger.success(`[Hybrid Quota] 총 ${finalQuotaList.length}건의 온누리 연계 사업자 쿼터 생성이 성공적으로 완료되었습니다.`);
    return finalQuotaList;

  } catch (error) {
    logger.error('[Hybrid Quota] 하이브리드 쿼터 생성 중 오류 발생:', error);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}
