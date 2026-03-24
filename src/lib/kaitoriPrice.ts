const toProxyUrl = (url: string) => `https://r.jina.ai/${url}`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間
const CACHE_KEY_PREFIX = 'kaitoriPrice_';

export interface KaitoriPriceResult {
  highestPrice: number;
  searchUrl: string;
  cachedAt?: number;
}

function loadCache(janCode: string): KaitoriPriceResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + janCode);
    if (!raw) return null;
    const data = JSON.parse(raw) as KaitoriPriceResult;
    if (Date.now() - (data.cachedAt ?? 0) > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + janCode);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveCache(janCode: string, result: KaitoriPriceResult) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + janCode, JSON.stringify({ ...result, cachedAt: Date.now() }));
  } catch {
    // noop
  }
}

export async function fetchKaitoriPrice(janCode: string): Promise<KaitoriPriceResult | null> {
  const cached = loadCache(janCode);
  if (cached) return cached;

  const searchUrl = `https://kaitori.wiki/search?type=&keyword=${encodeURIComponent(janCode)}`;
  const res = await fetch(toProxyUrl(searchUrl));
  if (!res.ok) throw new Error('取得に失敗しました');
  const text = await res.text();

  const matches = [...text.matchAll(/([\d,]+)円/g)];
  const prices = matches
    .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
    .filter((n) => !isNaN(n) && n > 0 && n < 10_000_000);

  if (prices.length === 0) return null;

  const result: KaitoriPriceResult = { highestPrice: Math.max(...prices), searchUrl };
  saveCache(janCode, result);
  return result;
}
