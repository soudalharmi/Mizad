'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase-browser'
import { aedToFils, fmt } from '@/lib/money'
import { compressImage } from '@/lib/image'
import PhoneInput from '@/components/PhoneInput'
import { CATS, DEFAULT_RULES, DEL, LIFE, csvBlob, deliverFile, elementToPdf, fin as finRaw, life as lifeRaw, previewCommission } from '@/lib/sales'

// My Sales: sales management and accounting for the host.
// Reads straight from the database (read-only for the browser); every change is sent to /api/vendor/sales.
type Props = { v: any; lang: 'ar' | 'en'; say: (m: string) => void; view: string; setView: (x: string) => void; sig: string; onChanged: () => void; goProducts: () => void; sessions: any }

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const dAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const digits = (x?: string) => String(x || '').replace(/\D/g, '')
const F0 = { range: 'all', from: '', to: '', method: '', cat: '', owner: '', buyer: '', pay: '', del: '', status: '', q: '' }
const R0 = { own: false, ophone: '', oname: '', name: '', cat: '', desc: '', asked: '', method: 'order', start: '', inc: '', date: '', notes: '', upfront: false }

export default function SalesManager({ v, lang, say, view, setView, sig, onChanged, goProducts, sessions }: Props) {
  const db = sb()
  const L = (a: string, e: string) => (lang === 'ar' ? a : e)
  const M = (f: number) => fmt(Number(f || 0), lang)
  const cur = v.currency || 'AED'
  const [prods, setProds] = useState<any[]>([]), [owners, setOwners] = useState<any[]>([]), [pays, setPays] = useState<any[]>([]), [rules, setRules] = useState<any>(DEFAULT_RULES), [rlog, setRlog] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false), [setup, setSetup] = useState(false), [sel, setSel] = useState<string | null>(null), [plog, setPlog] = useState<any[]>([])
  const [F, setF] = useState<any>(F0), [R, setR] = useState<any>({ ...R0, date: today() }), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [modal, setModal] = useState<any>(null), [mf, setMf] = useState<any>({}), [doc, setDoc] = useState<any>(null), [rf, setRf] = useState<any>(null), [calc, setCalc] = useState<any>({ m: 'order', p: '1500' }), [month, setMonth] = useState(today().slice(0, 7))
  const paper = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const q = (tb: string) => db.from(tb).select('*').eq('vendor_id', v.id)
    const [a, b, c, d, e] = await Promise.all([q('sale_products').order('created_at', { ascending: false }).limit(5000), q('sale_owners').order('name'), q('sale_payments').order('created_at').limit(20000), db.from('sales_rules').select('*').eq('vendor_id', v.id).maybeSingle(), q('sales_rules_log').order('created_at', { ascending: false }).limit(50)])
    if (a.error) { setSetup(true); setLoaded(true); return }
    setSetup(false); setProds(a.data || []); setOwners(b.data || []); setPays(c.data || []); setRules(d.data || DEFAULT_RULES); setRlog(e.data || []); setLoaded(true)
  }, [v.id])
  useEffect(() => { load() }, [load, sig])
  useEffect(() => { if (!sel) return setPlog([]); db.from('sale_log').select('*').eq('product_id', sel).order('id', { ascending: false }).limit(300).then((r: any) => setPlog(r.data || [])) }, [sel, prods, pays])
  useEffect(() => { setRf(null) }, [rules])

  const fin = (p: any) => finRaw(p, pays), life = (p: any) => lifeRaw(p, pays)
  const O = (id: string) => owners.find(o => o.id === id)
  const oname = (p: any) => (p.owner_id ? O(p.owner_id)?.name || '—' : L('ملك المزاد', 'Own product'))
  const methodName = (m: string) => (m === 'order' ? L('أمر بيع', 'Order Sale') : L('مزاد عادي', 'Regular Auction'))
  const payName = (m?: string) => (({ Cash: L('نقداً', 'Cash'), 'Bank transfer': L('تحويل بنكي', 'Bank transfer') } as any)[m || ''] || m || '—')
  const fdate = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const ftime = (d: string) => new Date(d).toLocaleString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const ERR: Record<string, [string, string]> = {
    FORBIDDEN: ['غير مسموح', 'Not allowed'], BAD_INPUT: ['تحقق من البيانات المدخلة', 'Check the details you entered'], BAD_PRICE: ['اكتب سعر البداية وقيمة زيادة لا تقل عن 2', 'Enter a start price and an increment of at least 2'],
    OWNER_REQUIRED: ['اكتب اسم صاحب القطعة ورقم جواله', 'Enter the owner’s name and mobile number'], NOT_SOLD: ['القطعة لم تُبَع بعد', 'The product is not sold yet'], BAD_AMOUNT: ['اكتب مبلغاً أكبر من صفر', 'Enter an amount above zero'],
    OVER_DUE: ['المبلغ أكبر من المتبقي', 'The amount is more than what remains'], BUYER_NOT_PAID: ['لا يمكن تسوية صاحب القطعة قبل تحصيل كامل المبلغ من المشتري', 'The owner cannot be settled before the buyer has paid in full'],
    REASON_REQUIRED: ['اكتب سبب العكس', 'Enter the reason'], ALREADY_REVERSED: ['هذا السند معكوس مسبقاً', 'This entry is already reversed'], OWNER_ALREADY_PAID: ['لا يمكن عكس التحصيل بعد دفع مستحقات صاحب القطعة. اعكس دفعة المالك أولاً', 'A collection cannot be reversed after the owner was paid. Reverse the owner payment first'],
    IN_AUCTION: ['القطعة في المزاد الآن. أغلق المزاد عليها أولاً', 'The product is in auction now. Close it first'], BAD_ACTION: ['هذا الإجراء غير متاح لهذه القطعة', 'This action is not available for this product'], NOT_FOUND: ['غير موجود', 'Not found'],
    SALES_SETUP: ['قاعدة البيانات تحتاج تحديثاً: شغّل ملف SQL رقم 023', 'The database needs an update: run SQL file 023'], GENERIC: ['تعذر تنفيذ الطلب', 'Could not complete the request'],
  }
  const E = (j: any) => { const x = ERR[j?.error] || ERR.GENERIC; return L(x[0], x[1]) + (j?.detail ? ' (' + j.detail + ')' : '') }
  const call = async (body: any) => { try { return await (await fetch('/api/vendor/sales', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() } catch { return { error: 'GENERIC' } } }
  const go = (x: string) => { setView(x); setErr(''); window.scrollTo(0, 0) }
  const open = (id: string) => { setSel(id); go('product') }
  const close = () => { setModal(null); setMf({}); setErr('') }
  const pillOf = (x: [string, string, string]) => <span className={'pill ' + x[2]}>{L(x[0], x[1])}</span>
  const lifePill = (p: any) => pillOf(LIFE[life(p)] || LIFE.listed)
  const payPill = (p: any) => { const f = fin(p); if (!f.sold) return <span className="pill">—</span>; return f.bDue === 0 ? <span className="pill green">{L('تم التحصيل', 'Collected')}</span> : f.bPaid > 0 ? <span className="pill gold">{L('تحصيل جزئي', 'Partly collected')}</span> : <span className="pill red">{L('لم يُحصَّل', 'Not collected')}</span> }
  const setPill = (p: any) => { const f = fin(p); if (!f.sold || !p.owner_id) return <span className="pill">—</span>; return f.oDue === 0 ? <span className="pill green">{L('تمت التسوية', 'Settled')}</span> : f.oPaid > 0 ? <span className="pill gold">{L('تسوية جزئية', 'Partly settled')}</span> : <span className="pill red">{L('لم تُسدَّد', 'Not settled')}</span> }
  const delPill = (p: any) => (p.stage !== 'sold' ? <span className="pill">—</span> : pillOf(DEL[p.del_status] || DEL.none))
  const whyText = (p: any) => (p.legacy ? L('بيع قديم قبل نظام العمولات', 'Older sale, before commission rules') : p.commission_kind === 'percent' ? `${Number(p.commission_pct)}% ${L('من سعر البيع', 'of the selling price')}` : p.commission_kind === 'regular' ? L('عمولة ثابتة للمزاد العادي', 'Fixed regular-auction commission') : p.commission_kind === 'fixed' ? L('عمولة ثابتة (السعر ضمن الحد)', 'Fixed commission (price within threshold)') : '—')
  const Thumb = ({ p, size = 40 }: any) => <span className="sm-thumb" style={{ width: size, height: size }}>{p.photos?.[0] ? <img src={p.photos[0]} alt="" /> : (p.name || '?').charAt(0)}</span>

  // ---------- filters ----------
  const pDate = (p: any) => p.sold_on || p.received_on
  const cats: string[] = Array.from(new Set<string>([...CATS.map(c => L(c[0], c[1])), ...prods.map(p => p.category).filter(Boolean)]))
  const filtered = () => {
    const t = today(), from = F.range === 'today' ? t : F.range === 'week' ? dAgo(6) : F.range === 'month' ? t.slice(0, 8) + '01' : F.range === 'custom' ? F.from : '', to = F.range === 'custom' ? F.to : ''
    const q = F.q.trim().toLowerCase(), qd = digits(F.q)
    return prods.filter(p => {
      const f = fin(p), o = O(p.owner_id), d = pDate(p)
      if (from && d < from) return false; if (to && d > to) return false
      if (F.method && p.method !== F.method) return false; if (F.cat && p.category !== F.cat) return false; if (F.owner && p.owner_id !== F.owner) return false
      if (F.buyer && !String(p.buyer_name || '').toLowerCase().includes(F.buyer.toLowerCase())) return false
      if (F.pay && (!f.sold || (F.pay === 'paid' ? f.bDue > 0 : F.pay === 'partial' ? !(f.bPaid > 0 && f.bDue > 0) : f.bPaid > 0))) return false
      if (F.del && (!f.sold || p.del_status !== F.del)) return false
      if (F.status && life(p) !== F.status) return false
      if (q) { const hay = [p.name, p.code, o?.name, p.buyer_name].join(' ').toLowerCase(); const ph = digits(o?.phone) + ' ' + digits(p.buyer_phone); if (!hay.includes(q) && !(qd.length > 2 && ph.includes(qd))) return false }
      return true
    }).sort((a, b) => String(pDate(b)).localeCompare(String(pDate(a))))
  }
  const totals = (list: any[]) => {
    const t = { rec: list.length, sold: 0, unsold: 0, gross: 0, listing: 0, comm: 0, owed: 0, oPaid: 0, oDue: 0, coll: 0, bDue: 0, feeOwed: 0, held: 0 }
    for (const p of list) { const f = fin(p); if (f.sold) t.sold++; if (p.stage === 'unsold') t.unsold++; t.gross += f.price; t.listing += f.listing; t.comm += f.comm; t.owed += f.net; t.oPaid += f.oPaid; t.oDue += f.oDue; t.coll += f.bPaid; t.bDue += f.bDue; t.feeOwed += f.feeOwed; t.held += Math.max(0, Math.min(f.bPaid, f.net) - f.oPaid) }
    return t
  }
  const Tile = ({ l, val, hl }: any) => <div className={'sm-tile' + (hl ? ' hl' : '')}><span>{l}</span><b>{val}</b></div>
  const Sel = ({ k, label, children }: any) => <div><label>{label}</label><select value={F[k]} onChange={e => setF({ ...F, [k]: e.target.value })}>{children}</select></div>
  const filterBar = (search: boolean) => <div className="card section">
    <div className="sm-seg">{[['all', L('الكل', 'All time')], ['today', L('اليوم', 'Today')], ['week', L('هذا الأسبوع', 'This week')], ['month', L('هذا الشهر', 'This month')], ['custom', L('فترة محددة', 'Custom range')]].map(([k, t]) => <button key={k} className={F.range === k ? 'on' : ''} onClick={() => setF({ ...F, range: k })}>{t}</button>)}</div>
    {F.range === 'custom' && <div className="sm-filters"><div><label>{L('من', 'From')}</label><input type="date" value={F.from} onChange={e => setF({ ...F, from: e.target.value })} /></div><div><label>{L('إلى', 'To')}</label><input type="date" value={F.to} onChange={e => setF({ ...F, to: e.target.value })} /></div></div>}
    <div className="sm-filters">
      {search && <div style={{ gridColumn: '1/-1' }}><label>{L('بحث: اسم القطعة، الرمز، صاحب القطعة، المشتري أو رقم الهاتف', 'Search: product, code, owner, buyer or phone')}</label><input value={F.q} onChange={e => setF({ ...F, q: e.target.value })} /></div>}
      <Sel k="method" label={L('طريقة البيع', 'Sale method')}><option value="">{L('الكل', 'All')}</option><option value="order">{methodName('order')}</option><option value="regular">{methodName('regular')}</option></Sel>
      <Sel k="cat" label={L('الفئة', 'Category')}><option value="">{L('الكل', 'All')}</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</Sel>
      <Sel k="owner" label={L('صاحب القطعة', 'Product owner')}><option value="">{L('الكل', 'All')}</option>{owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Sel>
      <div><label>{L('المشتري', 'Buyer')}</label><input value={F.buyer} onChange={e => setF({ ...F, buyer: e.target.value })} /></div>
      <Sel k="pay" label={L('تحصيل المشتري', 'Buyer payment')}><option value="">{L('الكل', 'All')}</option><option value="paid">{L('تم التحصيل', 'Collected')}</option><option value="partial">{L('جزئي', 'Partial')}</option><option value="unpaid">{L('لم يُحصَّل', 'Not collected')}</option></Sel>
      <Sel k="del" label={L('التوصيل', 'Delivery')}><option value="">{L('الكل', 'All')}</option>{Object.keys(DEL).map(k => <option key={k} value={k}>{L(DEL[k][0], DEL[k][1])}</option>)}</Sel>
      <Sel k="status" label={L('حالة القطعة', 'Product status')}><option value="">{L('الكل', 'All')}</option>{Object.keys(LIFE).map(k => <option key={k} value={k}>{L(LIFE[k][0], LIFE[k][1])}</option>)}</Sel>
    </div></div>

  // ---------- actions ----------
  const uploadAll = async () => { const urls: string[] = []; for (const f of files.slice(0, 6)) { const c = await compressImage(f); const p = `${v.id}/${crypto.randomUUID()}.${c.ext}`; const { error } = await db.storage.from('products').upload(p, c.blob, { contentType: c.type, cacheControl: '31536000' }); if (!error) urls.push(db.storage.from('products').getPublicUrl(p).data.publicUrl) } return urls }
  const receive = async (more: boolean) => {
    if (!R.name.trim()) return setErr(L('اكتب اسم القطعة', 'Enter the product name'))
    if (!R.own && (!R.oname.trim() || digits(R.ophone).length < 8)) return setErr(E({ error: 'OWNER_REQUIRED' }))
    if (!R.start || aedToFils(R.start) <= 0 || !R.inc || aedToFils(R.inc) < 200) return setErr(E({ error: 'BAD_PRICE' }))
    setBusy(true); setErr('')
    const photos = await uploadAll()
    const j = await call({ action: 'receive', data: { own: R.own, owner_name: R.oname.trim(), owner_phone: R.ophone, name: R.name.trim(), category: R.cat.trim(), description: R.desc, asked_fils: R.asked ? aedToFils(R.asked) : null, method: R.method, start_fils: aedToFils(R.start), inc_fils: aedToFils(R.inc), received_on: R.date || today(), notes: R.notes, upfront: R.upfront, photos } })
    setBusy(false); if (j.error) return setErr(E(j))
    await load(); onChanged(); setFiles([])
    say(L('تم الاستلام وأُضيفت القطعة إلى قائمة المنتجات · إيصال ', 'Received and added to the Products queue · receipt ') + j.result.rr_no)
    if (more) { setR({ ...R0, date: today(), own: R.own, ophone: R.ophone, oname: R.oname, method: R.method }); window.scrollTo(0, 0) }
    else { setR({ ...R0, date: today() }); setSel(j.result.id); go('product'); setDoc({ type: 'rr', id: j.result.id }) }
  }
  const act = async (productId: string, name: string, data: any = {}) => { setBusy(true); const j = await call({ action: 'act', productId, name, data }); setBusy(false); if (j.error) { modal ? setErr(E(j)) : say(E(j)); return false } await load(); onChanged(); close(); return true }
  const submitPay = async () => {
    const p = prods.find(x => x.id === modal.id); if (!p) return
    const amount = aedToFils(mf.amt || '0'); if (!(amount > 0)) return setErr(E({ error: 'BAD_AMOUNT' }))
    setBusy(true); setErr(''); let receipt: string | null = null
    if (mf.file) { const c = await compressImage(mf.file, 1600); const path = `${v.id}/${crypto.randomUUID()}.${c.ext}`; const { error } = await db.storage.from('receipts').upload(path, c.blob, { contentType: c.type }); if (!error) receipt = path }
    const j = await call({ action: 'pay', productId: p.id, kind: modal.kind, amount, method: mf.method || rules.pay_methods?.[0], date: mf.date || today(), ref: mf.ref, notes: mf.notes, receipt })
    setBusy(false); if (j.error) return setErr(E(j))
    await load(); close(); setDoc({ type: 'pay', id: p.id, no: j.result })
  }
  const submitReverse = async () => { if (!String(mf.reason || '').trim()) return setErr(E({ error: 'REASON_REQUIRED' })); setBusy(true); const j = await call({ action: 'reverse', paymentId: modal.pid, reason: mf.reason }); setBusy(false); if (j.error) return setErr(E(j)); await load(); close(); say(L('تم تسجيل القيد العكسي', 'Reversal recorded')) }
  const submitDelivery = async () => { setBusy(true); const j = await call({ action: 'delivery', productId: modal.id, data: { status: mf.status, address: mf.address, company: mf.company, tracking: mf.tracking, fee_fils: aedToFils(mf.fee || '0'), payer: mf.payer } }); setBusy(false); if (j.error) return setErr(E(j)); await load(); close(); say(L(DEL[mf.status][0], DEL[mf.status][1])) }
  const saveRules = async () => {
    const x = rf; if (!x) return; const pct = parseFloat(x.pct); if (!(pct >= 0 && pct <= 100)) return setErr(L('النسبة يجب أن تكون بين 0 و100', 'The percentage must be between 0 and 100'))
    setBusy(true); setErr('')
    const j = await call({ action: 'rules', data: { order_listing_fils: aedToFils(x.ol || '0'), order_fixed_fils: aedToFils(x.of || '0'), order_pct: pct, order_threshold_fils: aedToFils(x.ot || '0'), at_threshold: x.at, regular_listing_fils: aedToFils(x.rl || '0'), regular_commission_fils: aedToFils(x.rc || '0'), listing_when: x.lw, pay_methods: String(x.pm).split(/[,،]/).map((s: string) => s.trim()).filter(Boolean) } })
    setBusy(false); if (j.error) return setErr(E(j)); await load(); say(L('حُفظت القواعد وتُطبَّق على العمليات القادمة', 'Rules saved. They apply to future transactions'))
  }
  const showReceipt = async (path: string) => { const { data } = await db.storage.from('receipts').createSignedUrl(path, 600); data?.signedUrl ? setModal({ t: 'img', url: data.signedUrl }) : say(E({})) }
  const openPay = (p: any, kind: 'buyer' | 'owner') => { const f = fin(p); setMf({ amt: String((kind === 'buyer' ? f.bDue : f.oDue) / 100), method: rules.pay_methods?.[0] || 'Cash', date: today(), ref: '', notes: '', file: null }); setErr(''); setModal({ t: 'pay', id: p.id, kind }) }
  const openDel = (p: any) => { setMf({ status: p.del_status, address: p.del_address || '', company: p.del_company || '', tracking: p.del_tracking || '', fee: String(Number(p.del_fee_fils || 0) / 100), payer: p.del_payer }); setErr(''); setModal({ t: 'del', id: p.id }) }
  const exportCsv = async () => {
    const rows: any[][] = [[L('الرمز', 'Code'), L('القطعة', 'Product'), L('الفئة', 'Category'), L('صاحب القطعة', 'Owner'), L('هاتف المالك', 'Owner phone'), L('طريقة البيع', 'Method'), L('المطلوب', 'Requested'), L('سعر البيع', 'Sold for'), L('المشتري', 'Buyer'), L('هاتف المشتري', 'Buyer phone'), L('رسوم الإدراج', 'Listing fee'), L('العمولة', 'Commission'), L('صافي المالك', 'Owner net'), L('محصّل من المشتري', 'Collected'), L('مدفوع للمالك', 'Paid to owner'), L('الحالة', 'Status'), L('التوصيل', 'Delivery'), L('تاريخ الاستلام', 'Received'), L('تاريخ البيع', 'Sold')],
      ...filtered().map(p => { const f = fin(p), o = O(p.owner_id), s = LIFE[life(p)] || LIFE.listed; return [p.code, p.name, p.category || '', oname(p), o?.phone || '', methodName(p.method), p.asked_fils != null ? p.asked_fils / 100 : '', f.sold ? f.price / 100 : '', p.buyer_name || '', p.buyer_phone || '', f.listing / 100, f.comm / 100, f.sold ? f.net / 100 : '', f.bPaid / 100, f.oPaid / 100, L(s[0], s[1]), f.sold ? L(DEL[p.del_status][0], DEL[p.del_status][1]) : '', p.received_on, p.sold_on || ''] })]
    await deliverFile(csvBlob(rows), `mazadboss-sales-${today()}.csv`)
  }
  const sharePdf = async (name: string) => {
    if (!paper.current) return; setBusy(true)
    try { const blob = await elementToPdf(paper.current); await deliverFile(blob, name + '.pdf') } catch { say(L('تعذر إنشاء PDF، استخدم زر الطباعة ثم «حفظ كـ PDF»', 'Could not create the PDF. Use Print, then “Save as PDF”')) }
    setBusy(false)
  }

  // ---------- documents ----------
  const link = typeof location !== 'undefined' ? `${location.host}/${v.slug}` : ''
  const Top = ({ title, no, date }: any) => <div className="sm-ptop"><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{v.logo_url && <img src={v.logo_url} alt="" crossOrigin="anonymous" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />}<div><div style={{ fontWeight: 700, fontSize: 18 }}>{v.name}</div><div className="pm" dir="ltr">{link}{v.phone ? ' · ' + v.phone : ''}</div></div></div>
    <div style={{ textAlign: 'end' }}><div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div><div className="pm">{L('رقم', 'No.')} <b dir="ltr">{no}</b><br />{date}</div></div></div>
  const Foot = () => <div className="pm" style={{ marginTop: 18, borderTop: '1px solid #d9d5cb', paddingTop: 8, textAlign: 'center' }} dir="ltr">Mazad Boss · mazadboss.netlify.app</div>
  const ownerRows = (oid: string) => prods.filter(p => p.owner_id === oid)
  const docBody = (d: any): { name: string; node: any } | null => {
    const p = d.id ? prods.find(x => x.id === d.id) : null
    if (d.type === 'rr' && p) { const o = O(p.owner_id), r = p.rules_intake || rules; return { name: p.rr_no, node: <><Top title={L('إيصال استلام قطعة', 'Product Receiving Receipt')} no={p.rr_no} date={fdate(p.received_on)} />
      <table className="sm-ptable"><tbody>
        <tr><td className="pm">{L('القطعة', 'Product')}</td><td><b>{p.name}</b> · <span dir="ltr">{p.code}</span>{p.category ? ' · ' + p.category : ''}</td></tr>
        {p.description && <tr><td className="pm">{L('الوصف', 'Description')}</td><td>{p.description}</td></tr>}
        <tr><td className="pm">{L('صاحب القطعة', 'Original owner')}</td><td>{oname(p)} {o?.phone && <span dir="ltr">· {o.phone}</span>}</td></tr>
        {p.asked_fils != null && <tr><td className="pm">{L('المبلغ المطلوب', 'Requested price')}</td><td>{M(p.asked_fils)}</td></tr>}
        <tr><td className="pm">{L('طريقة البيع', 'Sale method')}</td><td>{methodName(p.method)}</td></tr>
        {p.owner_id && !p.legacy && <tr><td className="pm">{L('الرسوم والعمولة', 'Fees and commission')}</td><td>{p.method === 'order' ? <>{L('رسوم إدراج', 'Listing fee')} {M(p.listing_fee_fils)}{p.listing_upfront ? L(' (مدفوعة)', ' (paid)') : ''} · {L('عمولة', 'commission')} {M(r.order_fixed_fils)} {L('حتى', 'up to')} {M(r.order_threshold_fils)}، {L('ثم', 'then')} {Number(r.order_pct)}%</> : <>{Number(p.listing_fee_fils) > 0 && <>{L('رسوم إدراج', 'Listing fee')} {M(p.listing_fee_fils)} · </>}{L('عمولة ثابتة عند البيع', 'Fixed commission when sold')} {M(r.regular_commission_fils)}</>}</td></tr>}
        {p.notes && <tr><td className="pm">{L('ملاحظات', 'Notes')}</td><td>{p.notes}</td></tr>}</tbody></table>
      <p className="pm" style={{ marginTop: 14 }}>{L('تُحتسب العمولة حسب القواعد السارية وقت البيع.', 'Commission is calculated by the rules in force at the time of sale.')}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }} className="pm"><span>{L('توقيع المستلم', 'Received by')}: ____________</span><span>{L('توقيع صاحب القطعة', 'Owner signature')}: ____________</span></div><Foot /></> } }
    if (d.type === 'inv' && p) { const f = fin(p), o = O(p.owner_id); return { name: p.inv_no, node: <><Top title={L('فاتورة بيع', 'Sales Invoice')} no={p.inv_no} date={fdate(p.sold_on)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}><div><span className="pm">{L('المشتري', 'Buyer')}</span><br /><b>{p.buyer_name}</b> <span dir="ltr">{p.buyer_phone}</span></div><div><span className="pm">{L('صاحب القطعة', 'Original owner')}</span><br /><b>{oname(p)}</b> <span dir="ltr">{o?.phone}</span></div></div>
      <table className="sm-ptable"><thead><tr><th>{L('البيان', 'Item')}</th><th style={{ textAlign: 'end' }}>{L('المبلغ', 'Amount')}</th></tr></thead><tbody>
        <tr><td><b>{p.name}</b> · <span dir="ltr">{p.code}</span> · {methodName(p.method)}<br /><span className="pm">{L('سعر البيع النهائي', 'Final selling price')}</span></td><td style={{ textAlign: 'end' }}><b>{M(f.price)}</b></td></tr>
        {p.owner_id && <><tr><td>{L('العمولة', 'Commission')} <span className="pm">({whyText(p)})</span></td><td style={{ textAlign: 'end' }}>{M(f.comm)}</td></tr>
          <tr><td>{L('رسوم الإدراج', 'Listing fee')} {p.listing_upfront && <span className="pm">{L('(مدفوعة مسبقاً)', '(paid upfront)')}</span>}</td><td style={{ textAlign: 'end' }}>{M(f.listing)}</td></tr>
          <tr><td>{L('إجمالي رسوم المزاد', 'Total auction fees')}</td><td style={{ textAlign: 'end' }}>{M(f.comm + f.listing)}</td></tr>
          <tr className="tot"><td>{L('صافي المستحق لصاحب القطعة', 'Net payable to the original owner')}</td><td style={{ textAlign: 'end' }}>{M(f.net)}</td></tr></>}
      </tbody></table><Foot /></> } }
    if (d.type === 'pay' && p) { const x = pays.find(y => y.no === d.no && y.product_id === p.id); if (!x) return null; const b = x.kind === 'buyer', f = fin(p), o = O(p.owner_id)
      const upto = pays.filter(y => y.product_id === p.id && y.kind === x.kind && y.created_at <= x.created_at).reduce((n, y) => n + Number(y.amount_fils), 0), rem = Math.max(0, (b ? f.price : f.net) - upto)
      return { name: x.no, node: <><Top title={b ? L('سند قبض من المشتري', 'Buyer Payment Receipt') : L('سند دفع لصاحب القطعة', 'Owner Payment Voucher')} no={x.no} date={fdate(x.paid_on)} />
        <table className="sm-ptable"><tbody>
          <tr><td className="pm">{b ? L('استلمنا من', 'Received from') : L('دفعنا إلى', 'Paid to')}</td><td><b>{b ? p.buyer_name : oname(p)}</b> <span dir="ltr">{b ? p.buyer_phone : o?.phone}</span></td></tr>
          <tr><td className="pm">{L('عن القطعة', 'For product')}</td><td>{p.name} · <span dir="ltr">{p.code}</span></td></tr>
          <tr><td className="pm">{L('المبلغ', 'Amount')}</td><td><b style={{ fontSize: 17 }}>{M(x.amount_fils)}</b></td></tr>
          <tr><td className="pm">{L('طريقة الدفع', 'Payment method')}</td><td>{payName(x.method)}{x.ref ? <> · {L('مرجع', 'ref')} <span dir="ltr">{x.ref}</span></> : null}</td></tr>
          <tr><td className="pm">{L('الرصيد المتبقي بعد هذه الدفعة', 'Balance after this payment')}</td><td>{M(rem)}</td></tr>
          {x.notes && <tr><td className="pm">{L('ملاحظات', 'Notes')}</td><td>{x.notes}</td></tr>}</tbody></table><Foot /></> } }
    if (d.type === 'owner') { const o = O(d.owner); if (!o) return null; const ps = ownerRows(o.id), sold = ps.filter(q => q.stage === 'sold'), t = totals(ps)
      const hist = pays.filter(x => x.kind === 'owner' && ps.some(q => q.id === x.product_id))
      return { name: 'statement-' + o.name, node: <><Top title={L('كشف حساب صاحب القطعة', 'Original Owner Settlement Statement')} no={'OS-' + today().replace(/-/g, '')} date={fdate(today())} />
        <p><b>{o.name}</b> <span dir="ltr">{o.phone}</span></p>
        <table className="sm-ptable"><thead><tr><th>{L('القطعة', 'Product')}</th><th>{L('سعر البيع', 'Sold for')}</th><th>{L('العمولة', 'Commission')}</th><th>{L('الإدراج', 'Listing')}</th><th>{L('الصافي', 'Net')}</th><th>{L('دُفع', 'Paid')}</th></tr></thead><tbody>
          {sold.length === 0 && <tr><td colSpan={6} className="pm">{L('لا توجد قطع مباعة', 'No sold products')}</td></tr>}
          {sold.map(q => { const f = fin(q); return <tr key={q.id}><td>{q.name}<br /><span className="pm" dir="ltr">{q.code}</span></td><td>{M(f.price)}</td><td>{M(f.comm)}</td><td>{M(f.listingDeduct)}</td><td>{M(f.net)}</td><td>{M(f.oPaid)}</td></tr> })}
          <tr className="tot"><td>{L('الإجمالي', 'Total')}</td><td>{M(t.gross)}</td><td>{M(t.comm)}</td><td>{M(sold.reduce((n, q) => n + fin(q).listingDeduct, 0))}</td><td>{M(t.owed)}</td><td>{M(t.oPaid)}</td></tr></tbody></table>
        <p><b>{L('الرصيد المتبقي له', 'Remaining balance')}: {M(t.oDue)}</b>{t.feeOwed > 0 && <> · {L('رسوم إدراج مستحقة عليه لقطع لم تُبَع', 'listing fees owed for unsold products')}: {M(t.feeOwed)}</>}</p>
        {hist.length > 0 && <><div className="pm" style={{ marginTop: 10 }}>{L('سجل الدفعات', 'Payment history')}</div><table className="sm-ptable"><tbody>{hist.map(x => <tr key={x.id}><td dir="ltr">{x.no}</td><td>{fdate(x.paid_on)}</td><td>{payName(x.method)}{x.reversal_of ? ' · ' + L('عكس', 'reversal') : ''}</td><td style={{ textAlign: 'end' }}>{M(x.amount_fils)}</td></tr>)}</tbody></table></>}<Foot /></> } }
    if (d.type === 'month') { const m = d.month, inM = (x?: string) => !!x && x.startsWith(m); const s = { sales: 0, comm: 0, list: 0, coll: 0, paid: 0, n: 0, rec: 0 }
      for (const q of prods) { const f = fin(q); if (q.stage === 'sold' && inM(q.sold_on)) { s.sales += f.price; s.comm += f.comm; s.n++ } if (inM(q.received_on)) { s.rec++; if (q.listing_when === 'registration') s.list += f.listing } if (q.listing_when === 'sold' && q.stage === 'sold' && inM(q.sold_on)) s.list += f.listing }
      for (const x of pays) if (inM(x.paid_on)) { if (x.kind === 'buyer') s.coll += Number(x.amount_fils); else s.paid += Number(x.amount_fils) }
      const all = totals(prods); const row = (a: string, b: any, tot = false) => <tr className={tot ? 'tot' : ''}><td>{a}</td><td style={{ textAlign: 'end' }}>{b}</td></tr>
      return { name: 'monthly-' + m, node: <><Top title={L('الكشف المالي الشهري', 'Monthly Financial Statement')} no={'MS-' + m} date={m} />
        <table className="sm-ptable"><tbody>{row(L('القطع المستلمة', 'Products received'), s.rec)}{row(`${L('إجمالي المبيعات', 'Total sales')} (${s.n})`, M(s.sales))}{row(L('إجمالي العمولات', 'Total commissions'), M(s.comm))}{row(L('إجمالي رسوم الإدراج', 'Total listing fees'), M(s.list))}
          {row(L('صافي الإيراد (عمولات + رسوم إدراج)', 'Net revenue (commissions + listing fees)'), M(s.comm + s.list), true)}{row(L('المبالغ المحصّلة من المشترين', 'Collected from buyers'), M(s.coll))}{row(L('المبالغ المدفوعة لأصحاب القطع', 'Paid to original owners'), M(s.paid))}
          {row(L('أرصدة المشترين المتبقية (حتى اليوم)', 'Outstanding buyer balances (to date)'), M(all.bDue))}{row(L('تسويات الملّاك المتبقية (حتى اليوم)', 'Outstanding owner settlements (to date)'), M(all.oDue))}</tbody></table><Foot /></> } }
    if (d.type === 'report') { const list = filtered(), t = totals(list); return { name: 'sales-report-' + today(), node: <><Top title={L('تقرير المبيعات', 'Sales report')} no={'SR-' + today().replace(/-/g, '')} date={fdate(today())} />
      <table className="sm-ptable"><thead><tr><th>{L('القطعة', 'Product')}</th><th>{L('صاحبها', 'Owner')}</th><th>{L('سعر البيع', 'Sold for')}</th><th>{L('الرسوم', 'Fees')}</th><th>{L('صافي المالك', 'Owner net')}</th></tr></thead><tbody>
        {list.map(p => { const f = fin(p); return <tr key={p.id}><td>{p.name}<br /><span className="pm" dir="ltr">{p.code}</span></td><td>{oname(p)}</td><td>{f.sold ? M(f.price) : '—'}</td><td>{M(f.comm + f.listing)}</td><td>{f.sold ? M(f.net) : '—'}</td></tr> })}
        <tr className="tot"><td>{L('الإجمالي', 'Total')} ({list.length})</td><td></td><td>{M(t.gross)}</td><td>{M(t.comm + t.listing)}</td><td>{M(t.owed)}</td></tr></tbody></table><Foot /></> } }
    return null
  }

  // ---------- audit text ----------
  const logText = (x: any) => { const d = x.data || {}, m = (n: any) => M(Number(n || 0)); switch (x.action) {
    case 'received': return L(`استلام القطعة${d.owner ? ' من ' + d.owner : ''} · إيصال ${d.rr_no}${Number(d.listing_fee) > 0 ? ' · رسوم إدراج ' + m(d.listing_fee) + (d.upfront ? ' (مدفوعة)' : '') : ''}`, `Received${d.owner ? ' from ' + d.owner : ''} · receipt ${d.rr_no}${Number(d.listing_fee) > 0 ? ' · listing fee ' + m(d.listing_fee) + (d.upfront ? ' (paid)' : '') : ''}`)
    case 'listed': return L('أُضيفت إلى قائمة المنتجات · ' + methodName(d.method), 'Added to the Products queue · ' + methodName(d.method))
    case 'auction': return L('بدأ المزاد على القطعة', 'Auction started')
    case 'unsold': return L('أُغلق المزاد دون بيع', 'Auction closed without a sale')
    case 'sold': return L(`تم البيع إلى ${d.buyer} بمبلغ ${m(d.price)} · العمولة ${m(d.commission)} · فاتورة ${d.inv_no}`, `Sold to ${d.buyer} for ${m(d.price)} · commission ${m(d.commission)} · invoice ${d.inv_no}`)
    case 'confirmed': return L('تم تأكيد البيع', 'Sale confirmed')
    case 'buyer_paid': return L(`تحصيل ${m(d.amount)} من المشتري (${payName(d.method)}) · سند ${d.no}`, `Collected ${m(d.amount)} from the buyer (${payName(d.method)}) · receipt ${d.no}`)
    case 'owner_paid': return L(`دفع ${m(d.amount)} لصاحب القطعة (${payName(d.method)}) · سند ${d.no}`, `Paid ${m(d.amount)} to the owner (${payName(d.method)}) · voucher ${d.no}`)
    case 'reversed': return L(`عكس السند ${d.no} (${m(d.amount)}) · السبب: ${d.reason}`, `Reversed ${d.no} (${m(d.amount)}) · reason: ${d.reason}`)
    case 'delivery': { const s = DEL[d.status] || DEL.none; return L('التوصيل: ' + s[0], 'Delivery: ' + s[1]) + (d.company ? ' · ' + d.company : '') + (d.tracking ? ' · ' + d.tracking : '') }
    case 'listing_paid': return L(`تحصيل رسوم الإدراج ${m(d.amount)} من صاحب القطعة`, `Listing fee ${m(d.amount)} collected from the owner`)
    case 'cancelled': return L('أُلغيت القطعة', 'Product cancelled') + (d.reason ? ' · ' + d.reason : '')
    case 'relisted': return L('أُعيدت إلى قائمة المنتجات', 'Put back in the Products queue')
    case 'migrated': return L('نُقلت من النظام السابق', 'Moved from the previous system')
    default: return x.action } }

  if (!loaded) return <div className="empty">…</div>
  if (setup) return <div className="notice">{E({ error: 'SALES_SETUP' })}</div>

  // ---------- views ----------
  const TABS: [string, string][] = [['home', L('نظرة عامة', 'Overview')], ['table', L('جدول المبيعات', 'Sales table')], ['receive', L('استلام قطعة', 'Receive product')], ['owners', L('أصحاب القطع', 'Owners')], ['delivery', L('التوصيل', 'Delivery')], ['docs', L('المستندات', 'Documents')], ['rules', L('قواعد العمولة', 'Commission rules')], ['sessions', L('الجلسات', 'Sessions')]]
  const nav = <div className="sm-nav section">{TABS.map(([k, t]) => <button key={k} className={view === k || (view === 'product' && k === 'table') ? 'on' : ''} onClick={() => go(k)}>{t}</button>)}</div>

  const vHome = () => { const list = filtered(), t = totals(list), todo = list.filter(p => ['await_buyer', 'await_owner', 'await_delivery'].includes(life(p)) || (p.stage === 'sold' && !p.confirmed_at))
    return <>
      <div className="row section" style={{ flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>{L('مبيعاتي', 'My Sales')}</h2><div className="muted">{L('القطع، التحصيل، مستحقات الملّاك والتوصيل', 'Products, collections, owner settlements and delivery')}</div></div><button className="btn gold" onClick={() => go('receive')}>+ {L('استلام قطعة جديدة', 'Receive a product')}</button></div>
      {filterBar(false)}
      <div className="card section"><h3>{L('القطع', 'Products')}</h3><div className="sm-tiles"><Tile l={L('قطع مستلمة', 'Products received')} val={t.rec} /><Tile l={L('قطع مباعة', 'Products sold')} val={t.sold} /><Tile l={L('قطع لم تُبَع', 'Unsold products')} val={t.unsold} /><Tile l={L('إجمالي المبيعات', 'Total gross sales')} val={M(t.gross)} /></div></div>
      <div className="card section"><h3>{L('إيرادك أنت (ليس كامل سعر البيع)', 'Your revenue (not the full selling price)')}</h3><div className="sm-tiles"><Tile l={L('رسوم الإدراج', 'Listing fees')} val={M(t.listing)} /><Tile l={L('العمولات المكتسبة', 'Commissions earned')} val={M(t.comm)} /><Tile l={L('صافي إيرادك', 'Your net revenue')} val={M(t.listing + t.comm)} hl /></div>
        {t.feeOwed > 0 && <div className="muted" style={{ marginTop: 8 }}>{L('منها رسوم إدراج لم تُحصَّل بعد من ملّاك قطع لم تُبَع: ', 'Includes listing fees not yet collected from owners of unsold products: ')}<b>{M(t.feeOwed)}</b></div>}</div>
      <div className="sm-g2 section">
        <div className="card"><h3>{L('أموال المشترين', 'Buyers’ money')}</h3><div className="sm-tiles"><Tile l={L('تم تحصيله', 'Collected from buyers')} val={M(t.coll)} /><Tile l={L('بانتظار التحصيل', 'Pending collection')} val={M(t.bDue)} hl={t.bDue > 0} /></div></div>
        <div className="card"><h3>{L('أموال أصحاب القطع', 'Owners’ money')}</h3><div className="sm-tiles"><Tile l={L('إجمالي المستحق للملّاك', 'Total owed to owners')} val={M(t.owed)} /><Tile l={L('تم دفعه', 'Already paid')} val={M(t.oPaid)} /><Tile l={L('متبقٍ للدفع', 'Outstanding')} val={M(t.oDue)} hl={t.oDue > 0} /></div>
          <div className="muted" style={{ marginTop: 8 }}>{L('مبالغ لديك تنتظر التسوية (محصّلة ولم تُدفع للملّاك): ', 'Money you hold awaiting settlement (collected, not yet paid to owners): ')}<b>{M(t.held)}</b></div></div></div>
      <div className="card"><div className="row"><h3 style={{ margin: 0 }}>{L('يحتاج إجراء منك', 'Needs your action')} ({todo.length})</h3><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => go('table')}>{L('كل المبيعات', 'All sales')}</button></div>
        {todo.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>{L('لا توجد إجراءات معلّقة', 'Nothing pending')}</div> : todo.slice(0, 30).map(p => <button key={p.id} className="kv sm-rowbtn" onClick={() => open(p.id)}><span><b>{p.name}</b> <span className="muted" dir="ltr">{p.code}</span></span>{!p.confirmed_at ? <span className="pill gold">{L('بيع جديد · راجِعه', 'New sale · review')}</span> : lifePill(p)}</button>)}</div></> }

  const vTable = () => { const list = filtered(); return <>
    <div className="row section" style={{ flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>{L('جدول المبيعات', 'Sales table')}</h2><div style={{ display: 'flex', gap: 6 }}><button className="btn light" style={{ padding: '7px 10px', fontSize: 13 }} onClick={exportCsv}>{L('تصدير Excel', 'Export Excel')}</button><button className="btn light" style={{ padding: '7px 10px', fontSize: 13 }} onClick={() => setDoc({ type: 'report' })}>{L('تصدير PDF', 'Export PDF')}</button></div></div>
    {filterBar(true)}
    <div className="muted section">{list.length} {L('قطعة · اضغط على أي قطعة لفتح سجلها الكامل', 'products · tap any product to open its full record')}</div>
    <div className="sm-tbox"><table className="sm-table"><thead><tr><th></th><th>{L('الرمز', 'Code')}</th><th>{L('القطعة', 'Product')}</th><th>{L('صاحب القطعة', 'Owner')}</th><th>{L('هاتفه', 'Owner phone')}</th><th>{L('طريقة البيع', 'Method')}</th><th>{L('المطلوب', 'Requested')}</th><th>{L('سعر البيع', 'Sold for')}</th><th>{L('المشتري', 'Buyer')}</th><th>{L('هاتفه', 'Buyer phone')}</th><th>{L('رسوم الإدراج', 'Listing fee')}</th><th>{L('العمولة', 'Commission')}</th><th>{L('صافي المالك', 'Owner net')}</th><th>{L('الحالة', 'Status')}</th><th>{L('التحصيل', 'Collection')}</th><th>{L('التسوية', 'Settlement')}</th><th>{L('التوصيل', 'Delivery')}</th><th>{L('تاريخ البيع', 'Sale date')}</th></tr></thead>
      <tbody>{list.length === 0 && <tr><td colSpan={18} className="muted">{L('لا توجد نتائج', 'No results')}</td></tr>}{list.map(p => { const f = fin(p), o = O(p.owner_id); return <tr key={p.id} onClick={() => open(p.id)}><td><Thumb p={p} size={36} /></td><td dir="ltr">{p.code}</td><td><b>{p.name}</b></td><td>{oname(p)}</td><td dir="ltr">{o?.phone || ''}</td><td>{methodName(p.method)}</td><td>{p.asked_fils != null ? M(p.asked_fils) : '—'}</td><td>{f.sold ? <b>{M(f.price)}</b> : '—'}</td><td>{p.buyer_name || '—'}</td><td dir="ltr">{p.buyer_phone || ''}</td><td>{M(f.listing)}</td><td>{f.sold ? M(f.comm) : '—'}</td><td>{f.sold && p.owner_id ? <b>{M(f.net)}</b> : '—'}</td><td>{lifePill(p)}</td><td>{payPill(p)}</td><td>{setPill(p)}</td><td>{delPill(p)}</td><td>{fdate(p.sold_on)}</td></tr> })}</tbody></table></div>
    <div className="sm-plist">{list.length === 0 && <div className="empty">{L('لا توجد نتائج', 'No results')}</div>}{list.map(p => { const f = fin(p); return <button key={p.id} className="sm-pcard" onClick={() => open(p.id)}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Thumb p={p} /><div style={{ minWidth: 0, flex: 1 }}><b>{p.name}</b><div className="muted"><span dir="ltr">{p.code}</span> · {methodName(p.method)} · {oname(p)}</div></div></div>
      <div style={{ margin: '8px 0' }}>{lifePill(p)}</div>
      {f.sold ? <><div className="kv"><span>{L('سعر البيع', 'Selling price')}</span><b>{M(f.price)}</b></div>{p.owner_id && <><div className="kv"><span>{L('العمولة + الإدراج', 'Commission + listing')}</span><b>{M(f.comm + f.listing)}</b></div><div className="kv"><span>{L('صافي صاحب القطعة', 'Owner net')}</span><b>{M(f.net)}</b></div></>}<div className="kv"><span>{L('المشتري', 'Buyer')}</span><b>{p.buyer_name}</b></div></>
        : p.asked_fils != null && <div className="kv"><span>{L('المبلغ المطلوب', 'Requested amount')}</span><b>{M(p.asked_fils)}</b></div>}</button> })}</div></> }

  const rulesLine = (m: string) => (m === 'order' ? <>{L('رسوم إدراج', 'Listing fee')} {M(rules.order_listing_fils)} · {L('عمولة', 'commission')} {M(rules.order_fixed_fils)} {L('إذا بيعت حتى', 'if sold up to')} {M(rules.order_threshold_fils)}{rules.at_threshold === 'fixed' ? L(' (شاملة هذا المبلغ)', ' (inclusive)') : L(' (أقل منه فقط)', ' (below it only)')}، {L('و', 'and')} {Number(rules.order_pct)}% {L('إذا زادت', 'above that')}</> : <>{L('رسوم إدراج', 'Listing fee')} {M(rules.regular_listing_fils)} · {L('عمولة ثابتة عند البيع', 'fixed commission when sold')} {M(rules.regular_commission_fils)}</>)
  const vReceive = () => { const known = !R.own && owners.find(o => o.phone && o.phone === R.ophone), fee = R.own ? 0 : Number(R.method === 'order' ? rules.order_listing_fils : rules.regular_listing_fils)
    return <><h2 className="section" style={{ margin: '0 0 14px' }}>{L('استلام قطعة جديدة', 'Receive a product')}</h2>
      <div className="card">
        <div className="row"><h3 style={{ margin: 0 }}>{L('صاحب القطعة', 'Original owner')}</h3><label style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={R.own} onChange={e => setR({ ...R, own: e.target.checked })} />{L('القطعة ملكي (بدون مالك وبدون عمولة)', 'My own product (no owner, no commission)')}</label></div>
        {!R.own && <div className="sm-g2"><div><label>{L('رقم الجوال', 'Mobile number')}</label><PhoneInput value={R.ophone} onChange={(x: string) => { const o = owners.find(q => q.phone && q.phone === x); setR((r: any) => ({ ...r, ophone: x, oname: o && !r.oname ? o.name : r.oname })) }} />{known && <div className="muted" style={{ marginTop: 4 }}>{L('مالك مسجَّل: ', 'Saved owner: ')}<b>{known.name}</b> · {ownerRows(known.id).length} {L('قطعة سابقة', 'earlier products')}</div>}</div>
          <div><label>{L('الاسم الكامل', 'Full name')}</label><input value={R.oname} onChange={e => setR({ ...R, oname: e.target.value })} /></div></div>}
        <h3 style={{ margin: '20px 0 0' }}>{L('القطعة', 'Product')}</h3>
        <div className="sm-g2"><div><label>{L('اسم القطعة', 'Product name')}</label><input value={R.name} maxLength={120} onChange={e => setR({ ...R, name: e.target.value })} /></div>
          <div><label>{L('الفئة', 'Category')}</label><input list="sm-cats" value={R.cat} onChange={e => setR({ ...R, cat: e.target.value })} /><datalist id="sm-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></div></div>
        <label>{L('الوصف والمواصفات', 'Description and specifications')}</label><textarea value={R.desc} onChange={e => setR({ ...R, desc: e.target.value })} />
        <label>{L('الصور (حتى 6، الأولى تظهر للمزايدين)', 'Photos (up to 6, the first is shown to bidders)')}</label><input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />{files.length > 0 && <div className="muted" style={{ marginTop: 4 }}>{files.length} {L('صورة', 'photo(s)')}</div>}
        <div className="sm-g2"><div><label>{L('المبلغ المطلوب من صاحب القطعة', 'Amount requested by the owner')} ({cur})</label><input inputMode="decimal" value={R.asked} onChange={e => setR({ ...R, asked: e.target.value })} /></div>
          <div><label>{L('تاريخ الاستلام', 'Date received')}</label><input type="date" value={R.date} max={today()} onChange={e => setR({ ...R, date: e.target.value })} /></div></div>
        <label>{L('طريقة البيع', 'Sale method')}</label>
        <div style={{ display: 'flex', gap: 8 }}><button className={'btn ' + (R.method === 'order' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setR({ ...R, method: 'order' })}>{methodName('order')}</button><button className={'btn ' + (R.method === 'regular' ? '' : 'light')} style={{ flex: 1 }} onClick={() => setR({ ...R, method: 'regular' })}>{methodName('regular')}</button></div>
        <div className="sm-g2"><div><label>{L('سعر البداية', 'Start price')} ({cur}){R.method === 'order' && <small className="muted"> · {L('يظهر لك فقط', 'only you see it')}</small>}</label><input inputMode="decimal" value={R.start} onChange={e => setR({ ...R, start: e.target.value })} /></div>
          <div><label>{L('قيمة الزيادة', 'Bid increment')} ({cur}, ≥ 2)</label><input inputMode="decimal" value={R.inc} onChange={e => setR({ ...R, inc: e.target.value })} /></div></div>
        {!R.own && <div className="sm-tile" style={{ marginTop: 12 }}><span>{L('القواعد المطبّقة الآن', 'Rules applied now')}</span><b style={{ fontSize: 13, fontWeight: 500 }}>{rulesLine(R.method)}</b></div>}
        {fee > 0 && <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)' }}><input type="checkbox" style={{ width: 'auto' }} checked={R.upfront} onChange={e => setR({ ...R, upfront: e.target.checked })} />{L(`استلمتُ رسوم الإدراج (${M(fee)}) الآن، فلا تُخصم لاحقاً من مستحقات صاحب القطعة`, `I collected the listing fee (${M(fee)}) now, so it is not deducted from the owner’s settlement later`)}</label>}
        <label>{L('ملاحظات إضافية', 'Additional notes')}</label><textarea value={R.notes} onChange={e => setR({ ...R, notes: e.target.value })} />
        <div className="notice" style={{ margin: '12px 0 0' }}>{L('بعد الحفظ تُضاف القطعة تلقائياً إلى تبويب المنتجات تحت «', 'After saving, the product is added automatically to the Products tab under “')}{methodName(R.method)}{L('» وتكون جاهزة لفتح المزاد عليها.', '”, ready to be opened for auction.')}</div>
        {err && <p style={{ color: 'var(--red)', margin: '10px 0 0' }}>{err}</p>}
        <button className="btn gold full" disabled={busy} onClick={() => receive(false)}>{busy ? '…' : L('حفظ وإصدار إيصال الاستلام', 'Save and issue receiving receipt')}</button>
        <button className="btn light full" style={{ marginTop: 8 }} disabled={busy} onClick={() => receive(true)}>{L('حفظ وإضافة قطعة أخرى لنفس المالك', 'Save and add another from the same owner')}</button>
      </div></> }

  const vProduct = () => { const p = prods.find(x => x.id === sel); if (!p) return <div className="empty">{L('غير موجود', 'Not found')}</div>
    const f = fin(p), o = O(p.owner_id), k = life(p), flow = ['unsold', 'cancelled'].includes(p.stage) ? [p.stage] : ['listed', 'auction', 'await_buyer', ...(p.owner_id ? ['await_owner'] : []), 'await_delivery', 'delivered'], idx = flow.indexOf(k)
    const bp = pays.filter(x => x.product_id === p.id && x.kind === 'buyer'), op = pays.filter(x => x.product_id === p.id && x.kind === 'owner'), sm = { padding: '6px 10px', fontSize: 13 }
    const payRows = (list: any[]) => list.length === 0 ? <div className="muted" style={{ marginTop: 8 }}>{L('لا توجد دفعات مسجلة', 'No payments recorded')}</div> : list.map(x => <div className="kv" key={x.id} style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span><b dir="ltr">{x.no}</b> · {fdate(x.paid_on)} · {payName(x.method)}{x.ref && !x.reversal_of ? <> · <span dir="ltr">{x.ref}</span></> : null} {x.reversal_of && <span className="pill red">{L('عكس', 'Reversal')}</span>}{x.reversed && <span className="pill">{L('معكوس', 'Reversed')}</span>}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b>{M(x.amount_fils)}</b>{!x.reversal_of && <button className="btn light" style={sm} onClick={() => setDoc({ type: 'pay', id: p.id, no: x.no })}>{L('السند', 'Receipt')}</button>}{x.receipt_path && <button className="btn light" style={sm} onClick={() => showReceipt(x.receipt_path)}>{L('الصورة', 'Photo')}</button>}{!x.reversed && !x.reversal_of && <button className="btn red" style={sm} onClick={() => { setMf({ reason: '' }); setErr(''); setModal({ t: 'rev', pid: x.id, no: x.no }) }}>{L('عكس', 'Reverse')}</button>}</span></div>)
    let next: any = null
    if (p.stage === 'sold' && !p.confirmed_at) next = <><b>{L('بيع جديد سُجِّل تلقائياً من المزاد. راجِع البيانات ثم أكِّد.', 'A new sale was recorded automatically from the auction. Review it, then confirm.')}</b><button className="btn gold" style={sm} onClick={() => { setMf({ address: p.del_address || '', buyer_phone: p.buyer_phone || '' }); setErr(''); setModal({ t: 'confirm', id: p.id }) }}>{L('تأكيد البيع', 'Confirm sale')}</button></>
    else if (k === 'listed') next = <><b>{L('القطعة في قائمة المنتجات تحت «', 'The product is in the Products queue under “')}{methodName(p.method)}{L('». افتح المزاد عليها أثناء جلسة مباشرة.', '”. Open it for auction during a live session.')}</b><button className="btn gold" style={sm} onClick={goProducts}>{L('الذهاب إلى المنتجات', 'Go to Products')}</button></>
    else if (k === 'auction') next = <b>{L('القطعة في المزاد الآن. تُسجَّل النتيجة هنا تلقائياً عند الإغلاق.', 'The product is in auction now. The result is recorded here automatically when it closes.')}</b>
    else if (k === 'await_buyer') next = <><b>{L('الخطوة التالية: تحصيل', 'Next: collect')} {M(f.bDue)} {L('من المشتري', 'from the buyer')}</b><button className="btn gold" style={sm} onClick={() => openPay(p, 'buyer')}>{L('تسجيل دفعة المشتري', 'Record buyer payment')}</button></>
    else if (k === 'await_owner') next = <><b>{L('الخطوة التالية: دفع', 'Next: pay')} {M(f.oDue)} {L('لصاحب القطعة', 'to the owner')}</b><button className="btn gold" style={sm} onClick={() => openPay(p, 'owner')}>{L('تسجيل دفعة المالك', 'Record owner payment')}</button></>
    else if (k === 'await_delivery') next = <><b>{L('الخطوة التالية: التوصيل', 'Next: delivery')}</b><button className="btn gold" style={sm} onClick={() => openDel(p)}>{L('تحديث التوصيل', 'Update delivery')}</button></>
    else if (k === 'delivered') next = <b>{L('اكتملت دورة هذه القطعة بالكامل', 'This product’s cycle is complete')}</b>
    else if (k === 'unsold') next = <><b>{L('لم تُبَع', 'Not sold')}{f.feeOwed > 0 && <> · {L('رسوم إدراج مستحقة على المالك', 'listing fee owed by the owner')} {M(f.feeOwed)}</>}</b><button className="btn gold" style={sm} disabled={busy} onClick={() => act(p.id, 'relist')}>{L('إعادتها إلى قائمة المنتجات', 'Put back in the Products queue')}</button></>
    return <>
      <button className="btn light section" onClick={() => go('table')}>{lang === 'ar' ? '→' : '←'} {L('رجوع', 'Back')}</button>
      <div className="row section" style={{ flexWrap: 'wrap' }}><div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}><Thumb p={p} size={56} /><div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{p.name}</h2><div className="muted"><span dir="ltr">{p.code}</span>{p.category ? ' · ' + p.category : ''} · {methodName(p.method)}</div></div></div>{lifePill(p)}</div>
      <div className="sm-steps section">{flow.map((s, i) => <div key={s} className={'sm-step ' + (k === 'delivered' || i < idx ? 'done' : i === idx ? 'now' : '')}>{L(LIFE[s][0], LIFE[s][1]).replace(' · مكتمل', '').replace(' · complete', '')}</div>)}</div>
      {next && <div className="sm-next section">{next}</div>}
      {p.photos?.length > 1 && <div className="section" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>{p.photos.map((u: string) => <img key={u} src={u} alt="" style={{ width: 96, height: 96, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />)}</div>}
      <div className="sm-g2 section">
        <div className="card"><h3>{L('بيانات القطعة', 'Product details')}</h3>
          {p.description && <div className="kv"><span>{L('الوصف', 'Description')}</span><b>{p.description}</b></div>}
          <div className="kv"><span>{L('صاحب القطعة', 'Owner')}</span><b>{oname(p)} <span dir="ltr" className="muted">{o?.phone}</span></b></div>
          {p.asked_fils != null && <div className="kv"><span>{L('المبلغ المطلوب', 'Requested amount')}</span><b>{M(p.asked_fils)}</b></div>}
          {p.start_fils != null && <div className="kv"><span>{L('سعر البداية / الزيادة', 'Start price / increment')}</span><b>{M(p.start_fils)} / {M(p.inc_fils)}</b></div>}
          <div className="kv"><span>{L('تاريخ الاستلام', 'Date received')}</span><b>{fdate(p.received_on)}</b></div>
          {p.notes && <div className="kv"><span>{L('ملاحظات', 'Notes')}</span><b>{p.notes}</b></div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}><button className="btn light" style={sm} onClick={() => setDoc({ type: 'rr', id: p.id })}>{L('إيصال الاستلام', 'Receiving receipt')} <span dir="ltr">{p.rr_no}</span></button>
            {f.sold && <button className="btn light" style={sm} onClick={() => setDoc({ type: 'inv', id: p.id })}>{L('فاتورة البيع', 'Sales invoice')} <span dir="ltr">{p.inv_no}</span></button>}
            {['listed', 'unsold'].includes(p.stage) && <button className="btn red" style={sm} onClick={() => { setMf({ reason: '' }); setErr(''); setModal({ t: 'cancel', id: p.id }) }}>{L('إلغاء القطعة', 'Cancel product')}</button>}</div></div>
        <div className="card"><h3>{L('الحساب المالي', 'Financial breakdown')}</h3>
          {f.sold ? <><div className="kv"><span>{L('سعر البيع النهائي', 'Final selling price')}</span><b>{M(f.price)}</b></div>
            {p.owner_id ? <><div className="kv"><span>{L('العمولة', 'Commission')} <small className="muted">({whyText(p)})</small></span><b>− {M(f.comm)}</b></div>
              <div className="kv"><span>{L('رسوم الإدراج', 'Listing fee')} <small className="muted">{f.listing > 0 ? (p.listing_upfront ? L('(مدفوعة مسبقاً، لا تُخصم)', '(paid upfront, not deducted)') : L('(تُخصم من المستحقات)', '(deducted from settlement)')) : ''}</small></span><b>{p.listing_upfront ? M(f.listing) : '− ' + M(f.listingDeduct)}</b></div>
              <div className="kv"><span><b>{L('صافي مستحقات صاحب القطعة', 'Net payable to the owner')}</b></span><b style={{ color: 'var(--gold)', fontSize: 18 }}>{M(f.net)}</b></div>
              <div className="kv"><span>{L('إيرادك من هذه القطعة', 'Your revenue from this product')}</span><b>{M(f.comm + f.listing)}</b></div>
              <div className="muted" style={{ marginTop: 8 }}>{L('القواعد محفوظة كما كانت وقت البيع ولا تتغير بتعديل الإعدادات لاحقاً.', 'The rules are stored as they were at the time of sale and do not change when settings are edited later.')}</div></>
              : <div className="muted" style={{ marginTop: 8 }}>{L('قطعة من ملك المزاد: كامل المبلغ لك، ولا توجد عمولة أو تسوية.', 'Your own product: the full amount is yours; no commission or settlement.')}</div>}</>
            : <><div className="kv"><span>{L('رسوم الإدراج', 'Listing fee')}</span><b>{M(p.owner_id ? p.listing_fee_fils : 0)}{Number(p.listing_fee_fils) > 0 && p.owner_id ? ' · ' + (p.listing_upfront ? L('مدفوعة', 'paid') : p.listing_when === 'sold' ? L('تُستحق عند البيع', 'due when sold') : L('مستحقة', 'owed')) : ''}</b></div>
              {p.owner_id && Number(p.listing_fee_fils) > 0 && !p.listing_upfront && p.stage !== 'cancelled' && <button className="btn light" style={{ ...sm, marginTop: 8 }} disabled={busy} onClick={() => act(p.id, 'listing_paid')}>{L('استلمتُ رسوم الإدراج', 'Listing fee collected')}</button>}
              <div className="muted" style={{ marginTop: 8 }}>{L('تُحسب العمولة تلقائياً عند البيع.', 'The commission is calculated automatically when sold.')}</div></>}</div></div>
      {f.sold && <><div className="sm-g2 section">
        <div className="card"><div className="row"><h3 style={{ margin: 0 }}>{L('تحصيل المشتري', 'Buyer payment collection')}</h3>{payPill(p)}</div>
          <div className="kv"><span>{L('المشتري', 'Buyer')}</span><b>{p.buyer_name} <span dir="ltr" className="muted">{p.buyer_phone}</span></b></div><div className="kv"><span>{L('تاريخ البيع', 'Sale date')}</span><b>{fdate(p.sold_on)}</b></div>
          <div className="kv"><span>{L('المبلغ المستحق', 'Amount due')}</span><b>{M(f.price)}</b></div><div className="kv"><span>{L('تم تحصيله', 'Collected')}</span><b>{M(f.bPaid)}</b></div><div className="kv"><span>{L('المتبقي', 'Remaining')}</span><b>{M(f.bDue)}</b></div>
          {payRows(bp)}<button className="btn gold" style={{ ...sm, marginTop: 12 }} disabled={f.bDue === 0} onClick={() => openPay(p, 'buyer')}>{L('تسجيل دفعة المشتري', 'Record buyer payment')}</button></div>
        {p.owner_id && <div className="card"><div className="row"><h3 style={{ margin: 0 }}>{L('تسوية صاحب القطعة', 'Original owner settlement')}</h3>{setPill(p)}</div>
          <div className="kv"><span>{L('صاحب القطعة', 'Owner')}</span><b>{oname(p)}</b></div><div className="kv"><span>{L('صافي المستحق', 'Net payable')}</span><b>{M(f.net)}</b></div><div className="kv"><span>{L('تم دفعه', 'Paid')}</span><b>{M(f.oPaid)}</b></div><div className="kv"><span>{L('المتبقي', 'Remaining')}</span><b>{M(f.oDue)}</b></div>
          {payRows(op)}{f.bDue > 0 && <div className="notice" style={{ margin: '10px 0 0' }}>{L('تُفتح التسوية بعد تحصيل كامل المبلغ من المشتري.', 'Settlement opens once the buyer has paid in full.')}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}><button className="btn gold" style={sm} disabled={f.oDue === 0 || f.bDue > 0} onClick={() => openPay(p, 'owner')}>{L('تسجيل دفعة المالك', 'Record owner payment')}</button><button className="btn light" style={sm} onClick={() => setDoc({ type: 'owner', owner: p.owner_id })}>{L('كشف حساب المالك', 'Owner statement')}</button></div></div>}</div>
        <div className="card section"><div className="row"><h3 style={{ margin: 0 }}>{L('التوصيل', 'Delivery')}</h3>{delPill(p)}</div>
          <div className="kv"><span>{L('العنوان', 'Address')}</span><b>{p.del_address || '—'}</b></div><div className="kv"><span>{L('شركة التوصيل', 'Delivery company')}</span><b>{p.del_company || '—'}</b></div>
          <div className="kv"><span>{L('رسوم التوصيل', 'Delivery fee')}</span><b>{M(p.del_fee_fils)} · {p.del_payer === 'buyer' ? L('على المشتري', 'buyer pays') : L('على البائع', 'seller pays')}</b></div><div className="kv"><span>{L('رقم التتبع', 'Tracking number')}</span><b dir="ltr">{p.del_tracking || '—'}</b></div>
          <div className="muted" style={{ marginTop: 8 }}>{L('رسوم التوصيل تُسجَّل منفصلة ولا تدخل في العمولة ولا في مستحقات صاحب القطعة.', 'Delivery fees are recorded separately and are not part of the commission or the owner’s settlement.')}</div>
          <button className="btn light" style={{ ...sm, marginTop: 10 }} onClick={() => openDel(p)}>{L('تحديث التوصيل', 'Update delivery')}</button></div></>}
      <div className="card"><h3>{L('السجل الكامل للقطعة (سجل التدقيق)', 'Full history (audit trail)')}</h3>{plog.length === 0 ? <div className="muted">…</div> : plog.map(x => <div key={x.id} className="sm-log"><span className="muted">{ftime(x.created_at)}</span> · {logText(x)} <span className="muted">· {x.actor_id ? v.name : L('تلقائي', 'automatic')}</span></div>)}</div></> }

  const vOwners = () => <><h2 style={{ margin: '0 0 6px' }}>{L('أصحاب القطع', 'Product owners')}</h2><div className="muted section">{L('يتعرّف النظام على المالك من رقم جواله عند استلام قطعة جديدة.', 'The system recognises an owner by phone number when you receive a new product.')}</div>
    {owners.length === 0 ? <div className="empty">{L('لا يوجد ملّاك بعد', 'No owners yet')}</div> : <div className="sm-g2">{owners.map(o => { const t = totals(ownerRows(o.id)); return <div className="card" key={o.id}>
      <div className="row"><div><h3 style={{ margin: 0, fontSize: 17 }}>{o.name}</h3><div className="muted" dir="ltr" style={{ userSelect: 'all' }}>{o.phone}</div></div>{t.oDue > 0 ? <span className="pill gold">{L('له', 'Owed')} {M(t.oDue)}</span> : <span className="pill green">{L('لا مستحقات', 'Settled')}</span>}</div>
      <div className="sm-tiles" style={{ marginTop: 10 }}><Tile l={L('قطع مستلمة', 'Received')} val={t.rec} /><Tile l={L('قطع مباعة', 'Sold')} val={t.sold} /><Tile l={L('إجمالي المبيعات', 'Gross sales')} val={M(t.gross)} /><Tile l={L('العمولات والرسوم', 'Fees + commissions')} val={M(t.comm + t.listing)} /><Tile l={L('صافي أرباحه', 'Net earnings')} val={M(t.owed)} /><Tile l={L('دُفع له', 'Paid')} val={M(t.oPaid)} /></div>
      {t.feeOwed > 0 && <div className="muted" style={{ marginTop: 8 }}>{L('رسوم إدراج مستحقة عليه لقطع لم تُبَع: ', 'Listing fees owed for unsold products: ')}<b>{M(t.feeOwed)}</b></div>}
      <div className="sm-tile" style={{ marginTop: 10 }}><span>{L('حساب المالك في الموقع', 'Owner’s account on the site')}</span><div className="row" style={{ marginTop: 4 }}><b style={{ fontSize: 13, fontWeight: 500 }}>{o.portal ? L('يرى مبيعاته عند تسجيل الدخول برقمه', 'Sees his sales when signed in with this number') : L('متوقف: لا يرى شيئاً', 'Off: sees nothing')}</b><button className={'btn ' + (o.portal ? 'green' : 'light')} style={{ padding: '5px 10px', fontSize: 13 }} onClick={async () => { const j = await call({ action: 'portal', ownerId: o.id, on: !o.portal }); j.error ? say(E(j)) : load() }}>{o.portal ? L('إيقاف', 'Turn off') : L('تفعيل', 'Turn on')}</button></div></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setDoc({ type: 'owner', owner: o.id })}>{L('كشف الحساب', 'Statement')}</button><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => { setF({ ...F0, owner: o.id }); go('table') }}>{L('عرض قطعه', 'View products')}</button><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => { setR({ ...R0, date: today(), ophone: o.phone || '', oname: o.name }); go('receive') }}>+ {L('قطعة جديدة له', 'New product')}</button></div></div> })}</div>}</>

  const vDelivery = () => { const list = prods.filter(p => p.stage === 'sold').sort((a, b) => (a.del_status === 'delivered' ? 1 : 0) - (b.del_status === 'delivered' ? 1 : 0)); return <><h2 className="section" style={{ margin: '0 0 14px' }}>{L('إدارة التوصيل', 'Delivery management')}</h2>
    {list.length === 0 ? <div className="empty">{L('لا توجد قطع مباعة', 'No sold products')}</div> : <div className="sm-g2">{list.map(p => { const f = fin(p); return <div className="card" key={p.id}><div className="row"><b>{p.name} <span className="muted" dir="ltr">{p.code}</span></b>{delPill(p)}</div>
      <div className="kv"><span>{L('المشتري', 'Buyer')}</span><b>{p.buyer_name} <span dir="ltr" className="muted">{p.buyer_phone}</span></b></div><div className="kv"><span>{L('العنوان', 'Address')}</span><b>{p.del_address || '—'}</b></div>
      <div className="kv"><span>{L('الشركة / التتبع', 'Company / tracking')}</span><b>{p.del_company || '—'} <span dir="ltr">{p.del_tracking}</span></b></div><div className="kv"><span>{L('رسوم التوصيل', 'Delivery fee')}</span><b>{M(p.del_fee_fils)} · {p.del_payer === 'buyer' ? L('على المشتري', 'buyer') : L('على البائع', 'seller')}</b></div>
      {f.bDue > 0 && <div className="notice" style={{ margin: '10px 0 0' }}>{L('المشتري لم يدفع كامل المبلغ بعد: المتبقي ', 'The buyer has not paid in full yet: remaining ')}{M(f.bDue)}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}><button className="btn gold" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => openDel(p)}>{L('تحديث التوصيل', 'Update delivery')}</button><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => open(p.id)}>{L('فتح القطعة', 'Open product')}</button></div></div> })}</div>}</> }

  const vDocs = () => { const months = Array.from(new Set<string>([today(), ...prods.flatMap(p => [p.received_on, p.sold_on]), ...pays.map(x => x.paid_on)].filter(Boolean).map((d: string) => d.slice(0, 7)))).sort().reverse()
    const all: any[] = [...prods.map(p => [p.received_on, p.rr_no, L('إيصال استلام', 'Receiving receipt'), p, { type: 'rr', id: p.id }]), ...prods.filter(p => p.inv_no).map(p => [p.sold_on, p.inv_no, L('فاتورة بيع', 'Sales invoice'), p, { type: 'inv', id: p.id }]),
      ...pays.filter(x => !x.reversal_of).map(x => { const p = prods.find(q => q.id === x.product_id); return p ? [x.paid_on, x.no, x.kind === 'buyer' ? L('سند قبض من المشتري', 'Buyer payment receipt') : L('سند دفع للمالك', 'Owner payment voucher'), p, { type: 'pay', id: p.id, no: x.no }] : null }).filter(Boolean)].sort((a: any, b: any) => String(b[0]).localeCompare(String(a[0])))
    return <><h2 className="section" style={{ margin: '0 0 14px' }}>{L('المستندات والكشوف', 'Documents & statements')}</h2>
      <div className="sm-g2 section"><div className="card"><h3>{L('الكشف المالي الشهري', 'Monthly financial statement')}</h3><label>{L('الشهر', 'Month')}</label><select value={month} onChange={e => setMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select><button className="btn gold full" onClick={() => setDoc({ type: 'month', month })}>{L('عرض الكشف', 'View statement')}</button></div>
        <div className="card"><h3>{L('كشوف أصحاب القطع', 'Owner statements')}</h3>{owners.length === 0 && <div className="muted">—</div>}{owners.map(o => <div className="kv" key={o.id} style={{ alignItems: 'center' }}><span>{o.name}</span><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setDoc({ type: 'owner', owner: o.id })}>{L('عرض', 'View')}</button></div>)}</div></div>
      <div className="card"><h3>{L('كل المستندات الصادرة (أرقام متسلسلة)', 'All issued documents (sequential numbers)')}</h3>{all.length === 0 && <div className="muted">—</div>}{all.slice(0, 300).map((a: any) => <div className="kv" key={a[1] + a[4].type} style={{ alignItems: 'center', gap: 8 }}><span><b dir="ltr">{a[1]}</b> · {a[2]} · {a[3].name} <span className="muted">· {fdate(a[0])}</span></span><button className="btn light" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setDoc(a[4])}>{L('عرض', 'View')}</button></div>)}</div></> }

  const RK: Record<string, [string, string]> = { order_listing_fils: ['رسوم إدراج أمر البيع', 'Order Sale listing fee'], order_fixed_fils: ['عمولة أمر البيع الثابتة', 'Order Sale fixed commission'], order_pct: ['نسبة أمر البيع %', 'Order Sale percentage'], order_threshold_fils: ['حد العمولة', 'Commission threshold'], at_threshold: ['قاعدة الحد', 'Threshold rule'], regular_listing_fils: ['رسوم إدراج المزاد العادي', 'Regular listing fee'], regular_commission_fils: ['عمولة المزاد العادي', 'Regular Auction commission'], listing_when: ['وقت رسوم الإدراج', 'Listing fee timing'], pay_methods: ['طرق الدفع', 'Payment methods'] }
  const rv = (k: string, x: any) => (k.endsWith('_fils') ? M(Number(x)) : Array.isArray(x) ? x.join(', ') : x === 'fixed' ? L('ثابتة', 'fixed') : x === 'percent' ? L('نسبة', 'percentage') : x === 'registration' ? L('عند التسجيل', 'on registration') : x === 'sold' ? L('عند البيع', 'when sold') : String(x))
  const vRules = () => { const x = rf || { ol: String(rules.order_listing_fils / 100), of: String(rules.order_fixed_fils / 100), pct: String(Number(rules.order_pct)), ot: String(rules.order_threshold_fils / 100), at: rules.at_threshold, rl: String(rules.regular_listing_fils / 100), rc: String(rules.regular_commission_fils / 100), lw: rules.listing_when, pm: (rules.pay_methods || []).join(', ') }
    const set = (k: string) => (e: any) => setRf({ ...x, [k]: e.target.value }), price = aedToFils(calc.p || '0'), c = previewCommission(rules, calc.m, price), lf = Number(calc.m === 'order' ? rules.order_listing_fils : rules.regular_listing_fils)
    return <><h2 style={{ margin: '0 0 12px' }}>{L('قواعد البيع وإعدادات العمولة', 'Sales Rules & Commission Settings')}</h2>
      <div className="notice">{L('أي تغيير هنا يُطبَّق على العمليات القادمة فقط. المبيعات والفواتير السابقة تحتفظ بالقواعد التي كانت سارية وقتها.', 'Changes here apply to future transactions only. Past sales and invoices keep the rules that applied at the time.')}</div>
      <div className="sm-g2 section">
        <div className="card"><h3>{methodName('order')}</h3>
          <label>{L('رسوم إدراج القطعة', 'Product listing fee')} ({cur})</label><input inputMode="decimal" value={x.ol} onChange={set('ol')} />
          <label>{L('العمولة الثابتة (ضمن الحد)', 'Fixed commission (within threshold)')} ({cur})</label><input inputMode="decimal" value={x.of} onChange={set('of')} />
          <label>{L('العمولة بالنسبة (فوق الحد) %', 'Percentage commission (above threshold) %')}</label><input inputMode="decimal" value={x.pct} onChange={set('pct')} />
          <label>{L('حد العمولة', 'Commission threshold')} ({cur})</label><input inputMode="decimal" value={x.ot} onChange={set('ot')} />
          <label>{L('إذا كان سعر البيع يساوي الحد تماماً', 'When the selling price is exactly the threshold')}</label><select value={x.at} onChange={set('at')}><option value="fixed">{L('تُطبَّق العمولة الثابتة', 'Charge the fixed commission')}</option><option value="percent">{L('تُطبَّق النسبة المئوية', 'Charge the percentage')}</option></select></div>
        <div className="card"><h3>{methodName('regular')}</h3>
          <label>{L('رسوم إدراج القطعة', 'Product listing fee')} ({cur})</label><input inputMode="decimal" value={x.rl} onChange={set('rl')} />
          <label>{L('العمولة عند البيع', 'Commission when sold')} ({cur})</label><input inputMode="decimal" value={x.rc} onChange={set('rc')} />
          <h3 style={{ marginTop: 20 }}>{L('عام', 'General')}</h3>
          <label>{L('متى تُستحق رسوم الإدراج', 'When listing fees are charged')}</label><select value={x.lw} onChange={set('lw')}><option value="registration">{L('عند تسجيل القطعة (حتى لو لم تُبَع)', 'On registration (even if not sold)')}</option><option value="sold">{L('عند البيع فقط', 'Only when sold')}</option></select>
          <label>{L('طرق الدفع (مفصولة بفاصلة)', 'Payment methods (comma separated)')}</label><input value={x.pm} onChange={set('pm')} /></div></div>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <button className="btn gold section" disabled={busy || !rf} onClick={saveRules}>{L('حفظ القواعد', 'Save rules')}</button>
      <div className="card section"><h3>{L('حاسبة تجريبية (بالقواعد المحفوظة)', 'Try the calculator (saved rules)')}</h3><div className="sm-g2"><div><label>{L('طريقة البيع', 'Sale method')}</label><select value={calc.m} onChange={e => setCalc({ ...calc, m: e.target.value })}><option value="order">{methodName('order')}</option><option value="regular">{methodName('regular')}</option></select></div><div><label>{L('سعر البيع', 'Selling price')} ({cur})</label><input inputMode="decimal" value={calc.p} onChange={e => setCalc({ ...calc, p: e.target.value })} /></div></div>
        <div className="sm-tile" style={{ marginTop: 12 }}><span>{L('العمولة', 'Commission')}: {M(c.amount)} · {L('رسوم الإدراج', 'listing fee')}: {M(lf)}</span><b>{L('صافي صاحب القطعة', 'Owner net')}: {M(Math.max(0, price - c.amount - lf))}</b></div></div>
      <div className="card"><h3>{L('سجل تغييرات القواعد', 'Rules change log')}</h3>{rlog.length === 0 ? <div className="muted">{L('لا توجد تغييرات بعد', 'No changes yet')}</div> : rlog.map(g => <div key={g.id} className="sm-log"><span className="muted">{ftime(g.created_at)}</span>{Object.entries(g.changes || {}).map(([k, val]: any) => <div key={k}>{L((RK[k] || [k, k])[0], (RK[k] || [k, k])[1])}: {rv(k, val[0])} ← {rv(k, val[1])}</div>)}</div>)}</div></> }

  const mp = modal?.id ? prods.find(x => x.id === modal.id) : null, d = doc ? docBody(doc) : null
  return <div className="sm">
    {nav}
    {view === 'home' && vHome()}{view === 'table' && vTable()}{view === 'receive' && vReceive()}{view === 'product' && vProduct()}{view === 'owners' && vOwners()}{view === 'delivery' && vDelivery()}{view === 'docs' && vDocs()}{view === 'rules' && vRules()}{view === 'sessions' && sessions}

    {modal && <div className="sm-modal" onClick={close}><div className="sm-sheet" onClick={e => e.stopPropagation()}>
      {modal.t === 'pay' && mp && <><h3>{modal.kind === 'buyer' ? L('تسجيل دفعة المشتري', 'Record buyer payment') : L('تسجيل دفعة صاحب القطعة', 'Record owner payment')}</h3>
        <div className="sm-tile"><span>{mp.name} · {modal.kind === 'buyer' ? mp.buyer_name : oname(mp)}</span><b>{L('المتبقي', 'Remaining')}: {M(modal.kind === 'buyer' ? fin(mp).bDue : fin(mp).oDue)}</b></div>
        <label>{L('المبلغ', 'Amount')} ({cur})</label><input inputMode="decimal" value={mf.amt} onChange={e => setMf({ ...mf, amt: e.target.value })} />
        <div className="sm-g2"><div><label>{L('طريقة الدفع', 'Payment method')}</label><select value={mf.method} onChange={e => setMf({ ...mf, method: e.target.value })}>{(rules.pay_methods || ['Cash']).map((m: string) => <option key={m} value={m}>{payName(m)}</option>)}</select></div><div><label>{L('تاريخ الدفع', 'Payment date')}</label><input type="date" value={mf.date} max={today()} onChange={e => setMf({ ...mf, date: e.target.value })} /></div></div>
        <label>{L('مرجع العملية', 'Transaction reference')}</label><input dir="ltr" value={mf.ref} onChange={e => setMf({ ...mf, ref: e.target.value })} />
        <label>{L('ملاحظات', 'Notes')}</label><input value={mf.notes} onChange={e => setMf({ ...mf, notes: e.target.value })} />
        <label>{L('صورة الإيصال (اختياري)', 'Receipt photo (optional)')}</label><input type="file" accept="image/*" onChange={e => setMf({ ...mf, file: e.target.files?.[0] || null })} />
        {err && <p style={{ color: 'var(--red)' }}>{err}</p>}<button className="btn gold full" disabled={busy} onClick={submitPay}>{busy ? '…' : L('حفظ وإصدار السند', 'Save and issue receipt')}</button></>}
      {modal.t === 'rev' && <><h3>{L('عكس السند', 'Reverse entry')} <span dir="ltr">{modal.no}</span></h3><p className="muted">{L('لا يُحذف السند الأصلي. يُضاف قيد عكسي ويُحفظ السبب في سجل التدقيق.', 'The original entry is not deleted. A reversal entry is added and the reason is kept in the audit trail.')}</p>
        <label>{L('سبب العكس', 'Reason')}</label><input value={mf.reason} onChange={e => setMf({ ...mf, reason: e.target.value })} />{err && <p style={{ color: 'var(--red)' }}>{err}</p>}<button className="btn gold full" disabled={busy} onClick={submitReverse}>{L('تأكيد العكس', 'Confirm reversal')}</button></>}
      {modal.t === 'del' && <><h3>{L('تحديث التوصيل', 'Update delivery')}</h3>
        <label>{L('حالة التوصيل', 'Delivery status')}</label><select value={mf.status} onChange={e => setMf({ ...mf, status: e.target.value })}>{Object.keys(DEL).map(k => <option key={k} value={k}>{L(DEL[k][0], DEL[k][1])}</option>)}</select>
        <label>{L('عنوان التوصيل', 'Delivery address')}</label><input value={mf.address} onChange={e => setMf({ ...mf, address: e.target.value })} />
        <div className="sm-g2"><div><label>{L('شركة التوصيل', 'Delivery company')}</label><input value={mf.company} onChange={e => setMf({ ...mf, company: e.target.value })} /></div><div><label>{L('رقم التتبع', 'Tracking number')}</label><input dir="ltr" value={mf.tracking} onChange={e => setMf({ ...mf, tracking: e.target.value })} /></div></div>
        <div className="sm-g2"><div><label>{L('رسوم التوصيل', 'Delivery fee')} ({cur})</label><input inputMode="decimal" value={mf.fee} onChange={e => setMf({ ...mf, fee: e.target.value })} /></div><div><label>{L('من يدفع التوصيل', 'Who pays delivery')}</label><select value={mf.payer} onChange={e => setMf({ ...mf, payer: e.target.value })}><option value="buyer">{L('المشتري', 'Buyer')}</option><option value="seller">{L('البائع', 'Seller')}</option></select></div></div>
        {err && <p style={{ color: 'var(--red)' }}>{err}</p>}<button className="btn gold full" disabled={busy} onClick={submitDelivery}>{L('حفظ', 'Save')}</button></>}
      {modal.t === 'confirm' && mp && <><h3>{L('تأكيد البيع', 'Confirm sale')}</h3>
        <div className="kv"><span>{L('القطعة', 'Product')}</span><b>{mp.name}</b></div><div className="kv"><span>{L('المشتري', 'Buyer')}</span><b>{mp.buyer_name}</b></div><div className="kv"><span>{L('سعر البيع', 'Selling price')}</span><b>{M(mp.sale_price_fils)}</b></div>
        {mp.owner_id && <><div className="kv"><span>{L('العمولة', 'Commission')}</span><b>{M(mp.commission_fils)}</b></div><div className="kv"><span>{L('صافي صاحب القطعة', 'Owner net')}</span><b>{M(mp.net_fils)}</b></div></>}
        <label>{L('جوال المشتري', 'Buyer phone')}</label><PhoneInput value={mf.buyer_phone || ''} onChange={(x: string) => setMf((m: any) => ({ ...m, buyer_phone: x }))} />
        <label>{L('عنوان التوصيل (اختياري)', 'Delivery address (optional)')}</label><input value={mf.address} onChange={e => setMf({ ...mf, address: e.target.value })} />
        {err && <p style={{ color: 'var(--red)' }}>{err}</p>}<button className="btn gold full" disabled={busy} onClick={() => act(mp.id, 'confirm', { address: mf.address, buyer_phone: mf.buyer_phone })}>{L('تأكيد', 'Confirm')}</button></>}
      {modal.t === 'cancel' && mp && <><h3>{L('إلغاء القطعة', 'Cancel product')}</h3><p className="muted">{L('تُزال القطعة من قائمة المنتجات وتبقى في السجل بحالة «ملغي».', 'The product is removed from the Products queue and stays in the records as “Cancelled”.')}{mp.listing_when === 'registration' && Number(mp.listing_fee_fils) > 0 && !mp.listing_upfront && mp.owner_id ? ' ' + L('رسوم الإدراج تبقى مستحقة على المالك.', 'The listing fee stays owed by the owner.') : ''}</p>
        <label>{L('السبب (اختياري)', 'Reason (optional)')}</label><input value={mf.reason} onChange={e => setMf({ ...mf, reason: e.target.value })} />{err && <p style={{ color: 'var(--red)' }}>{err}</p>}<button className="btn red full" disabled={busy} onClick={() => act(mp.id, 'cancel', { reason: mf.reason })}>{L('تأكيد الإلغاء', 'Confirm cancellation')}</button></>}
      {modal.t === 'img' && <img src={modal.url} alt="" style={{ width: '100%', borderRadius: 12 }} />}
      <button className="btn light full" style={{ marginTop: 8 }} onClick={close}>{L('إغلاق', 'Close')}</button></div></div>}

    {doc && <div className="sm-modal sm-docmodal" onClick={() => setDoc(null)}><div className="sm-sheet wide" onClick={e => e.stopPropagation()}>
      {d ? <><div className="sm-paper" ref={paper} dir={lang === 'ar' ? 'rtl' : 'ltr'}>{d.node}</div>
        <div className="sm-docbtns"><button className="btn gold" style={{ flex: 1 }} disabled={busy} onClick={() => sharePdf(d.name)}>{busy ? '…' : L('مشاركة / حفظ PDF', 'Share / save PDF')}</button><button className="btn light" style={{ flex: 1 }} onClick={() => window.print()}>{L('طباعة', 'Print')}</button></div></> : <div className="empty">…</div>}
      <button className="btn light full sm-docbtns" style={{ marginTop: 8 }} onClick={() => setDoc(null)}>{L('إغلاق', 'Close')}</button></div></div>}
  </div>
}
