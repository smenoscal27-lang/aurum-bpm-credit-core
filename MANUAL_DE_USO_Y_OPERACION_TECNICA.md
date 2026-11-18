# Manual de Uso y Operación Técnica
## Sistema de Aprobación de Créditos de Consumo mediante Flujos Dinámicos (BPM)
**Documento Técnico Formal &middot; Versión 1.0.0 &middot; Grado Financiero / Banca Privada**

---

## 1. Resumen Ejecutivo de la Arquitectura

### 1.1 Propósito del Sistema
El **Sistema de Aprobación de Créditos de Consumo** es una plataforma integral de gestión de procesos de negocio (**Business Process Management - BPM**) y registro inmutable de eventos (**Event Sourcing**). Su objetivo principal es automatizar, regular y auditar el ciclo de vida completo de las solicitudes de crédito de consumo, erradicando la discrecionalidad arbitraria y garantizando el cumplimiento estricto de las políticas de riesgo de crédito, normas de protección al consumidor y estándares regulatorios internacionales (**SOX 404**, **ISO 27001 - A.12.4** y **PCI-DSS Requisito 10**).

El sistema coordina tres pilares operativos fundamentales:
1. **Evaluación de Riesgo Dinámica (BRE - Business Rules Engine):** Evaluación instantánea de capacidad de pago (*Debt-to-Income / DTI*) y reglas de umbral de capital.
2. **Orquestación de Procesos Concurrente (Fork-Join):** Despacho automático de verificaciones de campo e investigaciones crediticias paralelas.
3. **Pistas de Auditoría Inmutables (WORM - Write Once, Read Many):** Blindaje criptográfico y a nivel de motor de datos que imposibilita la alteración o supresión de eventos de decisión.

---

### 1.2 Pila Tecnológica de la Solución

| Capa Tecnológica | Tecnología / Herramienta | Versión | Justificación Arquitectónica |
| :--- | :--- | :--- | :--- |
| **Frontend (UI/UX)** | React + Vite + Tailwind CSS | React 18 / Vite 6 / Tailwind 3.4 | Renderizado reactivo de alta velocidad, arquitectura por componentes y diseño dark-mode especializado para banca privada y analistas financieros. |
| **Iconografía UI** | Lucide React | 0.468.x | Conjunto semántico de iconografía vectorial ligera y consistente. |
| **Backend (API Core)** | Node.js + Express.js | Node 20+ / Express 4.21 | Arquitectura no bloqueante orientada a eventos, tiempo de respuesta sub-milisegundo y modularidad desacoplada. |
| **Seguridad HTTP** | Helmet + Express-Rate-Limit | Helmet 8 / Rate-Limit 7 | Hardening de cabeceras de respuesta, mitigación activa contra denegación de servicio (DoS) y control de abuso de IP. |
| **Base de Datos** | SQLite3 (Motor WAL) | SQLite 3.4x | Base relacional integrada, modo *Write-Ahead Logging* para concurrencia masiva de lectura y escritura sin contención de bloqueos. |
| **Control de Procesos** | Triggers Nativos SQLite | N/A | Implementación de restricciones de base de datos con `RAISE(ABORT)` para forzar la inmutabilidad física en disco. |

---

### 1.3 Esquema de Comunicación entre Capas

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                      CAPA CLIENTE: NAVEGADOR WEB (SPA)                            │
│  - React 18 Single Page Application (Estética Dark Slate-950 / Obsidian)          │
│  - Métricas KPI en Vivo (Total, Aprobados, Tareas Activas, Revisión de Riesgo)    │
│  - Simulador DTI Heurístico en Tiempo Real                                        │
│  - Panel Lateral de Trazabilidad y Resolución Concurrente de Tareas               │
└────────────────────────────────────────┬──────────────────────────────────────────┘
                                         │  HTTP / JSON (REST)
                                         │  Proxy Reverso Vite (:5173 -> :3000)
                                         ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                     CAPA GATEWAY & HARDENING (EXPRESS.JS)                         │
