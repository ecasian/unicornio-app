type HealthResponse = { status: 'ok' };

export class ApiConfigurationError extends Error {
  constructor() {
    super('Configuración incompleta: define VITE_API_URL.');
    this.name = 'ApiConfigurationError';
  }
}

export async function fetchHealth(
  apiUrl = import.meta.env.VITE_API_URL,
): Promise<HealthResponse> {
  if (!apiUrl?.trim()) {
    throw new ApiConfigurationError();
  }

  const response = await fetch(`${apiUrl.trim().replace(/\/$/, '')}/health`);
  if (!response.ok) {
    throw new Error(`La API respondió con HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
