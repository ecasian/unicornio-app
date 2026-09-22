export type Cliente = {
  id: number;
  nombre: string;
  celular: string;
  direccion: string;
  manejaMedioLitro: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClienteInput = Pick<Cliente, 'nombre' | 'celular' | 'direccion' | 'manejaMedioLitro'>;
export type ClienteUpdate = Partial<ClienteInput & Pick<Cliente, 'activo'>>;

function apiBase(): string {
  // Mejora para el próximo módulo: compartir esta configuración con health.ts.
  const value = import.meta.env.VITE_API_URL?.trim();
  if (!value) throw new Error('Configuración incompleta: define VITE_API_URL.');
  return value.replace(/\/$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, init);
  if (!response.ok) {
    let message = `La API respondió con HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch { /* Preserve the HTTP error when the response is not JSON. */ }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const clientesApi = {
  list: () => request<Cliente[]>('/clientes'),
  get: (id: number) => request<Cliente>(`/clientes/${id}`),
  create: (data: ClienteInput) => request<Cliente>('/clientes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  update: (id: number, data: ClienteUpdate) => request<Cliente>(`/clientes/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
};