│  - Trust Proxy Configurado (app.set('trust proxy', 1))                            │
│  - Blindaje Helmet (CSP, HSTS, X-Content-Type-Options, FrameGuard)                │
│  - Rate Limiter Estricto (10 req / 15 min en POST /creditos)                      │
│  - Sanitización Preventiva Anti-XSS y Validación Alfanumérica por Lista Blanca    │
└──────────────────┬─────────────────────────────────────────────┬──────────────────┘
                   │                                             │
                   ▼                                             ▼
┌────────────────────────────────────────┐     ┌────────────────────────────────────┐
│      MOTOR DE REGLAS DE NEGOCIO        │     │       MÁQUINA DE ESTADOS BPM       │
│  - Cálculo de Cuota y Ratios DTI       │     │  - Ciclo de Vida del Proceso       │
│  - Reglas Declarativas Almacenadas     │     │  - Patrón Fork (Tareas Paralelas)  │
│  - Clasificación de Nivel de Riesgo    │     │  - Compuerta Join (Sincronización) │
└──────────────────┬─────────────────────┘     └─────────────────┬──────────────────┘
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                   CAPA DE PERSISTENCIA: SQLITE EN MODO WAL                        │
│  - creditos.db (Base de datos relacional)                                         │
│  - creditos.db-wal (Log de transacciones concurrentes de alta velocidad)          │
│  - PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout=5000│
│                                                                                   │
│  TABLAS Y TRIGGERS:                                                               │
│  ├── solicitudes_credito (Entidad raíz del proceso BPM)                           │
│  ├── reglas_negocio (Condiciones dinámicas en formato JSON)                       │
│  ├── tareas_paralelas (Hilos de verificación subordinados)                        │
│  └── bitacora_auditoria (Eventos inmutables protegidos por Triggers WORM)          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Guía Operativa de Módulos y Roles

El sistema implementa una separación estricta de responsabilidades mediante roles operativos. La identidad del usuario es auditada en cada interacción mediante la cabecera `x-user-id`.

```
                                 ROLES Y MATRIZ OPERATIVA
 
    [ Asesor Comercial ]               [ Oficial de Campo ]               [ Comité de Riesgos ]
             │                                   │                                  │
             ▼                                   ▼                                  ▼
   Nueva Solicitud & DTI               Completar / Rechazar              Transición Colegiada
    - Nombre, Cédula                    Tareas Paralelas                  Manual de Solicitudes
    - Ingresos, Monto                    (Fork & Join)                     (Revision_Riesgo)
             │                                   │                                  │
             └───────────────────────────────────┼──────────────────────────────────┘
                                                 │
                                                 ▼
                                     [ Auditor de Cumplimiento ]
                                                 │
                                                 ▼
                                       Inspección Forense y
                                    Verificación SHA-256 WORM
```

---

### 2.1 Rol 1: Asesor Comercial / Canal Digital (`ASESOR_CANAL_DIGITAL`)
**Objetivo:** Ingreso de clientes, asesoramiento financiero y solicitud de crédito.

#### Procedimiento Operativo Paso a Paso:
1. Inicie sesión en la interfaz y seleccione la pestaña **"Nueva Solicitud de Crédito"**.
2. Complete los campos del formulario respetando las restricciones del sistema:
   * **Nombre Completo del Cliente:** Ingrese nombres y apellidos (ej. *Valeria Alarcón*). Longitud permitida: 3 a 80 caracteres alfabéticos.
   * **Cédula / Identificación:** Ingrese el número de identidad (ej. *1723456789*). Solo se admiten caracteres alfanuméricos de 6 a 15 dígitos.
   * **Ingresos Mensuales Netos ($ USD):** Ingrese la renta líquida comprobable del cliente (mínimo \$100).
   * **Monto Solicitado ($ USD):** Ingrese el monto de capital requerido (mínimo \$500, máximo \$500,000).
   * **Plazo de Financiamiento:** Seleccione el plazo requerido haciendo clic en los selectores preestablecidos: **12**, **24**, **36**, **48** o **60 meses**.

