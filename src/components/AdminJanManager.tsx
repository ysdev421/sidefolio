import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Download, Loader2, Upload } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { upsertJanMaster } from '@/lib/firestore';

type JanRow = { janCode: string; productName: string; url?: string };
type DiffReport = { newCount: number; updateCount: number };

const BASE_URL = 'https://gamekaitori.jp/';
const MAX_PAGES_HARD = 200;
const EXTRACT_COOLDOWN_MS = 5 * 60 * 1000;
const LAST_EXTRACT_KEY = 'admin_jan_last_extract_at';
const SEED_URLS = [
  BASE_URL,
  'https://gamekaitori.jp/series/',
  'https://gamekaitori.jp/brand/',
  'https://gamekaitori.jp/series/nintendo-switch/',
  'https://gamekaitori.jp/brand/nintendo/',
  'https://gamekaitori.jp/brand/sony/',
  'https://gamekaitori.jp/brand/microsoft/',
];

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();
const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const cleanText = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const BRAND_PREFIX_RE = /^(SONY|FACEBOOK|META|NINTENDO|MICROSOFT|SEGA|KONAMI|CAPCOM|BANDAI(?:\s+NAMCO)?|SQUARE(?:\s+ENIX)?|ATLUS|HORI)\s*[:\-\/]?\s*/i;
const normalizeProductName = (value: string) =>
  cleanText(value)
    .replace(BRAND_PREFIX_RE, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
const toProxyUrl = (url: string) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch {
    // fallback
  }
  const proxied = await fetch(toProxyUrl(url));
  if (!proxied.ok) throw new Error(`取得失敗: ${url}`);
  return proxied.text();
}

async function checkRobotsNote(): Promise<string> {
  try {
    const text = await fetchText('https://gamekaitori.jp/robots.txt');
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    let inWildcard = false;
    let disallowAll = false;
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const lower = line.toLowerCase();
      if (lower.startsWith('user-agent:')) {
        inWildcard = lower.includes('*');
        continue;
      }
      if (inWildcard && lower.startsWith('disallow:')) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value === '/') disallowAll = true;
      }
    }
    if (disallowAll) return 'robots.txt で User-agent:* の Disallow:/ が指定されています。実行を控えてください。';
    return 'robots.txt 確認済み（全面禁止は検出なし）';
  } catch {
    return 'robots.txt を確認できませんでした。アクセス頻度を控えて実行してください。';
  }
}

function extractLinks(htmlOrText: string, currentUrl: string): string[] {
  const links = new Set<string>();

  for (const m of htmlOrText.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], currentUrl);
      if (u.hostname === 'gamekaitori.jp') links.add(u.toString());
    } catch {
      // noop
    }
  }

  for (const m of htmlOrText.matchAll(/https?:\/\/gamekaitori\.jp\/[^\s"'<>]+/gi)) {
    links.add(m[0].replace(/[),.;]+$/, ''));
  }

  return [...links];
}

function pickLongerName(current: JanRow | undefined, incomingName: string): boolean {
  if (!current) return true;
  const cur = current.productName || '';
  return incomingName.length > cur.length;
}

