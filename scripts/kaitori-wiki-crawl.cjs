'use strict';

/**
 * kaitori.wiki 全商品クロールバッチ
 *
 * 使い方:
 *   node scripts/kaitori-wiki-crawl.cjs [--dry-run] [--interval=7000] [--start-page=1]
 *
 * 環境変数:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  ... サービスアカウントキーのJSON文字列
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const BASE_URL = 'https://kaitori.wiki/search';
const TOTAL_PAGES = 174;
const SOURCE = 'kaitori.wiki';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const obj = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return obj;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTMLから商品情報を抽出 */
function parseProducts(html) {
  const results = [];
  const regex = /class="sub-pro-career">\s*<a[^>]*>([^<]+)<\/a>[\s\S]*?class="sub-pro-jia">買取価格:<span>\s*([\d,]+)円/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const raw = m[1].trim();
    const price = parseInt(m[2].replace(/,/g, ''), 10);
    const janMatch = raw.match(/(\d{13}|\d{8})\s*$/);
    if (!janMatch) continue;
    const janCode = janMatch[1];
    const productName = raw.slice(0, raw.lastIndexOf(janCode)).trim();
    if (productName && !isNaN(price) && price >= 100) {
      results.push({ janCode, productName, price });
    }
  }
  return results;
}

async function fetchPage(page) {
  const url = `${BASE_URL}/${page}/price/5`;
  const res = await fetch(url, {
    headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} page=${page}`);
  return res.text();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const intervalArg = args.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 7000;
  const startPageArg = args.find((a) => a.startsWith('--start-page='));
  const startPage = startPageArg ? parseInt(startPageArg.split('=')[1], 10) : 1;

  const env = {
    ...parseEnvFile(path.resolve(__dirname, '../.env')),
    ...parseEnvFile(path.resolve(__dirname, '../.env.local')),
    ...process.env,
  };

  console.log(`[crawl] 開始 dry-run=${dryRun} interval=${intervalMs}ms pages=${startPage}-${TOTAL_PAGES}`);

  let db = null;
  if (!dryRun) {
    const serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.error('[crawl] FIREBASE_SERVICE_ACCOUNT_JSON が設定されていません');
      process.exit(1);
    }
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      console.error('[crawl] FIREBASE_SERVICE_ACCOUNT_JSON のパースに失敗しました');
      process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log('[crawl] Firebase Admin 初期化OK');
  } else {
    console.log('[crawl] ドライランモード（Firestore接続なし）');
  }

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const now = new Date().toISOString();

  for (let page = startPage; page <= TOTAL_PAGES; page++) {
    console.log(`[crawl] ページ ${page}/${TOTAL_PAGES} 取得中...`);

    try {
      const html = await fetchPage(page);
      const products = parseProducts(html);
      console.log(`  → ${products.length}件パース`);

      if (dryRun) {
        totalAdded += products.length;
        if (products.length > 0) {
          console.log(`  例: ${products[0].productName} (${products[0].janCode}) ${products[0].price.toLocaleString()}円`);
        }
      } else if (products.length > 0) {
        // Firestore バッチ書き込み（最大400件/バッチ）
        let wb = db.batch();
        let batchCount = 0;

        for (const p of products) {
          const ref = db.collection('jan_master').doc(p.janCode);
          const existing = await ref.get();

          if (existing.exists) {
            const prev = existing.data();
            if (prev.kaitoriPrice !== p.price) {
              await db.collection('kaitoriPriceHistory').add({
                janCode: p.janCode,
                productName: p.productName,
                price: p.price,
                prevPrice: prev.kaitoriPrice ?? null,
                source: SOURCE,
                recordedAt: admin.firestore.Timestamp.now(),
              });
              wb.set(ref, {
                janCode: p.janCode,
                productName: p.productName,
                kaitoriPrice: p.price,
                source: SOURCE,
                updatedAt: now,
              }, { merge: true });
              totalUpdated++;
            } else {
              totalSkipped++;
            }
          } else {
            wb.set(ref, {
              janCode: p.janCode,
              productName: p.productName,
              kaitoriPrice: p.price,
              source: SOURCE,
              updatedAt: now,
              createdAt: now,
            });
            await db.collection('kaitoriPriceHistory').add({
              janCode: p.janCode,
              productName: p.productName,
              price: p.price,
              prevPrice: null,
              source: SOURCE,
              recordedAt: admin.firestore.Timestamp.now(),
            });
            totalAdded++;
          }

          batchCount++;
          if (batchCount >= 400) {
            await wb.commit();
            wb = db.batch();
            batchCount = 0;
          }
        }

        if (batchCount > 0) await wb.commit();
      }
    } catch (err) {
      console.error(`  [page ${page}] エラー:`, err.message);
      totalFailed++;
    }

    if (page < TOTAL_PAGES) {
      await sleep(intervalMs);
    }
  }

  console.log(`[crawl] 完了 added=${totalAdded} updated=${totalUpdated} skipped=${totalSkipped} failed=${totalFailed}`);
}

main().catch((err) => {
  console.error('[crawl] 致命的エラー:', err);
  process.exit(1);
});
