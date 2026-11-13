import { getApiBaseUrl } from './config';

type HealthResponse = { status: 'ok' };

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${getApiBaseUrl()}/health`, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`La API respondió con HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
