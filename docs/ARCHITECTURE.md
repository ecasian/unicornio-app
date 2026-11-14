# Arquitectura del MVP — Yogurt Unicornio

## Alcance y estructura

Aplicación web modular, con frontend y backend separados, API REST y una base
PostgreSQL. Las vistas Administrador y Repartidor utilizan las mismas reglas de
dominio del backend. El MVP original no autenticaba; el slice
`feat/auth-rbac-audit` agrega usuarios internos, sesiones y permisos de backend.
La selección manual del repartidor permanece para el flujo, mientras que las
cuentas con rol `REPARTIDOR` quedan ligadas a un único repartidor.

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
| Consolidado de abastecimiento aprobado | Consulta de solo lectura de la última versión por sucursal/fecha y suma únicamente las decisiones confirmadas no obsoletas. |
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
| `UsuarioInterno` | `id`, `nombre`, correo normalizado único, `passwordHash` Argon2id, `activo`, `repartidorId` nullable único, timestamps | Tiene roles y sesiones; la relación opcional con `Repartidor` limita las operaciones del rol `REPARTIDOR`. |
| `Rol`, `Permiso` | `codigo` único y nombre/descripción | Catálogos sembrados por migración; la matriz se relaciona mediante `RolPermiso`. |
| `UsuarioRol`, `RolPermiso` | Claves compuestas de sus dos FKs, `assignedAt` para `UsuarioRol` | Permiten roles múltiples y permisos declarativos sin duplicar usuarios. FKs restrictivas. |
| `Sesion` | UUID, `tokenHash`, `csrfHash`, `usuarioId` nullable, `expiresAt`, `revokedAt`, `lastSeenAt` | El valor aleatorio del navegador nunca se guarda en claro. Sesiones anónimas temporales sirven para CSRF previo al login. |
| `EventoAuditoria` | `id`, actor nullable, acción, ruta, método, resultado, requestId, metadata sin cuerpo, `createdAt` | Append-only por triggers que bloquean UPDATE, DELETE y TRUNCATE; los eventos previos al login o legacy conservan actor nulo. |
| `IntentoAcceso` | `claveHash`, contador y ventana, `bloqueadoHasta`, `updatedAt` | Límites persistentes por hash de correo/IP y por IP; no almacena correos ni contraseñas en claro. |

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
16. El consolidado diario usa la fecha calendario de `BUSINESS_TIMEZONE` y
    selecciona una sola versión (la más reciente) por sucursal. Una última
    versión BORRADOR se presenta como `PENDIENTE` y oculta cualquier
    confirmación anterior; una versión obsoleta se presenta como
    `REQUIERE_REVISION`. Solo se suman `decisionLitros` de la última versión
    `CONFIRMADA` y vigente. Los detalles ausentes continúan como ausentes y el
    cero explícito permanece visible. Sucursales inactivas se incluyen para
    preservar la lectura histórica. El concentrado de cubetas, yogurt base,
    inventario disponible y pedidos de clientes son fuentes separadas y no se
    incluyen en este resumen. La lectura se ejecuta en `RepeatableRead` y no
    cambia propuestas ni estados.

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

**Consolidado de abastecimiento aprobado:**
`/produccion/abastecimiento-sucursales` consulta en `BUSINESS_TIMEZONE` una
fecha operativa (por defecto, hoy). Por cada sucursal muestra la última versión
de propuesta: solo una confirmada y no obsoleta aporta litros decididos al
detalle y consolidado; un borrador queda pendiente, una referencia obsoleta
requiere revisión y la ausencia de propuesta se señala aparte. El total usa
Decimal exacto y no representa producción fabricada ni inventario disponible.
El concentrado de sucursales, YogurtBase y pedidos de clientes externos no se
combinan con esta consulta. La vista es de solo lectura.

**Historial administrativo de visitas:** `/admin/visitas` consulta
`VisitaCliente.llegadaAt` como fuente de verdad, en el día calendario de
`BUSINESS_TIMEZONE` (por defecto `America/Mexico_City`). Sin fecha explícita,
usa hoy, a diferencia de Producción, que usa ayer. Los filtros de cliente y
repartidor son opcionales. Devuelve todas las visitas en orden descendente de
llegada, incluidas visitas repetidas y las vinculadas a clientes o repartidores
inactivos. No escribe, edita ni elimina visitas. La ruta requiere el permiso
`visitas:read`; la autorización no cambia la fuente ni el contrato de consulta.

## Autenticación, permisos y auditoría

### Mismo origen y proxy

La SPA y la API se publican bajo el origen del Frontend. El cliente usa
`/api/...` relativo. En desarrollo, Vite escucha en `http://127.0.0.1:4173` y
proxy `/api` a `API_PROXY_TARGET` (por defecto `http://127.0.0.1:3000`). Esta
variable no lleva prefijo `VITE_` y no se incluye en el bundle.

