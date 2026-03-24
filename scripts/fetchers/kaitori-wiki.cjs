'use strict';

const PROXY = 'https://r.jina.ai/';
const SOURCE_NAME = 'kaitori.wiki';

/**
 * kaitori.wiki から JAN コードで買取価格を取得する
 * @param {string} janCode
 * @returns {Promise<{ price: number; searchUrl: string } | null>}
 */
async function fetchPrice(janCode) {
  const searchUrl = `https://kaitori.wiki/search?type=&keyword=${encodeURIComponent(janCode)}`;
  const res = await fetch(`${PROXY}${searchUrl}`, {
    headers: { 'User-Agent': 'sedori-app-kaitori-batch/1.0 (+github-actions)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  // 「買取価格」直後の数値を優先
  const directMatch = text.match(/買取価格[^\d]{0,10}([\d,]+)円/);
  if (directMatch) {
    const price = parseInt(directMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(price) && price > 0) return { price, searchUrl };
  }

  // フォールバック：最初の妥当な価格
  const prices = [...text.matchAll(/([\d,]+)円/g)]
    .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
    .filter((n) => !isNaN(n) && n >= 100 && n < 1_000_000);

  if (prices.length === 0) return null;
  return { price: prices[0], searchUrl };
}

module.exports = { name: SOURCE_NAME, fetchPrice };
