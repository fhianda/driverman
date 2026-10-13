'use strict';

// Calculs communs au graphique, aux totaux et à leurs tests.
const FuelMetrics = (() => {
  function intervals(records) {
    const vehicles = new Map();
    const result = [];
    for (const row of [...records].sort((a,b) => a.filled_at.localeCompare(b.filled_at) || a.id-b.id)) {
      let running = vehicles.get(row.vehicle_id);
      if (running) running.litersMl += row.liters_ml;
      if (!Number(row.full_tank)) continue;
      if (running && row.mileage > running.start.mileage) {
        const distance = row.mileage-running.start.mileage;
        result.push({vehicle_id:row.vehicle_id, start_at:running.start.filled_at, end_at:row.filled_at, liters:running.litersMl/1000, distance, rate:running.litersMl/10/distance});
      }
      vehicles.set(row.vehicle_id,{start:row,litersMl:0});
    }
    return result;
  }

  const costCents = row => Number((BigInt(row.liters_ml)*BigInt(row.unit_price_milli)+5000n)/10000n);
  function periodKey(at, grouping) {
    if (grouping === 'year') return at.slice(0,4);
    if (grouping === 'month') return at.slice(0,7);
    if (grouping === 'week') {
      const monday = new Date(`${at.slice(0,10)}T12:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
      return monday.toISOString().slice(0,10);
    }
    return at.slice(0,10);
  }
  function summarize(records, movements, filters) {
    const {vehicleId='all',from,to,currency='USD'} = filters;
    const matches = row => vehicleId === 'all' || row.vehicle_id === Number(vehicleId);
    const inPeriod = at => at && at.slice(0,10) >= from && at.slice(0,10) <= to;
    const refuelings = records.filter(r => matches(r) && inPeriod(r.filled_at));
    // Calculer d'abord sur tout l'historique : le plein de départ peut précéder la période.
    const completed = intervals(records.filter(matches)).filter(r => inPeriod(r.end_at));
    const trips = movements.filter(r => matches(r) && inPeriod(r.end_at));
    const totals = {liters:0,consumed:0,tankDistance:0,distance:0,USD:0,CDF:0,rate:null};
    const automaticGrouping = (Date.parse(to)-Date.parse(from))/86400000 > 62 ? 'month' : 'day';
    const grouping = ['day','week','month','year'].includes(filters.grouping) ? filters.grouping : automaticGrouping;
    const buckets = new Map();
    if (from <= to) {
      const end = new Date(`${to}T12:00:00Z`);
      const first = periodKey(from,grouping);
      const cursor = new Date(`${grouping === 'year' ? first+'-01-01' : grouping === 'month' ? first+'-01' : first}T12:00:00Z`);
      while (cursor <= end) {
        const key = periodKey(cursor.toISOString(),grouping);
        buckets.set(key,{key,liters:0,consumed:0,tankDistance:0,distance:0,spending:0,rate:null});
        if (grouping === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear()+1);
        else if (grouping === 'month') cursor.setUTCMonth(cursor.getUTCMonth()+1);
        else cursor.setUTCDate(cursor.getUTCDate()+(grouping === 'week' ? 7 : 1));
      }
    }
    const bucket = at => buckets.get(periodKey(at,grouping));
    for (const row of refuelings) {
      totals.liters += row.liters_ml/1000;
      totals[row.currency] += costCents(row)/100;
      const point = bucket(row.filled_at);
      if (point) {point.liters += row.liters_ml/1000; if (row.currency === currency) point.spending += costCents(row)/100;}
    }
    for (const row of completed) {
      totals.consumed += row.liters;
      totals.tankDistance += row.distance;
      const point = bucket(row.end_at);
      if (point) {point.consumed += row.liters;point.tankDistance += row.distance;}
    }
    for (const row of trips) {
      const distance = row.end_km-row.start_km;
      totals.distance += distance;
      const point = bucket(row.end_at);
      if (point) point.distance += distance;
    }
    if (totals.tankDistance) totals.rate = totals.consumed/totals.tankDistance*100;
    for (const point of buckets.values()) if (point.tankDistance) point.rate = point.consumed/point.tankDistance*100;
    return {totals,refuelings,intervals:completed,points:[...buckets.values()],grouping,automaticGrouping,monthly:grouping === 'month'};
  }
  return {intervals,costCents,summarize};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FuelMetrics;