El contenedor de Frontend ejecuta Caddy. `Caddyfile` atiende primero `/api` y
`/api/*` con `reverse_proxy {$BACKEND_UPSTREAM}` sin reescribir la ruta. El
proxy conserva método, query, body, cookies y encabezados `Set-Cookie`; las
rutas restantes usan `try_files {path} /index.html` para el fallback SPA. Si
Backend no responde, `/api/*` entrega error de proxy (502), nunca `index.html`.
`BACKEND_UPSTREAM` es una URL runtime completa, incluyendo host privado y el
puerto interno exacto informado por la plataforma. Caddy escucha en `PORT`
asignado al servicio.

### Sesiones y CSRF

`PUBLIC_ORIGIN` es obligatorio y debe ser el origen exacto, sin path ni barra
final. Las únicas rutas públicas son `GET /api/health`, `GET /api/auth/csrf` y
`POST /api/auth/login`; el resto requiere sesión autenticada y permiso
explícito. Las rutas sin matriz de permiso se deniegan por defecto.

El backend genera un token de sesión aleatorio de 256 bits y guarda solo su
SHA-256 en PostgreSQL. La cookie de sesión es host-only, `HttpOnly`,
`SameSite=Lax`, `Path=/`, con duración fija de 8 horas; se llama `__Host-...`
y agrega `Secure` cuando `PUBLIC_ORIGIN` usa HTTPS. No contiene atributo
`Domain`. El token CSRF queda ligado a la fila de sesión: una cookie no
HttpOnly separada permite conservar un token sincronizador estable entre
pestañas, y el cliente lo envía en `X-CSRF-Token` en cambios de estado.
Toda escritura valida que `Origin` coincida exactamente con `PUBLIC_ORIGIN` y
que el hash CSRF corresponda a la sesión. No se usa JWT ni `localStorage`.

Contraseña: Argon2id, 64 MiB de memoria, 3 iteraciones, paralelismo 1 y hash de
32 bytes. El login usa respuesta genérica para correo/contraseña incorrectos y
límites persistentes de 10 intentos por combinación de correo/IP y 100 por IP
en 15 minutos. El backend usa la IP observada por su servidor HTTP; la
topología de staging deberá mantenerlo accesible solo desde el proxy privado.

### Matriz de roles

| Rol | Acceso |
| --- | --- |
| `ADMIN_GENERAL` | Todos los permisos; puede administrar usuarios y roles, y consultar auditoría. |
| `ADMIN_SUCURSALES` | Lectura/gestión de sucursales, inventarios por turno y propuestas de abastecimiento. |
| `REPARTIDOR` | Lectura de clientes, catálogo y stock objetivo de clientes; registrar visitas y existencias; solo el `Repartidor` asignado a su usuario. |
| `OPERADOR_PRODUCCION` | Lectura/registro de Producción y YogurtBase; lectura de catálogo, sucursales, inventarios y abastecimiento aprobado. |

La matriz de permisos es persistente en `Rol`, `Permiso` y `RolPermiso`; el
backend resuelve permiso por método/ruta y deniega rutas no registradas.
Frontend oculta opciones no autorizadas, protege rutas profundas y muestra
403. Cambiar roles, desactivar usuario o restablecer contraseña revoca sesiones
activas. No se permite desactivar ni quitar el rol al último administrador
general activo; un advisory lock serializa esos cambios concurrentes.

El bootstrap del primer administrador requiere terminal interactiva, solicita
contraseña sin mostrarla, comprueba que no haya un administrador activo y usa
un lock de base. El evento de bootstrap tiene actor nulo porque todavía no
existía una sesión autenticada. No hay usuario ni contraseña por defecto.

### Auditoría

Cada mutación HTTP agrega `MUTATION_REQUESTED` antes del controller. Al resolver
la operación, agrega `MUTATION_SUCCEEDED`; si falla, registra
`MUTATION_FAILED` después del rollback del servicio. Los eventos terminales
usan `requestId` generado por Backend y un índice PostgreSQL único parcial que
permite como máximo un resultado terminal por solicitud. Reintentar la misma
escritura terminal es idempotente; un resultado terminal incompatible se
rechaza. La API no presenta éxito si no puede persistir el evento terminal:
responde 503 e incluye el `requestId` en el encabezado de respuesta para
revisión antes de reintentar.

