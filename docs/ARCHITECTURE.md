# Arquitectura del MVP — Yogurt Unicornio

## Alcance y estructura

Aplicación web modular, con frontend y backend separados, API REST y una base
PostgreSQL. Las vistas Administrador y Repartidor utilizan las mismas reglas de
dominio del backend. No existe autenticación ni control de permisos en el MVP;
la selección manual de repartidor sirve para atribuir registros, no para
verificar identidad.

Estructura propuesta para la implementación posterior:

```text
frontend/src/
  app/                 navegación y composición de vistas
  modules/             clientes, catalogo, stock-objetivo, sucursales,
                       existencias, reposicion, pedidos, bitacora, repartidores
  shared/              cliente REST, tipos y componentes comunes
backend/src/
  modules/             mismos límites funcionales y reglas del dominio
  db/                  conexión PostgreSQL y migraciones
  shared/              validación, errores y configuración
docs/                  decisiones y referencias del producto
```

## Módulos

| Módulo | Responsabilidad |
| --- | --- |
| Clientes | Alta, edición, activación, desactivación y consulta de tiendas externas. |
| Repartidores | Catálogo simple y selección de un repartidor activo. |
| Catálogo | Sabores, las dos presentaciones iniciales y disponibilidad por sabor. |
| Stock objetivo de clientes | Cantidades configuradas por el administrador para el surtido de cada cliente externo. |
| Stock objetivo de sucursales | Objetivo base permanente en litros por sucursal y sabor; separado del inventario por turno y del concentrado de necesidades. |
| Propuesta diaria de abastecimiento de sucursales | Snapshot versionado de referencia y decisión humana; no crea pedidos ni movimientos de inventario. |
| Visitas | Registra la llegada del repartidor al cliente antes del levantamiento. |
| Historial administrativo de visitas | Consulta de solo lectura de llegadas por día, cliente y repartidor. |
| Existencias | Captura y consulta de snapshots completos e históricos. |
| Reposición (futura) | Cálculo derivado del objetivo y la existencia vigente; no persiste una entidad `Reposicion`. |
| Pedidos a producción | Creación automática con la cantidad necesaria al guardar existencias; consulta de solo lectura en `/produccion`. |
| Bitácora | Registro automático y consulta de movimientos. |

Las experiencias incluyen `/admin`, `/repartidor` y `/produccion`. El pedido
se crea al guardar existencias y se recalcula al corregirlas mediante un nuevo
snapshot. `/produccion` no escribe datos.

El módulo de sucursales conserva separados el concentrado de necesidades en
cubetas, los inventarios físicos por turno y el objetivo base en litros.
«Registro de ventas» en los mockups se interpreta como Bitácora/Historial de
movimientos, sin ventas contables.

## Entidades y relaciones

