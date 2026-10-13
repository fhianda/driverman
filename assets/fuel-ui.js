'use strict';

const fuelFilters = {vehicleId:'all',metric:'liters',currency:'USD',grouping:'auto',from:'',to:''};
const fuelIndicators = {
  liters:['Carburant ajouté','L'], consumed:['Consommation entre pleins','L'],
  distance:['Kilomètres des trajets terminés','km'], spending:['Dépenses carburant',''], rate:['Consommation moyenne','L/100 km'],
};
const fuelNumber = (value,digits=2) => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:digits}).format(value);
const fuelMoney = (value,currency) => new Intl.NumberFormat('fr-FR',{style:'currency',currency,minimumFractionDigits:2}).format(value);

function fuelVehicleOptions() {
  const vehicles = new Map(state.data.vehicles.map(v => [v.id,{...v,removed:false}]));
  for (const row of [...state.data.refuelings,...state.data.movements]) {
    if (!vehicles.has(row.vehicle_id)) vehicles.set(row.vehicle_id,{id:row.vehicle_id,plate:row.plate,make:row.make,model:row.model,removed:'vehicle_deleted_at' in row ? Boolean(row.vehicle_deleted_at) : true});
  }
  return [...vehicles.values()].sort((a,b) => a.plate.localeCompare(b.plate));
}

