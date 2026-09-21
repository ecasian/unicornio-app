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
- generar reposición
- ajustar cantidades
- enviar pedido a producción

Las vistas representan flujos de trabajo, no permisos de seguridad.
No hay autenticación ni usuarios reales en el MVP.

## Repartidores

Existe un catálogo simple `Repartidor` con únicamente `id`, `nombre`,
`activo`, `createdAt` y `updatedAt`.
La vista Repartidor requiere seleccionar un repartidor activo antes de registrar
existencias o enviar un pedido. Su ID se conserva en los registros y movimientos.
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

La sugerencia inicial se obtiene mediante:

stock objetivo - existencia actual

Nunca permitir cantidades negativas.

La cantidad sugerida puede modificarse antes de enviar
el pedido a producción.
La reposición es un cálculo de dominio derivado de `StockObjetivo` y
`RegistroExistencias`; no es una entidad persistente.
Debe existir un registro de existencias antes de crear un pedido.
Solo se puede usar el snapshot más reciente del cliente; no se seleccionan
snapshots históricos. Si el más reciente ya tiene un pedido, se requiere un
nuevo levantamiento. También se requiere uno nuevo si cambió el conjunto de
combinaciones operables desde ese snapshot.
Cada registro de existencias puede generar como máximo un pedido en el MVP.
En cada detalle del pedido se conservan `cantidadSugerida` y
`cantidadSolicitada`.

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