| Entidad | Campos principales | Relaciones |
| --- | --- | --- |
| `Cliente` | `id`, `nombre`, `celular`, `direccion`, `manejaMedioLitro`, `activo`, `createdAt`, `updatedAt` | Tiene objetivos, visitas, snapshots, pedidos y movimientos. No se relaciona con sucursales. |
| `Sucursal` | `id`, `nombre`, `activo`, `createdAt`, `updatedAt` | Tiene concentrados de necesidades, inventarios por fecha/turno y objetivos base. |
| `StockObjetivoSucursal` | `sucursalId`, `saborId`, `litros Decimal(14,3)`, `createdAt`, `updatedAt` | Clave única por sucursal y sabor. Una fila con cero es objetivo explícito; sin fila significa no configurado. |
| `PropuestaAbastecimiento` | `sucursalId`, `fecha`, `version`, estado, snapshot de reporte fuente y timestamps | Versiones por sucursal/fecha. La versión más reciente es la actual; confirmadas e históricas se preservan. |
| `DetallePropuestaAbastecimiento` | `propuestaId`, `saborId`, estado de referencia, objetivo/existencia/sugerencia/decisión `Decimal(14,3)` | Snapshot inmutable de entradas al calcular; decisión nullable hasta captura explícita; `SIN_DATOS` no se interpreta como cero. |
| `Repartidor` | `id`, `nombre`, `activo`, `createdAt`, `updatedAt` | Identifica visitas, snapshots, pedidos y movimientos. No tiene otros campos en el MVP. |
| `Sabor` | `id`, `nombre`, `activo`, `createdAt`, `updatedAt` | Se relaciona con presentaciones mediante `SaborPresentacion` y aparece en los detalles. |
| `Presentacion` | `id`, `nombre`, `litrosEquivalentes`, `createdAt`, `updatedAt` | Valores iniciales: 1 litro (`1`) y 1/2 litro (`0.5`); no se crean otros tamaños en el MVP. |
| `SaborPresentacion` | `saborId`, `presentacionId`, `habilitada`, `createdAt`, `updatedAt` | Una combinación única por sabor y presentación. |
| `StockObjetivo` | `clienteId`, `saborId`, `presentacionId`, `cantidad`, `createdAt`, `updatedAt` | Una combinación única por cliente, sabor y presentación; su existencia define el surtido configurado. |
| `VisitaCliente` | `id`, `clienteId`, `repartidorId`, `llegadaAt` | Llegada con hora generada por la BD; puede tener varios snapshots. No registra salida ni ubicación. |
| `RegistroExistencias` | `id`, `clienteId`, `repartidorId`, `visitaClienteId`, `corrigeRegistroExistenciasId`, `createdAt` | Cabecera inmutable de un snapshot; la referencia nullable y única enlaza una corrección con su versión anterior sin permitir ramas. La visita es obligatoria en escrituras nuevas y nullable en BD para conservar históricos previos. |
| `DetalleExistencias` | `registroExistenciasId`, `saborId`, `presentacionId`, `cantidad` | Una fila por combinación operable; hereda la fecha/hora de su cabecera. |
| `PedidoProduccion` | `id`, `clienteId`, `repartidorId`, `registroExistenciasId`, `estado`, `createdAt` | Referencia obligatoria y única al snapshot que lo originó; tiene detalles. Solo se crea si existe algún faltante positivo. `estado` es `VIGENTE` o `SUSTITUIDO`; los pedidos anteriores se conservan. |
| `DetallePedido` | `pedidoProduccionId`, `saborId`, `presentacionId`, `cantidadSugerida`, `cantidadSolicitada` | Una fila por faltante positivo; hereda la fecha/hora de su cabecera. Ambas cantidades son iguales en este slice. |
| `MovimientoBitacora` | `id`, `clienteId`, `repartidorId`, `createdAt`, `tipo`, `registroExistenciasId` nullable, `pedidoProduccionId` nullable | `createdAt` es la fecha/hora del movimiento. Exactamente una referencia, según `tipo`. |

Para `REGISTRO_EXISTENCIAS`, solo `registroExistenciasId` tiene valor; para
`PEDIDO_PRODUCCION`, solo `pedidoProduccionId` tiene valor. Los IDs históricos
permanecen válidos cuando se desactiva un cliente, sabor o repartidor. Ninguno
de esos catálogos se elimina físicamente. `Reposicion` no figura entre las
entidades porque su resultado se calcula y no se persiste.

## Reglas de negocio

1. `StockObjetivo` y `RegistroExistencias` son conceptos distintos. El
   administrador configura el primero; el repartidor captura el segundo.
2. Una combinación sabor/presentación es operable para un cliente solo cuando
   existe un `StockObjetivo` explícito, `Sabor.activo = true`,
   `SaborPresentacion.habilitada = true` y la presentación está permitida para
   el cliente. Para 1/2 litro esto exige `Cliente.manejaMedioLitro = true`.
   Un objetivo ausente excluye la combinación; `StockObjetivo.cantidad = 0`
   la mantiene en el surtido operativo.
3. Las capturas nuevas incluyen todas las combinaciones operables del cliente.
   Una cantidad de cero se registra explícitamente; una combinación omitida
   hace incompleto el snapshot. Los snapshots anteriores no se modifican.
4. Las cantidades son enteros no negativos. Antes de un levantamiento operativo
   se registra una visita del mismo cliente y repartidor. La BD fija
   `llegadaAt`; el celular no la envía. No hay salida, GPS, rutas ni tracking.
