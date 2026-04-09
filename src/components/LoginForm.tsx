import { useState } from 'react';
import { Loader, Lock, LogIn, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface LoginProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { login, register, resetPassword, authLoading } = useAuth();

  const toJaError = (err: unknown) => {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('auth/invalid-credential')) return 'メールアドレスまたはパスワードが違います';
    if (message.includes('auth/user-not-found')) return 'ユーザーが見つかりません';
    if (message.includes('auth/wrong-password')) return 'パスワードが違います';
    if (message.includes('auth/too-many-requests')) return '試行回数が多すぎます。少し待ってからお試しください';
    if (message.includes('auth/invalid-email')) return 'メールアドレスの形式が正しくありません';
    if (message.includes('auth/email-already-in-use')) return 'このメールアドレスはすでに使われています';
    if (message.includes('auth/weak-password')) return 'パスワードは6文字以上にしてください';
    return message || '認証に失敗しました';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onSuccess?.();
    } catch (err) {
      setError(toJaError(err));
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setInfo('');

    if (!email) {
      setError('先にメールアドレスを入力してください');
      return;
    }

    try {
      await resetPassword(email);
      setInfo('パスワード再設定メールを送信しました');
    } catch (err) {
      setError(toJaError(err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-panel p-8 space-y-6 bg-gradient-to-br from-white/90 to-white/75">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-3 rounded-lg shadow-md shadow-teal-500/30">
                <LogIn className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">せどり利益管理</h1>
            <p className="text-gray-600">スマホで簡単に利益管理</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">メールアドレス</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
            {info && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{info}</div>}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-2.5 rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {authLoading && <Loader className="w-5 h-5 animate-spin" />}
              {isLogin ? 'ログイン' : '登録'}
            </button>
          </form>

          <div className="space-y-2 text-center">
            {isLogin && (
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-sm text-slate-600 hover:text-teal-700 transition"
              >
                パスワードを忘れた場合
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setInfo('');
              }}
              className="text-teal-600 hover:text-teal-700 font-medium text-sm transition"
            >
              {isLogin ? 'アカウントを持っていませんか？登録する' : 'ログインする'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
