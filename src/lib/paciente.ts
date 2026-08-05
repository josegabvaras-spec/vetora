export function calcularEdad(fechaNacimiento?: string | null): string {
  if (!fechaNacimiento) return 'Edad desconocida'
  const nacimiento = new Date(fechaNacimiento)
  const años = (Date.now() - nacimiento.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  return años < 1 ? `${Math.round(años * 12)} meses` : `${Math.floor(años)} años`
}
