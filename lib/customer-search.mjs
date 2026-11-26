const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const compact = value => fold(value).replace(/[^\p{L}\p{N}]/gu, '');
export const customerSearchFields = [
  {key:'name', label:'Name', placeholder:'Customer name'},
  {key:'phone', label:'Phone number', placeholder:'Full or partial number'},
  {key:'email', label:'Email', placeholder:'Email address'},
  {key:'address', label:'Address', placeholder:'Street, city, or ZIP'},
  {key:'customerNotes', label:'Customer notes', placeholder:'Words from customer notes'},
];
export const vehicleSearchFields = [
  {key:'year', label:'Year', placeholder:'e.g. 2019'},
  {key:'make', label:'Make', placeholder:'e.g. Toyota'},
  {key:'model', label:'Model', placeholder:'e.g. Camry'},
  {key:'plate', label:'License plate', placeholder:'Full or partial plate'},
  {key:'vin', label:'VIN', placeholder:'Full or partial VIN'},
  {key:'color', label:'Color', placeholder:'e.g. Silver'},
  {key:'vehicleNotes', label:'Vehicle notes', placeholder:'Words from vehicle notes'},
];
const customerKeys = customerSearchFields.map(field => field.key);
const vehicleKeys = vehicleSearchFields.map(field => field.key);
function matchesField(value, query, key) {
  if (key === 'phone') {
    const digits = String(query).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return !!digits && String(value ?? '').replace(/\D/g, '').includes(digits);
  }
  const tokens = String(query).trim().split(/\s+/).map(compact).filter(Boolean);
  return !!tokens.length && tokens.every(token => compact(value).includes(token));
}

// Every filled field must match its own parameter. Vehicle filters must match one car.
export function findCustomers(customers, vehicles, filters = {}) {
  const active = keys => keys.filter(key => String(filters[key] ?? '').trim());
  const customerFilters = active(customerKeys), vehicleFilters = active(vehicleKeys);
  if (!customerFilters.length && !vehicleFilters.length) return [];
  const byCustomer = new Map();
  for (const vehicle of vehicles) {
    const owned = byCustomer.get(vehicle.customer_id) || [];
    owned.push(vehicle);
    byCustomer.set(vehicle.customer_id, owned);
  }
  return customers.flatMap(customer => {
    if (!customerFilters.every(key => matchesField(key === 'customerNotes' ? customer.notes : key === 'phone' ? customer.phone_digits || customer.phone : customer[key], filters[key], key))) return [];
    const owned = byCustomer.get(customer.id) || [];
    const matched = vehicleFilters.length ? owned.filter(vehicle => vehicleFilters.every(key => matchesField(key === 'vehicleNotes' ? vehicle.notes : vehicle[key], filters[key], key))) : owned;
    if (vehicleFilters.length && !matched.length) return [];
    return [{customer, vehicles: matched, matchedVehicleId: vehicleFilters.length ? matched[0].id : ''}];
  });
}
