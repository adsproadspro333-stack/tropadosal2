// app/pagamento-confirmado/page.tsx
import PagamentoConfirmadoClient from "./PagamentoConfirmadoClient"

type PageProps = {
  searchParams: Promise<{ orderId?: string }>
}

export default async function PagamentoConfirmadoPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const orderId = sp?.orderId || undefined
  return <PagamentoConfirmadoClient orderIdFromSearch={orderId} />
}
