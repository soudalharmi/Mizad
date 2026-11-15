// Shared helpers for My Sales. Amounts are integer hundredths of the host's currency.
// The numbers themselves (commission, net, document numbers) are produced by the database; this file only reads them.
export const DEFAULT_RULES = { order_listing_fils: 10000, order_fixed_fils: 10000, order_pct: 5, order_threshold_fils: 200000, at_threshold: 'fixed', regular_listing_fils: 0, regular_commission_fils: 5000, listing_when: 'registration', pay_methods: ['Cash', 'Bank transfer'] }

// Same rule as sm_commission() in the database; used only for previews before a sale exists.
export function previewCommission(r: any, method: string, price: number) {
  if (method === 'regular') return { amount: Number(r.regular_commission_fils), kind: 'regular' }
  const th = Number(r.order_threshold_fils)
  if (price > th || (price === th && r.at_threshold === 'percent')) return { amount: Math.round(price * Number(r.order_pct) / 100), kind: 'percent' }
  return { amount: Number(r.order_fixed_fils), kind: 'fixed' }
}

export function fin(p: any, pays: any[]) {
  const sold = p.stage === 'sold', price = sold ? Number(p.sale_price_fils || 0) : 0, comm = sold ? Number(p.commission_fils || 0) : 0
  const listing = p.owner_id && (p.listing_when === 'registration' || sold) ? Number(p.listing_fee_fils || 0) : 0
  const listingDeduct = p.listing_upfront ? 0 : listing
  const net = sold ? Number(p.net_fils || 0) : 0
  let bPaid = 0, oPaid = 0
  for (const x of pays) if (x.product_id === p.id) { if (x.kind === 'buyer') bPaid += Number(x.amount_fils); else oPaid += Number(x.amount_fils) }
  return { sold, price, comm, listing, listingDeduct, net, bPaid, oPaid, bDue: Math.max(0, price - bPaid), oDue: Math.max(0, net - oPaid), feeOwed: !sold && !p.listing_upfront ? listing : 0 }
}

// One automatic status for the whole life of a product. It follows the recorded transactions.
export function life(p: any, pays: any[]) {
  if (p.stage !== 'sold') return p.stage as string
  const f = fin(p, pays)
  if (f.bDue > 0) return 'await_buyer'
  if (f.oDue > 0) return 'await_owner'
  if (p.del_status !== 'delivered') return 'await_delivery'
  return 'delivered'
}

export const LIFE: Record<string, [string, string, string]> = {
  listed: ['تم الاستلام والإدراج', 'Received and listed', ''], auction: ['في المزاد', 'In auction', 'gold'],
  await_buyer: ['بانتظار تحصيل المبلغ من المشتري', 'Awaiting buyer payment', 'gold'], await_owner: ['بانتظار تحويل مستحقات صاحب القطعة', 'Awaiting owner settlement', 'gold'],
  await_delivery: ['بانتظار التوصيل', 'Awaiting delivery', ''], delivered: ['تم التوصيل · مكتمل', 'Delivered · complete', 'green'],
  unsold: ['لم يتم البيع', 'Unsold', 'red'], cancelled: ['ملغي', 'Cancelled', 'red'],
}
export const DEL: Record<string, [string, string, string]> = {
  none: ['لم يُرتَّب', 'Not arranged', ''], pickup: ['بانتظار الاستلام', 'Awaiting pickup', 'gold'], picked: ['تم الاستلام', 'Picked up', ''],
  transit: ['في الطريق', 'In transit', ''], delivered: ['تم التوصيل', 'Delivered', 'green'], failed: ['فشل / مرتجع', 'Failed / returned', 'red'],
}
export const CATS: [string, string][] = [['مسابيح', 'Misbah'], ['كهرمان', 'Amber'], ['ساعات', 'Watches'], ['إكسسوارات', 'Accessories']]

// Hands a generated file to the phone's share sheet (WhatsApp, Files…) or downloads it on a computer.
export async function deliverFile(blob: Blob, name: string) {
  try {
    const file = new File([blob], name, { type: blob.type })
    const nav: any = navigator
    if (nav.canShare && nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: name }); return true }
  } catch (e: any) { if (e?.name === 'AbortError') return true }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); return true
}

const loadScript = (src: string) => new Promise<void>((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res()
  const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load')); document.head.appendChild(s)
})
// Turns the on-screen document into an A4 PDF (as a picture, so Arabic text keeps its exact look).
export async function elementToPdf(el: HTMLElement): Promise<Blob> {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  const w: any = window
  const canvas: HTMLCanvasElement = await w.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const pdf = new w.jspdf.jsPDF({ unit: 'pt', format: 'a4' })
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28, iw = pw - 2 * m
  const pagePx = Math.floor((ph - 2 * m) * canvas.width / iw)
  for (let y = 0, n = 0; y < canvas.height; y += pagePx, n++) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = Math.min(pagePx, canvas.height - y)
    c.getContext('2d')!.drawImage(canvas, 0, y, c.width, c.height, 0, 0, c.width, c.height)
    if (n > 0) pdf.addPage()
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, iw, c.height * iw / c.width)
  }
  return pdf.output('blob')
}
export const csvBlob = (rows: (string | number)[][]) => new Blob(['﻿' + rows.map(r => r.map(x => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
