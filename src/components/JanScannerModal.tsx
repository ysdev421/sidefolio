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
    <div className="fixed inset-0 z-[60] bg-black/70">
      <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white inline-flex items-center gap-2">
              <Camera className="w-5 h-5 text-cyan-300" />
              JAN Scanner
            </h3>
            <button onClick={onClose} className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/75 to-transparent">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <p className="text-xs text-slate-200">Align barcode in frame to fill JAN automatically.</p>
        </div>
      </div>
    </div>
  );
}
