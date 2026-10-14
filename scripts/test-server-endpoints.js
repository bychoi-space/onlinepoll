import express from 'express';
import { batchEnrichQuota, enrichBusinessData } from '../src/engine/enricher.js';

async function testFullIntegration() {
  console.log('=== 통합 기능 테스트 시작 ===');

  // 1. 단일 사업자 보강 테스트
  const singleTest = {
    companyName: '더덕상회',
    bizNumber: '626-22-02194',
    marketName: '풍납시장',
    address: '서울특별시 송파구 풍납동 1층 4호',
    ceoName: null,
    phone: null
  };

  console.log('[1. 단일 사업자 보강 테스트]');
  const enrichedSingle = await enrichBusinessData(singleTest);
  console.log(`- 상호: ${enrichedSingle.companyName}`);
  console.log(`- 대표자: ${enrichedSingle.ceoName} (${enrichedSingle.ceoSource || '출처없음'})`);
  console.log(`- 연락처: ${enrichedSingle.phone} (${enrichedSingle.phoneSource || '출처없음'})`);
  console.log(`- 보강 여부: ${enrichedSingle.isCeoEnriched ? '대표자 성공 ' : ''}${enrichedSingle.isPhoneEnriched ? '연락처 성공' : ''}`);

  if (enrichedSingle.ceoName !== '이은지') {
    throw new Error(`대표자명 불일치! 기대: '이은지', 실제: ${enrichedSingle.ceoName}`);
  }

  console.log('\n[2. 일괄 보강 테스트 (날조 방지 확인)]');
  const batchTest = [
    {
      companyName: '칠칠수산',
      bizNumber: '555-95-01465',
      marketName: '풍납시장',
      address: '서울특별시 송파구 풍납동 1층',
      ceoName: null,
      phone: null
    },
    {
      companyName: '미존재가공기업_테스트',
      bizNumber: '000-00-00000',
      marketName: '가공시장',
      address: '서울특별시 어딘가',
      ceoName: null,
      phone: null
    }
  ];

  const batchResult = await batchEnrichQuota(batchTest);
  console.log(`- 총 처리: ${batchResult.quotaList.length}건, 성공: ${batchResult.enrichedCount}건`);
  
  const ghost = batchResult.quotaList.find(b => b.companyName === '미존재가공기업_테스트');
  if (ghost.ceoName !== null || ghost.phone !== null) {
    throw new Error('미존재 기업에 가짜 데이터가 생성되었습니다! (Rule 2 위반)');
  }
  console.log('- 미존재 기업 검증: 대표자=null, 연락처=null 안전 유지 확인 (Zero-Hallucination 준수!)');

  console.log('\n=== 모든 통합 테스트 정상 통과! ===');
}

testFullIntegration();
