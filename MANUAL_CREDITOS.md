# Manual de Uso y Operación Técnica
## Sistema de Aprobación de Créditos de Consumo mediante Flujos Dinámicos (BPM)
**Versión:** 1.0.0 &middot; **Entorno:** Producción / Banca Privada &middot; **Arquitectura:** Node.js, SQLite WAL & React

---

## 1. Resumen Ejecutivo de la Arquitectura

El **Sistema de Aprobación de Créditos de Consumo** es una plataforma tecnológica diseñada bajo principios de **Business Process Management (BPM)** y **Event Sourcing**, orientada al sector bancario y Fintech. Su propósito es orquestar de manera automatizada, auditable y segura el ciclo de vida completo de una solicitud de crédito, desde su captura inicial hasta su resolución colegiada o aprobación directa.

```
                              ARQUITECTURA DE LA SOLUCIÓN
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                   FRONTEND: REACT + VITE + TAILWIND CSS                     │
  │        (Estética Fintech Dark: Slate-950, Superficies Carbón y Esmeralda)    │
  └──────────────────────────────────────┬──────────────────────────────────────┘
                                         │  HTTP / REST JSON (Proxy Inverso :5173 -> :3000)
                                         ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                   BACKEND: NODE.JS + EXPRESS (API CORE)                     │
  │  - Helmet (CSP, HSTS)        - Trust Proxy (RFC Forwarded-For)              │
  │  - Rate Limiter Estricto     - Sanitización Anti-XSS y Anti-SQLi            │
  └───────────────────┬─────────────────────────────────────┬───────────────────┘
                      │                                     │
                      ▼                                     ▼
        ┌───────────────────────────┐         ┌───────────────────────────┐
        │  MOTOR DE REGLAS (BRE)    │         │ MOTOR DE ESTADOS (BPM)    │
        │ - Evaluación Cuota/Ingreso │         │ - Patrón Fork / Join      │
        │ - Umbrales de Aprobación  │         │ - Sincronización Tareas   │
        └─────────────┬─────────────┘         └─────────────┬─────────────┘
                      │                                     │
                      └──────────────────┬──────────────────┘
                                         │
                                         ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                 BASE DE DATOS: SQLITE EN MODO WAL (HIGH CONCURRENCY)        │
  │  - PRAGMA journal_mode = WAL; (Lecturas concurrentes sin bloqueo de I/O)    │
  │  - Triggers WORM con RAISE(ABORT, ...) -> Inmutabilidad Absoluta            │
  └─────────────────────────────────────────────────────────────────────────────┘
```

### Características Técnicas Clave
* **Backend de Baja Latencia:** Construido sobre Node.js y Express, optimizado para registrar latencias sub-milisegundo en sondas de diagnóstico (`/health`).
* **Almacenamiento SQLite WAL:** Configurado en modo *Write-Ahead Logging* (`PRAGMA journal_mode = WAL;` y `PRAGMA synchronous = NORMAL;`), eliminando cuellos de botella de escritura y habilitando alta concurrencia.
* **Seguridad de Grado Financiero:** Hardening mediante cabeceras HTTP restrictivas (Helmet), validación de IPs reales tras proxies (`trust proxy`), limitadores de tráfico contra DoS (`express-rate-limit`) y sanitización estricta por lista blanca.
* **Experiencia de Usuario Fintech:** Interfaz de usuario React desarrollada con Vite y Tailwind CSS, implementando un diseño de banca privada oscura (`#080B11`, `bg-slate-900`, `border-slate-800`), insignias con emisión de luz (*glow effects*) y actualización reactiva de estados.

---

## 2. Rol Analista / Asesor: Captura de Solicitud y Motor DTI

El Asesor u Oficial de Crédito interactúa principalmente con la pestaña **"Nueva Solicitud de Crédito"** para ingresar expedientes de clientes en el sistema.

```
       [ Formulario Asesor ] ──(Entrada de Datos)──► [ Simulador DTI en Vivo ]
                                                              │
                                                              ▼ (Envío POST)
                                                  [ Motor Decisional BPM ]
                                                              │
                    ┌─────────────────────────────────────────┼────────────────────────────────────────┐
                    ▼                                         ▼                                        ▼
         [ APROBACIÓN DIRECTA ]                     [ TAREAS PARALELAS ]                    [ REVISIÓN DE RIESGO ]
            - Riesgo: Bajo                             - Riesgo: Medio                         - Riesgo: Alto
            - Monto <= $5,000                          - Verificación Domicilio                - Monto > $15,000 o
            - Ingresos > $1,000                        - Referencias Telefónicas                 Ingresos < $500
```

