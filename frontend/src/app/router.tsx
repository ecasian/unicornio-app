import { Route, Routes } from 'react-router';
import { HealthPage } from '../modules/health/HealthPage';
import { ClientesPage } from '../modules/clientes/ClientesPage';
import { RepartidoresPage } from '../modules/repartidores/RepartidoresPage';
import { SaboresPage } from '../modules/catalogo/SaboresPage';
import { StockObjetivoPage } from '../modules/stock-objetivo/StockObjetivoPage';
import { RepartidorInicioPage } from '../modules/repartidor-inicio/RepartidorInicioPage';
import { ProduccionPage } from '../modules/produccion/ProduccionPage';
import { VisitasPage } from '../modules/admin-visitas/VisitasPage';
import { ConcentradoSucursalesPage } from '../modules/sucursales/ConcentradoSucursalesPage';
import { YogurtBasePage } from '../modules/yogurt-base/YogurtBasePage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HealthPage />} />
      <Route path="/repartidor" element={<RepartidorInicioPage />} />
      <Route path="/produccion" element={<ProduccionPage />} />
      <Route path="/produccion/base" element={<YogurtBasePage />} />
      <Route path="/admin/visitas" element={<VisitasPage />} />
      <Route path="/sucursales" element={<ConcentradoSucursalesPage />} />
      <Route path="/admin/clientes" element={<ClientesPage />} />
      <Route path="/admin/clientes/:clienteId/stock-objetivo" element={<StockObjetivoPage />} />
      <Route path="/admin/repartidores" element={<RepartidoresPage />} />
      <Route path="/admin/sabores" element={<SaboresPage />} />
    </Routes>
  );
}
