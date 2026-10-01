#!/usr/bin/env node
/**
 * Alta o cambio de clave de una empresa en el archivo de empresas (multiempresa).
 *
 *   node bin/empresa.js alta 133524996 "MI EMPRESA SRL" [cert|test|prod] [archivo-clave-certificado]
 *   node bin/empresa.js nueva-clave 133524996
 *   node bin/empresa.js lista
 *
 * La clave de API se genera al azar y se muestra UNA sola vez; en el archivo solo queda su SHA-256.
 * Archivo: EMPRESAS_PATH o ./config/empresas.json
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RUTA = process.env.EMPRESAS_PATH || path.join(__dirname, '../config/empresas.json');
const leer = () => (fs.existsSync(RUTA) ? JSON.parse(fs.readFileSync(RUTA, 'utf-8')) : []);
const guardar = (lista) => {
  fs.mkdirSync(path.dirname(RUTA), { recursive: true });
  fs.writeFileSync(RUTA, JSON.stringify(lista, null, 2) + '\n', { mode: 0o600 });
};
const nuevaClave = () => {
  const clave = crypto.randomBytes(32).toString('base64url');
  return { clave, hash: crypto.createHash('sha256').update(clave).digest('hex') };
};

const [accion, rnc, nombre, ambiente, archivoClave] = process.argv.slice(2);
const lista = leer();
if (accion === 'lista') {
  for (const e of lista) console.log(`${e.rnc}\t${e.nombre || ''}\t${e.ambiente || ''}\t${e.activa === false ? 'inactiva' : 'activa'}`);
  process.exit(0);
}
if (!rnc || !/^\d{9,11}$/.test(rnc) || !['alta', 'nueva-clave'].includes(accion)) {
  console.error('Uso: node bin/empresa.js alta <RNC> "<nombre>" [cert|test|prod] [archivo-clave-certificado]\n     node bin/empresa.js nueva-clave <RNC>\n     node bin/empresa.js lista');
  process.exit(1);
}
let empresa = lista.find((e) => e.rnc === rnc);
if (accion === 'alta' && !empresa) {
  empresa = { rnc, nombre: nombre || rnc, ambiente: ambiente || 'cert' };
  if (archivoClave) empresa.claveCertificadoArchivo = archivoClave;
  lista.push(empresa);
} else if (!empresa) {
  console.error(`El RNC ${rnc} no está dado de alta.`);
  process.exit(1);
}
const { clave, hash } = nuevaClave();
empresa.apiKeySha256 = hash;
guardar(lista);
console.log(`Empresa ${rnc} guardada en ${RUTA}.`);
console.log(`Clave de API (guárdela ahora; no se vuelve a mostrar):\n${clave}`);
