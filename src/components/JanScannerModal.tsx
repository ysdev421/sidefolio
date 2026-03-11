import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, X } from 'lucide-react';

interface JanScannerModalProps {
  onClose: () => void;
  onDetected: (code: string) => void;
}

const normalizeJanCode = (value: string) => value.replace(/\D/g, '').trim();

export function JanScannerModal({ onClose, onDetected }: JanScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let closed = false;

    const start = async () => {
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
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        controls = await reader.decodeFromConstraints(constraints, videoRef.current!, (result, err) => {
          if (closed) return;
          if (result) {
            const normalized = normalizeJanCode(result.getText());
            if (!normalized) return;
            closed = true;
            controls?.stop();
            onDetected(normalized);
            return;
          }

          if (err && (err as Error).name !== 'NotFoundException') {
            setError('Scan failed. Please input JAN manually.');
          }
        });
      } catch {
        setError('Camera is not available. Please input JAN manually.');
      }
    };

    start();

    return () => {
      closed = true;
      controls?.stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 inline-flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-600" />
            JAN Scanner
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <video ref={videoRef} className="w-full aspect-video rounded-xl bg-slate-900" muted playsInline />

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <p className="text-xs text-slate-500">Align barcode in frame to fill JAN automatically.</p>
      </div>
    </div>
  );
}
