import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import FuelMetrics from '../assets/fuel-metrics.js';

const fill=(id,vehicle_id,day,mileage,liters,full_tank,currency='USD',price=1250) => ({id,vehicle_id,filled_at:`2026-09-${day} 12:00:00`,mileage,liters_ml:liters*1000,unit_price_milli:price,full_tank,currency});
const records=[fill(1,1,'01',1000,50,1),fill(2,1,'03',1200,20,0,'CDF',3000000),fill(3,1,'05',1500,30,1),fill(4,1,'07',1600,5,0),fill(5,2,'01',5000,90,1),fill(6,2,'05',6000,70,1)];
const intervals=FuelMetrics.intervals([...records].reverse());
assert.equal(intervals.length,2);
assert.equal(intervals.find(i=>i.vehicle_id===1).liters,50,'Inclure le plein final et les ajouts partiels, exclure le premier plein et les ajouts après le dernier plein');
assert.equal(intervals.find(i=>i.vehicle_id===1).rate,10);
assert.equal(intervals.find(i=>i.vehicle_id===2).rate,7);
const filters={from:'2026-09-03',to:'2026-09-07',vehicleId:'all',currency:'USD'};
const result=FuelMetrics.summarize(records,[{vehicle_id:1,start_km:1000,end_km:1200,end_at:'2026-09-03 18:00:00'},{vehicle_id:1,start_km:1200,end_km:null,end_at:null}],filters);
assert.equal(result.totals.liters,125);
assert.equal(result.totals.consumed,120,'Calculer avec le plein de départ hors période');
assert.equal(result.totals.rate,8,'Moyenne pondérée par la distance');
assert.equal(result.totals.distance,200,'Exclure les missions en cours');
assert.equal(result.totals.CDF,60000);
assert.equal(result.totals.USD,131.25);
assert.equal(result.points.find(p=>p.key==='2026-09-04').liters,0,'Afficher les jours sans ravitaillement');
assert.equal(result.points.find(p=>p.key==='2026-09-04').rate,null,'Ne jamais inventer une consommation nulle');
assert.equal(result.points.find(p=>p.key==='2026-09-03').spending,0,'Ne pas mélanger les devises');
const one=FuelMetrics.summarize(records,[],{...filters,vehicleId:'1',currency:'CDF'});
assert.equal(one.totals.consumed,50);
assert.equal(one.points.find(p=>p.key==='2026-09-03').spending,60000);
assert.equal(FuelMetrics.intervals([fill(1,1,'01',1000,10,0),fill(2,1,'03',1200,50,1)]).length,0,'Un seul plein complet ne suffit pas');
assert.equal(FuelMetrics.intervals([fill(1,1,'01',1000,50,1),fill(2,1,'03',1000,10,1)]).length,0,'Pas de division par zéro');
assert.equal(FuelMetrics.costCents({liters_ml:12345,unit_price_milli:1234}),1523);
assert.equal(FuelMetrics.summarize(records,[],{...filters,from:'2026-01-01'}).monthly,true);
assert.equal(FuelMetrics.summarize([],[],filters).totals.rate,null);

// Changing grouping must preserve filtered totals and currency separation.
for (const grouping of ['day','week','month','year']) {
  const grouped=FuelMetrics.summarize(records,[{vehicle_id:1,start_km:1000,end_km:1200,end_at:'2026-09-03 18:00:00'}],{...filters,grouping});
  assert.deepEqual(grouped.totals,result.totals);
  assert.equal(grouped.points.reduce((sum,p)=>sum+p.liters,0),125);
  assert.equal(grouped.points.reduce((sum,p)=>sum+p.spending,0),131.25);
  assert.equal(grouped.points.reduce((sum,p)=>sum+p.distance,0),200);
  assert.equal(grouped.grouping,grouping);
}
const weekly=FuelMetrics.summarize(records,[],{...filters,grouping:'week',vehicleId:'1',currency:'CDF'});
assert.deepEqual(weekly.points.map(p=>p.key),['2026-08-31','2026-09-07']);
assert.equal(weekly.points[0].liters,50,'Ne pas inclure le plein du 1er septembre hors du filtre');
assert.equal(weekly.points[0].spending,60000);
assert.equal(weekly.points[1].rate,null);
const monthly=FuelMetrics.summarize(records,[],{...filters,grouping:'month'});
assert.equal(monthly.points[0].rate,8,'Moyenne mensuelle pondérée, pas moyenne simple des consommations');
assert.deepEqual(monthly.points.map(p=>p.key),['2026-09']);
const boundaryRecords=['2020-12-27','2020-12-31','2021-01-03','2021-01-04','2021-01-05'].map((day,index)=>({...fill(index+1,1,'01',1000,10,0),filled_at:day+' 12:00:00'}));
const boundaryFilters={from:'2020-12-31',to:'2021-01-04',grouping:'week'};
const boundary=FuelMetrics.summarize(boundaryRecords,[],boundaryFilters);
assert.deepEqual(boundary.points.map(p=>[p.key,p.liters]),[['2020-12-28',20],['2021-01-04',10]],'Semaines du lundi au dimanche, même au changement d’année');
const years=FuelMetrics.summarize(boundaryRecords,[],{...boundaryFilters,grouping:'year'});
assert.deepEqual(years.points.map(p=>[p.key,p.liters]),[['2020',10],['2021',20]]);
const months=FuelMetrics.summarize(boundaryRecords,[],{...boundaryFilters,grouping:'month'});
assert.deepEqual(months.points.map(p=>[p.key,p.liters]),[['2020-12',10],['2021-01',20]]);
const leap=FuelMetrics.summarize([],[],{from:'2024-02-28',to:'2024-03-01',grouping:'day'});
assert.deepEqual(leap.points.map(p=>p.key),['2024-02-28','2024-02-29','2024-03-01']);
const emptyYears=FuelMetrics.summarize([],[],{from:'2024-02-28',to:'2026-03-01',grouping:'year'});
assert.deepEqual(emptyYears.points.map(p=>p.key),['2024','2025','2026']);
assert.ok(emptyYears.points.every(p=>p.rate===null&&p.liters===0));
assert.equal(FuelMetrics.summarize(records,[],{...filters,grouping:'invalid'}).grouping,'day');

// The selector must remain usable on empty charts as well as populated charts.
const ui=vm.createContext({document:{addEventListener(){}},FuelMetrics,esc:String,icon:()=>'',chartData:null});
vm.runInContext(await readFile(new URL('../assets/fuel-ui.js',import.meta.url),'utf8'),ui);
for (const grouping of ['day','week','month','year']) {
  ui.chartData=FuelMetrics.summarize(records,[],{...filters,grouping});
  vm.runInContext(`fuelFilters.grouping='${grouping}'`,ui);
  const html=vm.runInContext('fuelChart(chartData)',ui);
  assert.ok(html.includes(`value="${grouping}" selected`));
  assert.ok(html.includes('Auto (par jour)'));
  assert.ok(!html.includes('NaN'));
}
ui.chartData=emptyYears;
assert.match(vm.runInContext('fuelChart(chartData)',ui),/id="fuel-grouping"/);
assert.match(vm.runInContext('fuelChart(chartData)',ui),/Aucune donnée/);
console.log('Calculs carburant : totaux, devises, regroupements jour/semaine/mois/année, limites de dates et sélecteur validés.');
