/**
 * Construye una única línea de dirección (UK) a partir de campos estructurados.
 * Mantener alineado con Hoff-AppV2/utils/buildDireccionCompleta.ts
 */
function buildDireccionCompleta(parts) {
  const n = parts.numero != null ? String(parts.numero).trim() : '';
  const c = parts.calle != null ? String(parts.calle).trim() : '';
  const pisoT = parts.piso != null ? String(parts.piso).trim() : '';
  const city = parts.ciudad != null ? String(parts.ciudad).trim() : '';
  const cp = parts.codigo_postal != null ? String(parts.codigo_postal).trim() : '';
  const county = parts.provincia != null ? String(parts.provincia).trim() : '';
  const country = parts.pais != null ? String(parts.pais).trim() : '';

  const streetLine = [n, c].filter(Boolean).join(' ');
  const firstBlock = [streetLine, pisoT].filter(Boolean);
  const first = firstBlock.length ? firstBlock.join(', ') : '';

  const cityLine = [city, cp].filter(Boolean).join(' ');

  const segments = [first, cityLine, county, country].map((s) => String(s || '').trim()).filter(Boolean);
  return segments.join(', ');
}

module.exports = { buildDireccionCompleta };
