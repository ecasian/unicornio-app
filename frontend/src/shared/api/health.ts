import { getApiBaseUrl } from './config';
export { ApiConfigurationError } from './config';

type HealthResponse = { status: 'ok' };

export async function fetchHealth(
  apiUrl = import.meta.env.VITE_API_URL,
): Promise<HealthResponse> {
  const response = await fetch(`${getApiBaseUrl(apiUrl)}/health`);
  if (!response.ok) {
    throw new Error(`La API respondió con HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
