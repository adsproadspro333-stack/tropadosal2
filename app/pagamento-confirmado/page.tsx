// app/pagamento-confirmado/page.tsx
import PagamentoConfirmadoClient from "./PagamentoConfirmadoClient"

type Props = {
  searchParams?: { orderId?: string }
}

export default function PagamentoConfirmadoPage({ searchParams }: Props) {
  const orderId = searchParams?.orderId || undefined
  return <PagamentoConfirmadoClient orderIdFromSearch={orderId} />
}
