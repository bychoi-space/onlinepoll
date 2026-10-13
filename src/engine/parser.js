/**
 * 설문조사 DOM 질문 파서 (Survey DOM Parser)
 * Google Forms 및 범용 HTML 폼 요소의 구조를 분석하여 질문 제목, 유형, 선택지를 자동 추출합니다.
 */

/**
 * 현재 페이지에서 모든 질문 요소를 탐색하고 구조화된 데이터로 파싱
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<Object>>}
 */
export async function parseQuestions(page) {
  return await page.evaluate(() => {
    const questions = [];

    // --- A. 구글 폼(Google Forms) 전용 파서 ---
    // 구글 폼의 문항 컨테이너 셀렉터
    const googleItems = document.querySelectorAll('div[role="listitem"]');

    if (googleItems && googleItems.length > 0) {
      googleItems.forEach((container, index) => {
        // 제목 탐색
        const titleEl = container.querySelector('div[role="heading"]') ||
                        container.querySelector('.M7eMe') ||
                        container.querySelector('span');
        const title = titleEl ? titleEl.innerText.trim() : `문항 ${index + 1}`;

        // 필수 여부
        const isRequired = !!container.querySelector('[aria-label*="필수"]') ||
                           !!container.querySelector('.v5Duua');

        // 1. 단일 선택 (Radio / role="radiogroup")
        const radioGroup = container.querySelector('[role="radiogroup"]');
        const radios = container.querySelectorAll('[role="radio"]');
        if (radios.length > 0) {
          const options = Array.from(radios).map((r, optIdx) => {
            const labelEl = r.closest('label') || r.querySelector('[dir="auto"]') || r.parentElement;
            return labelEl ? labelEl.innerText.trim() : `옵션 ${optIdx + 1}`;
          });

          questions.push({
            index,
            title,
            type: 'radio',
            isRequired,
            options,
            elementSelector: `google-item-${index}`
          });
          return;
        }

        // 2. 복수 선택 (Checkbox / role="checkbox")
        const checkboxes = container.querySelectorAll('[role="checkbox"]');
        if (checkboxes.length > 0) {
          const options = Array.from(checkboxes).map((c, optIdx) => {
            const labelEl = c.closest('label') || c.querySelector('[dir="auto"]') || c.parentElement;
            return labelEl ? labelEl.innerText.trim() : `옵션 ${optIdx + 1}`;
          });

          questions.push({
            index,
            title,
            type: 'checkbox',
            isRequired,
            options,
            elementSelector: `google-item-${index}`
          });
          return;
        }

        // 3. 주관식 장문/단답형 (Textarea / Input)
        const textarea = container.querySelector('textarea');
        if (textarea) {
          questions.push({
            index,
            title,
            type: 'textarea',
            isRequired,
            elementSelector: `google-item-${index}`
          });
          return;
        }

        const textInput = container.querySelector('input[type="text"]');
        if (textInput) {
          questions.push({
            index,
            title,
            type: 'text',
            isRequired,
            elementSelector: `google-item-${index}`
          });
          return;
        }
      });

      if (questions.length > 0) return questions;
    }

    // --- B. 범용 표준 웹 설문지 파서 (Fallback) ---
    const fieldsets = document.querySelectorAll('fieldset, .form-group, .question-card, .survey-question');
    if (fieldsets.length > 0) {
      fieldsets.forEach((fs, index) => {
        const legend = fs.querySelector('legend, h3, h4, .title, label');
        const title = legend ? legend.innerText.trim() : `질문 ${index + 1}`;

        const radios = fs.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          const options = Array.from(radios).map((r, i) => {
            const label = fs.querySelector(`label[for="${r.id}"]`) || r.parentElement;
            return label ? label.innerText.trim() : `옵션 ${i + 1}`;
          });
          questions.push({ index, title, type: 'radio', options });
          return;
        }

        const checkboxes = fs.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length > 0) {
          const options = Array.from(checkboxes).map((c, i) => {
            const label = fs.querySelector(`label[for="${c.id}"]`) || c.parentElement;
            return label ? label.innerText.trim() : `옵션 ${i + 1}`;
          });
          questions.push({ index, title, type: 'checkbox', options });
          return;
        }

        const textarea = fs.querySelector('textarea');
        if (textarea) {
          questions.push({ index, title, type: 'textarea' });
          return;
        }

        const input = fs.querySelector('input[type="text"]');
        if (input) {
          questions.push({ index, title, type: 'text' });
          return;
        }
      });
    }

    return questions;
  });
}
