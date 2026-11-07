# Producción de YogurtBase: reglas pendientes

- La regla temporal implementada cuenta fechas calendario en `BUSINESS_TIMEZONE`: D+1 procesamiento normal; D+2 procesamiento obligatorio con alerta prioritaria; D+3 y posteriores requieren revisión. No se descarta, libera ni bloquea producto automáticamente.
- `fechaElaboracion` se usa como fecha D para calcular la antigüedad. Falta confirmar si en operación D significa inicio de fermentación o base ya terminada; según esa definición el conteo podría desplazarse un día. No se guarda una fecha/hora separada de inicio y término.
- Se registran cubetas declaradas de 10, 6 y 4 litros, su equivalencia nominal y el volumen real medido. No hay tolerancia aprobada entre capacidad nominal y medición real.
- El volumen consumido y el volumen obtenido se registran por separado; la diferencia se informa como obtenido menos consumido. No se aplica rendimiento esperado, merma ni regla de aceptación.
- La precisión persistida es de mililitros (tres decimales); confirmar si corresponde al instrumento de medición del proceso.
- Cada solicitud confirmada usa una clave UUID única para hacer reintentos idempotentes. El consumo acumulado se valida bajo bloqueo transaccional del lote.