Los terminales `MUTATION_SUCCEEDED` de las operaciones transaccionales se
insertan con el actor autenticado dentro de la misma transacción PostgreSQL que
la mutación. La respuesta de éxito se emite después del commit. Esto aplica a
autenticación (login/logout/administración), visitas, captura y corrección de
existencias con sus pedidos y movimientos, captura/confirmación de inventario
por turno, lotes y acondicionamientos de YogurtBase, propuestas (crear,
decidir, recalcular y confirmar), necesidades de sucursales (guardar y
confirmar), reemplazos de objetivos de stock y presentaciones de sabores. El
interceptor HTTP intenta registrar el terminal al resolver la ruta; si ya fue
escrito en la transacción, reconoce el mismo resultado y no crea otro evento.
Un fallo al escribir el éxito dentro de la transacción revierte también la
mutación.

Las altas y ediciones de clientes, sabores, repartidores y sucursales también
guardan `MUTATION_SUCCEEDED` en la misma transacción Prisma que el cambio. Si
la auditoría no puede insertarse, el cambio se revierte; el interceptor reconoce
el terminal existente y no duplica el evento. Cuando una operación falla y su
transacción revierte, el interceptor agrega `FAILED`; si la escritura de ese
terminal también falla, `REQUESTED` permanece sin terminal y significa
resultado desconocido hasta reconciliarlo por `requestId`. Ese ID correlaciona
auditoría, pero no vuelve idempotente la operación de negocio. No existe todavía
una ruta de entrega/surtido físico que registrar.
Antes de reintentar se debe seguir el contrato de cada ruta: por ejemplo,
acondicionamientos usan `claveSolicitud` con validación de mismo payload;
los reemplazos `PUT` de objetivos y presentaciones vuelven a guardar el estado
completo; confirmaciones inmutables pueden responder conflicto al segundo
intento; las capturas de existencias/correcciones crean snapshots versionados;
crear lotes, visitas y propuestas puede crear otro registro/versión; y guardar
un borrador de inventario o necesidades reemplaza el borrador identificado por
su clave de negocio. Ante `REQUESTED` sin terminal, primero se consulta el
estado del recurso para aplicar ese contrato; no se reenvía ciegamente un
`POST`. Los eventos no se editan ni eliminan.

Se guardan ruta, método, request ID, parámetros de ruta, ID de recurso devuelto
y status HTTP de errores; nunca el cuerpo, credenciales, hashes de correo,
cookies o tokens. Las denegaciones de sesión, permiso, CSRF y ámbito de
repartidor se registran antes de responder; si el registro falla, el Backend
falla cerrado con 503. `EventoAuditoria` es append-only: triggers bloquean
`UPDATE`, `DELETE` y `TRUNCATE`. Los registros/movimientos históricos no se
editan ni reciben actor retroactivo.

### Validación local y rollout de autenticación

El Quality Gate local usa PostgreSQL aislado y prueba el proxy Vite, cookies
HTTP locales, CSRF, permisos y auditoría. No valida atributos de cookie
`Secure`, TLS ni el proxy Railway. Antes de staging:

1. Confirmar el dominio HTTPS exacto en `PUBLIC_ORIGIN` y el upstream privado
   completo en `BACKEND_UPSTREAM`; Caddy debe ser el único proxy al Backend,
   y `trust proxy = 1` presupone exactamente ese salto.
2. Revisar logs de `REQUESTED` sin terminal y verificar que el índice parcial
   pueda crearse sin duplicados históricos; aplicar migraciones con
   `prisma migrate deploy`, sin reset.
3. Desplegar Backend y proxy Frontend; probar cookie host-only `Secure`,
   `HttpOnly`, `SameSite=Lax`, Origin/CSRF, 401/403, expiración, revocación,
   límites de login y matriz de roles antes de uso real.

El rollback de aplicación es a una versión compatible conservando la
migración y los eventos append-only. No retirar el índice parcial ni resetear
la base como rollback. Si auth o auditoría falla, cerrar escrituras y restaurar
la versión compatible; conservar Backend accesible solo por Caddy y revisar
solicitudes pendientes por `requestId` antes de reintentar. Staging y
producción siguen sin validarse desde este entorno.

### Variables de despliegue futuro

- Frontend: Dockerfile de `frontend/`, `BACKEND_UPSTREAM` con URL privada completa y `PORT` inyectado.
- Backend: `PUBLIC_ORIGIN` con el dominio HTTPS exacto del Frontend; `DATABASE_URL` existente y `BUSINESS_TIMEZONE` conservadas.
- Build de frontend: no requiere `VITE_API_URL`; todas las llamadas son relativas.
- Backend no debe exponerse como origen público para usar `X-Forwarded-For` con confianza; Caddy debe ser su único proxy de entrada.

Estas variables están documentadas para un deploy futuro. Railway no se ha
cambiado ni desplegado en este slice. Antes de considerar autenticación lista
para operación real, staging debe validar cookie `Secure`, proxy, CSRF,
sesiones revocables, códigos 401/403 y la matriz por endpoint.

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
