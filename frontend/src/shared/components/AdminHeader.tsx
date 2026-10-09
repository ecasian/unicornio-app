import { Link } from 'react-router';

const adminLinks = [
  { label: 'Clientes', href: '/admin/clientes' },
  { label: 'Repartidores', href: '/admin/repartidores' },
  { label: 'Sabores', href: '/admin/sabores' },
  { label: 'Visitas', href: '/admin/visitas' },
] as const;

export function AdminHeader({ current }: { current: 'Clientes' | 'Repartidores' | 'Sabores' | 'Visitas' }) {
  return <header className="bg-fuchsia-700 px-5 py-5">
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
      <nav aria-label="Navegación de Administrador" className="flex flex-wrap items-center gap-3">
        <Link to="/" className="font-semibold">Unicornio</Link>
        {adminLinks.map((item) => <span key={item.label} className="flex items-center gap-3"><span aria-hidden="true">/</span>{current === item.label ? <strong aria-current="page">{item.label}</strong> : <Link to={item.href} className="underline underline-offset-4">{item.label}</Link>}</span>)}
      </nav>
      <button type="button" disabled title="Sucursales todavía no disponible" className="rounded-full border border-fuchsia-200 px-4 py-2 text-sm text-fuchsia-100 opacity-75">Sucursales · Próximamente</button>
    </div>
  </header>;
}
