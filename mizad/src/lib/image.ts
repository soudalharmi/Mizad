// Shrinks a photo in the browser before upload: longest side 1200px, WebP (or JPEG where WebP is not supported).
// A 4 MB phone photo usually becomes 120-250 KB, which saves storage and makes pages load faster for viewers.
export async function compressImage(file: File, max = 1200, quality = 0.8): Promise<{ blob: Blob; type: string; ext: string }> {
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url)
    const toBlob = (type: string) => new Promise<Blob | null>(r => c.toBlob(b => r(b), type, quality))
    let blob = await toBlob('image/webp')
    if (blob && blob.type === 'image/webp') return { blob, type: 'image/webp', ext: 'webp' }
    blob = await toBlob('image/jpeg')
    if (blob) return { blob, type: 'image/jpeg', ext: 'jpg' }
  } catch {}
  return { blob: file, type: file.type || 'application/octet-stream', ext: (file.name.split('.').pop() || 'jpg').toLowerCase() }
}
