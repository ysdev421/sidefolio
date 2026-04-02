import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Plus, Trash2, X } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { RichDatePicker } from '@/components/RichDatePicker';
import {
  addKeikojiContract,
  deleteKeikojiContract,
  getUserKeikojiContracts,
  updateKeikojiContract,
} from '@/lib/firestore';
import type { KeikojiContract, KeikojiHoldDays } from '@/types';
import { KEIKOJI_HOLD_DAYS, KEIKOJI_HOLD_MONTHS } from '@/types';

interface KeikojiAppProps {
  userId: string;
}

const CARRIERS = ['ドコモ', 'au', 'SoftBank', '楽天モバイル', 'Y!mobile', 'UQmobile', 'その他'];

const EMPTY_FORM = {
  phoneNumber: '',
  carrier: 'ドコモ',
  contractedAt: new Date().toISOString().split('T')[0],
  holdDays: 91 as KeikojiHoldDays,
  adminFee: '3300',
  monthlyFee: '',
  deviceName: '',
  deviceCost: '0',
  salePrice: '',
  cashback: '',
  contractStore: '',
  voicePlan: '',
  dataPlan: '',
  status: 'active' as 'active' | 'terminated',
  memo: '',
};

function calcTerminationDate(contractedAt: string, holdDays: number): string {
  if (!contractedAt) return '';
  const d = new Date(contractedAt);
  d.setDate(d.getDate() + holdDays);
  return d.toISOString().split('T')[0];
}

function calcExpense(adminFee: number, monthlyFee: number, holdDays: KeikojiHoldDays, deviceCost: number): number {
  return adminFee + monthlyFee * KEIKOJI_HOLD_MONTHS[holdDays] + deviceCost;
}