### 2.1 Campos Obligatorios del Formulario
1. **Nombre Completo:** Validación alfabética estricta con tildes y diéresis (3 a 80 caracteres). Se bloquea cualquier intento de inserción de scripts o etiquetas HTML.
2. **Cédula / Identificación:** Identificador alfanumérico institucional (6 a 15 caracteres) sin espacios ni metacaracteres.
3. **Ingresos Mensuales Netos ($ USD):** Valor numérico mayor o igual a \$100.
4. **Monto Solicitado ($ USD):** Capital a financiar (mínimo \$500, máximo \$500,000).
5. **Plazo en Meses:** Selector dinámico mediante chips de plazo: 12, 24, 36, 48 o 60 meses.

### 2.2 Simulador Heurístico DTI (*Debt-to-Income*) en Tiempo Real
A medida que el asesor digita los ingresos y el monto, el componente ejecuta un cálculo proyectado en el navegador:

$$\text{Cuota Mensual Estimada} = \frac{\text{Monto Solicitado} \times (1 + \text{Tasa Mensual} \times \text{Plazo})}{\text{Plazo}}$$

$$\text{Ratio DTI (\%)} = \left( \frac{\text{Cuota Mensual Estimada}}{\text{Ingresos Mensuales Netos}} \right) \times 100$$

El simulador categoriza instantáneamente el expediente en una de las tres zonas de riesgo antes de que se confirme el envío al servidor.

### 2.3 Interpretación de la Decisión Instantánea del Motor BPM
Al presionar **"Procesar en Motor BPM"**, el backend evalúa las reglas de negocio y devuelve una tarjeta con la decisión vinculante:

| Decisión Asignada | Nivel de Riesgo | Condición de Regla | Acción Operativa del Sistema |
| :--- | :--- | :--- | :--- |
| **`Aprobado`** | `Bajo` | Monto $\le \$5,000$ e Ingresos $> \$1,000$. | Crédito aprobado automáticamente. No requiere verificaciones de campo. |
| **`Tareas_Paralelas`** | `Medio` | Monto en rango medio con capacidad de pago estándar. | **Patrón BPM Fork:** El sistema crea automáticamente tareas concurrentes para el equipo de operaciones. |
| **`Revision_Riesgo`** | `Alto` | Monto $> \$15,000$ o Ingresos $< \$500$. | Escalado a la bandeja del Comité de Crédito para dictamen colegiado. |

---

## 3. Gestión de Tareas Paralelas (Patrón BPM Fork-Join)

Para solicitudes en estado **`Tareas_Paralelas`**, el sistema activa un sub-proceso de sincronización concurrente (*Fork-Join Gateway*).

```
                           [ SOLICITUD EN 'Tareas_Paralelas' ]
                                            │
                                            ▼ (PATRÓN FORK)
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
          [ Verificación Domicilio ]                   [ Referencias Telefónicas ]
             (Oficial de Campo)                           (Operador Telefónico)
                     │                                             │
                     └──────────────────────┬──────────────────────┘
                                            │
                                            ▼ (PATRÓN JOIN)
                                   ¿Resolución de Tareas?
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
            [ Alguna Rechazada ]                         [ Todas Completadas ]
                     │                                             │
                     ▼                                             ▼
             ESTADO: RECHAZADO                             ESTADO: APROBADO
```

### 3.1 Operación desde el Panel Lateral (*Drawer*)
1. En el **Directorio de Solicitudes**, haga clic sobre cualquier registro en estado amarillo (`Tareas_Paralelas`) o pulse el botón **"Trazabilidad"**.
2. Se desplegará el panel lateral con la sección **"Sub-flujos Concurrentes (Tareas Paralelas)"**.
3. Cada tarea presenta su tipo (`Verificacion_Domicilio`, `Referencias_Telefonicas`), operador asignado y botones de acción rápida:
   * **Marcar Completada (Botón Verde):** Registra el visto bueno de la verificación de campo con fecha y sello de operador.
   * **Rechazar (Botón Rojo):** Notifica inconsistencias graves (ej. dirección inexistente o referencias no coincidentes).