5. Guardar existencias genera automáticamente un pedido si alguna combinación
   necesita producción. Para cada una se calcula
   `cantidadNecesaria = max(stockObjetivo - existenciaActual, 0)`; solo se
   persisten detalles con faltante positivo. Si todos son cero, se conserva el
   snapshot sin pedido. `cantidadSugerida` y `cantidadSolicitada` coinciden en
   este slice. No hay edición libre de cantidades de producción.
6. Una corrección crea otra versión inmutable del snapshot. Solo el último
   registro de la cadena es vigente y puede corregirse de nuevo. Conserva
   cliente, repartidor, visita y combinaciones originales; valida el surtido
   vigente y recalcula faltantes con el objetivo actual en una transacción.
   El pedido anterior queda `SUSTITUIDO` y se crea uno `VIGENTE` solo si hay
   faltantes. `/produccion` consulta únicamente pedidos `VIGENTE` ligados al
   snapshot que sigue vigente; el detalle y el consolidado se derivan del
   mismo conjunto dentro de una lectura `RepeatableRead`.
7. Los totales conservan por separado unidades de 1 L y de 1/2 L. Los litros
   equivalentes se calculan como `unidades1L + unidades500ml * 0.5`.
8. Una desactivación impide nuevas operaciones con el catálogo desactivado,
   pero conserva los registros históricos que lo referencian.
9. Los catálogos y configuraciones modificables tienen `createdAt` y
   `updatedAt`. Los registros históricos y movimientos tienen `createdAt`
   como fecha/hora del evento; sus detalles toman esa fecha/hora de la
   cabecera, sin timestamps propios.
10. `StockObjetivoSucursal` es el objetivo base permanente en litros deseados
    tras abastecimiento. Es independiente de `StockObjetivo` de clientes,
    `ReporteInventarioSucursal` y `NecesidadSucursal`.
11. El reemplazo de objetivos de una sucursal es completo y transaccional.
    Cero se persiste explícitamente; una fila ausente no equivale a cero.
    Los objetivos existentes de sabores inactivos deben preservarse sin cambio
    al reemplazar el conjunto; no se pueden crear ni editar mientras el sabor
    permanezca inactivo.
12. La comparación usa únicamente el snapshot confirmado exacto de sucursal,
    fecha y turno seleccionados. Valores sin fila permanecen ausentes; la
    diferencia informativa se calcula como objetivo menos existencia solo
    cuando existen ambos. No genera pedidos ni reposición automática.
13. Los ajustes de cantidad por jornada pertenecen a otro slice y nunca
    sobrescriben este objetivo base. No se aplica al inventario de sucursales
    el umbral del 50% usado en el dominio de clientes externos.
14. La propuesta para fecha D usa exclusivamente el inventario VESPERTINO
    confirmado de D−1; no combina turnos ni usa borradores. La sugerencia es
    `max(objetivo − existencia, 0)` solo cuando ambas entradas existen.
    Cuando alguna falta, se marca `SIN_DATOS`, no se asigna sugerencia y Fer o
    Jonathan pueden ingresar una decisión manual explícita, incluso cero.
15. Una propuesta permanece BORRADOR hasta confirmación; la cantidad decidida
    es editable solo en borrador y requiere una entrada explícita para cada
    sabor activo. La confirmación la vuelve inmutable. Si cambia la fuente del
    borrador, la confirmación queda bloqueada; recalcular crea una nueva
    versión con nuevas sugerencias y decisiones manuales sin definir, dejando
    intacta la versión anterior. Una versión confirmada puede seguirse de una
    nueva versión, que tampoco sobrescribe el historial.

## Responsabilidades por vista

**Administrador:** crea y edita clientes; activa o desactiva clientes, sabores
y repartidores; configura `manejaMedioLitro`, sabores, disponibilidad de
presentaciones por sabor, stock objetivo de clientes y objetivo base de
sucursales; consulta existencias, pedidos y bitácora. Las presentaciones
iniciales se mantienen limitadas a 1 L y 1/2 L; no se crean tamaños
adicionales durante el MVP.

