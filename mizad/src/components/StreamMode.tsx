'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '@/lib/money'

const MOTIV: Record<string, string[]> = {
  ar: ['مزايدة جديدة! من يتحدّاه؟', 'السعر يرتفع… الفرصة بين يديك', 'الأقوى يفوز، زايد الآن', 'لحظة حاسمة… من التالي؟', 'هذا المسبحة تستحق الأفضل'],
  en: ['A new bid! Who will challenge it?', 'The price is rising… your chance is now', 'Boldest bid wins. Bid now', 'A decisive moment… who is next?', 'A piece worth the best bid'],
}

// Full-screen black stage for the live stream. Shows names only (never phone numbers) and never host-only prices.
export default function StreamMode({ items, bidders, vendorName, lang, t, onApprove, onReject, onExit }: any) {
  const item = useMemo(() => {
    const live = items.find((i: any) => i.status === 'live'); if (live) return live
    const paused = items.find((i: any) => i.status === 'paused'); if (paused) return paused
    const sold = items.filter((i: any) => i.status === 'sold').sort((a: any, b: any) => +new Date(b.closed_at || 0) - +new Date(a.closed_at || 0))[0]
    return sold || null
  }, [items])
  const hidden = item?.auction_type === 'custom' && !item?.revealed
  const sold = item?.status === 'sold'
  const hasLeader = !!item?.leader_bidder_id && !hidden
  const target = hasLeader ? item.current_price_fils : 0
  const sig = item ? `${item.id}:${item.leader_bidder_id}:${item.current_price_fils}:${item.bid_count}` : 'none'

  const [disp, setDisp] = useState(target), [flash, setFlash] = useState(0), [line, setLine] = useState(0)
  const prevAmt = useRef(target), prevItem = useRef<string | undefined>(item?.id), prevSig = useRef(sig), first = useRef(true)

  useEffect(() => {
    const sameItem = prevItem.current === item?.id; prevItem.current = item?.id
    const from = prevAmt.current, to = target; prevAmt.current = to
    if (!sameItem || from === to) { setDisp(to); return }
    const t0 = performance.now(); let raf = 0
    const step = (n: number) => { const p = Math.min(1, (n - t0) / 900), e = 1 - Math.pow(1 - p, 3); setDisp(Math.round(from + (to - from) * e)); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [target, item?.id])

  useEffect(() => {
    if (first.current) { first.current = false; prevSig.current = sig; return }
    if (sig !== prevSig.current && hasLeader && !sold) { setFlash(f => f + 1); setLine(l => (l + 1) % MOTIV[lang].length) }
    prevSig.current = sig
  }, [sig])

  useEffect(() => { // keep the screen awake and go full screen when supported
    let lock: any
    try { document.documentElement.requestFullscreen?.() } catch {}
    ;(navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {})
    return () => { try { lock?.release() } catch {}; try { if (document.fullscreenElement) document.exitFullscreen() } catch {} }
  }, [])

  const pending = bidders.filter((b: any) => b.status === 'pending')
  return (
    <div className="stage" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <style>{CSS}</style>
      <div className="glow" />
      {[...Array(14)].map((_, i) => <i key={i} className="spark" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.7) % 9}s`, animationDuration: `${9 + (i % 5) * 2}s` }} />)}
      <button className="exit" onClick={onExit}>{t('exit_stream')} ✕</button>
      <div className="top"><span className="dot" /> {vendorName}</div>

      <div className="center">
        {!item && <div className="wait">{t('stream_wait')}</div>}
        {item && (<>
          <div className="itemname">{item.name}{item.ref_code && <span className="code" dir="ltr">{item.ref_code}</span>}</div>
          {item.status === 'paused' && <div className="paused">{t('stream_paused')}</div>}
          {hidden ? <div className="custom">{t('stream_custom')}</div> : sold ? (<>
            <div className="congrats">{t('stream_congrats')} 🎉</div>
            <div className="winner" key={'s' + sig}>{item.leader_name}</div>
            <div className="amount sold">{fmt(item.current_price_fils, lang)}</div>
          </>) : (<>
            <div className="label">{t('stream_highest')}</div>
            <div className="amountwrap">
              {flash > 0 && <span className="ring" key={'r' + flash} />}
              <div className={'amount ' + (flash % 2 ? 'pulseA' : 'pulseB')} key={'a' + flash}>{hasLeader ? fmt(disp, lang) : '—'}</div>
            </div>
            <div className="rule" />
            <div className="label">{t('stream_leader')}</div>
            {hasLeader ? <div className="winner" key={'w' + item.leader_bidder_id + ':' + flash}>{item.leader_name}</div> : <div className="winner dim">{t('no_bids')}</div>}
            {flash > 0 && <div className="motiv" key={'m' + flash}>{MOTIV[lang][line]}</div>}
          </>)}
        </>)}
      </div>

      {pending.length > 0 && (
        <div className="reqs"><div className="reqhead">{t('stream_requests')} · {pending.length}</div>
          {pending.slice(0, 3).map((b: any) => (
            <div className="req" key={b.id}><span>{b.name}</span>
              <span className="acts"><button className="ok" onClick={() => onApprove(b.id)} aria-label={t('approve')}>✓</button><button className="no" onClick={() => onReject(b.id)} aria-label={t('reject')}>✕</button></span></div>))}
          {pending.length > 3 && <div className="more">+{pending.length - 3}</div>}
        </div>)}
    </div>
  )
}

const CSS = `
.stage{position:fixed;inset:0;z-index:100;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:'IBM Plex Sans Arabic',Arial,sans-serif;text-align:center}
.glow{position:absolute;inset:0;background:radial-gradient(60% 45% at 50% 48%,#a77b3c33 0%,#a77b3c0d 45%,transparent 72%);animation:breathe 6s ease-in-out infinite}
.spark{position:absolute;bottom:-10px;width:3px;height:3px;border-radius:50%;background:#d7b77f;opacity:0;animation:rise linear infinite}
.top{position:absolute;top:22px;inset-inline-start:26px;font-size:14px;letter-spacing:2px;color:#d7b77f;display:flex;align-items:center;gap:10px}
.dot{width:9px;height:9px;border-radius:50%;background:#d93025;box-shadow:0 0 0 0 #d9302580;animation:live 1.6s infinite}
.exit{position:absolute;top:16px;inset-inline-end:18px;background:transparent;color:#ffffff55;border:1px solid #ffffff22;border-radius:99px;padding:6px 14px;font-size:12px;z-index:3}
.exit:hover{color:#fff}
.center{position:relative;z-index:2;width:100%;padding:0 5vw}
.itemname{font-size:clamp(16px,2.6vw,26px);color:#cfc7b8;letter-spacing:1px;margin-bottom:clamp(14px,3vh,34px)}
.code{display:inline-block;margin-inline-start:12px;padding:3px 10px;border:1px solid #a77b3c88;border-radius:99px;font-size:.6em;color:#d7b77f;letter-spacing:2px}
.label{font-size:clamp(12px,1.8vw,18px);letter-spacing:4px;color:#8f8a7e;text-transform:uppercase}
.amountwrap{position:relative;display:inline-block;margin:clamp(6px,1.5vh,16px) 0}
.amount{font-size:clamp(54px,17vw,200px);font-weight:700;line-height:1.05;letter-spacing:-2px;background:linear-gradient(180deg,#f6e3b8 0%,#d7b77f 45%,#a77b3c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.amount.sold{margin-top:10px}
.pulseA{animation:pop .9s cubic-bezier(.2,.9,.2,1)}.pulseB{animation:popb .9s cubic-bezier(.2,.9,.2,1)}
.ring{position:absolute;left:50%;top:50%;width:30%;aspect-ratio:1;border:2px solid #d7b77f;border-radius:50%;transform:translate(-50%,-50%) scale(.4);opacity:0;animation:ring 1.4s ease-out}
.rule{width:min(260px,40vw);height:1px;margin:clamp(14px,3vh,30px) auto;background:linear-gradient(90deg,transparent,#a77b3c,transparent)}
.winner{margin-top:8px;font-size:clamp(30px,8.5vw,96px);font-weight:600;color:#fff;animation:slide .9s cubic-bezier(.2,.9,.2,1) both;text-shadow:0 0 40px #a77b3c55}
.winner.dim{color:#5c584f;font-size:clamp(20px,4vw,40px);animation:none}
.motiv{margin-top:clamp(14px,3vh,30px);font-size:clamp(14px,2.6vw,26px);color:#d7b77f;animation:fade 3.2s ease both}
.congrats{font-size:clamp(26px,7vw,70px);color:#d7b77f;font-weight:600;animation:slide 1s both}
.custom{font-size:clamp(28px,7vw,72px);color:#d7b77f;font-weight:600;animation:breathe 3s ease-in-out infinite}
.paused,.wait{color:#8f8a7e;font-size:clamp(16px,3vw,28px);margin:8px 0}
.reqs{position:absolute;bottom:18px;inset-inline-end:18px;z-index:3;width:min(300px,82vw);background:#0c0c0cd9;border:1px solid #ffffff1a;border-radius:16px;padding:12px;backdrop-filter:blur(8px);text-align:start}
.reqhead{font-size:11px;letter-spacing:2px;color:#8f8a7e;margin-bottom:8px}
.req{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 4px;border-top:1px solid #ffffff10;font-size:15px}
.acts{display:flex;gap:6px}
.acts button{width:34px;height:34px;border-radius:50%;border:0;font-size:16px;cursor:pointer}
.acts .ok{background:#26734d;color:#fff}.acts .no{background:#3a2220;color:#e38c82}
.more{font-size:12px;color:#8f8a7e;text-align:center;padding-top:6px}
@keyframes pop{0%{transform:scale(.86);filter:brightness(1.8)}60%{transform:scale(1.06)}100%{transform:scale(1);filter:none}}
@keyframes popb{0%{transform:scale(.86);filter:brightness(1.8)}60%{transform:scale(1.06)}100%{transform:scale(1);filter:none}}
@keyframes ring{0%{opacity:.9;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.2)}}
@keyframes slide{0%{opacity:0;transform:translateY(34px);filter:blur(8px)}100%{opacity:1;transform:none;filter:none}}
@keyframes fade{0%{opacity:0;transform:translateY(10px)}15%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@keyframes breathe{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes rise{0%{opacity:0;transform:translateY(0)}12%{opacity:.8}100%{opacity:0;transform:translateY(-105vh)}}
@keyframes live{0%{box-shadow:0 0 0 0 #d9302580}70%{box-shadow:0 0 0 10px #d9302500}100%{box-shadow:0 0 0 0 #d9302500}}
`
