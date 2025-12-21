// app/pagamento-confirmado/page.tsx
import PagamentoConfirmadoClient from "./PagamentoConfirmadoClient"

export const dynamic = "force-dynamic"
export const revalidate = 0

type PageProps = {
  searchParams?: { orderId?: string }
}

export default function PagamentoConfirmadoPage({ searchParams }: PageProps) {
  const orderId = searchParams?.orderId || undefined
  return <PagamentoConfirmadoClient orderIdFromSearch={orderId} />
}
