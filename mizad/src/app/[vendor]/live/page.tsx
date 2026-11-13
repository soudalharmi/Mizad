import Live from './LiveClient'
export default function Page({ params }: { params: { vendor: string } }) { return <Live slug={params.vendor} /> }
