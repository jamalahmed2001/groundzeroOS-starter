'use client';

import { useEffect, useRef, useState } from 'react';

export type GestureType = 'none' | 'palm' | 'point' | 'pinch' | 'peace' | 'fist' | 'gun';

export interface HandGestureState {
  detected: boolean;
  palmX: number;     // 0–1 normalised (raw camera coords, not mirrored)
  palmY: number;     // 0–1 normalised
  pinchDist: number; // 0–1 normalised (thumb-tip to index-tip)
  indexX: number;    // index fingertip 0–1
  indexY: number;    // index fingertip 0–1
  gesture: GestureType;
}

// Classify gesture from 21 MediaPipe landmarks
function classifyGesture(lms: { x: number; y: number; z: number }[]): GestureType {
  if (lms.length < 21) return 'none';
  // Finger extended: tip y < pip y (lower y = higher in image = finger pointing up)
  // Small threshold reduces flicker
  const indexExt  = lms[8].y  < lms[6].y  - 0.02;
  const middleExt = lms[12].y < lms[10].y - 0.02;
  const ringExt   = lms[16].y < lms[14].y - 0.02;
  const pinkyExt  = lms[20].y < lms[18].y - 0.02;
  // Pinch: thumb tip close to index tip
  const pinchDist  = Math.hypot(lms[4].x - lms[8].x, lms[4].y - lms[8].y);
  const isPinch    = pinchDist < 0.13;
  // Thumb spread sideways: tip clearly separated from index MCP horizontally
  const thumbSpread = Math.abs(lms[4].x - lms[5].x) > 0.10;
  // Fist: all four fingers curled
  if (!indexExt && !middleExt && !ringExt && !pinkyExt) return 'fist';
  // Pinch: thumb+index close overrides other states
  if (isPinch) return 'pinch';
  // Gun / L-shape: index up + thumb out sideways + others curled
  if (indexExt && thumbSpread && !middleExt && !ringExt && !pinkyExt) return 'gun';
  // Point: only index up (thumb not spread)
  if (indexExt && !middleExt && !ringExt && !pinkyExt) return 'point';
  // Peace/V: index + middle
  if (indexExt && middleExt && !ringExt && !pinkyExt) return 'peace';
  // Everything else = open palm = pan
  return 'palm';
}

// MediaPipe hand skeleton connections (21-landmark model)
const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// Serve WASM locally from public/ to avoid CDN version mismatches
const WASM_PATH  = '/mediapipe/wasm';
const MODEL_URL  = '/mediapipe/hand_landmarker.task';

interface Props {
  active: boolean;
  onGesture: (state: HandGestureState) => void;
  onReady?: () => void;
}

type Status = 'loading' | 'ready' | 'error' | 'no-camera';

