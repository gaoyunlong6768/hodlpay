"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Keypair } from "@solana/web3.js";
import { PROTOCOL } from "@/lib/engine";
import { encodeSolanaPay, parseSolanaPay } from "@/lib/solanapay";
import { MERCHANTS } from "@/lib/useOnchain";

export default function ScanQr() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(
    (url: string) => {
      try {
        parseSolanaPay(url);
        router.push(`/pay?${new URLSearchParams({ sp: url.trim() }).toString()}`);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [router],
  );

  const decode = useCallback((source: CanvasImageSource, w: number, h: number) => {
    const c = canvas.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx || !w || !h) return null;
    c.width = w;
    c.height = h;
    ctx.drawImage(source, 0, 0, w, h);
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
  }, []);

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const v = video.current;
      const found = v && v.readyState >= 2 ? decode(v, v.videoWidth, v.videoHeight) : null;
      if (found?.toLowerCase().startsWith("solana:") && go(found)) return;
      frame = requestAnimationFrame(tick);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        video.current.play().catch(() => {});
        tick();
      })
      .catch(() => {
        setError("No camera access. Upload a screenshot of the code or paste its link instead.");
        setCamera(false);
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, decode, go]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const found = decode(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(img.src);
      if (found) go(found);
      else setError("No QR code found in that image.");
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-24">
      <p className="num mb-3 text-xs uppercase tracking-[0.25em] text-ink-soft">Pay any Solana Pay merchant in 4</p>
      <h1 className="font-display text-5xl leading-[0.95]">Scan the code at the counter.</h1>
      <p className="mt-4 text-ink-soft">
        Any Solana Pay USDC code works, even if the merchant has never heard of HodlPay. They get the full price the
        way they asked for it; you repay in 4 interest-free installments, plus a {PROTOCOL.merchantFeeBps / 100}% fee
        the merchant didn&apos;t sign up to pay.
      </p>

      <div className="receipt mt-6 p-5">
        {camera ? (
          <div className="relative aspect-square w-full overflow-hidden bg-ink">
            <video ref={video} muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-10 border-2 border-paper/70" />
          </div>
        ) : (
          <button
            onClick={() => {
              setError(null);
              setCamera(true);
            }}
            className="w-full bg-ink px-4 py-3.5 text-sm font-medium text-paper transition hover:bg-mint"
          >
            Scan with camera
          </button>
        )}
        {camera && (
          <button onClick={() => setCamera(false)} className="num mt-2 text-xs underline">
            stop camera
          </button>
        )}
        <canvas ref={canvas} className="hidden" />

        <label className="mt-3 block w-full cursor-pointer border border-ink px-4 py-3 text-center text-sm font-medium transition hover:bg-paper-2">
          Upload a screenshot of the code
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>

        <div className="dash mt-4 pt-4">
          <span className="num mb-1 block text-[11px] uppercase tracking-widest text-ink-soft">Or paste the link</span>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="solana:…?amount=…&spl-token=…"
              className="num min-w-0 flex-1 border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              onClick={() => {
                setError(null);
                go(text);
              }}
              disabled={!text.trim()}
              className="bg-ink px-4 text-sm font-medium text-paper disabled:bg-ink/30"
            >
              Pay
            </button>
          </div>
        </div>
        {error && <p className="num mt-3 text-[11px] text-vermilion">{error}</p>}
      </div>
      <p className="num mt-3 text-[11px] text-ink-soft">
        No code at hand?{" "}
        <button
          className="underline decoration-dotted"
          onClick={() =>
            go(
              encodeSolanaPay({
                recipient: MERCHANTS.Bluebottle,
                amount: 42.5,
                reference: [Keypair.generate().publicKey],
                label: "Bluebottle",
                message: "Counter order",
              }),
            )
          }
        >
          Try a sample code from Bluebottle →
        </button>{" "}
        It is the same plain USDC transfer request a point-of-sale app shows; the{" "}
        <Link href="/merchant" className="underline decoration-dotted">
          merchant page
        </Link>{" "}
        makes a live one and watches for the payment.
      </p>
    </div>
  );
}