#### Simulador de Capacidad (DTI) en Tiempo Real:
Mientras el asesor ingresa los datos, el panel lateral derecho ejecuta automáticamente el análisis heurístico sin tocar la base de datos:
* **Fórmula de Amortización Estimada:**
  $$\text{Cuota Mensual} = \frac{\text{Monto} \times (1 + 0.015 \times \text{Plazo})}{\text{Plazo}}$$
* **Fórmula de Relación Cuota / Ingreso (DTI):**
  $$\text{Ratio DTI (\%)} = \left(\frac{\text{Cuota Mensual}}{\text{Ingresos Mensuales}}\right) \times 100$$

#### Interpretación de la Decisión Instantánea del Motor BPM:
Al presionar el botón **"Procesar en Motor BPM"**, la solicitud viaja al servidor, se aplican las reglas declarativas y la interfaz devuelve una tarjeta con la decisión vinculante:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                 RESULTADOS POSIBLES DEL MOTOR BPM                      │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 1. 'Aprobado' (Riesgo Bajo):                                           │
  │    Monto <= $5,000 e Ingresos > $1,000.                                │
  │    El crédito queda aprobado de inmediato con código de desembolso.    │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 2. 'Tareas_Paralelas' (Riesgo Medio):                                  │
  │    Montos estándar que requieren confirmación de solvencia.            │
  │    El motor bifurca el flujo (Fork) creando tareas para operaciones.   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 3. 'Revision_Riesgo' (Riesgo Alto):                                    │
  │    Monto > $15,000 o Ingresos ajustados (< $500).                      │
  │    El flujo se detiene y queda a la espera del Comité de Crédito.      │
  └────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Rol 2: Oficial de Operaciones y Verificación (`OFICIAL_OPERACIONES`)
**Objetivo:** Tramitar y dictaminar las tareas paralelas de verificación física, laboral y telefónica.

#### Procedimiento Operativo del Patrón Fork-Join:
1. En la pestaña **"Directorio de Solicitudes"**, filtre las solicitudes en estado amarillo: **`Tareas_Paralelas`**.
2. Haga clic sobre la solicitud o presione el botón **"Trazabilidad"** para abrir el panel lateral (*Drawer*).
3. En la sección **"Sub-flujos Concurrentes (Tareas Paralelas)"**, visualice las tareas asignadas por el motor:
   * `Verificacion_Domicilio`
   * `Referencias_Telefonicas`
4. Para cada tarea pendiente, el oficial dispone de dos acciones:
   * **Marcar Completada (Botón Verde):** Confirma que la visita domiciliaria o la llamada telefónica fue positiva y validada.
   * **Rechazar (Botón Rojo):** Notifica inconsistencias graves (documentación adulterada, números falsos o domicilio inexistente).

#### Lógica de la Compuerta de Sincronización (*Join Gateway*):
* **Rechazo Inmediato (Cortocircuito):** Si cualquiera de las tareas es marcada como `Rechazada`, la solicitud pasa automáticamente al estado terminal **`Rechazado`**, cancelando el resto del proceso.
* **Aprobación Concurrente Total:** Cuando **todas** las tareas asignadas se resuelven en estado `Completada`, la compuerta Join transiciona el crédito automáticamente a estado **`Aprobado`**.
* **Estado en Espera:** Si una tarea es completada pero la otra sigue pendiente, el crédito permanece en `Tareas_Paralelas` indicando el progreso actual (ej. *1/2 tareas resueltas*).

---

### 2.3 Rol 3: Analista / Comité de Riesgos Senior (`COMITE_RIESGOS_CENTRAL`)
**Objetivo:** Evaluación colegiada y dictamen de créditos escalados por monto alto o atipicidad financiera.

#### Procedimiento Operativo:
1. Filtre el directorio por el estado **`Revision_Riesgo`**.
2. Abra el panel de trazabilidad de la solicitud y analice el resumen de capital, ingresos y notas de la bitácora.
3. Si el comité decide dictaminar la solicitud, ejecuta una llamada autorizada al endpoint:
   `PATCH /api/v1/creditos/:id/transicionar`
4. La petición requiere obligatoriamente:
   * `nuevo_estado`: (`Aprobado`, `Rechazado` o `Tareas_Paralelas`).
   * `motivo`: Justificación documental completa (ej. *"Aprobado bajo fianza prendaria aprobada en Acta de Comité #892"*).