### 3.2 Lógica de la Compuerta Join (Convergencia)
* **Cortocircuito por Rechazo:** Si un operador marca cualquiera de las tareas como `Rechazada`, el motor Join actualiza inmediatamente el crédito a estado **`Rechazado`**, interrumpiendo el flujo y registrando el evento en la auditoría.
* **Aprobación por Convergencia Plena:** Cuando **todas** las tareas concurrentes alcanzan el estado `Completada`, la compuerta Join transiciona automáticamente la solicitud a **`Aprobado`**.
* **Estado Intermedio:** Mientras existan tareas en estado `Pendiente`, el proceso permanece en `Tareas_Paralelas`, indicando en el panel el progreso exacto (ej. *1/2 tareas resueltas*).

---

## 4. Auditoría Inmutable (WORM: Write Once, Read Many)

La tabla `bitacora_auditoria` funciona como un libro contable digital inalterable (*Append-Only Event Sourcing*), garantizando cumplimiento con las normas **SOX 404**, **ISO 27001 (A.12.4)** y regulaciones de la Superintendencia Bancaria.

```
                  INTENTO DE MODIFICACIÓN O BORRADO EN AUDITORÍA
  
          Sentencia SQL (UPDATE / DELETE)
                         │
                         ▼
           ┌────────────────────────────┐
           │ TRIGGER SQLITE (BEFORE)    │
           │ trg_prevent_update_...     │
           │ trg_prevent_delete_...     │
           └─────────────┬──────────────┘
                         │
                         ▼
           ┌────────────────────────────┐
           │     SELECT RAISE(ABORT)    │
           └─────────────┬──────────────┘
                         │
                         ▼
        ╔════════════════════════════════════════════════╗
        ║ ERROR CRÍTICO: VIOLACIÓN DE AUDITORÍA         ║
        ║ Transacción cancelada. El registro no cambia. ║
        ╚════════════════════════════════════════════════╝
```

### 4.1 Definición Técnica de los Triggers de SQLite
A nivel de base de datos (`database.js`), se compilaron dos disparadores nativos que interceptan cualquier operación DML destructiva:

```sql
-- 1. Bloqueo total de modificaciones (UPDATE)
CREATE TRIGGER IF NOT EXISTS trg_prevent_update_bitacora_auditoria
BEFORE UPDATE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion UPDATE denegada.');
END;

-- 2. Bloqueo total de eliminaciones (DELETE)
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_bitacora_auditoria
BEFORE DELETE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion DELETE denegada.');
END;
```

### 4.2 Evidencia de Protección ante Intentos de Alteración
Si un usuario con privilegios de administrador intenta ejecutar:
```sql
UPDATE bitacora_auditoria SET resultado = 'ALTERADO' WHERE id = 1;
DELETE FROM bitacora_auditoria WHERE id = 1;
```
El motor SQLite aborta de inmediato la transacción con el código de excepción:
```text
SQLITE_CONSTRAINT: VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion UPDATE denegada.
```

---

## 5. Matriz de Credenciales y Usuarios de Prueba

Para propósitos de pruebas funcionales, auditoría interna y verificación de la API, se define la siguiente matriz de identidades (transmitidas mediante la cabecera HTTP `x-user-id`):

| Rol / Función | Identificador (`x-user-id`) | Área Operativa | Permisos en el Sistema |
| :--- | :--- | :--- | :--- |
| **Oficial de Crédito Digital** | `ASESOR_CANAL_DIGITAL` | Ventas y Captación | Creación de solicitudes, visualización de estado en directorio y simulación DTI. |
| **Verificador Domiciliario** | `OFICIAL_VERIFICACION_DOMICILIO` | Operaciones de Campo | Resolución (Completar/Rechazar) de la tarea `Verificacion_Domicilio`. |
| **Analista de Referencias** | `OFICIAL_REFERENCIAS_TELEFONICAS` | Call Center / Mesa de Control | Resolución de la tarea `Referencias_Telefonicas`. |
| **Comité de Riesgos Senior** | `COMITE_RIESGOS_CENTRAL` | Gerencia de Riesgo | Transición manual de créditos en estado `Revision_Riesgo` (`/transicionar`). |
| **Auditor de Cumplimiento** | `AUDITOR_INTERNO_SOX` | Auditoría y Forense | Inspección de la bitácora inmutable y verificación criptográfica de integridad. |

