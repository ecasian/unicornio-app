# Proyecto Unicornio

## Objetivo

Construir un sistema modular para controlar clientes externos,
existencias y pedidos de producción de Yogurt Unicornio.

El desarrollo debe realizarse incrementalmente.
No construir características fuera del alcance solicitado.

## Principios

- Arquitectura modular.
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
- definir stock objetivo
- habilitar venta de medios litros
- administrar sabores
- administrar presentaciones
- consultar existencias
- consultar pedidos a producción
- consultar bitácora de movimientos

### Repartidor

Puede:

- seleccionar cliente
- registrar existencias
- consultar stock objetivo
- generar reposición
- ajustar cantidades
- enviar pedido a producción

## Clientes

Cada cliente representa una tienda externa.

Campos iniciales:

- nombre
- celular
- dirección
- manejaMedioLitro
- activo

No existe relación cliente -> sucursal.

## Sucursales

Unicornio tiene cinco sucursales propias.

El módulo de sucursales NO pertenece al MVP actual.

Mantener el botón visible pero sin funcionalidad.

## Productos

Producto representa un sabor.

Ejemplo:

- Fresa
- Nuez
- Ciruela

Las presentaciones son independientes:

- 1 litro
- 1/2 litro

Un cliente puede tener deshabilitada la presentación de 1/2 litro.

## Stock

Existen dos conceptos diferentes:

1. stock objetivo
2. existencia registrada

El stock objetivo lo configura el administrador.

La existencia la registra el repartidor.

No mezclar ambos conceptos.

## Reposición

La sugerencia inicial se obtiene mediante:

stock objetivo - existencia actual

Nunca permitir cantidades negativas.

La cantidad sugerida puede modificarse antes de enviar
el pedido a producción.

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
- referencia al registro correspondiente

El repartidor no crea manualmente entradas en la bitácora.

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