// Postcodes.io gives `region` for England; Scotland/Wales/NI only have `country`.
export const UK_REGIONS = [
  'London', 'South East', 'South West', 'East of England', 'West Midlands', 'East Midlands',
  'Yorkshire and The Humber', 'North West', 'North East', 'Scotland', 'Wales', 'Northern Ireland',
];

export async function lookupPostcode(postcode: string): Promise<{ region: string; district: string }> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
  if (res.status === 404) throw new Error('That postcode was not found. Check it and try again.');
  if (!res.ok) throw new Error('Postcode lookup is unavailable right now.');
  const { result } = await res.json();
  return { region: result.region ?? result.country, district: result.admin_district };
}
