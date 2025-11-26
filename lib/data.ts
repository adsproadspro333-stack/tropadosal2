// Mock data for the application

export const carouselImages = ["/banner-1.jpg", "/banner-2.jpg"]

export interface PromoCombo {
  quantity: number
  price: number
  highlight?: boolean
}

export const promoCombos: PromoCombo[] = [
  { quantity: 500, price: 50.0 },
  { quantity: 1000, price: 100.0, highlight: true },
  { quantity: 3000, price: 300.0 },
]

export interface ScratcherCombo {
  title: string
  quantity: number
  price: number
  description: string
}

export const scratcherCombos: ScratcherCombo[] = [
  {
    title: "Bronze",
    quantity: 10,
    price: 5.0,
    description: "10 Raspadinhas por apenas R$ 5,00",
  },
  {
    title: "Prata",
    quantity: 25,
    price: 10.0,
    description: "25 Raspadinhas por apenas R$ 10,00",
  },
  {
    title: "Ouro",
    quantity: 50,
    price: 15.0,
    description: "50 Raspadinhas por apenas R$ 15,00",
  },
]

export interface Winner {
  id: string
  name: string
  date: string
  amount: string
  avatarUrl: string
  prize: string
}

export const mockWinners: Winner[] = [
  {
    id: "1",
    name: "João Henrique",
    date: "28/01/2025",
    amount: "R$ 10.000",
    avatarUrl: "/winners/winner1.jpg",
    prize: "R$ 10.000",
  },
  {
    id: "2",
    name: "Carlos Eduardo",
    date: "25/01/2025",
    amount: "R$ 5.000",
    avatarUrl: "/winners/winner2.jpg",
    prize: "iPhone 17",
  },
  {
    id: "3",
    name: "Pedro Henrique",
    date: "21/01/2025",
    amount: "R$ 2.500",
    avatarUrl: "/winners/winner3.jpg",
    prize: "R$ 2.500",
  },
  {
    id: "4",
    name: "Gabriel Santos",
    date: "18/01/2025",
    amount: "R$ 1.000",
    avatarUrl: "/winners/winner4.jpg",
    prize: "Moto Honda 0 KM",
  },
  {
    id: "5",
    name: "Rafael Lima",
    date: "14/01/2025",
    amount: "R$ 500",
    avatarUrl: "/winners/winner5.jpg",
    prize: "R$ 500",
  },
  {
    id: "6",
    name: "Lucas Almeida",
    date: "11/01/2025",
    amount: "R$ 500",
    avatarUrl: "/winners/winner6.jpg",
    prize: "R$ 1.000",
  },
  {
    id: "7",
    name: "Bruno Oliveira",
    date: "07/01/2025",
    amount: "Moto 0 KM",
    avatarUrl: "/winners/winner7.jpg",
    prize: "Moto 0 KM",
  },
  {
    id: "8",
    name: "André Pereira",
    date: "03/01/2025",
    amount: "Moto 0 KM",
    avatarUrl: "/winners/winner8.jpg",
    prize: "Smart TV 55''",
  },
]

// TODO: Integrate with real payment gateway (PagFlex/Braix)
export function generatePixPayload(totalCentavos: number, txid = "TX" + Date.now()): string {
  // Mock PIX payload - Replace with real integration
  const amount = (totalCentavos / 100).toFixed(2)
  return `00020126680014BR.GOV.BCB.PIX2566pix.example.com/qr/v2/${txid}52040000530398654${amount.length.toString().padStart(2, "0")}${amount}5802BR5925NOME DO BENEFICIARIO6009SAO PAULO62070503***6304MOCK`
}
