export class ApiConfigurationError extends Error {
  constructor() {
    super('Configuración incompleta: define VITE_API_URL.');
    this.name = 'ApiConfigurationError';
  }
}

export function getApiBaseUrl(value: string | undefined = import.meta.env.VITE_API_URL): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ApiConfigurationError();
  return trimmed.replace(/\/+$/, '');
}