5. La máquina de estados BPM valida que la transición sea legal y asienta la decisión de forma irrevocable en la bitácora de auditoría.

---

### 2.4 Rol 4: Auditor Interno y Oficial de Cumplimiento (`AUDITOR_INTERNO_SOX`)
**Objetivo:** Supervisión forense, verificación de no repudio y exportación de evidencias para entidades reguladoras.

#### Procedimiento Operativo:
1. Acceda a la sección **"Bitácora de Auditoría Inmutable (WORM)"** dentro del panel lateral de cualquier solicitud para ver la cronología completa de eventos.
2. Cada evento muestra su marca de tiempo exacta, el usuario responsable, la acción ejecutada (`SOLICITUD_CREADA`, `EVALUACION_REGLA_NEGOCIO`, `FORK_TAREAS`, `COMPUERTA_JOIN`) y la carga útil en formato JSON.
3. Para auditorías externas integrales, consulte la verificación criptográfica del libro contable en:
   `GET /api/v1/auditoria/verificar-integridad`
4. Exporte la evidencia certificada en formato JSON o CSV a través de:
   `GET /api/v1/auditoria/exportar?formato=csv`

---

## 3. Seguridad y Arquitectura de Datos (Hardening & Auditoría)

El sistema ha sido estructurado siguiendo el principio de **Defensa en Profundidad (Defense in Depth)**, asegurando que un fallo en una capa sea contenido inmediatamente por la siguiente.

```
                            CAPAS DE DEFENSA EN PROFUNDIDAD
  
   [ Tráfico Web ]
          │
          ▼
  ┌────────────────────────────────────────────────────────┐
  │ 1. CONTROL DE FLUJO: Rate Limiter (Anti-DoS)           │  Máx 10 peticiones / 15 min / IP
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. CABECERAS HTTP: Helmet Hardening                    │  CSP, HSTS, NoSniff, FrameGuard
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. VALIDACIÓN DE ENTRADA: Sanitización Anti-XSS        │  Rechazo explícito por lista blanca
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 4. CONSULTAS PARAMETRIZADAS: Anti-SQL Injection        │  Driver SQLite (? binding nativo)
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 5. BASE DE DATOS WORM: Triggers SQLite Inmutables      │  RAISE(ABORT) en UPDATE y DELETE
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 6. SELLADO CRIPTOGRÁFICO: Cadena Hash SHA-256          │  Verificación Merkle de no alteración
  └────────────────────────────────────────────────────────┘
```

---

### 3.1 Blindaje de Red y Cabeceras de Seguridad (Helmet & Trust Proxy)
1. **`app.set('trust proxy', 1);`:** Configuración esencial para despliegues detrás de Nginx, Cloudflare o balanceadores de carga AWS/GCP. Permite determinar la IP real de origen del encabezado `X-Forwarded-For` y previene ataques de elusión de cuota mediante *IP spoofing*.
2. **`helmet(...)`:** Aplica de forma automática las cabeceras recomendadas por OWASP:
   * **Content Security Policy (CSP):** Restringe la carga de scripts únicamente al dominio origen y previene inyecciones XSS de terceros.
   * **Strict-Transport-Security (HSTS):** Fuerza conexiones seguras HTTPS durante 31,536,000 segundos.
   * **X-Content-Type-Options: nosniff:** Impide que el navegador interprete archivos con tipos MIME erróneos.
   * **X-Frame-Options: SAMEORIGIN:** Previene ataques de suplantación de clics (*Clickjacking*).
3. **`app.disable('x-powered-by');`:** Elimina la cabecera que identifica a Express en las respuestas, dificultando el escaneo automatizado de vulnerabilidades de versiones.

---

### 3.2 Control de Tráfico y Mitigación de DoS (Rate Limiting)
Para evitar que atacantes saturen el motor de decisiones o creen miles de créditos fraudulentos:
* **Ruta Crítica (`POST /api/v1/creditos`):**
  * Ventana de tiempo: 15 minutos (900,000 ms).
  * Límite estricto: **10 solicitudes por dirección IP**.
  * Cabeceras estándar RFC Draft-6 habilitadas: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
  * Código de respuesta ante exceso: `HTTP 429 Too Many Requests`.
