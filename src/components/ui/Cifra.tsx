/**
 * Cifra de cabecera de los asistentes: un rótulo pequeño y el número grande.
 *
 * `alerta` la pone en ámbar. Se reserva para lo que pide acción —consultas sin
 * atender, evoluciones pendientes—: si todo llama la atención, nada lo hace.
 *
 * Estaba copiada en el asistente de recepción y en el del veterinario, y desde
 * que el administrador ve los dos bloques en la misma pantalla, dos copias del
 * mismo componente eran dos sitios donde el estilo podía separarse.
 *
 * El `Cifra` de `PlataformaResumenPage` es otro: lleva icono, tono y detalle, y
 * pinta una tarjeta entera.
 */
export function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
      <p
        className={
          alerta
            ? 'font-display text-2xl font-black text-amber-600'
            : 'font-display text-2xl font-black text-slate-900'
        }
      >
        {valor}
      </p>
    </div>
  )
}
