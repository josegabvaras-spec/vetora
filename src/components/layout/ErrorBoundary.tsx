import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { registrarError } from '../../lib/errores'

/**
 * Evita que un fallo de React deje la pantalla en blanco.
 *
 * Sin esto, un componente que revienta al dibujarse desmonta el árbol entero y
 * el usuario se queda mirando una página vacía, sin mensaje ni forma de volver.
 * En un consultorio eso pasa delante del cliente, a media consulta.
 *
 * Es un componente de **clase** porque `getDerivedStateFromError` y
 * `componentDidCatch` no tienen equivalente en hooks: es la única parte de React
 * que sigue exigiéndolo. Una clase normal no choca con `erasableSyntaxOnly`, que
 * lo que prohíbe es `enum`, `namespace` y las propiedades de parámetro.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { falló: boolean }> {
  state = { falló: false }

  static getDerivedStateFromError() {
    return { falló: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // El `componentStack` dice QUÉ componente reventó, que es justo lo que le
    // falta al `window.onerror` genérico de lib/errores.ts. Solo la primera
    // línea: el contexto se recorta a 200 caracteres y el resto es ruido.
    const componente = info.componentStack?.trim().split('\n')[0]?.trim() ?? 'desconocido'
    registrarError(error.message, `${window.location.pathname} · ${componente}`)
  }

  render() {
    if (!this.state.falló) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle size={24} />
          </div>

          <h1 className="font-display text-lg font-bold text-slate-900">Algo salió mal</h1>
          {/*
            El mensaje técnico NO se enseña: un «cannot read properties of
            undefined» no le dice nada a quien atiende el mostrador y puede
            filtrar detalles internos. Queda en la bitácora, que es donde sirve.
          */}
          <p className="mt-2 text-sm text-slate-600">
            La pantalla no se pudo mostrar. El fallo quedó registrado y el equipo puede revisarlo.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Nada de lo que hayas guardado antes se ha perdido.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Recargar la página
            </button>
            {/*
              `<a>` y no `<Link>` a propósito: si lo que falló es el propio
              enrutado, un `Link` de react-router no llevaría a ninguna parte.
              Esto fuerza una carga limpia.
            */}
            <a
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
    )
  }
}
