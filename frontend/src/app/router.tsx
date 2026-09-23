import { Route, Routes } from 'react-router';
import { HealthPage } from '../modules/health/HealthPage';
import { ClientesPage } from '../modules/clientes/ClientesPage';
import { RepartidoresPage } from '../modules/repartidores/RepartidoresPage';
import { SaboresPage } from '../modules/catalogo/SaboresPage';
import { StockObjetivoPage } from '../modules/stock-objetivo/StockObjetivoPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HealthPage />} />
      <Route path="/admin/clientes" element={<ClientesPage />} />
      <Route path="/admin/clientes/:clienteId/stock-objetivo" element={<StockObjetivoPage />} />
      <Route path="/admin/repartidores" element={<RepartidoresPage />} />
      <Route path="/admin/sabores" element={<SaboresPage />} />
    </Routes>
  );
}