function calcProfit(salePrice: number, cashback: number, expense: number): number {
  return salePrice + cashback - expense;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function KeikojiApp({ userId }: KeikojiAppProps) {
  const [contracts, setContracts] = useState<KeikojiContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<KeikojiContract | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setContracts(await getUserKeikojiContracts(userId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [userId]);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setShowForm(true);
  };

  const openEdit = (c: KeikojiContract) => {
    setEditTarget(c);
    setForm({
      phoneNumber: c.phoneNumber,
      carrier: c.carrier,
      contractedAt: c.contractedAt,
      holdDays: c.holdDays,
      adminFee: String(c.adminFee),
      monthlyFee: String(c.monthlyFee),
      deviceName: c.deviceName,
      deviceCost: String(c.deviceCost),
      salePrice: c.salePrice !== undefined ? String(c.salePrice) : '',
      cashback: c.cashback !== undefined ? String(c.cashback) : '',
      contractStore: c.contractStore ?? '',
      voicePlan: c.voicePlan ?? '',
      dataPlan: c.dataPlan ?? '',
      status: c.status,
      memo: c.memo ?? '',
    });
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phoneNumber.trim()) { setError('携帯番号を入力してください'); return; }
    if (!form.monthlyFee.trim()) { setError('月額料金を入力してください'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        phoneNumber: form.phoneNumber.trim(),
        carrier: form.carrier,
        contractedAt: form.contractedAt,
        holdDays: form.holdDays,
        adminFee: parseFloat(form.adminFee) || 0,
        monthlyFee: parseFloat(form.monthlyFee) || 0,
        deviceName: form.deviceName.trim(),
        deviceCost: parseFloat(form.deviceCost) || 0,
        ...(form.salePrice !== '' ? { salePrice: parseFloat(form.salePrice) } : {}),
        ...(form.cashback !== '' ? { cashback: parseFloat(form.cashback) } : {}),
        ...(form.contractStore.trim() ? { contractStore: form.contractStore.trim() } : {}),
        ...(form.voicePlan.trim() ? { voicePlan: form.voicePlan.trim() } : {}),
        ...(form.dataPlan.trim() ? { dataPlan: form.dataPlan.trim() } : {}),
        status: form.status,
        ...(form.memo.trim() ? { memo: form.memo.trim() } : {}),
      };
      if (editTarget) {
        await updateKeikojiContract(editTarget.id, payload);
      } else {
        await addKeikojiContract(userId, payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteKeikojiContract(id);
    setDeleteConfirmId(null);
    await load();
  };

  const activeContracts = contracts.filter((c) => c.status === 'active');
  const terminatedContracts = contracts.filter((c) => c.status === 'terminated');

  const totalProfit = contracts.reduce((sum, c) => {
    const exp = calcExpense(c.adminFee, c.monthlyFee, c.holdDays, c.deviceCost);
    return sum + calcProfit(c.salePrice ?? 0, c.cashback ?? 0, exp);
  }, 0);

  const renderContract = (c: KeikojiContract) => {
    const termDate = calcTerminationDate(c.contractedAt, c.holdDays);
    const days = daysUntil(termDate);
    const exp = calcExpense(c.adminFee, c.monthlyFee, c.holdDays, c.deviceCost);
    const profit = calcProfit(c.salePrice ?? 0, c.cashback ?? 0, exp);
    const isExpanded = expandedId === c.id;

    let urgencyClass = 'text-slate-500';
    let urgencyLabel = `解約まで${days}日`;
    if (c.status === 'terminated') {
      urgencyLabel = '解約済み';
      urgencyClass = 'text-slate-400';
    } else if (days < 0) {
      urgencyLabel = `解約期限超過 ${Math.abs(days)}日`;
      urgencyClass = 'text-rose-600 font-bold';
    } else if (days <= 14) {
      urgencyClass = 'text-rose-500 font-semibold';
    } else if (days <= 30) {
      urgencyClass = 'text-amber-500 font-semibold';
    }

    return (
      <div key={c.id} className="glass-panel overflow-hidden">
        <div
          className="p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : c.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900">{c.carrier}</span>
              <span className="text-xs text-slate-500">{c.phoneNumber}</span>
              {c.status === 'active' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">運用中</span>
              )}
              {c.status === 'terminated' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">解約済</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span className="text-slate-500">契約: {c.contractedAt}</span>
              <span className={urgencyClass}>解約予定: {termDate}（{urgencyLabel}）</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              <span className="text-slate-600">経費: <span className="font-semibold text-rose-600">¥{exp.toLocaleString()}</span></span>
              {c.salePrice !== undefined && <span className="text-slate-600">売却: <span className="font-semibold">¥{c.salePrice.toLocaleString()}</span></span>}
              {c.cashback !== undefined && <span className="text-slate-600">CB: <span className="font-semibold text-emerald-600">¥{c.cashback.toLocaleString()}</span></span>}
              <span className="text-slate-600">利益: <span className={`font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>¥{profit.toLocaleString()}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition"><Edit2 className="w-4 h-4 text-slate-500" /></button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id); }} className="p-1.5 hover:bg-rose-50 rounded-lg transition"><Trash2 className="w-4 h-4 text-rose-400" /></button>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <div><span className="text-slate-400">維持期間</span><br />{c.holdDays}日（{KEIKOJI_HOLD_MONTHS[c.holdDays]}ヶ月）</div>
            <div><span className="text-slate-400">事務手数料</span><br />¥{c.adminFee.toLocaleString()}</div>
            <div><span className="text-slate-400">月額料金</span><br />¥{c.monthlyFee.toLocaleString()}</div>
            <div><span className="text-slate-400">端末名</span><br />{c.deviceName || '—'}</div>
            <div><span className="text-slate-400">端末代金</span><br />¥{c.deviceCost.toLocaleString()}</div>
            <div><span className="text-slate-400">契約店舗</span><br />{c.contractStore || '—'}</div>
            <div><span className="text-slate-400">通話</span><br />{c.voicePlan || '—'}</div>
            <div><span className="text-slate-400">通信</span><br />{c.dataPlan || '—'}</div>
            {c.memo && <div className="col-span-2 sm:col-span-3"><span className="text-slate-400">メモ</span><br />{c.memo}</div>}
          </div>
        )}

        {deleteConfirmId === c.id && (
          <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-rose-700">この回線を削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white">キャンセル</button>
              <button onClick={() => handleDelete(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white font-semibold">削除</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-20">
      {/* サマリー */}
      <div className="glass-panel p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">合計利益（全回線）</p>
          <p className={`text-2xl font-black ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ¥{totalProfit.toLocaleString()}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <p>運用中: <span className="font-semibold text-slate-700">{activeContracts.length}回線</span></p>
          <p>解約済: <span className="font-semibold text-slate-700">{terminatedContracts.length}回線</span></p>
        </div>
      </div>

      <button
        onClick={openAdd}
        className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-md hover:opacity-90 active:scale-95 transition"
      >
        <Plus className="w-4 h-4" />
        回線を追加
      </button>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <>
          {activeContracts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 px-1">運用中</p>
              {activeContracts.map(renderContract)}
            </div>
          )}
          {terminatedContracts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 px-1">解約済み</p>
              {terminatedContracts.map(renderContract)}
            </div>
          )}
          {contracts.length === 0 && (
            <div className="glass-panel text-center py-12">
              <p className="text-slate-500 text-sm">回線が登録されていません</p>
            </div>
          )}
        </>
      )}

      {/* 追加/編集フォーム */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="min-h-full w-full flex items-end pt-12">
            <form
              className="w-full bg-white rounded-t-2xl p-6"
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSubmit}
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-slate-900">{editTarget ? '回線を編集' : '回線を追加'}</h2>
                <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-500" /></button>
              </div>

              {error && <p className="mb-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="space-y-4">
                {/* 携帯番号 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">携帯番号 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例: 090-xxxx-1234"
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </div>

                {/* キャリア */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">キャリア</label>
                  <select
                    className="input-field"
                    value={form.carrier}
                    onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
                  >
                    {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* 契約日 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">契約日</label>
                  <RichDatePicker
                    value={form.contractedAt}
                    onChange={(v) => setForm((f) => ({ ...f, contractedAt: v }))}
                  />
                </div>

                {/* 維持期間 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">維持期間</label>
                  <div className="flex flex-wrap gap-2">
                    {KEIKOJI_HOLD_DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, holdDays: d }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${form.holdDays === d ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {d}日（{KEIKOJI_HOLD_MONTHS[d]}ヶ月）
                      </button>
                    ))}
                  </div>
                  {form.contractedAt && (
                    <p className="mt-1.5 text-xs text-violet-600 font-semibold">
                      解約予定日: {calcTerminationDate(form.contractedAt, form.holdDays)}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 事務手数料 */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">事務手数料</label>
                    <NumericInput integer value={form.adminFee} onChange={(e) => setForm((f) => ({ ...f, adminFee: e.target.value }))} className="input-field" />
                  </div>
                  {/* 月額料金 */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">月額料金 <span className="text-rose-500">*</span></label>
                    <NumericInput integer value={form.monthlyFee} onChange={(e) => setForm((f) => ({ ...f, monthlyFee: e.target.value }))} className="input-field" placeholder="例: 1000" />
                  </div>
                </div>

                {/* 端末 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">購入端末名</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例: iPhone 15"
                    value={form.deviceName}
                    onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">端末代金</label>
                  <NumericInput integer value={form.deviceCost} onChange={(e) => setForm((f) => ({ ...f, deviceCost: e.target.value }))} className="input-field" />
                </div>

                {/* 経費総額（自動計算・表示のみ） */}
                {form.monthlyFee && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm">
                    <span className="text-slate-500">経費総額（自動計算）: </span>
                    <span className="font-bold text-rose-600">
                      ¥{calcExpense(parseFloat(form.adminFee) || 0, parseFloat(form.monthlyFee) || 0, form.holdDays, parseFloat(form.deviceCost) || 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">= 事務{form.adminFee || 0} + 月額{form.monthlyFee}×{KEIKOJI_HOLD_MONTHS[form.holdDays]}ヶ月 + 端末{form.deviceCost || 0}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* 売却額 */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">売却額</label>
                    <NumericInput integer value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} className="input-field" placeholder="未売却なら空欄" />
                  </div>
                  {/* CB */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">CB（キャッシュバック）</label>
                    <NumericInput integer value={form.cashback} onChange={(e) => setForm((f) => ({ ...f, cashback: e.target.value }))} className="input-field" placeholder="例: 20000" />
                  </div>
                </div>

                {/* 利益（自動計算・表示のみ） */}
                {(form.salePrice || form.cashback) && form.monthlyFee && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm">
                    <span className="text-slate-500">利益（自動計算）: </span>
                    <span className={`font-bold ${calcProfit(parseFloat(form.salePrice) || 0, parseFloat(form.cashback) || 0, calcExpense(parseFloat(form.adminFee) || 0, parseFloat(form.monthlyFee) || 0, form.holdDays, parseFloat(form.deviceCost) || 0)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      ¥{calcProfit(parseFloat(form.salePrice) || 0, parseFloat(form.cashback) || 0, calcExpense(parseFloat(form.adminFee) || 0, parseFloat(form.monthlyFee) || 0, form.holdDays, parseFloat(form.deviceCost) || 0)).toLocaleString()}
                    </span>
                  </div>
                )}

                {/* 契約店舗・通話・通信 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">契約店舗</label>
                  <input type="text" className="input-field" placeholder="例: ドコモショップ渋谷" value={form.contractStore} onChange={(e) => setForm((f) => ({ ...f, contractStore: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">通話</label>
                    <input type="text" className="input-field" placeholder="例: かけ放題" value={form.voicePlan} onChange={(e) => setForm((f) => ({ ...f, voicePlan: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">通信</label>
                    <input type="text" className="input-field" placeholder="例: 3GB" value={form.dataPlan} onChange={(e) => setForm((f) => ({ ...f, dataPlan: e.target.value }))} />
                  </div>
                </div>

                {/* ステータス */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">ステータス</label>
                  <div className="flex gap-2">
                    {(['active', 'terminated'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, status: s }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${form.status === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {s === 'active' ? '運用中' : '解約済み'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* メモ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">メモ</label>
                  <textarea className="input-field resize-none" rows={2} value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-6 w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold py-3 rounded-xl shadow-md hover:opacity-90 active:scale-95 transition disabled:opacity-50"
              >
                {saving ? '保存中...' : (editTarget ? '更新する' : '登録する')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
