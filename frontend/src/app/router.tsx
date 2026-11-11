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
import { CapturaInventarioPage } from '../modules/inventario-sucursales/CapturaInventarioPage';
import { ConsultaInventarioPage } from '../modules/inventario-sucursales/ConsultaInventarioPage';
import { YogurtBasePage } from '../modules/yogurt-base/YogurtBasePage';
import { StockObjetivoSucursalPage } from '../modules/sucursales/StockObjetivoSucursalPage';
import { PropuestaAbastecimientoPage } from '../modules/propuesta-abastecimiento/PropuestaAbastecimientoPage';
import { AbastecimientoSucursalesPage } from '../modules/abastecimiento-sucursales/AbastecimientoSucursalesPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HealthPage />} />
      <Route path="/repartidor" element={<RepartidorInicioPage />} />
      <Route path="/produccion" element={<ProduccionPage />} />
      <Route path="/produccion/abastecimiento-sucursales" element={<AbastecimientoSucursalesPage />} />
      <Route path="/produccion/base" element={<YogurtBasePage />} />
      <Route path="/admin/visitas" element={<VisitasPage />} />
      <Route path="/sucursales" element={<ConcentradoSucursalesPage />} />
      <Route path="/sucursales/stock-objetivo" element={<StockObjetivoSucursalPage />} />
      <Route path="/sucursales/propuesta-abastecimiento" element={<PropuestaAbastecimientoPage />} />
      <Route path="/inventario-sucursales" element={<CapturaInventarioPage />} />
      <Route path="/inventario-sucursales/consulta" element={<ConsultaInventarioPage />} />
      <Route path="/admin/clientes" element={<ClientesPage />} />
      <Route path="/admin/clientes/:clienteId/stock-objetivo" element={<StockObjetivoPage />} />
      <Route path="/admin/repartidores" element={<RepartidoresPage />} />
      <Route path="/admin/sabores" element={<SaboresPage />} />
    </Routes>
  );
}