**Repartidor:** selecciona manualmente un repartidor activo y un cliente activo;
consulta objetivos, marca su llegada y registra existencias. No crea sabores ni
movimientos de bitácora de forma manual. El pedido nace al guardar el snapshot.

**Producción:** `/produccion` consulta de solo lectura los pedidos vigentes cuya
visita asociada ocurrió en la fecha local solicitada. La fecha se interpreta en
`BUSINESS_TIMEZONE` (por defecto `America/Mexico_City`); sin fecha, usa el día
calendario local anterior. La fecha de visita permanece como criterio aunque
el snapshot se haya corregido después. Muestra detalle por tienda y
consolidado por sabor/presentación a partir de `cantidadSolicitada`; fechas sin
pedidos devuelven una respuesta vacía. No permite editar ni enviar pedidos.
El flujo de Producción no implementa operaciones de sucursales ni producción
vespertina.

**Historial administrativo de visitas:** `/admin/visitas` consulta
`VisitaCliente.llegadaAt` como fuente de verdad, en el día calendario de
`BUSINESS_TIMEZONE` (por defecto `America/Mexico_City`). Sin fecha explícita,
usa hoy, a diferencia de Producción, que usa ayer. Los filtros de cliente y
repartidor son opcionales. Devuelve todas las visitas en orden descendente de
llegada, incluidas visitas repetidas y las vinculadas a clientes o repartidores
inactivos. No escribe, edita ni elimina visitas. Esta separación funcional no
es un control de acceso mientras no haya autenticación.

Estas vistas no constituyen una frontera de seguridad mientras no exista
autenticación.

## Flujo de registro de existencias

1. Al entrar a la vista, se selecciona un repartidor activo; después, un
   cliente activo.
2. El sistema muestra solo las combinaciones con `StockObjetivo` explícito,
   sabor activo, relación `SaborPresentacion` habilitada y presentación
   permitida para el cliente. Para clientes sin medio litro no muestra ni
   acepta filas de 1/2 litro. Un objetivo de cero sigue apareciendo.
3. El repartidor pulsa «Llegué a la tienda». El backend valida cliente y
   repartidor activos y registra `VisitaCliente.llegadaAt` con hora de BD.
   Cambiar cliente o repartidor exige una nueva llegada.
4. El repartidor introduce una cantidad no negativa para **cada** combinación,
   incluidos los ceros.
5. El backend valida la visita del mismo cliente y repartidor y que el snapshot
   sea completo; guarda una nueva cabecera ligada a la visita con sus detalles.
   Los registros anteriores a esta entidad conservan `visitaClienteId = null`
   y siguen siendo legibles. Nunca se sobrescriben.
6. En la misma transacción crea un movimiento `REGISTRO_EXISTENCIAS` con
   cliente, repartidor, fecha/hora y referencia al snapshot.
7. Calcula faltantes con el objetivo validado y los detalles persistidos. Si
   alguno es positivo, crea pedido, detalles y movimiento `PEDIDO_PRODUCCION`
   en la misma transacción. Los históricos anteriores no se completan
   retroactivamente.

## Flujo Reparto → Producción

Repartidor → seleccionarse → seleccionar cliente → marcar «Llegué» → registrar
llegada → capturar existencias → guardar levantamiento → calcular faltantes →
crear pedido automáticamente → permitir corrección versionada si hubo error →
Producción consulta al día siguiente por tienda y en consolidado.

El flujo termina con la corrección versionada, el pedido recalculado cuando es
necesario y la confirmación al repartidor. Producción consulta pedidos
vigentes agrupados por el día local de la llegada.

## Bitácora automática

Los movimientos previstos son `REGISTRO_EXISTENCIAS` y `PEDIDO_PRODUCCION`.
El segundo se crea solo si hubo faltantes. `VisitaCliente` es la fuente de verdad
de la llegada y no genera un movimiento adicional. La bitácora se consulta
desde Administrador en un slice futuro y sus entradas
se crean únicamente como efecto de guardar correctamente el registro o pedido
correspondiente. Cada entrada guarda exactamente una de las referencias
`registroExistenciasId` o `pedidoProduccionId`, de acuerdo con `tipo`. No hay
captura manual, ventas contables ni entradas para acciones futuras fuera del
MVP.
