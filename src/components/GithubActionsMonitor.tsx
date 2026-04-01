import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';

interface GithubActionsMonitorProps {
  userId: string;
}

type WorkflowRun = {
  id: number;
  name?: string;
  html_url: string;
  status: string;
  conclusion: string | null;
  event: string;
  run_number: number;
  run_attempt: number;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  actor?: { login?: string };
  head_branch?: string;
};

const STORAGE_KEY = 'gh_actions_monitor_settings_v1';

function formatDateTime(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function statusLabel(run: WorkflowRun) {
  if (run.status === 'in_progress') return '実行中';
  if (run.status === 'queued') return '待機中';
  if (run.status === 'completed' && run.conclusion === 'success') return '成功';
  if (run.status === 'completed' && run.conclusion === 'failure') return '失敗';
  if (run.status === 'completed' && run.conclusion === 'cancelled') return 'キャンセル';
  if (run.status === 'completed' && run.conclusion === 'timed_out') return 'タイムアウト';
  if (run.status === 'completed' && run.conclusion === 'skipped') return 'スキップ';
  return run.conclusion || run.status;
}

function statusClass(run: WorkflowRun) {
  const label = statusLabel(run);
  if (label === '成功') return 'bg-emerald-100 text-emerald-700';
  if (label === '実行中' || label === '待機中') return 'bg-sky-100 text-sky-700';
  return 'bg-rose-100 text-rose-700';
}

export function GithubActionsMonitor({ userId }: GithubActionsMonitorProps) {
  const [owner, setOwner] = useState(import.meta.env.VITE_GITHUB_OWNER || '');
  const [repo, setRepo] = useState(import.meta.env.VITE_GITHUB_REPO || '');
  const [workflowFile, setWorkflowFile] = useState(import.meta.env.VITE_GITHUB_KAITORI_WORKFLOW || 'kaitori-wiki-crawl.yml');
  const [branch, setBranch] = useState(import.meta.env.VITE_GITHUB_ACTIONS_BRANCH || '');
  const [token, setToken] = useState(import.meta.env.VITE_GITHUB_ACTIONS_TOKEN || '');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY}_${userId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        owner?: string;
        repo?: string;
        workflowFile?: string;
        branch?: string;
        token?: string;
      };
      if (parsed.owner) setOwner(parsed.owner);
      if (parsed.repo) setRepo(parsed.repo);
      if (parsed.workflowFile) setWorkflowFile(parsed.workflowFile);
      if (parsed.branch) setBranch(parsed.branch);
      if (parsed.token) setToken(parsed.token);
    } catch {
      // ignore
    }
  }, [userId]);

  const canFetch = useMemo(() => owner.trim() && repo.trim() && workflowFile.trim(), [owner, repo, workflowFile]);

  const saveSettings = () => {
    window.localStorage.setItem(
      `${STORAGE_KEY}_${userId}`,
      JSON.stringify({
        owner: owner.trim(),
        repo: repo.trim(),
        workflowFile: workflowFile.trim(),
        branch: branch.trim(),
        token: token.trim(),
      })
    );
    setMessage('設定を保存しました');
    window.setTimeout(() => setMessage(''), 1800);
  };

  const fetchRuns = async () => {
    if (!canFetch) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        per_page: '20',
      });
      if (branch.trim()) params.set('branch', branch.trim());
      const url = `https://api.github.com/repos/${owner.trim()}/${repo.trim()}/actions/workflows/${encodeURIComponent(workflowFile.trim())}/runs?${params.toString()}`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      };
      if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`取得失敗 (${res.status}) ${text.slice(0, 120)}`);
      }
      const json = await res.json() as { workflow_runs?: WorkflowRun[] };
      setRuns(json.workflow_runs || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canFetch) return;
    void fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

  useEffect(() => {
    if (!autoRefresh || !canFetch) return;
    const timer = window.setInterval(() => {
      void fetchRuns();
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, canFetch, owner, repo, workflowFile, branch, token]);

  const latest = runs[0];

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">GitHub Actions監視</h2>
        <p className="text-xs text-slate-500">kaitori.wiki 全商品クロールの実行状況をここで確認できます。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className="input-field" placeholder="your-org" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Repo</label>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} className="input-field" placeholder="your-repo" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Workflow file</label>
            <input value={workflowFile} onChange={(e) => setWorkflowFile(e.target.value)} className="input-field" placeholder="kaitori-wiki-crawl.yml" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Branch（任意）</label>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} className="input-field" placeholder="main" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">GitHub Token（Private repo時）</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="input-field" placeholder="ghp_xxx" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveSettings} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition text-sm font-semibold">
            <Save className="w-4 h-4" />
            設定保存
          </button>
          <button
            type="button"
            onClick={() => void fetchRuns()}
            disabled={!canFetch || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 disabled:opacity-50 text-sm font-semibold"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            更新
          </button>
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-sm font-semibold ${autoRefresh ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            自動更新 {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
        {lastUpdatedAt && <p className="text-xs text-slate-500">最終更新: {formatDateTime(lastUpdatedAt)}</p>}
        {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{message}</p>}
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
      </div>

      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">直近ステータス</h3>
          {latest?.html_url && (
            <a href={latest.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800">
              GitHubで開く
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {latest ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass(latest)}`}>{statusLabel(latest)}</span>
              <span className="text-slate-500">#{latest.run_number} / 試行{latest.run_attempt}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <p className="text-slate-500">開始: <span className="text-slate-800">{formatDateTime(latest.run_started_at || latest.created_at)}</span></p>
              <p className="text-slate-500">更新: <span className="text-slate-800">{formatDateTime(latest.updated_at)}</span></p>
              <p className="text-slate-500">Event: <span className="text-slate-800">{latest.event || '-'}</span></p>
              <p className="text-slate-500">Branch: <span className="text-slate-800">{latest.head_branch || '-'}</span></p>
              <p className="text-slate-500 col-span-2">Actor: <span className="text-slate-800">{latest.actor?.login || '-'}</span></p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">データがありません。設定確認後に更新してください。</p>
        )}
      </div>

      <div className="glass-panel p-4">
        <h3 className="text-sm font-bold text-slate-800 mb-2">最近の実行ログ</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">表示できる実行ログがありません。</p>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 10).map((run) => (
              <div key={run.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusClass(run)}`}>{statusLabel(run)}</span>
                    <span className="text-slate-600 font-semibold truncate">#{run.run_number}</span>
                    <span className="text-slate-500 truncate">{run.name || workflowFile}</span>
                  </div>
                  <p className="text-slate-500">{formatDateTime(run.run_started_at || run.created_at)} / {run.event} / {run.head_branch || '-'}</p>
                </div>
                <a href={run.html_url} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 text-sky-700 hover:text-sky-800 font-semibold">
                  開く
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