---

## 6. Guía de Arranque y Comandos de Operación

### 6.1 Requisitos Previos
* **Node.js:** Versión 18.x, 20.x o superior.
* **Gestor de Paquetes:** npm v9+ o v10+.
* **Navegador:** Chrome, Edge, Firefox o Safari con soporte moderno de CSS/ES6.

### 6.2 Puesta en Marcha del Backend (API Core)
Abra una terminal en la carpeta principal del proyecto:

```bash
# 1. Instalar dependencias del backend (Express, SQLite3, Helmet, Rate-Limit, Dotenv)
npm install

# 2. Iniciar el servidor en modo desarrollo (con reinicio automático)
npm run dev

# Alternativa: Iniciar en modo estándar de producción
npm start
```
* **Puerto Backend:** `http://localhost:3000`
* **Sonda de Salud:** `http://localhost:3000/health`

### 6.3 Puesta en Marcha del Frontend (Interfaz Fintech)
En una segunda terminal, diríjase a la carpeta del cliente web:

```bash
# 1. Ingresar a la carpeta del frontend
cd frontend-creditos

# 2. Instalar dependencias de UI (React, Vite, Tailwind CSS, Lucide Icons)
npm install

# 3. Iniciar el servidor de desarrollo Vite
npm run dev
```
* **Puerto Frontend:** `http://localhost:5173` (El proxy interno redirige `/api` automáticamente al puerto `3000`).

---

## 7. Catálogo de Comandos de Pruebas Automatizadas

El sistema incluye tres suites de pruebas unitarias y de estrés que pueden ejecutarse en cualquier momento desde la terminal raíz:

```bash
# 1. Validar SQLite WAL y Triggers de Inmutabilidad WORM
npm run test:db

# 2. Validar Ciclo de Vida BPM, Fork-Join y Endpoints REST
npm run test:api

# 3. Validar Hardening (Mitigación XSS, Inyección SQL y Rate Limiter)
npm run test:security
```

---

## 8. Resumen de Endpoints de la API REST (`/api/v1`)

| Método | Endpoint | Middleware / Seguridad | Descripción Funcional |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Telemetría en tiempo real: estado de SQLite WAL, latencia y memoria. |
| `POST` | `/api/v1/creditos` | Rate Limit (10 req/15min) + Anti-XSS | Crea la solicitud y evalúa las reglas instantáneas del motor BPM. |
| `GET` | `/api/v1/creditos` | Rate Limit General (150 req/15min) | Lista solicitudes con filtros opcionales (`?estado=`, `?cedula=`). |
| `GET` | `/api/v1/creditos/:id` | Rate Limit General | Obtiene detalle consolidado: solicitud, tareas paralelas y bitácora. |
| `PATCH`| `/api/v1/creditos/:id/transicionar` | Requiere `x-user-id` y motivo | Transición manual de estado auditada (para comités de riesgo). |
| `GET` | `/api/v1/tareas` | Rate Limit General | Consulta de tareas paralelas con filtro por operador y solicitud. |
| `PATCH`| `/api/v1/tareas/:id/completar` | Auditoría Automática | Dictamina una tarea (`Completada`/`Rechazada`) y evalúa la compuerta Join. |
| `GET` | `/api/v1/auditoria` | Solo lectura | Consulta histórica forense de todos los eventos registrados. |
| `GET` | `/api/v1/auditoria/verificar-integridad` | Criptografía SHA-256 | Certificación Merkle de no alteración de registros. |
| `GET` | `/api/v1/reglas` | Solo lectura | Listado de reglas de negocio declarativas vigentes. |
| `POST` | `/api/v1/reglas/simular` | Modo Dry-Run | Simula decisiones sin persistir datos en la base operativa. |

---
*Manual generado formalmente para el equipo de Operaciones, Riesgos y Desarrollo de Software &middot; Sistema AURUM BPM.*

