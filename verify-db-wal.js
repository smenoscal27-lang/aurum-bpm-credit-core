/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: verify-db-wal.js
 * Descripción: Script de Auditoría Automatizada con 'better-sqlite3' para:
 *              1. Verificación del Modo WAL (Write-Ahead Logging)
 *              2. Inspección del Esquema Relacional (usuarios, solicitudes_credito, trazabilidad_auditoria)
 *              3. Comprobación de Integridad de Claves Foráneas (PRAGMA foreign_keys = ON)
 *              4. Prueba Forense de Inmutabilidad WORM en Triggers (Bloqueo de UPDATE y DELETE)
 * ============================================================================
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || 'creditos.db');

console.log('==============================================================================');
console.log('🏛️  AUDITORÍA DE BASE DE DATOS BANCARIA Y MODO WAL - AURUM BPM CREDIT CORE');
console.log(`📁 Archivo de Base de Datos: ${DB_PATH}`);
console.log('==============================================================================\n');

let db;
try {
  db = new Database(DB_PATH, {
    // timeout en milisegundos para evitar bloqueos
    timeout: 5000,
    verbose: null
  });
} catch (err) {
  console.error('[-] Error crítico al conectar con SQLite mediante better-sqlite3:', err.message);
  process.exit(1);
}

let totalTests = 0;
let passedTests = 0;

function assertCheck(description, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
    if (details) console.log(`     └─ Detalle: ${details}`);
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    if (details) console.error(`     └─ Motivo: ${details}`);
  }
}

// ----------------------------------------------------------------------------
// 1. COMPROBACIÓN DEL MODO WAL (Write-Ahead Logging)
// ----------------------------------------------------------------------------
console.log('📌 1. COMPROBACIÓN DEL MODO WAL (High Performance & Concurrency)');
const journalModeRow = db.pragma('journal_mode', { simple: true });
const synchronousRow = db.pragma('synchronous', { simple: true });

assertCheck(
  'Modo de diario configurado en WAL (Write-Ahead Logging)',
  String(journalModeRow).toLowerCase() === 'wal',
  `PRAGMA journal_mode = '${journalModeRow}' (Esperado: 'wal')`
);

assertCheck(
  'Pragma de sincronización configurado para rendimiento óptimo (NORMAL = 1)',
  synchronousRow === 1 || synchronousRow === '1' || synchronousRow === 'normal',
  `PRAGMA synchronous = ${synchronousRow}`
);

// ----------------------------------------------------------------------------
// 2. COMPROBACIÓN DEL ESQUEMA RELACIONAL Y TABLAS OBLIGATORIAS
// ----------------------------------------------------------------------------
console.log('\n📌 2. COMPROBACIÓN DEL ESQUEMA RELACIONAL');

const requiredTables = ['usuarios', 'solicitudes_credito', 'trazabilidad_auditoria'];
const existingTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
  .all()
  .map(r => r.name);

console.log(`  📋 Tablas detectadas en creditos.db: [ ${existingTables.join(', ')} ]`);

for (const tableName of requiredTables) {
  const exists = existingTables.includes(tableName);
  assertCheck(
    `Existencia de la tabla requerida: '${tableName}'`,
    exists,
    exists ? 'Tabla presente en catálogo sqlite_master' : 'Tabla no encontrada'
  );

  if (exists) {
    const columns = db.pragma(`table_info(${tableName})`);
    const colSummary = columns.map(c => `${c.name} (${c.type}${c.pk ? ' [PK]' : ''}${c.notnull ? ' [NOT NULL]' : ''})`).join(', ');
    console.log(`     └─ Columnas (${columns.length}): ${colSummary}`);
  }
}

// ----------------------------------------------------------------------------
// 3. COMPROBACIÓN DE CLAVES FORÁNEAS (Foreign Keys Integrity)
// ----------------------------------------------------------------------------
console.log('\n📌 3. COMPROBACIÓN DE CLAVES FORÁNEAS (PRAGMA foreign_keys = ON)');

// Asegurar activación para la sesión
db.pragma('foreign_keys = ON');
const fkStatus = db.pragma('foreign_keys', { simple: true });

assertCheck(
  'Restricciones de clave foránea activadas a nivel de motor',
  fkStatus === 1,
  `PRAGMA foreign_keys = ${fkStatus} (1 = HABILITADO / ON)`
);

// Inspección de Foreign Keys en 'trazabilidad_auditoria' hacia 'solicitudes_credito'
const fkList = db.pragma('foreign_key_list(trazabilidad_auditoria)');
const referencesSolicitudes = fkList.some(fk => fk.table === 'solicitudes_credito' && fk.to === 'id');

assertCheck(
  "Relación foránea: 'trazabilidad_auditoria.solicitud_id' -> 'solicitudes_credito.id'",
  referencesSolicitudes,
  fkList.length > 0 ? `Apunta a tabla: '${fkList[0].table}', campo: '${fkList[0].to}', on_delete: '${fkList[0].on_delete}'` : 'Sin FK configurada'
);

