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
  modules/             clientes, catalogo, stock-objetivo, existencias,
                       reposicion, pedidos, bitacora, repartidores
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
| Stock objetivo | Cantidades configuradas por el administrador. |
| Existencias | Captura y consulta de snapshots completos e históricos. |
| Reposición | Servicio de dominio que calcula la sugerencia a partir del objetivo y el snapshot vigente; no persiste una entidad `Reposicion`. |
| Pedidos a producción | Cantidades sugeridas y solicitadas, envío y consulta. |
| Bitácora | Registro automático y consulta de movimientos. |

El botón «Sucursales» permanece visible e inactivo. No tiene modelo, API ni
lógica. «Registro de ventas» en los mockups se interpreta como Bitácora/Historial
de movimientos, sin ventas contables.

## Entidades y relaciones

| Entidad | Campos principales | Relaciones |
| --- | --- | --- |
| `Cliente` | `id`, `nombre`, `celular`, `direccion`, `manejaMedioLitro`, `activo`, `createdAt`, `updatedAt` | Tiene objetivos, snapshots, pedidos y movimientos. No se relaciona con sucursales. |
| `Repartidor` | `id`, `nombre`, `activo`, `createdAt`, `updatedAt` | Identifica al autor de snapshots, pedidos y movimientos. No tiene otros campos en el MVP. |
| `Sabor` | `id`, `nombre`, `activo`, `createdAt`, `updatedAt` | Se relaciona con presentaciones mediante `SaborPresentacion` y aparece en los detalles. |
| `Presentacion` | `id`, `nombre`, `litrosEquivalentes`, `createdAt`, `updatedAt` | Valores iniciales: 1 litro (`1`) y 1/2 litro (`0.5`); no se crean otros tamaños en el MVP. |
| `SaborPresentacion` | `saborId`, `presentacionId`, `habilitada`, `createdAt`, `updatedAt` | Una combinación única por sabor y presentación. |
| `StockObjetivo` | `clienteId`, `saborId`, `presentacionId`, `cantidad`, `createdAt`, `updatedAt` | Una combinación única por cliente, sabor y presentación; su existencia define el surtido configurado. |
| `RegistroExistencias` | `id`, `clienteId`, `repartidorId`, `createdAt` | Cabecera inmutable de un snapshot; tiene detalles y, como máximo, un pedido. `createdAt` es la fecha/hora del levantamiento. |
| `DetalleExistencias` | `registroExistenciasId`, `saborId`, `presentacionId`, `cantidad` | Una fila por combinación operable; hereda la fecha/hora de su cabecera. |
| `PedidoProduccion` | `id`, `clienteId`, `repartidorId`, `registroExistenciasId`, `createdAt` | Referencia obligatoria y única al snapshot más reciente; tiene detalles. `createdAt` es la fecha/hora del pedido. |
| `DetallePedido` | `pedidoProduccionId`, `saborId`, `presentacionId`, `cantidadSugerida`, `cantidadSolicitada` | Una fila por combinación del pedido; hereda la fecha/hora de su cabecera. |
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
4. Las cantidades son enteros no negativos. Para cada combinación operable,
   la sugerencia es `max(stockObjetivo.cantidad - existenciaActual, 0)`.
   Una combinación sin objetivo no entra en este cálculo.
5. El pedido requiere el snapshot más reciente del mismo cliente. No se puede
   elegir uno histórico. Cada snapshot genera como máximo un pedido; si el
   más reciente ya tiene uno, se necesita un nuevo levantamiento. También se
   necesita uno nuevo si las combinaciones operables actuales difieren de las
   incluidas en ese snapshot.
6. Al crear el pedido se guarda tanto `cantidadSugerida` como
   `cantidadSolicitada` por detalle. La primera refleja el cálculo en ese
   momento; la segunda refleja el ajuste final del repartidor. Los cambios
   posteriores de objetivos o existencias no reescriben el pedido.
7. Los totales conservan por separado unidades de 1 L y de 1/2 L. Los litros
   equivalentes se calculan como `unidades1L + unidades500ml * 0.5`.
8. Una desactivación impide nuevas operaciones con el catálogo desactivado,
   pero conserva los registros históricos que lo referencian.
9. Los catálogos y configuraciones modificables tienen `createdAt` y
   `updatedAt`. Los registros históricos y movimientos tienen `createdAt`
   como fecha/hora del evento; sus detalles toman esa fecha/hora de la
   cabecera, sin timestamps propios.

## Responsabilidades por vista

**Administrador:** crea y edita clientes; activa o desactiva clientes, sabores
y repartidores; configura `manejaMedioLitro`, sabores, disponibilidad de
presentaciones por sabor y stock objetivo; consulta existencias, pedidos y
bitácora. Las presentaciones iniciales se mantienen limitadas a los tamaños
de 1 L y 1/2 L; no se crean tamaños adicionales durante el MVP.

**Repartidor:** selecciona manualmente un repartidor activo y un cliente activo;
consulta objetivos; registra existencias; revisa la reposición sugerida; ajusta
cantidades y envía el pedido. No crea sabores ni movimientos de bitácora de
forma manual.

Estas vistas no constituyen una frontera de seguridad mientras no exista
autenticación.

## Flujo de registro de existencias

1. Al entrar a la vista, se selecciona un repartidor activo; después, un
   cliente activo.
2. El sistema muestra solo las combinaciones con `StockObjetivo` explícito,
   sabor activo, relación `SaborPresentacion` habilitada y presentación
   permitida para el cliente. Para clientes sin medio litro no muestra ni
   acepta filas de 1/2 litro. Un objetivo de cero sigue apareciendo.
3. El repartidor introduce una cantidad no negativa para **cada** combinación,
   incluidos los ceros.
4. El backend valida que el snapshot sea completo y guarda una nueva cabecera
   con sus detalles. Nunca sobrescribe un registro anterior.
5. En la misma transacción crea un movimiento `REGISTRO_EXISTENCIAS` con
   cliente, repartidor, fecha/hora y referencia al snapshot.

## Flujo de pedido a producción

1. Se obtiene exclusivamente el snapshot más reciente del cliente. Si no
   existe, no se puede crear un pedido; si ya tiene pedido, se requiere un
   nuevo snapshot. Se requiere uno nuevo si cambió el conjunto de
   combinaciones operables. No se eligen snapshots históricos.
2. El backend calcula la sugerencia para cada combinación operable con el
   stock objetivo y las existencias del snapshot, sin negativos.
3. El repartidor revisa y ajusta las cantidades solicitadas, también sin
   negativos. Se mantienen separados los envases de 1 L y 1/2 L y se muestran
   los litros equivalentes.
4. Al enviar, el backend vuelve a validar cliente, repartidor, combinaciones,
   snapshot y unicidad de pedido por snapshot. Guarda `cantidadSugerida` y
   `cantidadSolicitada` en cada detalle.
5. En la misma transacción crea un movimiento `PEDIDO_PRODUCCION` con cliente,
   repartidor, fecha/hora y referencia al pedido.

## Bitácora automática

Solo los dos eventos iniciales generan movimientos: `REGISTRO_EXISTENCIAS` y
`PEDIDO_PRODUCCION`. La bitácora se consulta desde Administrador y sus entradas
se crean únicamente como efecto de guardar correctamente el registro o pedido
correspondiente. Cada entrada guarda exactamente una de las referencias
`registroExistenciasId` o `pedidoProduccionId`, de acuerdo con `tipo`. No hay
captura manual, ventas contables ni entradas para acciones futuras fuera del
MVP.
