import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testE2E() {
  console.log('=== [상인회 25단계 E2E 완주 시뮬레이션 시작] ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 1000 }
  });
  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`[Alert 감지] "${dialog.message().replace(/\n/g, ' ')}" ➔ 자동 수락`);
    await dialog.accept().catch(() => {});
  });

  const reportDir = path.resolve('reports/test_assoc_full_e2e');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const surveyUrl = 'https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=xMhDVlSB1&type=tapi&prid=2026070801&mnid=900001374&srt=1';
  await page.goto(surveyUrl, { waitUntil: 'networkidle' });

  // 1. Start from Q1
  await page.evaluate(() => {
    if (typeof move_page === 'function') move_page('Q1');
  });
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  console.log('[1] Q1 진입 완료: ', page.url());

  // Q1 fill
  await page.evaluate(() => {
    const surveyor = document.querySelector('#Q1_10');
    if (surveyor) surveyor.value = '가온박정순';
    const leader = document.querySelector('#Q1_4');
    if (leader && !leader.value) leader.value = '노철영';
    const phone = document.querySelector('#Q1_6');
    if (phone && !phone.value) phone.value = '010-3853-7256';
    const radioPos = document.querySelector('input[name="Q1_8"][value="1"]');
    if (radioPos) { radioPos.checked = true; radioPos.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.screenshot({ path: path.join(reportDir, 'step_01_Q1.png'), fullPage: true });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
    page.click('#next')
  ]);
  console.log('[2] Q1 통과 후 진입 URL:', page.url());

  // Loop through pages
  let maxSteps = 35;
  while (maxSteps-- > 0) {
    const currUrl = page.url();
    const currPageName = await page.evaluate(() => document.querySelector('input[name="PageName"]')?.value || '');
    console.log(`\n>>> [현재 단계] PageName: ${currPageName}, URL: ${currUrl}`);

    if (currUrl.includes('Agree.asp') || currPageName === 'Agree') {
      console.log('🎉 [축하] Agree.asp 최종 동의 페이지 도달 성공!');
      await page.screenshot({ path: path.join(reportDir, 'step_24_AGREE.png'), fullPage: true });
      break;
    }

    // P21: F5, F6
    if (currUrl.includes('P21') || currPageName === 'P21') {
      console.log('-> [P21] F5, F6 처리...');
      await page.evaluate(() => {
        const frameF5 = document.querySelector('#frame_F5')?.contentDocument;
        if (frameF5) {
          const r = frameF5.querySelector('input[name="F5"][value="1"]') || frameF5.querySelector('input[type="radio"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        const frameF6 = document.querySelector('#frame_F6')?.contentDocument;
        if (frameF6) {
          const r = frameF6.querySelector('input[name="F6"][value="1"]') || frameF6.querySelector('input[type="radio"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      });
      await page.screenshot({ path: path.join(reportDir, 'step_P21.png'), fullPage: true });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        page.click('#next')
      ]);
      continue;
    }

    // P22: G1, G2
    if (currUrl.includes('P22') || currPageName === 'P22') {
      console.log('-> [P22] G1, G2 처리...');
      await page.evaluate(() => {
        const frameG1 = document.querySelector('#frame_G1')?.contentDocument;
        if (frameG1) {
          const r = frameG1.querySelector('input[name="G1"][value="1"]') || frameG1.querySelector('input[type="radio"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        const frameG2 = document.querySelector('#frame_G2')?.contentDocument;
        if (frameG2) {
          const r = frameG2.querySelector('input[name="G2"][value="1"]') || frameG2.querySelector('input[type="radio"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      });
      await page.screenshot({ path: path.join(reportDir, 'step_P22.png'), fullPage: true });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        page.click('#next')
      ]);
      continue;
    }

    // P23: G3, G4
    if (currUrl.includes('P23') || currPageName === 'P23') {
      console.log('-> [P23] G3, G4 처리...');
      await page.evaluate(() => {
        const frameG3 = document.querySelector('#frame_G3')?.contentDocument;
        if (frameG3) {
          frameG3.querySelectorAll('input[type="radio"][value="2"]').forEach(r => {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        const frameG4 = document.querySelector('#frame_G4')?.contentDocument;
        if (frameG4) {
          frameG4.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (!cb.name.includes('G4_1_7') && !cb.name.includes('G4_2_6') && 
                !cb.name.includes('G4_3_6') && !cb.name.includes('G4_4_6') &&
                !cb.id.includes('G4_1_7') && !cb.id.includes('G4_2_6') && 
                !cb.id.includes('G4_3_6') && !cb.id.includes('G4_4_6')) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }
      });
      await page.screenshot({ path: path.join(reportDir, 'step_P23.png'), fullPage: true });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        page.click('#next')
      ]);
      continue;
    }

    // P1 ~ P20: 일반 미러링 및 특수 검증
    console.log(`-> [${currPageName}] 프레임 미러링 및 주입...`);

    // Sync child frames
    await page.evaluate(() => {
      document.querySelectorAll('iframe').forEach(f => {
        const dSrc = f.getAttribute('data-src');
        if (dSrc && (f.src === 'about:blank' || !f.src)) f.src = dSrc;
      });
    });
    await page.waitForTimeout(600);

    // Mirroring across frames
    for (const f of page.frames()) {
      try {
        await f.evaluate(() => {
          // 1. prevData / currData
          const data = Object.assign({}, window.prevData || {}, window.currData || {});
          Object.keys(data).forEach(k => {
            const v = data[k];
            if (v === undefined || v === null || v === '') return;
            let curKey = k.startsWith('TP') ? 'T' + k.substring(2) : (k.startsWith('P') ? k.substring(1) : k);
            const r = document.querySelector(`input[type="radio"][name="${curKey}"][value="${v}"]`);
            if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
            const cb = document.querySelector(`input[type="checkbox"][name="${curKey}"][value="${v}"]`);
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
            const inp = document.querySelector(`input[name="${curKey}"]:not([type="radio"]):not([type="checkbox"])`);
            if (inp) {
              inp.value = v;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });

          // 2. DOM 'P' prefix elements (Radios & Checkboxes)
          document.querySelectorAll('input[type="radio"][name^="P"]').forEach(pr => {
            if (pr.checked) {
              const crName = pr.name.substring(1);
              const cr = document.querySelector(`input[type="radio"][name="${crName}"][value="${pr.value}"]`);
              if (cr) { cr.checked = true; cr.dispatchEvent(new Event('change', { bubbles: true })); }
            }
          });

          // 2-2. DOM 'P' prefix elements (Text / Tel / Numeric inputs like A6_1_1, B1, etc.)
          document.querySelectorAll('input[name^="P"]:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])').forEach(pInp => {
            const crName = pInp.name.substring(1);
            const crInp = document.querySelector(`input[name="${crName}"]`);
            if (crInp) {
              const valToSet = pInp.value && pInp.value.trim() !== '' ? pInp.value : '0';
              crInp.value = valToSet;
              crInp.dispatchEvent(new Event('input', { bubbles: true }));
              crInp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });

          // 3. New ratings / radios without response (PREFER '1' first to avoid '3=기타')
          const groups = {};
          document.querySelectorAll('input[type="radio"]:not([name^="P"]):not([disabled])').forEach(r => {
            if (!groups[r.name]) groups[r.name] = [];
            groups[r.name].push(r);
          });
          Object.keys(groups).forEach(gn => {
            if (!groups[gn].some(r => r.checked)) {
              // 1번 선택 최우선 (상인회, 유, 만족 등), 3번(보통)은 척도 문항일 때
              const opt1 = groups[gn].find(r => r.value === '1');
              const opt3 = groups[gn].find(r => r.value === '3');
              const opt = opt1 || opt3 || groups[gn][0];
              if (opt) { opt.checked = true; opt.dispatchEvent(new Event('change', { bubbles: true })); }
            }
          });

          // 4. Selects
          document.querySelectorAll('select:not([disabled])').forEach(s => {
            if (!s.value && s.options.length > 1) {
              s.value = s.options[1].value;
              s.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });

          // 4-2. Calculations
          if (typeof window.calculateA6 === 'function') window.calculateA6();
          if (typeof window.calculateA6A === 'function') window.calculateA6A();
          if (typeof window.calculateA7 === 'function') window.calculateA7();
          if (typeof window.calculateA8 === 'function') window.calculateA8();
          if (typeof window.calculateB1 === 'function') window.calculateB1();
          if (typeof window.calculateB2 === 'function') window.calculateB2();

          // 4-3. Specific frame helpers:
          // A3A: 1(상인회)
          const a3a = document.querySelector('input[name="A3A"]');
          if (a3a && !document.querySelector('input[name="A3A"]:checked')) {
            const opt1 = document.querySelector('input[name="A3A"][value="1"]');
            if (opt1) { opt1.checked = true; opt1.dispatchEvent(new Event('change', { bubbles: true })); }
          }

          // A5: 전문시장 여부
          const radioA5 = document.querySelector('input[name="A5"]');
          if (radioA5) {
            const pa5 = document.querySelector('input[name="PA5"]:checked')?.value || '2';
            const targetA5 = document.querySelector(`input[name="A5"][value="${pa5}"]`) || document.querySelector('input[name="A5"][value="2"]');
            if (targetA5) {
              targetA5.checked = true;
              targetA5.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
            if (ta5) {
              if (pa5 === '1') {
                if (!ta5.value) ta5.value = '종합소매';
              } else {
                ta5.value = '';
              }
            }
          }

          // A6A: 점포 업종별 수 (1~9)
          for (let i = 1; i <= 9; i++) {
            const inp = document.querySelector(`input[name="A6A_${i}"]`);
            if (inp && (!inp.value || inp.value.trim() === '')) {
              const prev = document.querySelector(`input[name="PA6A_${i}"]`)?.value;
              inp.value = prev && prev.trim() !== '' ? prev : '0';
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (typeof window.calculateA6A === 'function') window.calculateA6A();

          // 5. Special D3 handling
          const radioD3 = document.querySelector('input[name="D3"]');
          if (radioD3) {
            const d3Checked = document.querySelector('input[name="D3"]:checked');
            if (!d3Checked) {
              const opt2 = document.querySelector('#D3_2, input[name="D3"][value="2"]');
              if (opt2) {
                opt2.checked = true;
                opt2.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            const curD3 = document.querySelector('input[name="D3"]:checked')?.value;
            if (curD3 === '2') {
              const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
              if (td3) td3.value = '';
            } else if (curD3 === '1') {
              const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
              if (td3 && (!td3.value || parseInt(td3.value, 10) < 1)) td3.value = '1';
            }
          }

          // 6. Special F1~F4 handling
          const f1_1 = document.querySelector('input[name="F1_1"]');
          if (f1_1 && !f1_1.value) {
            f1_1.value = '0';
            const f1_2 = document.querySelector('input[name="F1_2"]');
            if (f1_2) f1_2.value = '0';
            const f1_3 = document.querySelector('input[name="F1_3"]');
            if (f1_3) f1_3.value = '0';
            const f1_4 = document.querySelector('input[name="F1_4"]');
            if (f1_4) f1_4.value = '0';
            if (typeof window.calcF1_4 === 'function') window.calcF1_4();
          }

          // F3 checkbox
          const f3Checkboxes = document.querySelectorAll('input[type="checkbox"][name^="F3"]');
          if (f3Checkboxes.length > 0) {
            const hasChecked = Array.from(f3Checkboxes).some(c => c.checked);
            if (!hasChecked) {
              const f3_1 = document.querySelector('#F3_1, input[name="F3_1"]');
              if (f3_1) { f3_1.checked = true; f3_1.dispatchEvent(new Event('change', { bubbles: true })); }
            }
          }

          // F4 inputs: ensure equal to F1
          const f4Inputs = document.querySelectorAll('input[name^="F4"]:not([readonly]):not([type="hidden"])');
          if (f4Inputs.length > 0) {
            f4Inputs.forEach(inp => {
              if (!inp.value) inp.value = '0';
            });
            const f4e4 = document.querySelector('input[name="F4E_4"]');
            if (f4e4) f4e4.value = '0';
          }
        });
      } catch (_) {}
    }

    await page.screenshot({ path: path.join(reportDir, `step_${currPageName}.png`), fullPage: true });

    // Click next
    const prevUrlForNav = page.url();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
      page.click('#next')
    ]);

    await page.waitForTimeout(600);
    if (page.url() === prevUrlForNav) {
      console.log(`⚠️ [${currPageName}] 페이지 잔류 감지. move_page로 보정 시도...`);
      // 다음 페이지 번호 계산
      const match = currPageName.match(/P(\d+)/);
      if (match) {
        const nextP = 'P' + (parseInt(match[1], 10) + 1);
        await page.evaluate((target) => {
          if (typeof move_page === 'function') move_page(target);
        }, nextP);
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      }
    }
  }

  await browser.close();
  console.log('=== [E2E 테스트 완료] ===');
}

testE2E().catch(console.error);
