'use strict';

const reportFilters={type:'all',from:'',to:'',vehicleId:'all'};
let reportExporting=false;
const reportScripts=new Map();
function reportPage() {
  reportFilters.from ||= state.data.today.slice(0,4)+'-01';reportFilters.to ||= state.data.today.slice(0,7);
  const select=(name,label,values)=>`<label>${label}<select name="${name}" data-report-filter>${values.map(([value,text])=>`<option value="${esc(value)}" ${String(reportFilters[name])===String(value)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  return `<section class="panel report-controls"><div class="panel-heading"><div><h2>Préparer un rapport</h2><p>Choisissez une période, consultez les résultats et téléchargez votre document.</p></div>${icon('activity')}</div><div class="fuel-filters report-filters">${select('type','Type de rapport',Object.entries(ReportMetrics.types))}<label>Du mois<input type="month" name="from" data-report-filter min="2000-01" max="${state.data.today.slice(0,7)}" value="${reportFilters.from}"></label><label>Au mois<input type="month" name="to" data-report-filter min="2000-01" max="${state.data.today.slice(0,7)}" value="${reportFilters.to}"></label>${select('vehicleId','Véhicule du rapport',[['all','Tous les véhicules'],...fuelVehicleOptions().map(v=>[v.id,`${v.plate}${v.removed?' (retiré du parc)':''}`])])}</div><div class="report-actions"><p>Les exports reprennent la période et le véhicule sélectionnés, avec tous les détails.</p><button class="btn secondary" type="button" data-report-export="pdf">${icon('download')} Exporter en PDF</button><button class="btn primary" type="button" data-report-export="xlsx">${icon('download')} Exporter en Excel</button></div><p id="report-error" class="fuel-error" role="alert"></p><p id="report-export-status" class="report-status" role="status"></p></section><div id="report-results"></div>`;
}
function renderReport() {
  if(!isAdmin()||state.page!=='reports') return;
  const error=document.querySelector('#report-error'),target=document.querySelector('#report-results');
  let report;
  try{report=ReportMetrics.summarize(state.data,reportFilters);error.textContent='';}catch(e){error.textContent=e.message;target.innerHTML='';document.querySelectorAll('[data-report-export]').forEach(b=>b.disabled=true);return;}
  document.querySelectorAll('[data-report-export]').forEach(b=>b.disabled=reportExporting);
  const t=report.totals;
  const hasData=reportFilters.type==='courses'?t.courses:reportFilters.type==='fuel'?t.refuels||t.intervals:t.courses||t.refuels||t.intervals;
  const cards=ReportExports.indicators(report).map(([label,value,unit])=>`<div><span>${esc(label)}</span><strong>${value===null?'—':fuelNumber(value,unit==='L'?3:2)}${value!==null?` <small>${esc(unit)}</small>`:''}</strong></div>`).join('');
  const tables=ReportMetrics.tables(report).filter(table=>table.summary);
  target.innerHTML=`<p class="overview-period">${esc(report.title)} · ${esc(report.filters.from)} à ${esc(report.filters.to)} · ${esc(report.vehicleLabel)}</p>${!hasData?'<p class="report-empty">Aucun enregistrement sur cette période. Vous pouvez changer les filtres ou exporter un rapport vide.</p>':''}<section class="panel report-summary"><div class="fuel-stats">${cards}</div></section>${tables.map(table=>`<section class="panel report-table"><div class="panel-heading"><h2>${esc(table.title)}</h2><span>${table.rows.length} ligne(s)</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="${esc(table.title)}"><table class="table"><thead><tr>${table.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${table.rows.length?table.rows.map(row=>`<tr>${row.map((v,i)=>`<td class="${table.columns[i].type==='number'?'report-number':''}">${esc(ReportExports.display(v,table.columns[i]))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${table.columns.length}">Aucun enregistrement.</td></tr>`}</tbody></table></div></section>`).join('')}<section class="panel report-method"><h2>Comment lire ce rapport</h2>${ReportMetrics.notes(report).map(note=>`<p>${esc(note)}</p>`).join('')}</section>`;
}
function loadReportScript(file) {
  if(!reportScripts.has(file)) reportScripts.set(file,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`assets/vendor/${file}`;script.onload=resolve;script.onerror=()=>{reportScripts.delete(file);script.remove();reject(new Error('Impossible de charger le module d’export. Actualisez la page puis réessayez.'));};document.head.append(script);}));
  return reportScripts.get(file);
}
async function reportFont(file) {
  const response=await fetch(`assets/${file}`);if(!response.ok)throw new Error('La police du PDF est indisponible. Réessayez.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
async function exportReport(format) {
  if(!isAdmin()||reportExporting) return;
  reportExporting=true;const error=document.querySelector('#report-error'),status=document.querySelector('#report-export-status');
  document.querySelectorAll('[data-report-export],[data-report-filter]').forEach(el=>el.disabled=true);
  error.textContent='';status.textContent='Préparation du document…';
  try {
    // Recharger les données autorisées pour ne pas exporter un ancien état de session.
    const data=await api('bootstrap');
    if(data.user.role!=='admin') throw new Error('Les rapports sont réservés aux administrateurs.');
    state.data=data;const report=ReportMetrics.summarize(data,reportFilters);let buffer;
    if(format==='xlsx') {await loadReportScript('exceljs.min.js');buffer=await ReportExports.excel(report,window.ExcelJS);}
    else {
      await loadReportScript('jspdf.umd.min.js');await loadReportScript('jspdf.plugin.autotable.min.js');
      const [fontRegular,fontBold]=await Promise.all([reportFont('manrope-regular.ttf'),reportFont('manrope-bold.ttf')]);
      buffer=ReportExports.pdf(report,{jsPDF:window.jspdf.jsPDF,autoTable:(doc,options)=>doc.autoTable(options),fontRegular,fontBold});
    }
    if(!state.authenticated||state.data.user.id!==data.user.id) return;
    const blob=new Blob([buffer],{type:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(window.DriverManMobile) await window.DriverManMobile.saveFile(ReportExports.filename(report,format),blob);
    else {
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=ReportExports.filename(report,format);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    status.textContent=window.DriverManMobile?'Document préparé pour le partage.':`Le téléchargement ${format==='pdf'?'PDF':'Excel'} a été lancé.`;renderReport();
  } catch(e) {error.textContent=e.message;status.textContent='';}
  finally {reportExporting=false;document.querySelectorAll('[data-report-export],[data-report-filter]').forEach(el=>el.disabled=false);}
}
document.addEventListener('change',event=>{if(!event.target.matches('[data-report-filter]'))return;reportFilters[event.target.name]=event.target.value;document.querySelector('#report-export-status').textContent='';renderReport();});
document.addEventListener('click',event=>{const button=event.target.closest('[data-report-export]');if(button&&!button.disabled)exportReport(button.dataset.reportExport);});
