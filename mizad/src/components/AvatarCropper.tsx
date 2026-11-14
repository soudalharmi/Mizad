'use client'
import { useEffect, useRef, useState } from 'react'
import { useLang } from './Lang'

const V = 280   // visible square on screen (px)
const OUT = 512 // saved image size (px)

// Instagram-style: drag to move, pinch or slider to zoom, circle mask; saves a square JPEG that is shown as a circle.
export default function AvatarCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const { t } = useLang()
  const [src] = useState(() => URL.createObjectURL(file))
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1), [pos, setPos] = useState({ x: 0, y: 0 }), [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>()), pinch = useRef<{ d: number; z: number } | null>(null), drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  useEffect(() => () => URL.revokeObjectURL(src), [src])

  const min = nat ? V / Math.min(nat.w, nat.h) : 1
  const s = min * zoom
  const clamp = (p: { x: number; y: number }, sc = s) => !nat ? p : ({ x: Math.min(0, Math.max(V - nat.w * sc, p.x)), y: Math.min(0, Math.max(V - nat.h * sc, p.y)) })
  const setZ = (z: number) => { // zoom around the centre of the frame
    if (!nat) return; const nz = Math.min(4, Math.max(1, z)), ns = min * nz
    const cx = (V / 2 - pos.x) / s, cy = (V / 2 - pos.y) / s
    setZoom(nz); setPos(clamp({ x: V / 2 - cx * ns, y: V / 2 - cy * ns }, ns))
  }
  const onLoad = () => { const i = imgRef.current!; const n = { w: i.naturalWidth, h: i.naturalHeight }; setNat(n); const sc = V / Math.min(n.w, n.h); setPos({ x: (V - n.w * sc) / 2, y: (V - n.h * sc) / 2 }) }

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag.current = null }
  }
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return; pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 2 && pinch.current) { const [a, b] = [...pts.current.values()]; setZ(pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d) }
    else if (drag.current) setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }))
  }
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); pinch.current = null; drag.current = pts.current.size === 1 ? (() => { const p = [...pts.current.values()][0]; return { x: p.x, y: p.y, px: pos.x, py: pos.y } })() : null }

  const save = () => {
    if (!nat || !imgRef.current) return; setBusy(true)
    const c = document.createElement('canvas'); c.width = c.height = OUT
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(imgRef.current, -pos.x / s, -pos.y / s, V / s, V / s, 0, 0, OUT, OUT)
    c.toBlob(b => { setBusy(false); b && onDone(b) }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000000cc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <h3 style={{ marginTop: 0 }}>{t('crop_title')}</h3>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ width: V, height: V, margin: '0 auto', position: 'relative', overflow: 'hidden', touchAction: 'none', background: '#111', cursor: 'grab', borderRadius: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt="" onLoad={onLoad} draggable={false}
            style={{ position: 'absolute', left: 0, top: 0, maxWidth: 'none', userSelect: 'none', width: nat ? nat.w * s : 'auto', height: nat ? nat.h * s : 'auto', transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 400px rgba(0,0,0,.6)', border: '2px solid #ffffffcc', pointerEvents: 'none' }} />
        </div>
        <p className="muted">{t('crop_hint')}</p>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZ(parseFloat(e.target.value))} style={{ padding: 0 }} />
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn light" style={{ flex: 1 }} onClick={onCancel}>{t('cancel')}</button>
          <button className="btn gold" style={{ flex: 1 }} disabled={!nat || busy} onClick={save}>{t('save')}</button>
        </div>
      </div>
    </div>
  )
}