* **Rutas Generales (`/api/*`):**
  * Límite amplio de 150 solicitudes por cada 15 minutos por IP para operaciones de lectura del directorio.

---

### 3.3 Sanitización y Validación Anti-XSS / Anti-SQLi
En lugar de permitir datos arbitrarios y confiar en un limpiado silencioso, el backend implementa el principio de **Rechazo Explícito**:
* **Filtro Anti-XSS:** Cualquier nombre o cadena que contenga `<script>`, `<iframe>`, `javascript:`, `onerror=`, `onload=` o etiquetas HTML es rechazado de inmediato con un error `HTTP 400 (SEC_INVALID_NAME)`.
* **Lista Blanca Alfanumérica:** El nombre de cliente solo admite letras del alfabeto internacional (incluyendo tildes, diéresis y la letra ñ), espacios y guiones.
* **Inmunidad contra SQL Injection:** Toda interacción con la base de datos utiliza consultas parametrizadas con marcadores de posición posicionales (`?`), delegando el escape de caracteres al compilador nativo de SQLite en lenguaje C.

---

### 3.4 Arquitectura de la Bitácora Inmutable (WORM)
La tabla `bitacora_auditoria` almacena cada transición de estado de manera secuencial y permanente.

#### Estructura Relacional de Auditoría:
```sql
CREATE TABLE IF NOT EXISTS bitacora_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  solicitud_id INTEGER,
  accion TEXT NOT NULL,
  usuario_responsable TEXT NOT NULL,
  resultado TEXT,
  FOREIGN KEY (solicitud_id) REFERENCES solicitudes_credito(id) ON DELETE SET NULL
);
```

#### Triggers Nativos de Inmutabilidad Absoluta en SQLite:
Para cumplir con el estándar WORM (*Write Once, Read Many*), la base de datos tiene compilados dos disparadores que bloquean cualquier intento de modificación o borrado:

```sql
-- Trigger 1: Bloqueo irrevocable de UPDATE
CREATE TRIGGER IF NOT EXISTS trg_prevent_update_bitacora_auditoria
BEFORE UPDATE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion UPDATE denegada.');
END;

-- Trigger 2: Bloqueo irrevocable de DELETE
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_bitacora_auditoria
BEFORE DELETE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion DELETE denegada.');
END;
```

> [!CAUTION]
> Incluso si un administrador con acceso directo a la consola SQLite intenta ejecutar `DELETE FROM bitacora_auditoria;`, el motor abortará inmediatamente la operación y revertirá la transacción, preservando intacta la evidencia forense.

#### Cadena de Custodia Criptográfica (Merkle-Chain SHA-256):
El endpoint `/api/v1/auditoria/verificar-integridad` ejecuta una función criptográfica que recorre todos los eventos desde el registro inicial (*Bloque Génesis*), calculando recursivamente:

$$\text{Hash}_i = \text{SHA256}\left(\text{Hash}_{i-1} \parallel \text{id}_i \parallel \text{timestamp}_i \parallel \text{solicitud\_id}_i \parallel \text{accion}_i \parallel \text{usuario}_i \parallel \text{resultado}_i\right)$$

Si un registro hubiese sido alterado manipulando los archivos binarios directamente con un editor hexadecimal, la cadena hash resultante diferirá, detectando la intrusión de forma matemática irrefutable.

---

## 4. Matriz de Endpoints y Credenciales de Prueba

### 4.1 Catálogo de Endpoints de la API REST (`/api/v1`)

