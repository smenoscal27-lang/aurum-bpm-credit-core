/**
 * Test de Integración: API de Créditos, Motor de Reglas y Auditoría Inmutable
 */

const { initDatabase, db, dbRun, dbAll } = require('./database');
const { crearSolicitud, listarSolicitudes, obtenerSolicitudPorId } = require('./credit.controller');

// Mock helpers para Express req y res
const crearMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

async function ejecutarPruebas() {
  try {
    console.log('\n============================================================');
    console.log('🧪 INICIANDO PRUEBAS DE CONTROLADOR Y MOTOR BPM DE CRÉDITOS');
    console.log('============================================================\n');

    await initDatabase();

    // ------------------------------------------------------------------------
    // CASO 1: Aprobación Directa (Monto <= 5000 e Ingresos > 1000)
    // ------------------------------------------------------------------------
    console.log('[TEST 1] Probando caso: Aprobación Directa (Monto $3,000, Ingresos $2,200)...');
    const req1 = {
      body: {
        cliente_nombre: 'Carlos Mendoza',
        cliente_cedula: '0912345678',
        ingresos_mensuales: 2200,
        monto_solicitado: 3000,
        plazo_meses: 24
      },
      headers: { 'x-user-id': 'CANAL_MOVIL' }
    };
    const res1 = crearMockRes();
    await crearSolicitud(req1, res1);

    console.log(` -> HTTP Code: ${res1.statusCode}`);
    console.log(` -> Estado Asignado: ${res1.body.data.solicitud.estado_actual}`);
    console.log(` -> Nivel Riesgo: ${res1.body.data.solicitud.nivel_riesgo}`);
    if (res1.body.data.solicitud.estado_actual !== 'Aprobado') {
      throw new Error(`Fallo en Test 1: Se esperaba 'Aprobado' pero se obtuvo '${res1.body.data.solicitud.estado_actual}'`);
    }

    const idCaso1 = res1.body.data.solicitud.id;

    // ------------------------------------------------------------------------
    // CASO 2: Tareas Paralelas Fork (Monto $7,500, Ingresos $1,800)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2] Probando caso: Tareas Paralelas (Monto $7,500, Ingresos $1,800)...');
    const req2 = {
      body: {
        cliente_nombre: 'Ana Valenzuela',
        cliente_cedula: '1723456789',
        ingresos_mensuales: 1800,
        monto_solicitado: 7500,
        plazo_meses: 36
      },
      headers: { 'x-user-id': 'PORTAL_WEB' }
    };
    const res2 = crearMockRes();
    await crearSolicitud(req2, res2);

    console.log(` -> HTTP Code: ${res2.statusCode}`);
    console.log(` -> Estado Asignado: ${res2.body.data.solicitud.estado_actual}`);
    console.log(` -> Tareas instanciadas:`, res2.body.data.decision_bpm.tareas_paralelas.map(t => t.tipo_tarea));
    if (res2.body.data.solicitud.estado_actual !== 'Tareas_Paralelas') {
      throw new Error(`Fallo en Test 2: Se esperaba 'Tareas_Paralelas' pero se obtuvo '${res2.body.data.solicitud.estado_actual}'`);
    }

    const idCaso2 = res2.body.data.solicitud.id;

    // ------------------------------------------------------------------------
    // CASO 3: Revisión de Riesgo / Comité (Monto $22,000)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3] Probando caso: Revisión de Riesgo (Monto $22,000, Ingresos $3,500)...');
    const req3 = {
      body: {
        cliente_nombre: 'Roberto Gomez',
        cliente_cedula: '1102938475',
        ingresos_mensuales: 3500,
        monto_solicitado: 22000,
        plazo_meses: 48
      },
      headers: { 'x-user-id': 'AGENCIA_CENTRAL' }
    };
    const res3 = crearMockRes();
    await crearSolicitud(req3, res3);

    console.log(` -> HTTP Code: ${res3.statusCode}`);
    console.log(` -> Estado Asignado: ${res3.body.data.solicitud.estado_actual}`);
    console.log(` -> Nivel Riesgo: ${res3.body.data.solicitud.nivel_riesgo}`);
    if (res3.body.data.solicitud.estado_actual !== 'Revision_Riesgo') {
      throw new Error(`Fallo en Test 3: Se esperaba 'Revision_Riesgo' pero se obtuvo '${res3.body.data.solicitud.estado_actual}'`);
    }

    // ------------------------------------------------------------------------
    // CASO 4: Listar Solicitudes
    // ------------------------------------------------------------------------
    console.log('\n[TEST 4] Listando solicitudes registradas...');
    const reqList = { query: {} };
    const resList = crearMockRes();
    await listarSolicitudes(reqList, resList);
    console.log(` -> Total de solicitudes encontradas: ${resList.body.total}`);

    // ------------------------------------------------------------------------
    // CASO 5: Detalle e Inspección de Auditoría Inmutable para Caso 2
    // ------------------------------------------------------------------------
    console.log(`\n[TEST 5] Inspeccionando detalle y bitácora de auditoría para la Solicitud ID: ${idCaso2}...`);
    const reqDetalle = { params: { id: idCaso2 } };
    const resDetalle = crearMockRes();
    await obtenerSolicitudPorId(reqDetalle, resDetalle);

    console.log(` -> Tareas Paralelas registradas: ${resDetalle.body.data.tareas_paralelas.length}`);
    console.log(` -> Eventos de auditoría registrados: ${resDetalle.body.data.bitacora_auditoria.length}`);
    resDetalle.body.data.bitacora_auditoria.forEach((evento, i) => {
      console.log(`    [Evento ${i + 1}] ${evento.accion} | Responsable: ${evento.usuario_responsable} | Fecha: ${evento.timestamp}`);
    });

    console.log('\n============================================================');
    console.log('✅ TODAS LAS PRUEBAS DE CONTROLADOR Y BPM PASARON CON ÉXITO');
    console.log('============================================================\n');

  } catch (error) {
    console.error('[-] Error durante las pruebas:', error);
  } finally {
    db.close();
  }
}

ejecutarPruebas();

