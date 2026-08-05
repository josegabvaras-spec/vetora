// PRD §5.2: "Moneda: Bolivianos (Bs.) con dos decimales."
export function formatBs(amount: number): string {
  return `Bs. ${amount.toFixed(2)}`
}