export default function HandTracker({ active, onGesture, onReady }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const skeletonRef = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const cleanupRef  = useRef<(() => void) | null>(null);
  const [status, setStatus]   = useState<Status>('loading');
  const [loadStep, setLoadStep] = useState('initializing…');
  const [errorMsg, setErrorMsg] = useState('');

  // Keep latest callbacks in refs so the detect loop never captures stale closures
  const onGestureRef = useRef(onGesture);
  const onReadyRef   = useRef(onReady);
  useEffect(() => { onGestureRef.current = onGesture; }, [onGesture]);
  useEffect(() => { onReadyRef.current   = onReady;   }, [onReady]);

  useEffect(() => {
    if (!active) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setStatus('loading');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setErrorMsg('');

    (async () => {
      try {
        // Dynamic import avoids SSR issues
        setLoadStep('loading module…');
        const mp = await import('@mediapipe/tasks-vision');
        const { HandLandmarker, FilesetResolver } = mp;
        if (cancelled) return;

        setLoadStep('loading wasm…');
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) return;

        // Try GPU first, fall back to CPU if it throws
        setLoadStep('loading model…');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let handLandmarker: any;
        try {
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        } catch {
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        }
        if (cancelled) { handLandmarker.close(); return; }

        setLoadStep('opening camera…');

        // Request webcam — check secure context and device availability first
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('no-camera');
          setErrorMsg('Requires HTTPS. Use https://192.168.1.248:3000 — accept the cert warning in your browser');
          handLandmarker.close();
          return;
        }

        let devices: MediaDeviceInfo[] = [];
        try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { /* ok */ }
        const hasCamera = devices.some(d => d.kind === 'videoinput');
        if (!hasCamera) {
          setStatus('no-camera');
          setErrorMsg('No camera found. Plug in a webcam to use hand tracking.');
          handLandmarker.close();
          return;
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (camErr) {
          const name = camErr instanceof Error ? camErr.name : '';
          const msg  = camErr instanceof Error ? camErr.message : String(camErr);
          const friendly = name === 'NotAllowedError'  ? 'Camera permission denied — allow it in the browser address bar'
                         : name === 'NotFoundError'    ? 'No camera device found'
                         : name === 'NotReadableError' ? 'Camera is in use by another app'
                         : msg.slice(0, 100);
          setStatus('no-camera');
          setErrorMsg(friendly);
          handLandmarker.close();
          return;
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); handLandmarker.close(); return; }

        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); handLandmarker.close(); return; }
        video.srcObject = stream;

        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = reject;
          video.play().catch(reject);
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); handLandmarker.close(); return; }

        setStatus('ready');
        onReadyRef.current?.();

        let lastTs = 0;

        const detect = () => {
          if (cancelled) return;
          rafRef.current = requestAnimationFrame(detect);
          if (video.readyState < 2) return;

          const now = performance.now();
          // Cap to ~30fps to avoid overwhelming the inference engine
          if (now - lastTs < 30) return;
          lastTs = now;

          let result: ReturnType<typeof handLandmarker.detectForVideo>;
          try {
            result = handLandmarker.detectForVideo(video, now);
          } catch {
            return; // silently skip bad frames
          }

          // Draw skeleton overlay
          const skeleton = skeletonRef.current;
          const sctx = skeleton?.getContext('2d');
          if (skeleton && sctx) {
            sctx.clearRect(0, 0, skeleton.width, skeleton.height);
            const lms = result.landmarks[0];
            if (lms) {
              const W = skeleton.width, H = skeleton.height;
              sctx.strokeStyle = 'rgba(0,220,180,0.65)';
              sctx.lineWidth = 1.5;
              for (const [a, b] of CONNECTIONS) {
                sctx.beginPath();
                sctx.moveTo(lms[a].x * W, lms[a].y * H);
                sctx.lineTo(lms[b].x * W, lms[b].y * H);
                sctx.stroke();
              }
              for (let i = 0; i < lms.length; i++) {
                const isTip = [4, 8, 12, 16, 20].includes(i);
                sctx.beginPath();
                sctx.arc(lms[i].x * W, lms[i].y * H, isTip ? 3.5 : 2, 0, Math.PI * 2);
                sctx.fillStyle = isTip ? 'rgba(0,220,180,1)' : 'rgba(255,255,255,0.55)';
                sctx.fill();
              }
            }
          }

          const lms = result.landmarks[0];
          if (lms) {
            const gesture  = classifyGesture(lms);
            const palmIdxs = [0, 5, 9, 13, 17];
            const palmX = palmIdxs.reduce((s, i) => s + lms[i].x, 0) / palmIdxs.length;
            const palmY = palmIdxs.reduce((s, i) => s + lms[i].y, 0) / palmIdxs.length;
            const ddx = lms[4].x - lms[8].x;
            const ddy = lms[4].y - lms[8].y;
            onGestureRef.current({
              detected: true,
              palmX, palmY,
              pinchDist: Math.sqrt(ddx * ddx + ddy * ddy),
              indexX: lms[8].x, indexY: lms[8].y,
              gesture,
            });
          } else {
            onGestureRef.current({
              detected: false,
              palmX: 0.5, palmY: 0.5, pinchDist: 0.3,
              indexX: 0.5, indexY: 0.5,
              gesture: 'none',
            });
          }
        };

        rafRef.current = requestAnimationFrame(detect);

        cleanupRef.current = () => {
          cancelled = true;
          cancelAnimationFrame(rafRef.current);
          stream.getTracks().forEach(t => t.stop());
          handLandmarker.close();
          if (videoRef.current) videoRef.current.srcObject = null;
        };
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('HandTracker init failed:', err);
          setStatus('error');
          setErrorMsg(msg.slice(0, 80));
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      width: 160, height: 120, borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${status === 'error' || status === 'no-camera' ? 'rgba(255,69,58,0.5)' : 'rgba(0,220,180,0.4)'}`,
      background: '#000',
      boxShadow: '0 0 24px rgba(0,220,180,0.12), 0 4px 16px rgba(0,0,0,0.5)',
    }}>
      <video ref={videoRef} muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
          opacity: status === 'ready' ? 1 : 0.3 }}
      />
      <canvas ref={skeletonRef} width={160} height={120}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }}
      />

      {/* Status overlay */}
      {status !== 'ready' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          {status === 'loading' && (
            <>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(0,220,180,0.3)', borderTopColor: 'rgba(0,220,180,0.9)', animation: 'spin 0.8s linear infinite' }}/>
              <span style={{ fontSize: 9, color: 'rgba(0,220,180,0.7)', fontFamily: 'monospace', textAlign: 'center', padding: '0 6px' }}>{loadStep}</span>
            </>
          )}
          {(status === 'error' || status === 'no-camera') && (
            <>
              <span style={{ fontSize: 10, color: 'rgba(255,69,58,0.9)' }}>
                {status === 'no-camera' ? 'no camera' : 'error'}
              </span>
              {errorMsg && (
                <span style={{ fontSize: 8, color: 'rgba(255,69,58,0.6)', textAlign: 'center', padding: '0 8px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {errorMsg}
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 4, left: 0, right: 0,
        textAlign: 'center', fontSize: 9,
        color: status === 'ready' ? 'rgba(0,220,180,0.75)' : 'rgba(139,148,158,0.5)',
        fontFamily: 'monospace', letterSpacing: '0.06em', pointerEvents: 'none',
      }}>
        {status === 'ready' ? 'HAND TRACKING' : status.toUpperCase()}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
