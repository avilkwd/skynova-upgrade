const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const compact = value => fold(value).replace(/[^\p{L}\p{N}]/gu, '');
const customerFields = customer => [customer.name, customer.phone, customer.phone_digits, customer.email, customer.address, customer.notes];
const vehicleFields = vehicle => [vehicle.year, vehicle.make, vehicle.model, vehicle.plate, vehicle.vin, vehicle.color, vehicle.notes];
const matches = (fields, tokens) => tokens.every(token => fields.some(value => compact(value).includes(token)));

// Keep results empty until staff search; never render the entire customer directory.
export function findCustomers(customers, vehicles, query) {
  const text = String(query ?? '').trim();
  if (!text) return [];
  const phoneOnly = /^[+\d\s().-]+$/.test(text);
  const phone = text.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const tokens = text.split(/\s+/).map(compact).filter(Boolean);
  if (!tokens.length) return [];
  const byCustomer = new Map();
  for (const vehicle of vehicles) {
    const owned = byCustomer.get(vehicle.customer_id) || [];
    owned.push(vehicle);
    byCustomer.set(vehicle.customer_id, owned);
  }
  return customers.flatMap(customer => {
    const owned = byCustomer.get(customer.id) || [];
    const fields = customerFields(customer);
    if (phoneOnly) {
      const matchingVehicles = phone ? owned.filter(vehicle => matches(vehicleFields(vehicle), [phone])) : [];
      return phone && (matches(fields, [phone]) || matchingVehicles.length)
        ? [{customer, vehicles: matchingVehicles.length ? matchingVehicles : owned, matchedVehicleId: matchingVehicles[0]?.id || ''}] : [];
    }
    if (!matches([...fields, ...owned.flatMap(vehicleFields)], tokens)) return [];
    const vehicleTokens = tokens.filter(token => !matches(fields, [token]));
    const matched = vehicleTokens.length ? owned.filter(vehicle => matches(vehicleFields(vehicle), vehicleTokens)) : [];
    return [{customer, vehicles: matched.length ? matched : owned, matchedVehicleId: matched[0]?.id || ''}];
  });
}
