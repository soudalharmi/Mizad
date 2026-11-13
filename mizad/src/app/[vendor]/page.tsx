import { redirect } from 'next/navigation'
export default function V({ params }: { params: { vendor: string } }) { redirect(`/${params.vendor}/live`) }
