/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Modulo: Configuración y Esquema de Base de Datos SQLite (Modo WAL)
 * ============================================================================
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { registrarEventoSeguridad } = require('./security.logger');

const DB_PATH = path.isAbsolute(process.env.DB_PATH || '')
  ? process.env.DB_PATH
  : path.resolve(__dirname, process.env.DB_PATH || 'creditos.db');

// Garantizar que el directorio contenedor exista en entornos Linux / Hostinger
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Instancia de conexión a SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[-] Error crítico al abrir la base de datos SQLite:', err.message);
  } else {
    console.log(`[+] Conexión establecida con SQLite en: ${DB_PATH}`);
  }
});

/**
 * Promisificación de métodos SQLite para arquitectura basada en async/await
 * con captura y registro forense de violaciones de inmutabilidad WORM
 */
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        if (err.message && err.message.includes('VIOLACION CRITICA DE AUDITORIA')) {
          registrarEventoSeguridad('WORM_AUDIT_TAMPER_TRIGGER_BLOCKED', null, {
            sql_ejecutado: sql,
            parametros: params,
            error_sqlite: err.message
          }, 'CRITICAL');
        }
        return reject(err);
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

/**
 * Inicialización de Pragmas de Alto Rendimiento, Esquemas y Triggers de Inmutabilidad
 */
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        console.log('[*] Aplicando pragmas de alto rendimiento y concurrencia (WAL)...');

        // 1. Pragmas de Concurrencia e Integridad
        await dbRun('PRAGMA foreign_keys = ON;');
        const journalMode = await dbGet('PRAGMA journal_mode = WAL;');
        console.log(`[+] Modo de diario SQLite configurado: ${journalMode.journal_mode.toUpperCase()}`);

        await dbRun('PRAGMA synchronous = NORMAL;');
        await dbRun('PRAGMA busy_timeout = 5000;');
        await dbRun('PRAGMA trusted_schema = OFF;');

        console.log('[*] Verificando y creando esquemas relacionales BPM...');

        // 1.5. Tabla: usuarios (Directorio Institucional Bancario RBAC)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS usuarios (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            nombre TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('ASESOR', 'OFICIAL_CAMPO', 'COMITE_RIESGOS', 'AUDITOR_SOX', 'ADMIN')),
            cargo TEXT,
            departamento TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Seed inicial de usuarios institucionales si la tabla está vacía
        const conteoUsuarios = await dbGet('SELECT COUNT(*) as total FROM usuarios;');
        if (conteoUsuarios && conteoUsuarios.total === 0) {
          console.log('[*] Poblano directorio institucional de usuarios bancarios...');
          const usuariosSeed = [
            ['usr_asesor_01', 'asesor@aurum.com', 'asesor', 'Password123!', 'Valeria Alarcón', 'ASESOR', 'Asesora Senior de Créditos', 'Banca Personas & Consumo'],
            ['usr_oficial_01', 'oficial@aurum.com', 'oficial', 'Password123!', 'Marcos Villalba', 'OFICIAL_CAMPO', 'Oficial de Mesa de Control & Verificación', 'Operaciones & Terreno'],
            ['usr_comite_01', 'comite@aurum.com', 'comite', 'Password123!', 'Dr. Santiago Morales', 'COMITE_RIESGOS', 'Vocal Principal de Riesgo Crediticio', 'Comité de Riesgos & Dictámenes'],
            ['usr_auditor_01', 'auditor@aurum.com', 'auditor', 'Password123!', 'Elena Rivas', 'AUDITOR_SOX', 'Auditora Forense de Cumplimiento SOX', 'Compliance & Control Interno'],
            ['usr_admin_01', 'admin@aurum.com', 'admin', 'Password123!', "Carlos D'Alessandro", 'ADMIN', 'Arquitecto y Administrador del Sistema', 'Tecnología & Seguridad Bancaria']
          ];
          for (const u of usuariosSeed) {
            await dbRun(
              'INSERT INTO usuarios (id, email, username, password, nombre, role, cargo, departamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
              u
            );
          }
        }

        // 2. Tabla: solicitudes_credito (Entidad Raíz del Proceso BPM)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS solicitudes_credito (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_nombre TEXT NOT NULL,
            cliente_cedula TEXT NOT NULL,
            ingresos_mensuales REAL NOT NULL CHECK (ingresos_mensuales >= 0),
            monto_solicitado REAL NOT NULL CHECK (monto_solicitado > 0),
            plazo_meses INTEGER NOT NULL CHECK (plazo_meses > 0),
            estado_actual TEXT NOT NULL DEFAULT 'Recibido' CHECK (
              estado_actual IN ('Recibido', 'Revision_Riesgo', 'En_Evaluacion', 'Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado')
            ),
            nivel_riesgo TEXT DEFAULT 'Pendiente',
            asesor_id TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Índices para búsquedas frecuentes y filtros de cola de trabajo BPM
        await dbRun('CREATE INDEX IF NOT EXISTS idx_solicitudes_cedula ON solicitudes_credito(cliente_cedula);');
        await dbRun('CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_credito(estado_actual);');

        // Auto-migración defensiva: garantizar que columnas requeridas existan si la base fue creada con esquemas previos
        const columnasSolicitudes = await dbAll('PRAGMA table_info(solicitudes_credito);');
        const nombresColumnas = columnasSolicitudes.map(c => c.name);

        if (!nombresColumnas.includes('updated_at')) {
          console.log('[*] Migración automática: Agregando columna updated_at a solicitudes_credito...');
          await dbRun('ALTER TABLE solicitudes_credito ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;');
        }
        if (!nombresColumnas.includes('nivel_riesgo')) {
          console.log('[*] Migración automática: Agregando columna nivel_riesgo a solicitudes_credito...');
          await dbRun("ALTER TABLE solicitudes_credito ADD COLUMN nivel_riesgo TEXT DEFAULT 'Pendiente';");
        }
        if (!nombresColumnas.includes('asesor_id')) {
          console.log('[*] Migración automática: Agregando columna asesor_id a solicitudes_credito...');
          await dbRun("ALTER TABLE solicitudes_credito ADD COLUMN asesor_id TEXT;");
        }

        // 3. Tabla: reglas_negocio (Motor de Reglas / Declarative Rules Engine)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS reglas_negocio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_regla TEXT NOT NULL UNIQUE,
            condicion_json TEXT NOT NULL,
            accion_resultado TEXT NOT NULL,
            activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // 4. Tabla: tareas_paralelas (Sub-flujos / Patrón Fork-Join BPM)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS tareas_paralelas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            solicitud_id INTEGER NOT NULL,
            tipo_tarea TEXT NOT NULL CHECK (
              tipo_tarea IN ('Verificacion_Domicilio', 'Referencias_Telefonicas', 'Validacion_Laboral', 'Consulta_Buro', 'Inspeccion_Garantias')
            ),
            estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (
              estado IN ('Pendiente', 'En_Proceso', 'Completada', 'Rechazada', 'Cancelada')
            ),
            asignado_a TEXT,
            observaciones TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (solicitud_id) REFERENCES solicitudes_credito(id) ON DELETE RESTRICT
          );
        `);

        await dbRun('CREATE INDEX IF NOT EXISTS idx_tareas_solicitud ON tareas_paralelas(solicitud_id);');
        await dbRun('CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas_paralelas(estado);');

        // 5. Tabla: bitacora_auditoria (Event Log Inmutable / Compliance Financiero)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS bitacora_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            solicitud_id INTEGER,
            accion TEXT NOT NULL,
            usuario_responsable TEXT NOT NULL,
            resultado TEXT,
            FOREIGN KEY (solicitud_id) REFERENCES solicitudes_credito(id) ON DELETE SET NULL
          );
        `);

        await dbRun('CREATE INDEX IF NOT EXISTS idx_bitacora_solicitud ON bitacora_auditoria(solicitud_id);');
        await dbRun('CREATE INDEX IF NOT EXISTS idx_bitacora_timestamp ON bitacora_auditoria(timestamp);');

        // 6. TRIGGERS DE SEGURIDAD CRÍTICA: Inmutabilidad Estricta (WORM: Write Once, Read Many)
        // Bloqueo total de sentencias UPDATE
        await dbRun(`
          CREATE TRIGGER IF NOT EXISTS trg_prevent_update_bitacora_auditoria
          BEFORE UPDATE ON bitacora_auditoria
          BEGIN
            SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion UPDATE denegada.');
          END;
        `);

        // Bloqueo total de sentencias DELETE
        await dbRun(`
          CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_bitacora_auditoria
          BEFORE DELETE ON bitacora_auditoria
          BEGIN
            SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en bitacora_auditoria son estrictamente inmutables. Operacion DELETE denegada.');
          END;
        `);

        // 7. Tabla: trazabilidad_auditoria (Trazabilidad y Cumplimiento Normativo SOX)
        await dbRun(`
          CREATE TABLE IF NOT EXISTS trazabilidad_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            solicitud_id INTEGER,
            accion TEXT NOT NULL,
            usuario_responsable TEXT NOT NULL,
            resultado TEXT,
            FOREIGN KEY (solicitud_id) REFERENCES solicitudes_credito(id) ON DELETE SET NULL
          );
        `);

        await dbRun('CREATE INDEX IF NOT EXISTS idx_trazabilidad_solicitud ON trazabilidad_auditoria(solicitud_id);');
        await dbRun('CREATE INDEX IF NOT EXISTS idx_trazabilidad_timestamp ON trazabilidad_auditoria(timestamp);');

        // Sincronización de registros preexistentes
        await dbRun(`
          INSERT INTO trazabilidad_auditoria (id, timestamp, solicitud_id, accion, usuario_responsable, resultado)
          SELECT id, timestamp, solicitud_id, accion, usuario_responsable, resultado
          FROM bitacora_auditoria
          WHERE id NOT IN (SELECT id FROM trazabilidad_auditoria);
        `);

        // TRIGGERS WORM PARA trazabilidad_auditoria (Write Once, Read Many)
        await dbRun(`
          CREATE TRIGGER IF NOT EXISTS trg_prevent_update_trazabilidad_auditoria
          BEFORE UPDATE ON trazabilidad_auditoria
          BEGIN
            SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en trazabilidad_auditoria son estrictamente inmutables. Operacion UPDATE denegada.');
          END;
        `);

        await dbRun(`
          CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_trazabilidad_auditoria
          BEFORE DELETE ON trazabilidad_auditoria
          BEGIN
            SELECT RAISE(ABORT, 'VIOLACION CRITICA DE AUDITORIA: Los registros en trazabilidad_auditoria son estrictamente inmutables. Operacion DELETE denegada.');
          END;
        `);

        // Replicación en tiempo real de eventos de auditoría
        await dbRun(`
          CREATE TRIGGER IF NOT EXISTS trg_sync_bitacora_to_trazabilidad
          AFTER INSERT ON bitacora_auditoria
          BEGIN
            INSERT OR IGNORE INTO trazabilidad_auditoria (id, timestamp, solicitud_id, accion, usuario_responsable, resultado)
            VALUES (NEW.id, NEW.timestamp, NEW.solicitud_id, NEW.accion, NEW.usuario_responsable, NEW.resultado);
          END;
        `);

        console.log('[+] Tablas, índices y triggers de auditoría inmutable inicializados exitosamente.');
        resolve(db);
      } catch (error) {
        console.error('[-] Error durante la inicialización de la base de datos:', error);
        reject(error);
      }
    });
  });
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};

