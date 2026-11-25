export class InputError extends Error {}
export function required(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${name} is required (maximum ${max} characters).`);
  return value.trim();
}
export function optional(value, max = 3000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new InputError('Text is too long or invalid.');
  return value.trim();
}
export function vehicleValues(vehicle) {
  if (!vehicle || typeof vehicle !== 'object' || Array.isArray(vehicle)) throw new InputError('Enter valid vehicle details.');
  const values = [optional(vehicle.year,4), required(vehicle.make,'Make',80), required(vehicle.model,'Model',80), optional(vehicle.plate,30).toUpperCase(), optional(vehicle.vin,17).toUpperCase(), optional(vehicle.color,50), optional(vehicle.notes)];
  if (values[0] && !/^\d{4}$/.test(values[0])) throw new InputError('Enter a four-digit vehicle year.');
  if (values[4] && !/^[A-HJ-NPR-Z0-9]{17}$/.test(values[4])) throw new InputError('VIN must contain 17 valid characters.');
  return values;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw new InputError('Enter a valid date.');
  return value;
}
export function integer(value, name, min, max) {
  const n = Number(value); if (value === '' || value == null || !Number.isSafeInteger(n) || n < min || n > max) throw new InputError(`Enter a valid ${name}.`); return n;
}
export function calculate(items, taxBps) {
  const bps = integer(taxBps, 'tax rate', 0, 2500);
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new InputError('Add between 1 and 100 line items.');
  const normalized = items.map(item => {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || Math.round(quantity*1000)/1000 !== quantity) throw new InputError('Quantity must be positive, with up to 3 decimal places.');
    const rateCents = integer(item.rateCents, 'price', 0, 100000000);
    if (!['Part','Labor','Other'].includes(item.type)) throw new InputError('Choose a line item type.');
    if (typeof item.taxable !== 'boolean') throw new InputError('Invalid tax selection.');
    return { description: required(item.description,'Description',500), partNumber: optional(item.partNumber,100), type: item.type, quantity, rateCents, taxable: item.taxable, amountCents: Math.round(quantity * rateCents) };
  });
  const subtotalCents = normalized.reduce((a,i)=>a+i.amountCents,0);
  const taxCents = Math.round(normalized.filter(i=>i.taxable).reduce((a,i)=>a+i.amountCents,0)*bps/10000);
  if (subtotalCents+taxCents > 10000000000) throw new InputError('Document total is too large.');
  return { items: normalized, subtotalCents, taxCents, totalCents: subtotalCents+taxCents, taxBps:bps };
}
export function searchTerms(value) { return String(value||'').trim().slice(0,200).toLowerCase().replace(/\bbrakes\b/g,'brake').split(/\s+/).filter(Boolean).slice(0,12); }
export function like(value) { return '%'+value.replace(/[\\%_]/g,'\\$&')+'%'; }
