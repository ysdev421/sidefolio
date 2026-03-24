'use strict';

/**
 * 買取価格一括取得バッチ
 *
 * 使い方:
 *   node scripts/kaitori-price-batch.cjs [--dry-run] [--interval=7000]
 *
 * 環境変数（.env または GitHub Secrets）:
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
 *   IMPORT_EMAIL, IMPORT_PASSWORD
 */

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  collection,
  getDocs,
  getFirestore,
  query,
  Timestamp,
  updateDoc,
  addDoc,
  doc,
  where,
} = require('firebase/firestore');

// ── フェッチャー登録 ──────────────────────────────────────
// 将来のサイト追加はここに require を1行追加するだけ
const FETCHERS = [
  require('./fetchers/kaitori-wiki.cjs'),
  // require('./fetchers/kaitori-shoten.cjs'),
  // require('./fetchers/kaitori-rudeya.cjs'),
  // require('./fetchers/kaitori-icchome.cjs'),
];

// ─────────────────────────────────────────────────────────

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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const intervalArg = args.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 7000;

  const env = {
    ...parseEnvFile(path.resolve(__dirname, '../.env')),
    ...process.env,
  };

  console.log(`[batch] 開始 dry-run=${dryRun} interval=${intervalMs}ms fetchers=${FETCHERS.map((f) => f.name).join(', ')}`);

  // Firebase 初期化
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[batch] 環境変数が不足:', missing.join(', '));
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInWithEmailAndPassword(auth, env.IMPORT_EMAIL, env.IMPORT_PASSWORD);
  console.log('[batch] Firebase 認証OK');

  // JAN コードがある全商品を取得
  const snap = await getDocs(query(collection(db, 'products')));
  const products = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.janCode && p.status !== 'sold');

  console.log(`[batch] 対象商品: ${products.length}件`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    console.log(`[batch] 処理中: ${product.productName} (JAN:${product.janCode})`);

    for (const fetcher of FETCHERS) {
      try {
        const result = await fetcher.fetchPrice(product.janCode);
        if (!result) {
          console.log(`  [${fetcher.name}] 価格なし`);
          skipped++;
          continue;
        }

        console.log(`  [${fetcher.name}] ${result.price.toLocaleString()}円`);

        if (!dryRun) {
          const now = Timestamp.now();
          // 履歴を保存
          await addDoc(collection(db, 'kaitoriPriceHistory'), {
            userId: product.userId,
            janCode: product.janCode,
            productId: product.id,
            price: result.price,
            source: fetcher.name,
            recordedAt: now,
          });
          // 商品の最新価格を更新（最高値で上書き）
          const currentBest = product.kaitoriPrice ?? 0;
          if (result.price >= currentBest) {
            await updateDoc(doc(db, 'products', product.id), {
              kaitoriPrice: result.price,
              kaitoriPriceAt: now.toDate().toISOString(),
              updatedAt: now,
            });
          }
        }
        updated++;
      } catch (err) {
        console.error(`  [${fetcher.name}] エラー:`, err.message);
        failed++;
      }

      // サイト間にも間隔を空ける
      if (FETCHERS.length > 1) await sleep(intervalMs);
    }

    // 商品間のウェイト
    console.log(`  次の商品まで ${intervalMs}ms 待機...`);
    await sleep(intervalMs);
  }

  console.log(`[batch] 完了 updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error('[batch] 致命的エラー:', err);
  process.exit(1);
});
