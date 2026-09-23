export function presentacionPermitidaParaCliente(litrosEquivalentes: number, manejaMedioLitro: boolean): boolean {
  return litrosEquivalentes !== 0.5 || manejaMedioLitro;
}
