/**
 * Enlace de WhatsApp con el mensaje ya escrito, listo para pulsar «enviar».
 *
 * Es lo que hace que el envío sea one-way de verdad (PRD §2): la aplicación
 * prepara el texto y quien atiende lo manda desde su propio WhatsApp. No hay
 * API que reciba respuestas ni conversación que mantener.
 */
export function enlaceWhatsapp(numero: string, mensaje: string): string {
  const soloDigitos = numero.replace(/\D/g, '')
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(mensaje)}`
}
