'use strict';

// Un même instantané alimente l'écran, le PDF et le classeur Excel.
const ReportMetrics = (() => {
  const fuel = typeof module !== 'undefined' && module.exports ? require('./fuel-metrics.js') : FuelMetrics;
  const types = {all:'Rapport complet',courses:'Rapport des courses',fuel:'Rapport carburant'};
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  function validate(filters, today) {
    if (!types[filters.type]) throw new Error('Choisissez un type de rapport.');
    if (!monthPattern.test(filters.from) || !monthPattern.test(filters.to) || filters.from < '2000-01' || filters.from > filters.to || filters.to > today.slice(0,7)) {
      throw new Error('Choisissez une période valide, entre janvier 2000 et le mois en cours.');
    }
    if (filters.vehicleId !== 'all' && !/^[1-9]\d*$/.test(String(filters.vehicleId))) throw new Error('Choisissez un véhicule valide.');
  }
  const blank = () => ({courses:0,completed:0,active:0,distance:0,refuels:0,litersMl:0,USD:0,CDF:0,consumedMl:0,tankDistance:0,intervals:0});
  const finish = value => ({...value,liters:value.litersMl/1000,USD:value.USD/100,CDF:value.CDF/100,consumed:value.intervals ? value.consumedMl/1000 : null,rate:value.tankDistance ? value.consumedMl/10/value.tankDistance : null});
  function summarize(data, filters) {
    validate(filters,data.today);
    const months = new Map();
    let [year,month] = filters.from.split('-').map(Number);
    for (let key=filters.from; key<=filters.to; key=`${year}-${String(month).padStart(2,'0')}`) {
      months.set(key,{key,...blank()});
      if (++month===13) {year++;month=1;}
    }
    const matches = row => filters.vehicleId==='all' || Number(row.vehicle_id)===Number(filters.vehicleId);
    const inPeriod = at => at && at.slice(0,7)>=filters.from && at.slice(0,7)<=filters.to;
    const trips = data.movements.filter(r=>matches(r)&&inPeriod(r.start_at)).sort((a,b)=>a.start_at.localeCompare(b.start_at)||a.id-b.id);
    const refuelings = data.refuelings.filter(r=>matches(r)&&inPeriod(r.filled_at)).sort((a,b)=>a.filled_at.localeCompare(b.filled_at)||a.id-b.id);
    const intervals = fuel.intervals(data.refuelings.filter(matches)).filter(r=>inPeriod(r.end_at));
    const total=blank(), drivers=new Map(), vehicles=new Map();
    const history = new Map([...data.vehicles,...data.movements.map(r=>({...r,id:r.vehicle_id})),...data.refuelings.map(r=>({...r,id:r.vehicle_id}))].map(r=>[Number(r.id),r]));
    function vehicle(id) {
      if (!vehicles.has(id)) {const v=history.get(Number(id));vehicles.set(id,{id,label:v?.plate||`Véhicule ${id}`,...blank()});}
      return vehicles.get(id);
    }
    for (const row of trips) {
      if (!drivers.has(row.driver_id)) drivers.set(row.driver_id,{id:row.driver_id,label:row.driver_name,...blank()});
      for (const value of [total,months.get(row.start_at.slice(0,7)),vehicle(row.vehicle_id),drivers.get(row.driver_id)]) {
        value.courses++; value[row.end_at?'completed':'active']++;
        if (row.end_at) value.distance+=row.end_km-row.start_km;
      }
    }
    for (const row of refuelings) for (const value of [total,months.get(row.filled_at.slice(0,7)),vehicle(row.vehicle_id)]) {
      value.refuels++;value.litersMl+=row.liters_ml;value[row.currency]+=fuel.costCents(row);
    }
    for (const row of intervals) for (const value of [total,months.get(row.end_at.slice(0,7)),vehicle(row.vehicle_id)]) {
      value.intervals++;value.consumedMl+=Math.round(row.liters*1000);value.tankDistance+=row.distance;
    }
    const label=filters.vehicleId==='all'?'Tous les véhicules':history.get(Number(filters.vehicleId))?.plate;
    if (!label) throw new Error('Ce véhicule ne figure plus dans les données disponibles.');
    return {filters:{...filters},title:types[filters.type],vehicleLabel:label,generatedAt:data.now,timezone:data.timezone,demo:!!data.demo,totals:finish(total),months:[...months.values()].map(finish),vehicles:[...vehicles.values()].map(finish).sort((a,b)=>a.label.localeCompare(b.label)),drivers:[...drivers.values()].map(finish).sort((a,b)=>b.courses-a.courses||a.label.localeCompare(b.label)),trips,refuelings};
  }
  const column = (label,type='text',digits=0) => ({label,type,digits});
  const courseColumns = ['Courses','Terminées','En cours','Distance (km)'].map(label=>column(label,'number'));
  const fuelColumns = [column('Ravitaillements','number'),column('Ajouté (L)','number',3),column('Dépenses USD','number',2),column('Dépenses CDF','number',2),column('Consommé (L)','number',3),column('Moyenne (L/100 km)','number',2)];
  const courseValues = v => [v.courses,v.completed,v.active,v.distance];
  const fuelValues = v => [v.refuels,v.liters,v.USD,v.CDF,v.consumed,v.rate];
  function tables(report) {
    const result=[],f=report.filters;
    const add=(name,title,columns,rows,summary=false)=>result.push({name,title,columns,rows,summary});
    if(f.type!=='fuel') {
      add('Courses par mois','Courses par mois',[column('Mois'),...courseColumns],report.months.map(v=>[v.key,...courseValues(v)]),true);
      add('Courses par véhicule','Courses par véhicule',[column('Véhicule'),...courseColumns],report.vehicles.filter(v=>v.courses).map(v=>[v.label,...courseValues(v)]),true);
      add('Courses par chauffeur','Courses par chauffeur',[column('Chauffeur'),...courseColumns],report.drivers.map(v=>[v.label,...courseValues(v)]),true);
    }
    if(f.type!=='courses') {
      add('Carburant par mois','Carburant par mois',[column('Mois'),...fuelColumns],report.months.map(v=>[v.key,...fuelValues(v)]),true);
      add('Carburant par véhicule','Carburant par véhicule',[column('Véhicule'),...fuelColumns],report.vehicles.filter(v=>v.refuels||v.intervals).map(v=>[v.label,...fuelValues(v)]),true);
    }
    if(f.type!=='fuel') add('Détail courses','Détail des courses',[column('N°','number'),column('Départ','date'),column('Retour réel','date'),column('Véhicule'),column('Chauffeur'),column('Destination'),column('Motif'),column('Statut'),column('Distance (km)','number')],report.trips.map(r=>[r.id,r.start_at,r.end_at,r.plate,r.driver_name,r.destination,r.purpose,r.end_at?'Terminée':'En cours',r.end_at?r.end_km-r.start_km:null]));
    if(f.type!=='courses') add('Détail carburant','Détail des ravitaillements',[column('Date','date'),column('Véhicule'),column('Compteur (km)','number'),column('Quantité (L)','number',3),column('Prix par litre','number',3),column('Total','number',2),column('Devise'),column('Plein'),column('Station')],report.refuelings.map(r=>[r.filled_at,r.plate,r.mileage,r.liters_ml/1000,r.unit_price_milli/1000,fuel.costCents(r)/100,r.currency,Number(r.full_tank)?'Complet':'Partiel',r.station||'Non renseignée']));
    return result;
  }
  function notes(report) {
    const result=[];
    if(report.filters.type!=='fuel') result.push('Une course correspond à un départ enregistré. Courses et kilomètres sont rattachés au mois du départ. La distance inclut seulement les courses terminées ; le statut est celui de la date de génération, même si le retour a eu lieu après la période.');
    if(report.filters.type!=='courses') result.push('Les litres ajoutés et les dépenses sont rattachés à la date du ravitaillement. USD et CDF sont séparés, sans conversion. La consommation est estimée entre deux pleins complets et rattachée au plein final, avec les ajouts partiels intermédiaires. Le premier plein est exclu. Sans intervalle exploitable, la consommation est indéterminée.');
    result.push(`Source : enregistrements DriverMan TELESOL${report.demo?' (données fictives de démonstration)':''}. Horaires locaux : ${report.timezone}.`);
    return result;
  }
  return {types,validate,summarize,tables,notes};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=ReportMetrics;
