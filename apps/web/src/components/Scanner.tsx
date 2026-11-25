import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the decoded text of the first QR found. */
  onResult: (text: string) => void;
}

/** Camera scanner in a sheet. Falls back to a one-line message if the camera is denied. */
export function Scanner({ open, onClose, onResult }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    setFailed(false);
    const canvas = document.createElement('canvas');
    const tick = () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height);
          if (hit?.data) {
            stopped = true;
            onResult(hit.data);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setFailed(true));
    if (!navigator.mediaDevices) setFailed(true);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [open, onResult]);

  return (
    <Sheet open={open} title="Escanear código" onClose={onClose}>
      {failed ? (
        <p className="text-muted">No pudimos abrir la cámara. Escribe el código o el RUC.</p>
      ) : (
        <video
          ref={video}
          muted
          playsInline
          aria-label="Cámara"
          className="aspect-square w-full rounded-card bg-ink object-cover"
        />
      )}
      <Button variant="text" onClick={onClose}>
        Cerrar
      </Button>
    </Sheet>
  );
}