function extractRows(htmlOrText: string, sourceUrl: string): JanRow[] {
  const byJan = new Map<string, JanRow>();

  for (const m of htmlOrText.matchAll(/title=["']([^"']*?)(\d{8,13})[^"']*["']/gi)) {
    const jan = normalizeJanCode(m[2]);
    const name = normalizeProductName(cleanText(m[1]).replace(/\d{8,13}/g, '').trim());
    if (!jan || !name) continue;
    const current = byJan.get(jan);
    if (pickLongerName(current, name)) byJan.set(jan, { janCode: jan, productName: name, url: sourceUrl });
  }

  for (const m of htmlOrText.matchAll(/\/purchase\/([^\s"'<>]+?)(\d{8,13})(?:[^\s"'<>]*)/gi)) {
    const jan = normalizeJanCode(m[2]);
    if (!jan) continue;
    const slug = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim();
    const name = normalizeProductName(cleanText(slug).replace(/\d{8,13}/g, '').trim());
    if (!name) continue;
    const current = byJan.get(jan);
    if (pickLongerName(current, name)) byJan.set(jan, { janCode: jan, productName: name, url: sourceUrl });
  }

  for (const m of htmlOrText.matchAll(/(JAN|ＪＡＮ)\s*[：:]\s*([0-9０-９\-\s]{8,20})/gi)) {
    const jan = normalizeJanCode(m[2].replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 65248)));
    if (!jan || byJan.has(jan)) continue;
    byJan.set(jan, { janCode: jan, productName: '（要確認）', url: sourceUrl });
  }

  return [...byJan.values()];
}

function toValidRows(rows: JanRow[]): JanRow[] {
  const map = new Map<string, JanRow>();
  for (const row of rows) {
    const jan = normalizeJanCode(row.janCode);
    const name = normalizeProductName(cleanText(String(row.productName || '')).replace(/\d{8,13}/g, '').trim());
    if (!jan) continue;
    const normalized: JanRow = { janCode: jan, productName: name || '（要確認）', url: row.url };
    const current = map.get(jan);
    if (pickLongerName(current, normalized.productName)) map.set(jan, normalized);
  }
  return [...map.values()].sort((a, b) => a.janCode.localeCompare(b.janCode));
}

async function buildDiffReport(rows: JanRow[], setProgress?: (v: number) => void): Promise<DiffReport> {
  if (rows.length === 0) return { newCount: 0, updateCount: 0 };

  let newCount = 0;
  let updateCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const snap = await getDoc(doc(db, 'jan_master', row.janCode));
    if (!snap.exists()) {
      newCount += 1;
    } else {
      const existingName = String((snap.data() as any)?.productName || '').trim();
      if (existingName !== row.productName) updateCount += 1;
    }
    if (setProgress) setProgress(Math.round(((i + 1) / rows.length) * 100));
  }

  return { newCount, updateCount };
}

function downloadCsv(rows: JanRow[]) {
  const csv = Papa.unparse(
    rows.map((r) => ({ janCode: r.janCode, productName: r.productName, url: r.url || '' }))
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kaitoriwiki_jan_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function AdminJanManager() {
  const [rows, setRows] = useState<JanRow[]>([]);
  const [maxPages, setMaxPages] = useState(80);
  const [delayMs, setDelayMs] = useState(700);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [log, setLog] = useState('未実行');
  const [robotsNote, setRobotsNote] = useState('');
  const [diff, setDiff] = useState<DiffReport>({ newCount: 0, updateCount: 0 });
  const [onlyNew, setOnlyNew] = useState(true);
  const [importQueue, setImportQueue] = useState<string[]>([]);
  const [currentImportJan, setCurrentImportJan] = useState('');
  const [importedJanSet, setImportedJanSet] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validRows = useMemo(
    () => rows.filter((r) => r.productName && r.productName !== '（要確認）'),
    [rows]
  );

  const importTargetCount = onlyNew ? diff.newCount : validRows.length;

  const recalcDiff = async (targetRows: JanRow[]) => {
    setLoadingDiff(true);
    setImportProgress(0);
    try {
      const report = await buildDiffReport(targetRows.filter((r) => r.productName !== '（要確認）'), setImportProgress);
      setDiff(report);
      return report;
    } finally {
      setLoadingDiff(false);
      setImportProgress(0);
    }
  };

  const runExtract = async () => {
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_EXTRACT_KEY) || '0');
    if (last > 0 && now - last < EXTRACT_COOLDOWN_MS) {
      const remainSec = Math.ceil((EXTRACT_COOLDOWN_MS - (now - last)) / 1000);
      setLog(`連続実行を制限中です。あと ${remainSec} 秒待ってください。`);
      return;
    }

    setLoadingExtract(true);
    setExtractProgress(0);
    setLog('買取WIKIから抽出中...');
    try {
      setRobotsNote(await checkRobotsNote());
      localStorage.setItem(LAST_EXTRACT_KEY, String(Date.now()));

      const cappedMaxPages = Math.min(MAX_PAGES_HARD, Math.max(1, maxPages));
      const queue = [...new Set(SEED_URLS)];
      const visited = new Set<string>();
      const map = new Map<string, JanRow>();

      while (queue.length > 0 && visited.size < cappedMaxPages) {
        const url = queue.shift();
        if (!url || visited.has(url)) continue;
        visited.add(url);
        setExtractProgress(Math.round((visited.size / cappedMaxPages) * 100));

        let text = '';
        try {
          text = await fetchText(url);
        } catch {
          continue;
        }

        for (const r of extractRows(text, url)) {
          const current = map.get(r.janCode);
          if (pickLongerName(current, r.productName)) map.set(r.janCode, r);
        }

        for (const link of extractLinks(text, url)) {
          if (visited.has(link)) continue;
          if (queue.length > cappedMaxPages * 4) break;
          queue.push(link);
        }

        if (delayMs > 0) await sleep(delayMs);
      }

      const next = toValidRows([...map.values()]);
      setRows(next);
      await recalcDiff(next);
      setLog(`抽出完了: ${next.length}件 / 巡回 ${Math.min(visited.size, cappedMaxPages)}ページ`);
      setExtractProgress(100);
    } catch (e) {
      setLog(e instanceof Error ? e.message : '抽出に失敗しました');
    } finally {
      setLoadingExtract(false);
    }
  };

  const runImport = async () => {
    if (validRows.length === 0) {
      setLog('取り込み対象がありません');
      return;
    }

    setLoadingImport(true);
    setImportProgress(0);
    setLog('jan_master へ取り込み中...');
    try {
      const targets: JanRow[] = [];
      if (onlyNew) {
        for (const row of validRows) {
          const snap = await getDoc(doc(db, 'jan_master', row.janCode));
          if (!snap.exists()) targets.push(row);
        }
      } else {
        targets.push(...validRows);
      }
      setImportQueue(targets.map((t) => t.janCode));
      setImportedJanSet({});
      setCurrentImportJan('');

      let processed = 0;
      for (const row of targets) {
        setCurrentImportJan(row.janCode);
        await upsertJanMaster({ janCode: row.janCode, productName: row.productName });
        processed += 1;
        setImportedJanSet((prev) => ({ ...prev, [row.janCode]: true }));
        setImportProgress(Math.round((processed / Math.max(1, targets.length)) * 100));
      }
      setCurrentImportJan('');

      const report = await recalcDiff(validRows);
      setLog(`取り込み完了: ${processed}件 (新規 ${report?.newCount || 0} / 更新候補 ${report?.updateCount || 0})`);
      setImportProgress(100);
    } catch (e) {
      setLog(e instanceof Error ? e.message : '取り込みに失敗しました');
    } finally {
      setCurrentImportJan('');
      setLoadingImport(false);
    }
  };

  const onCsvImport = async (file: File) => {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const importedRows = (parsed.data as any[]).map((r) => ({
      janCode: String(r.janCode || ''),
      productName: String(r.productName || ''),
      url: String(r.url || ''),
    }));
    const next = toValidRows(importedRows);
    setRows(next);
    await recalcDiff(next);
    setLog(`CSV読み込み完了: ${next.length}件`);
  };

  return (
    <section className="space-y-4">
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">管理者: JAN抽出/投入</h2>
        <p className="text-sm text-slate-600">買取WIKIから抽出して jan_master に取り込みます</p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-700">
            巡回ページ数
            <input
              type="number"
              min={1}
              max={MAX_PAGES_HARD}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.min(MAX_PAGES_HARD, Math.max(1, Number(e.target.value || 1))))}
              className="input-field ml-2 w-28"
            />
          </label>
          <label className="text-sm text-slate-700">
            間隔(ms)
            <input
              type="number"
              min={200}
              max={5000}
              value={delayMs}
              onChange={(e) => setDelayMs(Math.max(200, Number(e.target.value || 200)))}
              className="input-field ml-2 w-28"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            未登録JANのみ取り込み
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runExtract}
            disabled={loadingExtract || loadingImport || loadingDiff}
            className="btn-primary px-4 py-2 rounded-xl inline-flex items-center gap-2"
          >
            {loadingExtract ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            1. 買取WIKIから抽出
          </button>

          <button
            type="button"
            onClick={runImport}
            disabled={loadingExtract || loadingImport || loadingDiff || importTargetCount === 0}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 inline-flex items-center gap-2"
          >
            {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            2. jan_masterへ取り込み
          </button>

          <button
            type="button"
            onClick={() => downloadCsv(validRows)}
            disabled={validRows.length === 0 || loadingExtract || loadingImport || loadingDiff}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800"
          >
            CSVダウンロード
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingExtract || loadingImport || loadingDiff}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800"
          >
            CSV読み込み
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await onCsvImport(file);
              e.currentTarget.value = '';
            }}
          />
        </div>

        <div className="text-sm text-slate-700 space-y-1">
          <p>{log}</p>
          {(loadingExtract || loadingImport || loadingDiff) && (
            <p>
              進捗: {loadingExtract ? `${extractProgress}%` : `${importProgress}%`}
            </p>
          )}
          <p>差分: 新規 {diff.newCount}件 / 更新候補 {diff.updateCount}件</p>
          <p>取り込み対象: {importTargetCount}件</p>
          {robotsNote && <p className="text-xs text-slate-500">{robotsNote}</p>}
          <p className="text-xs text-slate-500">抽出は最大 {MAX_PAGES_HARD} ページ、連続実行は5分クールダウンです。</p>
        </div>
      </div>

      <div className="glass-panel p-5 space-y-2">
        <p className="text-sm text-slate-600">抽出件数: {rows.length}件 / 有効件数: {validRows.length}件</p>
        <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-white/60">
          {rows.length === 0 && <p className="text-sm text-slate-500 p-2">まだ抽出していません</p>}
          {rows.map((r) => (
            <div key={r.janCode} className="text-xs text-slate-700 p-1">
              <span className="font-semibold">{r.janCode}</span> / {r.productName}
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-5 space-y-2">
        <p className="text-sm text-slate-600">
          取り込み対象JAN: {importQueue.length}件
          {currentImportJan ? ` / 処理中: ${currentImportJan}` : ''}
        </p>
        <div className="max-h-56 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-white/60">
          {importQueue.length === 0 && <p className="text-sm text-slate-500 p-2">まだ取り込みを開始していません</p>}
          {importQueue.map((jan) => (
            <div key={jan} className="text-xs text-slate-700 p-1 flex items-center justify-between gap-2">
              <span className="font-semibold">{jan}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  importedJanSet[jan]
                    ? 'bg-emerald-100 text-emerald-700'
                    : currentImportJan === jan
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {importedJanSet[jan] ? '完了' : currentImportJan === jan ? '処理中' : '待機'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
