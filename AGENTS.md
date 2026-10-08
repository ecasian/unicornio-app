# Proyecto Unicornio

## Objetivo

Construir un sistema modular para controlar clientes externos,
existencias y pedidos de producción de Yogurt Unicornio.

El desarrollo debe realizarse incrementalmente.
No construir características fuera del alcance solicitado.

## Principios

- Arquitectura modular.
- Aplicación web con frontend y backend separados, API REST y PostgreSQL.
- No implementar un ERP.
- No implementar un POS.
- No agregar funcionalidades futuras sin autorización.
- Mantener código sencillo, mantenible y tipado.
- Validar cada módulo antes de continuar con el siguiente.
- No duplicar lógica entre vistas.

## Roles del MVP

### Administrador

Puede:

- crear clientes
- editar clientes
- activar y desactivar clientes
- definir stock objetivo
- configurar `manejaMedioLitro` por cliente
- crear, editar, activar y desactivar sabores
- gestionar el catálogo simple de repartidores activos e inactivos
- configurar las presentaciones disponibles por sabor
- consultar las presentaciones iniciales de 1 litro y 1/2 litro
- consultar existencias
- consultar pedidos a producción
- consultar bitácora de movimientos

### Repartidor

Puede:

- seleccionar manualmente un repartidor activo al entrar a la vista
- seleccionar cliente
- registrar existencias
- consultar stock objetivo
- registrar su llegada antes del levantamiento

En slices posteriores podrá corregir existencias mediante un nuevo registro
versionado si hubo un error. El pedido de producción se generará
automáticamente a partir del levantamiento vigente.

Las vistas representan flujos de trabajo, no permisos de seguridad.
No hay autenticación ni usuarios reales en el MVP.

## Repartidores

Existe un catálogo simple `Repartidor` con únicamente `id`, `nombre`,
`activo`, `createdAt` y `updatedAt`.
La vista Repartidor requiere seleccionar un repartidor activo antes de registrar
la llegada o existencias. Su ID se conserva en visitas, registros y movimientos.
No eliminar repartidores físicamente.

## Clientes

Cada cliente representa una tienda externa.

Campos iniciales:

- nombre
- celular
- dirección
- manejaMedioLitro
- activo

No existe relación cliente -> sucursal.
No eliminar clientes físicamente. Usar `activo` para desactivarlos.
No implementar la acción "Eliminar cliente" de los mockups.

## Sucursales

Unicornio tiene cinco sucursales propias.

El módulo de sucursales NO pertenece al MVP actual.

Mantener el botón visible pero sin funcionalidad.
No crear modelo, API ni lógica de sucursales.

## Productos

`Sabor` representa un sabor.

Ejemplo:

- Fresa
- Nuez
- Ciruela

`Presentacion` es independiente de `Sabor`. Las únicas presentaciones
iniciales del MVP son:

- 1 litro
- 1/2 litro

No se requiere crear tamaños adicionales en el MVP.
`SaborPresentacion` indica qué presentaciones están habilitadas para cada sabor.
El administrador puede agregar sabores y configurar sus presentaciones.
El repartidor no puede agregar sabores durante el levantamiento.
No eliminar sabores físicamente. Usar `activo` para desactivarlos.

`Cliente.manejaMedioLitro` determina si se muestra y permite operar con
1/2 litro para ese cliente. Una combinación sabor/presentación solo forma
parte del surtido operativo de un cliente cuando existe explícitamente un
`StockObjetivo`, el sabor está activo, `SaborPresentacion.habilitada` es
verdadera y la presentación está permitida para el cliente. Para 1/2 litro,
`Cliente.manejaMedioLitro` debe ser verdadero.

## Stock

Existen dos conceptos diferentes:

1. stock objetivo
2. existencia registrada

El stock objetivo lo configura el administrador.

La existencia la registra el repartidor.

No mezclar ambos conceptos.
Un `StockObjetivo` no configurado no equivale a cantidad cero: la combinación
queda fuera del surtido operativo. `StockObjetivo.cantidad = 0` sí es válido.
Cada registro de existencias es un snapshot completo de las existencias del
cliente en ese momento. Debe incluir todas las combinaciones operables, con
cantidades explícitas en cero cuando corresponda. Los registros históricos
nunca se sobrescriben.

## Reposición

La cantidad necesaria para el pedido se obtiene mediante:

`max(stockObjetivo - existenciaActual, 0)`

La reposición es un cálculo de dominio derivado de `StockObjetivo` y
`RegistroExistencias` vigente; no es una entidad persistente. El
`PedidoProduccion` se genera automáticamente al guardar el levantamiento
vigente. No se permite modificar libremente la cantidad de producción de
forma que rompa su relación con `StockObjetivo` y la existencia vigente.

Si hubo un error en la captura, se crea una corrección versionada de
existencias. El registro original permanece en el histórico y el corregido
pasa a ser vigente. Después de la corrección, el pedido debe
recalcularse usando la existencia vigente.
Cada corrección crea un nuevo `RegistroExistencias` inmutable y solo puede
corregirse el último registro de su cadena. Los pedidos anteriores se
conservan como `SUSTITUIDO`; el nuevo pedido, si hay faltantes, queda
`VIGENTE`. La vista `/produccion` consulta solo pedidos vigentes.

## Producción

`/produccion` es una consulta de solo lectura para el día calendario local de
llegada (`VisitaCliente.llegadaAt`), en la zona `BUSINESS_TIMEZONE` (por
defecto `America/Mexico_City`). Sin `fecha`, consulta el día calendario local
anterior; acepta fechas pasadas o futuras explícitas. Solo muestra pedidos
`VIGENTE` ligados al snapshot vigente. Una corrección conserva el día de la
visita original; si la corrección sustituye el pedido o no genera uno nuevo,
el anterior deja de aparecer. El detalle por tienda y el consolidado se
derivan de los mismos pedidos y usan `cantidadSolicitada`. La vista no edita,
crea ni envía pedidos. No implementar producción vespertina ni sucursales.

## Totales

Conservar por separado:

- cantidad de envases de 1L
- cantidad de envases de 1/2L

También calcular litros equivalentes:

litros = unidades_1L + unidades_500ml * 0.5

No sustituir los valores originales por el total calculado.

## Bitácora

Registrar automáticamente los movimientos:

- REGISTRO_EXISTENCIAS
- PEDIDO_PRODUCCION

Guardar:

- cliente
- repartidor
- fecha/hora
- tipo
- `registroExistenciasId` nullable
- `pedidoProduccionId` nullable

Debe existir exactamente una de las dos referencias, según el tipo de
movimiento.

El repartidor no crea manualmente entradas en la bitácora.
El "Registro de ventas" de los mockups significa Bitácora/Historial de
movimientos durante el MVP; no representa ventas contables.

## Timestamps

Usar `createdAt` y `updatedAt` en catálogos y configuraciones modificables.
Los registros históricos y movimientos llevan `createdAt` como fecha/hora
del evento; sus detalles heredan la fecha/hora de la cabecera.

## Fuera del MVP

No implementar todavía:

- autenticación
- usuarios reales
- permisos RBAC
- dashboard
- modelo predictivo
- rutas
- módulo funcional de sucursales
- facturación
- POS
- ERP
