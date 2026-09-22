import { Route, Routes } from 'react-router';
import { HealthPage } from '../modules/health/HealthPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HealthPage />} />
    </Routes>
  );
}
