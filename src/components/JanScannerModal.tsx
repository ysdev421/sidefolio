import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, Flashlight, FlashlightOff, RotateCcw, X } from 'lucide-react';

interface JanScannerModalProps {
  onClose: () => void;
  onDetected: (code: string) => void;
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();

export function JanScannerModal({ onClose, onDetected }: JanScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    let closed = false;

    const start = async () => {
      stopScanner();
      setError('');
      setScanning(true);
      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        const videoConstraints: any = {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: 'continuous',
          advanced: [{ focusMode: 'continuous' }, { zoom: 2 }],
        };

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: videoConstraints,
        };

        controlsRef.current = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result, err) => {
            if (closed) return;
            if (result) {
              const normalized = normalizeJanCode(result.getText());
              if (!normalized) return;
              closed = true;
              stopScanner();
              onDetected(normalized);
              return;
            }

            if (err && (err as Error).name !== 'NotFoundException') {
              setError('読み取りに失敗しました。コード枠にJANを収めて再試行してください');
            }
          }
        );
      } catch {
        setError('カメラを開始できませんでした。手入力に切り替えてください');
        setScanning(false);
      }
    };

    start();

    return () => {
      closed = true;
      stopScanner();
    };
  }, [attempt, onDetected, stopScanner]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80">
      <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover scale-[1.15]" muted playsInline />

        <div className="absolute inset-x-0 top-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white inline-flex items-center gap-2">
              <Camera className="w-5 h-5 text-cyan-300" />
              JAN読み取り
            </h3>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const stream = videoRef.current?.srcObject as MediaStream | null;
                  const track = stream?.getVideoTracks?.()[0];
                  if (!track) return;
                  try {
                    await (track as any).applyConstraints({ advanced: [{ torch: !torchEnabled }] });
                    setTorchEnabled((v) => !v);
                  } catch {
                    setError('この端末ではライト制御に対応していません');
                  }
                }}
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition"
                title="ライト切替"
              >
                {torchEnabled ? <Flashlight className="w-4 h-4 text-amber-200" /> : <FlashlightOff className="w-4 h-4 text-white" />}
              </button>
              <button onClick={onClose} className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none flex items-center justify-center px-0">
          <div className="w-full max-w-none h-56 border-2 border-cyan-300/90 rounded-none sm:rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-cyan-200/70" />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent space-y-2">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <p className="text-xs text-slate-200">枠いっぱいにバーコードを合わせてください。ピントが合わない場合は再試行してください。</p>
          <p className="text-[11px] text-slate-300">iPhone Chrome: 明るい場所で、JANを水平に固定すると読み取り精度が上がります。</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAttempt((v) => v + 1)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 text-white hover:bg-white/25 transition"
            >
              <RotateCcw className="w-4 h-4" />
              再試行
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 text-white hover:bg-white/25 transition"
            >
              手入力へ切替
            </button>
          </div>
          {!scanning && <p className="text-xs text-slate-300">カメラ再接続中...</p>}
        </div>
      </div>
    </div>
  );
}