| Método | Endpoint / Ruta | Nivel de Seguridad | Descripción Funcional |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Sonda activa de disponibilidad del servidor, modo de diario SQLite WAL y latencia sub-milisegundo. |
| `POST` | `/api/v1/creditos` | Rate Limit Estricto (10/15min) + Anti-XSS | Crea una nueva solicitud en estado `Recibido`, ejecuta el motor de reglas y realiza la primera transición BPM. |
| `GET` | `/api/v1/creditos` | Rate Limit General | Obtiene el listado de todas las instancias del proceso con soporte de filtros (`?estado=`, `?cedula=`, `?limit=`). |
| `GET` | `/api/v1/creditos/:id` | Rate Limit General | Devuelve el detalle consolidado: expediente del cliente, sub-flujos paralelos asignados y la bitácora inmutable completa. |
| `PATCH` | `/api/v1/creditos/:id/transicionar` | Requiere `x-user-id` y justificación | Transición manual de estado auditada para el Comité de Riesgos (valida la máquina de estados BPM). |
| `GET` | `/api/v1/tareas` | Rate Limit General | Consulta y lista las tareas paralelas activas con filtros por operador, solicitud o estado. |
| `PATCH` | `/api/v1/tareas/:id/completar` | Auditoría de Operador Obligatoria | Dictamina una tarea (`Completada` / `Rechazada`) y evalúa la compuerta de sincronización Join. |
| `GET` | `/api/v1/reglas` | Rate Limit General | Lista todas las reglas de negocio declarativas almacenadas en la base de datos. |
| `POST` | `/api/v1/reglas` | Requiere Rol Administrador | Añade una nueva regla de negocio en caliente con validación de sintaxis JSON. |
| `PATCH` | `/api/v1/reglas/:id` | Requiere Rol Administrador | Habilita, deshabilita o ajusta los parámetros de una regla existente sin reiniciar el servidor. |
| `POST` | `/api/v1/reglas/simular` | Modo Dry-Run | Simula la evaluación de un crédito ficticio contra el motor de reglas sin persistir datos en la base. |
| `GET` | `/api/v1/auditoria` | Rol Auditor Interno | Consulta histórica de eventos forenses con filtros por fecha, usuario y acción. |
| `GET` | `/api/v1/auditoria/verificar-integridad`| Solo Lectura Criptográfica | Ejecuta el algoritmo Merkle SHA-256 para verificar la integridad absoluta de la bitácora. |
| `GET` | `/api/v1/auditoria/exportar` | Descarga de Evidencia | Exporta la bitácora de auditoría en formato JSON firmado o archivo plano CSV. |

---

### 4.2 Matriz de Identidades y Credenciales de Prueba

Para emular peticiones en entornos de prueba o desarrollo, envíe en las solicitudes HTTP el encabezado **`x-user-id`** con el valor del rol correspondiente:

| Rol Operativo | Identificador de Prueba (`x-user-id`) | Alcance y Permisos | Escenario Típico de Prueba |
| :--- | :--- | :--- | :--- |
| **Asesor Canal Digital** | `ASESOR_CANAL_DIGITAL` | Captura de solicitudes, simulación DTI y consulta general del directorio. | Registro de créditos de consumo en la pestaña principal de la UI. |
| **Oficial de Terreno / Domicilio**| `OFICIAL_VERIFICACION_DOMICILIO`| Dictamen exclusivo de la tarea paralela `Verificacion_Domicilio`. | Inspección ocular y aprobación de residencia del solicitante. |
| **Operador de Mesa de Control** | `OFICIAL_REFERENCIAS_TELEFONICAS`| Dictamen exclusivo de la tarea paralela `Referencias_Telefonicas`. | Verificación telefónica de referencias personales y laborales. |
| **Comité de Riesgos Central** | `COMITE_RIESGOS_CENTRAL` | Transición manual de créditos en estado `Revision_Riesgo` (`/transicionar`). | Aprobación de créditos mayores a \$15,000 bajo condiciones especiales. |
| **Auditor de Cumplimiento SOX** | `AUDITOR_INTERNO_SOX` | Acceso a reportes forenses, validación de integridad SHA-256 y descargas CSV. | Certificación anual de pistas de auditoría ante reguladores externos. |
| **Administrador del Motor BPM** | `ADMIN_MOTOR_BPM` | Mantenimiento de reglas declarativas (`POST /reglas` y `PATCH /reglas/:id`). | Modificación de umbrales de capital y reglas DTI en caliente. |

---

## 5. Guía de Arranque y Despliegue

