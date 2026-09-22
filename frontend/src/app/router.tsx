import { Route, Routes } from 'react-router';
import { HealthPage } from '../modules/health/HealthPage';
import { ClientesPage } from '../modules/clientes/ClientesPage';
import { RepartidoresPage } from '../modules/repartidores/RepartidoresPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HealthPage />} />
      <Route path="/admin/clientes" element={<ClientesPage />} />
      <Route path="/admin/repartidores" element={<RepartidoresPage />} />
    </Routes>
  );
}