function fuelDashboard() {
  fuelFilters.from ||= addDays(state.data.today,-29);
  fuelFilters.to ||= state.data.today;
  const indicators = Object.entries(fuelIndicators).filter(([key]) => isAdmin() || ['liters','distance','spending'].includes(key));
  if (!indicators.some(([key]) => key === fuelFilters.metric)) fuelFilters.metric = 'liters';
  if (fuelFilters.vehicleId !== 'all' && !fuelVehicleOptions().some(v => v.id === Number(fuelFilters.vehicleId))) fuelFilters.vehicleId = 'all';
  const select = (name,label,values) => `<label>${label}<select name="${name}" data-fuel-filter>${values.map(([value,text]) => `<option value="${esc(value)}" ${String(fuelFilters[name])===String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  return `<section class="panel fuel-insights" aria-labelledby="fuel-insights-title"><div class="panel-heading"><div><h2 id="fuel-insights-title">${isAdmin() ? 'Carburant & kilométrage' : 'Mes achats de carburant'}</h2><p>${isAdmin() ? 'Comparez les ravitaillements et l’activité de votre parc.' : 'Vos achats enregistrés et les kilomètres de vos missions.'}</p></div><button class="text-button" data-action="add-refueling">${icon('plus')} ${isAdmin() ? 'Ravitaillement' : 'Acheter du carburant'}</button></div><div class="fuel-filters">
    ${select('vehicleId','Véhicule',[['all','Tous les véhicules'],...fuelVehicleOptions().map(v => [v.id,`${v.plate} · ${v.make} ${v.model}${v.removed ? ' (retiré du parc)' : ''}`])])}
    ${select('metric','Indicateur',indicators.map(([key,value]) => [key,value[0]]))}
    <label>Du<input type="date" name="from" data-fuel-filter value="${fuelFilters.from}" min="2000-01-01" max="${state.data.today}"></label><label>Au<input type="date" name="to" data-fuel-filter value="${fuelFilters.to}" min="2000-01-01" max="${state.data.today}"></label>
    ${select('currency','Devise du graphique',[['USD','USD'],['CDF','CDF']])}</div><p id="fuel-filter-error" class="fuel-error" role="alert"></p><div id="fuel-insight-results"></div></section>`;
}

function fuelPage() {
  return `${fuelDashboard()}<section class="panel fuel-history"><div class="panel-heading"><div><h2>Ravitaillements enregistrés</h2><p>Le véhicule et la période sélectionnés filtrent également cet historique.</p></div>${icon('fuel')}</div><div id="fuel-records"></div></section>`;
}

function renderFuelInsights() {
  const target = document.querySelector('#fuel-insight-results');
  if (!target) return;
  const summaryTarget = document.querySelector('#overview-fuel-summary');
  const error = document.querySelector('#fuel-filter-error');
  if (!fuelFilters.from || !fuelFilters.to || fuelFilters.from > fuelFilters.to || fuelFilters.from < '2000-01-01' || fuelFilters.to > state.data.today) {
    error.textContent = 'Choisissez une période valide, entre le 01/01/2000 et aujourd’hui.';
    target.innerHTML = '';
    if (summaryTarget) summaryTarget.innerHTML = '<p class="fuel-error">Choisissez une période valide dans les filtres du graphique pour afficher les indicateurs carburant.</p>';
    const records = document.querySelector('#fuel-records'); if (records) records.innerHTML = '';
    return;
  }
  error.textContent = '';
  const data = FuelMetrics.summarize(state.data.refuelings,state.data.movements,fuelFilters);
  const t = data.totals;
  const metrics = [
    ['Carburant ajouté',`${fuelNumber(t.liters)} L`,'Somme des ravitaillements'],
    ['Consommation calculée',data.intervals.length ? `${fuelNumber(t.consumed)} L` : '—',`${data.intervals.length} intervalle(s) entre pleins complets`],
    ['Consommation moyenne',t.rate === null ? '—' : `${fuelNumber(t.rate)} L/100 km`,`${fuelNumber(t.tankDistance)} km entre pleins`],
    ['Kilomètres parcourus',`${fuelNumber(t.distance)} km`,'Trajets terminés sur la période'],
    ['Dépenses en USD',fuelMoney(t.USD,'USD'),'Sans conversion de devise'],
    ['Dépenses en CDF',fuelMoney(t.CDF,'CDF'),'Sans conversion de devise'],
  ].filter((_,index) => isAdmin() || ![1,2].includes(index));
  const summary = `<div class="fuel-stats${isAdmin() ? '' : ' fuel-stats-personal'}">${metrics.map(([label,value,sub]) => `<div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('')}</div>`;
  if (summaryTarget) summaryTarget.innerHTML = `<p class="overview-period">Carburant · du ${date(fuelFilters.from)} au ${date(fuelFilters.to)} · ${fuelFilters.vehicleId === 'all' ? 'Tous les véhicules' : esc(fuelVehicleOptions().find(v => v.id===Number(fuelFilters.vehicleId))?.plate || 'Véhicule sélectionné')}</p>${summary}`;
  const method = 'La consommation est estimée entre deux pleins complets, en incluant les ajouts intermédiaires et en excluant le premier plein. Elle est rattachée à la date du plein final ; la période de conduite peut commencer avant le filtre choisi. Sans deux pleins complets à des kilométrages différents, elle reste indéterminée. Les litres ajoutés ne sont pas les litres consommés.';
  target.innerHTML = `${summaryTarget ? '' : summary}${fuelChart(data)}${!isAdmin() ? '<p class="fuel-method">Seuls les achats enregistrés avec votre compte sont affichés. Le suivi de consommation du véhicule est disponible dans l’espace administrateur.</p>' : summaryTarget ? `<details class="fuel-method"><summary>Comprendre le calcul de consommation</summary><p>${method}</p></details>` : `<p class="fuel-method">${method}</p>`}`;
  const records = document.querySelector('#fuel-records');
  if (records) records.innerHTML = fuelTable(data.refuelings);
}

function fuelChart(data) {
  const metric = fuelFilters.metric;
  const [label,baseUnit] = fuelIndicators[metric];
  const unit = metric === 'spending' ? fuelFilters.currency : baseUnit;
  const groupNames = {day:'Par jour',week:'Par semaine',month:'Par mois',year:'Par année'};
  const groupingOptions = [['auto',`Auto (${groupNames[data.automaticGrouping].toLowerCase()})`],...Object.entries(groupNames)];
  const heading = `<div class="fuel-chart-heading"><h3>${esc(label)} <span>(${esc(unit)})</span></h3><div class="fuel-grouping"><label for="fuel-grouping">Regrouper</label><select id="fuel-grouping" name="grouping" data-fuel-filter>${groupingOptions.map(([value,text]) => `<option value="${value}" ${fuelFilters.grouping===value ? 'selected' : ''}>${text}</option>`).join('')}</select></div></div>${data.grouping==='week' ? '<p class="fuel-grouping-note">Semaines du lundi au dimanche, dans les dates sélectionnées.</p>' : ''}`;
  const points = data.points;
  const known = points.filter(p => p[metric] !== null);
  if (!known.length || (!data.refuelings.length && !data.intervals.length && !data.totals.distance)) return `${heading}<div class="fuel-chart-empty">${icon('activity')}<strong>${metric === 'rate' || metric === 'consumed' ? 'Pas encore assez de pleins pour calculer la consommation' : 'Aucune donnée sur cette période'}</strong><span>Enregistrez vos ravitaillements ou élargissez la période.</span></div>`;
  if (metric === 'consumed' && !data.intervals.length) return `${heading}<div class="fuel-chart-empty"><strong>Deux pleins complets sont nécessaires</strong><span>Les ajouts de carburant restent visibles dans l’indicateur « Carburant ajouté ».</span></div>`;
  const formatValue = value => fuelNumber(value,metric === 'liters' || metric === 'consumed' ? 3 : 2);
  const valueLabels = points.map((p,index) => ({index,value:p[metric]})).filter(p => p.value>0).map(p => ({...p,width:formatValue(p.value).length*7}));
  const slotWidth = Math.max(24,...valueLabels.slice(1).map((p,i) => (p.width/2+valueLabels[i].width/2+12)/(p.index-valueLabels[i].index)));
  const max = Math.max(1,...known.map(p => p[metric]))*1.1;
  const left=Math.max(62,(valueLabels[0]?.width || 0)/2+8),right=Math.max(20,(valueLabels.at(-1)?.width || 0)/2+8);
  const width = Math.max(720,points.length*slotWidth+left+right), height=260, plotHeight=168, top=28;
  const step=(width-left-right)/points.length;
  const pointLabel = p => data.grouping === 'year' ? p.key : data.grouping === 'month' ? `${p.key.slice(5,7)}/${p.key.slice(0,4)}` : `${data.grouping === 'week' ? 'S. ' : ''}${p.key.slice(8,10)}/${p.key.slice(5,7)}`;
  const periodLabel = p => data.grouping === 'week' ? `Semaine du ${p.key.slice(8,10)}/${p.key.slice(5,7)}/${p.key.slice(0,4)}` : p.key;
  const ticks = Array.from({length:5},(_,i) => {const value=max*i/4,y=top+plotHeight-value/max*plotHeight;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="fuel-gridline"/><text x="${left-8}" y="${y+4}" text-anchor="end">${fuelNumber(value,1)}</text>`;}).join('');
  const bars = points.map((p,i) => {
    const value=p[metric],h=value===null ? 0 : Math.max(value>0 ? 2 : 0,value/max*plotHeight);
    const x=left+i*step+step*.15,y=top+plotHeight-h,center=x+step*.35;
    const bar=value!==null ? `<rect x="${x}" y="${y}" width="${step*.7}" height="${h}" rx="3"><title>${esc(periodLabel(p))} : ${formatValue(value)} ${esc(unit)}</title></rect>` : '';
    const valueLabel=value>0 ? `<text class="fuel-bar-value" x="${center}" y="${y-8}" text-anchor="middle">${formatValue(value)}</text>` : '';
    const tick=i%Math.max(1,Math.ceil(points.length/12))===0 ? `<text x="${center}" y="${top+plotHeight+23}" text-anchor="middle">${pointLabel(p)}</text>` : '';
    return `${bar}${valueLabel}${tick}`;
  }).join('');
  return `${heading}<div class="fuel-chart-scroll" tabindex="0" role="region" aria-label="Graphique ${esc(label)}"><svg class="fuel-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="${esc(label)} en ${esc(unit)}, ${groupNames[data.grouping].toLowerCase()}. Les valeurs sont affichées au-dessus des barres et dans le tableau sous le graphique."><title>${esc(label)} (${esc(unit)})</title>${ticks}${bars}</svg></div><details class="fuel-values"><summary>Voir les valeurs du graphique</summary><div class="table-scroll"><table class="table"><thead><tr><th>Période</th><th>${esc(label)} (${esc(unit)})</th></tr></thead><tbody>${points.map(p => `<tr><td>${esc(periodLabel(p))}</td><td>${p[metric]===null ? 'Non calculable' : formatValue(p[metric])}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function fuelTable(records, compact = false) {
  if (compact) {
    if (!records.length) return emptyState('Aucun ravitaillement pour le moment','Les prochains ajouts de carburant apparaîtront ici.','add-refueling','Enregistrer un ravitaillement');
    return `<div class="table-scroll"><table class="table"><thead><tr><th>Véhicule / date</th><th>Quantité</th><th>Total</th></tr></thead><tbody>${records.map(r => `<tr><td><strong>${esc(r.plate)}${r.vehicle_deleted_at ? ' · retiré' : ''}</strong><small>${date(r.filled_at,true)}</small></td><td>${fuelNumber(r.liters_ml/1000,3)} L</td><td><strong>${fuelMoney(FuelMetrics.costCents(r)/100,r.currency)}</strong></td></tr>`).join('')}</tbody></table></div>`;
  }
  if (!records.length) return emptyState('Aucun ravitaillement sur cette période','Choisissez un véhicule ou une autre période.','add-refueling','Enregistrer un ravitaillement');
  return `<div class="table-scroll"><table class="table"><thead><tr><th>Date / véhicule</th><th>Quantité</th><th>Prix unitaire</th><th>Total</th><th>Compteur</th><th>Plein</th><th>Lieu</th></tr></thead><tbody>${records.map(r => `<tr><td><strong>${esc(r.plate)}${r.vehicle_deleted_at ? ' · retiré' : ''}</strong><small>${date(r.filled_at,true)}</small></td><td>${fuelNumber(r.liters_ml/1000,3)} L</td><td>${fuelNumber(r.unit_price_milli/1000,3)} ${esc(r.currency)}/L</td><td><strong>${fuelMoney(FuelMetrics.costCents(r)/100,r.currency)}</strong></td><td>${number(r.mileage)} km</td><td>${Number(r.full_tank) ? 'Complet' : 'Partiel'}</td><td>${esc(r.station || 'Non renseigné')}${r.latitude!==null && r.longitude!==null ? `<small>${fuelNumber(r.latitude,6)}, ${fuelNumber(r.longitude,6)}${r.accuracy!==null ? ` · ± ${number(Math.round(r.accuracy))} m` : ''}</small><a class="text-button" href="https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=16/${r.latitude}/${r.longitude}" target="_blank" rel="noopener noreferrer">Voir la carte ${icon('pin')}</a>` : '<small>Sans coordonnées</small>'}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function openRefueling(vehicleId=0) {
  const vehicles=selectableVehicles().filter(v => v.fuel!=='Électrique');
  if (!vehicles.length) {openModal(isAdmin() ? 'Ajouter un véhicule' : 'Aucun véhicule disponible',isAdmin() ? 'Un véhicule utilisant du carburant est nécessaire.' : 'Un véhicule disponible ou celui de votre mission en cours doit utiliser du carburant.',`<div class="modal-actions"><button class="btn secondary" data-action="close">Fermer</button>${isAdmin() ? '<button class="btn primary" data-action="add-vehicle">Ajouter un véhicule</button>' : ''}</div>`);return;}
  const currentVehicleId = !isAdmin() && state.data.movements.find(m => !m.end_at)?.vehicle_id;
  const vehicle=vehicles.find(v => v.id===(vehicleId || Number(fuelFilters.vehicleId) || currentVehicleId)) || vehicles[0];
  const optional = (label,name,type='text',extra='') => `<div class="field"><label for="fuel-${name}">${label}</label><input id="fuel-${name}" name="${name}" type="${type}" ${extra}></div>`;
  openModal(isAdmin() ? 'Enregistrer un ravitaillement' : 'Acheter du carburant','Enregistrez la quantité achetée, le coût et le compteur du véhicule.',`<form id="record-form" method="post" data-action="save-refueling">
    ${selectField('Véhicule','vehicle_id',vehicles.map(v => [v.id,`${v.plate} · ${v.make} ${v.model}`]),vehicle.id)}
    <div class="form-row">${inputField('Date et heure','filled_at',serverNow(),'datetime-local',`max="${serverNow()}"`)}${inputField('Compteur (km)','mileage',vehicle.mileage,'number','min="0" max="10000000" step="1"')}</div>
    <p class="field-hint">Heure locale : ${esc(state.data.timezone)}. Pour une saisie passée, indiquez le compteur relevé ce jour-là.</p>
    <div class="form-row">${inputField('Quantité (litres)','liters','','number','min="0.001" max="10000" step="0.001" placeholder="Ex. 45,5"')}${inputField('Prix par litre','unit_price','','number','min="0" max="10000000" step="0.001" placeholder="Ex. 1,25"')}</div>
    ${selectField('Devise','currency',[['USD','Dollar américain (USD)'],['CDF','Franc congolais (CDF)']],fuelFilters.currency)}
    <p class="fuel-form-total" aria-live="polite">Total : <strong id="fuel-total">—</strong></p>
    <label class="fuel-full"><input type="checkbox" name="full_tank" value="1"> Plein complet (réservoir rempli)</label><p class="field-hint">Cochez uniquement si le réservoir est rempli : deux pleins complets permettent le calcul en L/100 km.</p>
    ${optional('Station / lieu (facultatif)','station','text','maxlength="150"')}
    <fieldset class="fuel-location"><legend>Position du ravitaillement (facultative)</legend>
      <button type="button" class="btn secondary" data-action="locate-refueling">${icon('pin')} Utiliser ma position actuelle</button>
      <p id="fuel-location-status" role="status">Ce bouton remplit automatiquement la latitude et la longitude depuis cet appareil. Autorisez la localisation lorsqu’elle est demandée. Pour un ancien achat, saisissez la position de la station.</p>
      <div class="form-row">${optional('Latitude WGS84','latitude','number','min="-90" max="90" step="any" placeholder="Ex. -4,325"')}${optional('Longitude WGS84','longitude','number','min="-180" max="180" step="any" placeholder="Ex. 15,322"')}</div><input type="hidden" name="accuracy" value="">
      <div class="fuel-map-links"><a id="fuel-location-preview" class="text-button" hidden target="_blank" rel="noopener noreferrer">Voir le point sur la carte (facultatif) ${icon('pin')}</a></div>
    </fieldset>
    <div class="field"><label for="fuel-notes">Observations (facultatif)</label><textarea id="fuel-notes" name="notes" maxlength="1000" rows="2"></textarea></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">Enregistrer ${icon('check')}</button></div></form>`);
}

let fuelLocationController;

function updateFuelLocationPreview(form) {
  const lat = form.elements.latitude.value, lon = form.elements.longitude.value;
  const point = lat !== '' && lon !== '' ? {latitude:Number(lat),longitude:Number(lon)} : null;
  const link = form.querySelector('#fuel-location-preview'), url = DriverManGeo.mapUrl(point);
  link.hidden = !url;
  if (url) link.href = url;
  else link.removeAttribute('href');
}

async function locateRefueling(button) {
  const form=button.closest('form');
  const status=form.querySelector('#fuel-location-status');
  const geolocation=window.DriverManMobile?.geolocation || navigator.geolocation;
  if ((!window.isSecureContext && !window.DriverManMobile) || !geolocation) {status.textContent='La localisation nécessite HTTPS ou localhost. Vous pouvez saisir les coordonnées manuellement.';return;}
  if (fuelLocationController) { fuelLocationController.abort(); return; }
  const controller = new AbortController();
  fuelLocationController = controller;
  button.textContent='Annuler le relevé';status.textContent='Recherche de votre position… Les champs se rempliront dès le premier relevé.';
  const inputs = ['latitude','longitude'].map(name => form.elements[name]);
  inputs.forEach(input => input.readOnly = true);
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  let latest;
  const description = point => `${point.accuracy > DriverManGeo.recommendedAccuracy ? 'Position approximative' : 'Position relevée'} · précision estimée : ± ${number(Math.ceil(point.accuracy))} m.`;
  const apply = point => {
    if (!form.isConnected || !modal.open || controller.signal.aborted) return;
    latest = point;
    form.elements.latitude.value=point.latitude.toFixed(6);
    form.elements.longitude.value=point.longitude.toFixed(6);
    form.elements.accuracy.value=point.accuracy;
    updateFuelLocationPreview(form);
    button.textContent='Conserver cette position';
    status.textContent=`${description(point)} Champs remplis. Recherche d’un meilleur relevé pendant 30 secondes maximum…`;
  };
  const close = () => controller.abort();
  modal.addEventListener('close',close,{once:true});
  const disconnected = setInterval(() => { if (!form.isConnected || !modal.open) controller.abort(); }, 250);
  try {
    const position=await DriverManGeo.currentPosition({geolocation,signal:controller.signal,progress:apply});
    if (!form.isConnected || !modal.open) return;
    status.textContent=`${description(position)} Latitude et longitude remplies automatiquement.${position.accuracy > DriverManGeo.recommendedAccuracy ? ' Vous pouvez relancer le relevé dehors pour améliorer la précision.' : ''}`;
  } catch (error) {
    if (form.isConnected && modal.open) status.textContent = latest
      ? `${controller.signal.aborted ? 'Relevé arrêté.' : error.message} ${description(latest)} Les coordonnées affichées sont conservées.`
      : error.message + (form.elements.latitude.value !== '' ? ' Les coordonnées précédentes sont conservées.' : '');
  } finally {
    clearInterval(disconnected);modal.removeEventListener('close',close);
    if (fuelLocationController === controller) fuelLocationController=null;
    button.textContent='Utiliser ma position actuelle';
    inputs.forEach(input => input.readOnly = false);submit.disabled=false;
  }
}

document.addEventListener('input',event => {
  const form=event.target.closest('form[data-action="save-refueling"]');
  if (!form) return;
  if (['latitude','longitude'].includes(event.target.name)) {form.elements.accuracy.value='';form.querySelector('#fuel-location-status').textContent='Coordonnées saisies manuellement. Vérifiez le point sur la carte.';updateFuelLocationPreview(form);}
  const liters=form.elements.liters.value,price=form.elements.unit_price.value;
  const valid=liters!=='' && price!=='' && form.elements.liters.validity.valid && form.elements.unit_price.validity.valid;
  form.querySelector('#fuel-total').textContent=valid ? fuelMoney(FuelMetrics.costCents({liters_ml:Math.round(Number(liters)*1000),unit_price_milli:Math.round(Number(price)*1000)})/100,form.elements.currency.value) : '—';
});
document.addEventListener('change',event => {
  if (event.target.matches('[data-fuel-filter]')) {
    fuelFilters[event.target.name]=event.target.value;
    renderFuelInsights();
    if (event.target.name === 'grouping') document.querySelector('#fuel-grouping')?.focus();
  }
  const form=event.target.closest('form[data-action="save-refueling"]');
  if (form && event.target.name==='vehicle_id') {const vehicle=selectableVehicles().find(v => v.id===Number(event.target.value));if (vehicle) form.elements.mileage.value=vehicle.mileage;}
});