// Prueba de violación de clave foránea intencional (rechazo de solicitud_id inexistente)
let fkViolationBlocked = false;
try {
  const orphanInsert = db.prepare(`
    INSERT INTO trazabilidad_auditoria (solicitud_id, accion, usuario_responsable, resultado)
    VALUES (99999999, 'TEST_FK_VIOLATION', 'AUDITOR_PRUEBA', 'RECHAZADO');
  `);
  orphanInsert.run();
} catch (fkErr) {
  if (fkErr.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || fkErr.message.includes('FOREIGN KEY')) {
    fkViolationBlocked = true;
  }
}

assertCheck(
  'Bloqueo estricto de inserción huérfana por violación de Foreign Key',
  fkViolationBlocked,
  'SQLITE_CONSTRAINT_FOREIGNKEY activado correctamente ante solicitud_id inválido'
);

// ----------------------------------------------------------------------------
// 4. COMPROBACIÓN DE BLINDAJE WORM EN TRIGGERS (Inmutabilidad Estricta)
// ----------------------------------------------------------------------------
console.log('\n📌 4. COMPROBACIÓN FORENSE DEL BLINDAJE WORM (Write Once, Read Many)');

// 4.1 Inserción de un registro legítimo para pruebas de ataque
const insertAudit = db.prepare(`
  INSERT INTO trazabilidad_auditoria (solicitud_id, accion, usuario_responsable, resultado)
  VALUES (NULL, 'TEST_INTEGRIDAD_WORM', 'SISTEMA_AUDITORIA', 'REGISTRO_ORIGINAL');
`);
const insertResult = insertAudit.run();
const testRecordId = insertResult.lastInsertRowid;

console.log(`  ℹ️  Registro de prueba insertado con ID: ${testRecordId}`);

// 4.2 Intento de Modificación (UPDATE) -> Debe ser abortado por Trigger
let updateBlocked = false;
let updateErrorMsg = '';

try {
  const updateStmt = db.prepare(`
    UPDATE trazabilidad_auditoria
    SET resultado = 'ALTERADO_POR_ATACANTE'
    WHERE id = ?;
  `);
  updateStmt.run(testRecordId);
} catch (updErr) {
  updateErrorMsg = updErr.message;
  if (
    updateErrorMsg.includes('VIOLACION CRITICA DE AUDITORIA') &&
    updateErrorMsg.includes('UPDATE denegada')
  ) {
    updateBlocked = true;
  }
}

assertCheck(
  "Trigger WORM bloquea sentencia UPDATE en 'trazabilidad_auditoria'",
  updateBlocked,
  `Error arrojado por SQLite: "${updateErrorMsg}"`
);

// 4.3 Intento de Eliminación (DELETE) -> Debe ser abortado por Trigger
let deleteBlocked = false;
let deleteErrorMsg = '';

try {
  const deleteStmt = db.prepare(`
    DELETE FROM trazabilidad_auditoria
    WHERE id = ?;
  `);
  deleteStmt.run(testRecordId);
} catch (delErr) {
  deleteErrorMsg = delErr.message;
  if (
    deleteErrorMsg.includes('VIOLACION CRITICA DE AUDITORIA') &&
    deleteErrorMsg.includes('DELETE denegada')
  ) {
    deleteBlocked = true;
  }
}

assertCheck(
  "Trigger WORM bloquea sentencia DELETE en 'trazabilidad_auditoria'",
  deleteBlocked,
  `Error arrojado por SQLite: "${deleteErrorMsg}"`
);

// 4.4 Verificación de integridad post-ataque: El registro debe permanecer inalterado
const recordCheck = db
  .prepare('SELECT resultado FROM trazabilidad_auditoria WHERE id = ?')
  .get(testRecordId);

assertCheck(
  'El registro original se mantiene intacto tras los intentos de alteración y borrado',
  recordCheck && recordCheck.resultado === 'REGISTRO_ORIGINAL',
  `Valor actual en base de datos: '${recordCheck?.resultado}'`
);

// ----------------------------------------------------------------------------
// RESUMEN EJECUTIVO DE AUDITORÍA
// ----------------------------------------------------------------------------
db.close();

console.log('\n==============================================================================');
console.log(`📊 RESULTADO DE LA AUDITORÍA: ${passedTests} de ${totalTests} pruebas superadas exitosamente (${Math.round((passedTests/totalTests)*100)}%)`);
if (passedTests === totalTests) {
  console.log('🏆 ESTADO DEL HITO: [COMPLETO Y CERTIFICADO PARA PRODUCCIÓN]');
  console.log('   Modo WAL Activo | Claves Foráneas Estrictas | Blindaje WORM 100% Inmutable');
} else {
  console.error('⚠️  ESTADO DEL HITO: [DISCREPANCIAS DETECTADAS - REVISAR LOGS]');
  process.exit(1);
}
console.log('==============================================================================\n');
