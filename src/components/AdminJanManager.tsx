import { useMemo, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { upsertJanMaster } from '@/lib/firestore';

type JanRow = { janCode: string; productName: string; url?: string };

const BASE_URL = 'https://gamekaitori.jp/';

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();
const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const cleanText = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

const toProxyUrl = (url: string) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch {
    // fallback to proxy
  }
  const proxied = await fetch(toProxyUrl(url));
  if (!proxied.ok) throw new Error(`取得失敗: ${url}`);
  return proxied.text();
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

function extractRows(htmlOrText: string, sourceUrl: string): JanRow[] {
  const rows: JanRow[] = [];
  const byJan = new Map<string, JanRow>();

  for (const m of htmlOrText.matchAll(/title=["']([^"']*?)(\d{8,13})[^"']*["']/gi)) {
    const jan = normalizeJanCode(m[2]);
    const name = cleanText(m[1]).replace(/\d{8,13}/g, '').trim();
    if (!jan || !name) continue;
    byJan.set(jan, { janCode: jan, productName: name, url: sourceUrl });
  }

  for (const m of htmlOrText.matchAll(/\/purchase\/([^\s"'<>]+?)(\d{8,13})(?:[^\s"'<>]*)/gi)) {
    const jan = normalizeJanCode(m[2]);
    if (!jan) continue;
    const slug = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim();
    const nameGuess = cleanText(slug).replace(/\d{8,13}/g, '').trim();
    if (!nameGuess) continue;
    if (!byJan.has(jan)) byJan.set(jan, { janCode: jan, productName: nameGuess, url: sourceUrl });
  }

  for (const m of htmlOrText.matchAll(/(JAN|ＪＡＮ)\s*[：:]\s*([0-9０-９\-\s]{8,20})/gi)) {
    const jan = normalizeJanCode(m[2].replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 65248)));
    if (!jan || byJan.has(jan)) continue;
    byJan.set(jan, { janCode: jan, productName: '（要確認）', url: sourceUrl });
  }

  rows.push(...byJan.values());
  return rows;
}

export function AdminJanManager() {
  const [rows, setRows] = useState<JanRow[]>([]);
  const [maxPages, setMaxPages] = useState(40);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [log, setLog] = useState('未実行');

  const validRows = useMemo(
    () => rows.filter((r) => r.productName && r.productName !== '（要確認）'),
    [rows]
  );

  const runExtract = async () => {
    setLoadingExtract(true);
    setLog('抽出中...');
    try {
      const queue = [BASE_URL];
      const visited = new Set<string>();
      const map = new Map<string, JanRow>();

      while (queue.length > 0 && visited.size < maxPages) {
        const url = queue.shift();
        if (!url || visited.has(url)) continue;
        visited.add(url);

        let text = '';
        try {
          text = await fetchText(url);
        } catch {
          continue;
        }

        const extracted = extractRows(text, url);
        for (const r of extracted) {
          if (!map.has(r.janCode)) map.set(r.janCode, r);
          else {
            const cur = map.get(r.janCode)!;
            if (r.productName.length > cur.productName.length) map.set(r.janCode, r);
          }
        }

        for (const link of extractLinks(text, url)) {
          if (visited.has(link)) continue;
          if (queue.length > maxPages * 3) break;
          queue.push(link);
        }
      }

      const next = [...map.values()].sort((a, b) => a.janCode.localeCompare(b.janCode));
      setRows(next);
      setLog(`抽出完了: ${next.length}件 (巡回 ${Math.min(maxPages, visited.size)}ページ)`);
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
    setLog('jan_masterへ取り込み中...');
    try {
      let imported = 0;
      for (const row of validRows) {
        await upsertJanMaster({ janCode: row.janCode, productName: row.productName });
        imported += 1;
      }
      setLog(`取り込み完了: ${imported}件`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : '取り込みに失敗しました');
    } finally {
      setLoadingImport(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-panel p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">管理者: JAN抽出/投入</h2>
        <p className="text-sm text-slate-600">gamekaitoriから抽出して jan_master に取り込みます</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-700">
            巡回ページ数
            <input
              type="number"
              min={1}
              max={300}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Number(e.target.value || 1)))}
              className="input-field ml-2 w-28"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runExtract}
            disabled={loadingExtract || loadingImport}
            className="btn-primary px-4 py-2 rounded-xl inline-flex items-center gap-2"
          >
            {loadingExtract ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            1. gamekaitoriから抽出
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={loadingExtract || loadingImport || validRows.length === 0}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 inline-flex items-center gap-2"
          >
            {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            2. jan_masterへ取り込み
          </button>
        </div>
        <p className="text-sm text-slate-700">{log}</p>
      </div>

      <div className="glass-panel p-5 space-y-2">
        <p className="text-sm text-slate-600">抽出件数: {rows.length}件 / 取り込み対象: {validRows.length}件</p>
        <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-white/60">
          {rows.length === 0 && <p className="text-sm text-slate-500 p-2">まだ抽出していません</p>}
          {rows.map((r) => (
            <div key={r.janCode} className="text-xs text-slate-700 p-1">
              <span className="font-semibold">{r.janCode}</span> / {r.productName}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