### 5.1 Requisitos Previos del Sistema
* **Entorno de Ejecución:** Node.js versión `18.x`, `20.x` o superior (LTS recomendado).
* **Gestor de Paquetes:** `npm` v9.x o superior.
* **Sistema Operativo:** Compatible con Windows 10/11, macOS y distribuciones Linux (Ubuntu/Debian/RHEL).
* **Navegador Web:** Google Chrome, Microsoft Edge, Mozilla Firefox o Safari actualizados.

---

### 5.2 Estructura de Variables de Entorno ([`.env`](file:///d:/Escritorio/Sistema de Aprobación de Créditos de Consumo mediante Flujos Dinámicos/.env))
Verifique que el archivo `.env` exista en la raíz del proyecto backend con la siguiente configuración:

```ini
# Configuración del Servidor Express
PORT=3000
NODE_ENV=development

# Ruta de la Base de Datos SQLite
DB_PATH=./creditos.db
```

---

### 5.3 Procedimiento de Puesta en Marcha

#### Paso 1: Inicialización del Backend (API Core)
Abra una terminal en la raíz del proyecto:

```bash
# 1. Instalar dependencias de producción y seguridad
npm install

# 2. Iniciar el servidor backend en modo desarrollo (con recarga automática)
npm run dev
```

> **Salida esperada en consola:**
> ```text
> [+] Conexión establecida con SQLite en: ./creditos.db
> [*] Aplicando pragmas de alto rendimiento y concurrencia (WAL)...
> [+] Modo de diario SQLite configurado: WAL
> [*] Verificando y creando esquemas relacionales BPM...
> [+] Tablas, índices y triggers de auditoría inmutable inicializados exitosamente.
> ================================================================
> 🚀 Motor BPM de Créditos escuchando en http://localhost:3000
> 📡 Endpoint de Salud: http://localhost:3000/health
> ⚡ Modo: DEVELOPMENT | SQLite WAL: ACTIVO
> ================================================================
> ```

#### Paso 2: Inicialización del Frontend (Interfaz Fintech)
Abra una segunda terminal e ingrese a la carpeta del cliente web:

```bash
# 1. Navegar a la carpeta del frontend
cd frontend-creditos

# 2. Instalar dependencias de React, Tailwind CSS y Lucide Icons
npm install

# 3. Iniciar el servidor de desarrollo de Vite
npm run dev
```

> **Salida esperada en consola:**
> ```text
>   VITE v6.0.3  ready in 210 ms
> 
>   ➜  Local:   http://localhost:5173/
>   ➜  Network: use --host to expose
> ```

Abra su navegador en **`http://localhost:5173`**. La aplicación web se conectará automáticamente con el backend en el puerto `3000` mediante el proxy inverso integrado de Vite.

---

### 5.4 Comandos para la Ejecución de Pruebas Automatizadas

El sistema incorpora tres suites de pruebas unitarias y de estrés automatizadas para verificar la solidez del motor antes de pasar a producción:

```bash
# 1. Verificación de la Base de Datos y Triggers de Inmutabilidad WORM
# Valida la activación de PRAGMA WAL y comprueba que UPDATE/DELETE en auditoría fallen.
npm run test:db

# 2. Verificación Integral del Motor BPM y Endpoints de Crédito
# Ejecuta casos de Aprobación Directa, Tareas Paralelas Fork, Comités y Trazabilidad.
npm run test:api

# 3. Verificación de Ciberseguridad y Hardening
# Prueba inyecciones de payloads XSS, inyecciones SQL y límites de tasa (Rate Limiting).
npm run test:security
```

---

### 5.5 Construcción para Entornos de Producción (Build)

Para empaquetar los artefactos finales listos para distribución en servidores Nginx o contenedores Docker:

```bash
# Compilar el frontend en assets estáticos optimizados (HTML, CSS minificado, JS chunks)
npm run build:client

# Los archivos compilados quedarán generados en la carpeta:
# frontend-creditos/dist/
```

---
*Manual técnico compilado para la Dirección de Tecnología, Oficiales de Riesgo y Analistas de Operaciones del Sistema AURUM BPM.*
