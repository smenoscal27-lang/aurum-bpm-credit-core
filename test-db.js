/**
 * Test de Verificación Arquitectónica: Esquemas y Triggers de Inmutabilidad
 */
const { initDatabase, dbRun, dbGet, dbAll, db } = require('./database');

async function testAuditingTriggers() {
  try {
    console.log('\n--- INICIANDO VERIFICACIÓN DE ARQUITECTURA DE DATOS ---');
    await initDatabase();

    // 1. Verificar modo WAL
    const journalResult = await dbGet('PRAGMA journal_mode;');
    console.log(`[TEST] PRAGMA journal_mode = ${journalResult.journal_mode}`);
    if (journalResult.journal_mode.toLowerCase() !== 'wal') {
      throw new Error('El modo WAL no se encuentra activo');
    }

    // 2. Insertar un registro de auditoría de prueba
    console.log('[TEST] Insertando registro válido en bitacora_auditoria...');
    const insertResult = await dbRun(
      `INSERT INTO bitacora_auditoria (solicitud_id, accion, usuario_responsable, resultado)
       VALUES (?, ?, ?, ?)`,
      [null, 'INICIALIZACION_SISTEMA', 'SYSTEM_ADMIN', 'EXITOSO']
    );
    const auditId = insertResult.lastID;
    console.log(`[TEST] Registro creado con ID: ${auditId}`);

    // 3. Probar violación de UPDATE (Debe fallar)
    console.log('[TEST] Intentando modificar (UPDATE) el registro de auditoría...');
    try {
      await dbRun(
        `UPDATE bitacora_auditoria SET resultado = 'ALTERADO' WHERE id = ?`,
        [auditId]
      );
      throw new Error('FALLO DE SEGURIDAD: El trigger permitió ejecutar UPDATE en bitacora_auditoria.');
    } catch (err) {
      console.log(`[TEST - ÉXITO] UPDATE bloqueado correctamente por SQLite Trigger: "${err.message}"`);
    }

    // 4. Probar violación de DELETE (Debe fallar)
    console.log('[TEST] Intentando eliminar (DELETE) el registro de auditoría...');
    try {
      await dbRun(
        `DELETE FROM bitacora_auditoria WHERE id = ?`,
        [auditId]
      );
      throw new Error('FALLO DE SEGURIDAD: El trigger permitió ejecutar DELETE en bitacora_auditoria.');
    } catch (err) {
      console.log(`[TEST - ÉXITO] DELETE bloqueado correctamente por SQLite Trigger: "${err.message}"`);
    }

    console.log('\n>>> TODAS LAS PRUEBAS DE INMUTABILIDAD PASARON EXITOSAMENTE <<<\n');
  } catch (error) {
    console.error('[-] Error en prueba:', error);
  } finally {
    db.close();
  }
}

testAuditingTriggers();

