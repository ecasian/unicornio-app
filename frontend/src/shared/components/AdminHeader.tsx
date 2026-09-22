import { Link } from 'react-router';

export function AdminHeader({ current }: { current: 'Clientes' | 'Repartidores' | 'Sabores' }) {
  return <header className="bg-fuchsia-700 px-5 py-5">
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
      <nav aria-label="Navegación de Administrador" className="flex flex-wrap items-center gap-3">
        <Link to="/" className="font-semibold">Unicornio</Link>
        <span aria-hidden="true">/</span>
        {current === 'Clientes' ? <strong>Clientes</strong> : <Link to="/admin/clientes" className="underline underline-offset-4">Clientes</Link>}
        <span aria-hidden="true">/</span>
        {current === 'Repartidores' ? <strong>Repartidores</strong> : <Link to="/admin/repartidores" className="underline underline-offset-4">Repartidores</Link>}
        <span aria-hidden="true">/</span>
        {current === 'Sabores' ? <strong>Sabores</strong> : <Link to="/admin/sabores" className="underline underline-offset-4">Sabores</Link>}
      </nav>
      <button type="button" disabled title="Sucursales todavía no disponible" className="rounded-full border border-fuchsia-200 px-4 py-2 text-sm text-fuchsia-100 opacity-75">Sucursales · Próximamente</button>
    </div>
  </header>;
}
