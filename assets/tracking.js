'use strict';

const DriverManTracking = (() => {
  let map, tileLayer, current=null;
  const segments = points => DriverManRoute.split([points]).map(line=>line.map(p=>[p.latitude,p.longitude]));
  const stamp = value => Number.isFinite(value) ? new Date(value).toLocaleString('fr-FR') : 'Horaire non fourni';

  function draw(context,route,preview=false) {
    if(current!==context || !context.container.isConnected) return;
    map?.remove();map=null;
    context.selected=route;
    const target=context.container.querySelector('#route-view');
    const parts=route ? DriverManRoute.split(route.segments,{maxGapSeconds:route.maxGapSeconds??120}) : [];
    context.parts=parts;
    if(!parts.length) {
      target.innerHTML='<div class="route-empty"><h3>Aucun tracé enregistré</h3><p>Aucune position n’a encore été reçue pour cette course. Le chauffeur active le GPS pendant la création de sa course dans l’application Android. Les positions synchronisées apparaissent ici, du départ au retour. Un ancien trajet sans relevés GPS ne peut pas être reconstitué à partir du compteur.</p></div>';
      return;
    }
    const summary=DriverManRoute.stats(parts),points=parts.flat();
    target.innerHTML=`${preview?'<p class="route-preview-note">Aperçu du fichier · pas encore rattaché à la course</p>':''}<div class="route-summary"><span><strong>${number(summary.count)}</strong> positions</span><span><strong>${(summary.meters/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})} km</strong> entre relevés</span><span><strong>${summary.parts}</strong> segment${summary.parts>1?'s':''}</span></div><p class="field-hint">${esc(route.name)} · ${esc(stamp(points[0].recorded_at))} → ${esc(stamp(points[points.length-1].recorded_at))}</p>${summary.timed!==summary.count?'<p class="route-preview-note">Ce tracé comporte des positions sans horaires. Leur passage pendant cette course ne peut pas être vérifié.</p>':''}<div id="route-map" class="route-map" aria-label="Carte des positions de la course"></div><p class="field-hint">Vert : premier point. Orange : dernier point. Trait plein : relevés GPS reliés. Pointillés bleus : liaison indicative entre deux segments, sans trajet enregistré. Ces lignes ne calculent pas les rues empruntées.</p><p id="route-map-status" role="status"></p>${preview?'':`<div class="route-tools"><button type="button" class="btn primary" data-route-export="pdf">Télécharger PDF</button><button type="button" class="btn secondary" data-route-export="jpeg">Télécharger JPEG</button><button type="button" class="btn secondary" data-route-export="gpx">Exporter GPX</button><button type="button" class="btn secondary" data-route-export="kml">Exporter KML</button></div><p class="field-hint">Le PDF et le JPEG reprennent la carte affichée. Cadrez le trajet avant de télécharger.</p>`}`;
    map=L.map(target.querySelector('#route-map'),{zoomAnimation:false,fadeAnimation:false});
    tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,crossOrigin:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map).on('tileerror',event=>{
      event.tile.dataset.mapError='true';
      if(target.isConnected) target.querySelector('#route-map-status').textContent='Fond de carte indisponible. Les positions restent affichées ; les tuiles nécessitent Internet.';
    });
    const lines=DriverManRoute.coordinates(parts),coordinates=lines.flat();
    for(const gap of DriverManRoute.connections(lines)) {
      L.polyline(gap,{color:'#365c85',weight:3,dashArray:'8 8',className:'route-gap'})
        .addTo(map).bindTooltip('Liaison indicative · trajet non enregistré');
    }
    for(const coords of lines) {
      if(coords.length>1) L.polyline(coords,{color:'#d65b22',weight:4}).addTo(map);
      else L.circleMarker(coords[0],{radius:4,color:'#d65b22'}).addTo(map);
    }
    L.circleMarker(coordinates[0],{radius:8,color:'#15803d',fillOpacity:1}).addTo(map).bindTooltip('Premier point relevé');
    L.circleMarker(coordinates[coordinates.length-1],{radius:6,color:'#c2410c',fillOpacity:1}).addTo(map).bindTooltip(context.movement.end_at?'Dernier point relevé':'Dernière position reçue');
    map.fitBounds(L.latLngBounds(coordinates).pad(0.15),{maxZoom:17});
    requestAnimationFrame(()=>map?.invalidateSize());
  }

  async function show(id,selectedId=null) {
    const movement=state.data.movements.find(m=>m.id===id);
    if(!movement) return;
    map?.remove();map=null;
    openModal('Itinéraire de la course',`${movement.plate} · ${movement.destination}`,`<div id="route-content"><p role="status">Chargement des positions…</p></div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Fermer</button></div>`);
    const container=document.querySelector('#route-content');
    const context={movement,container,preview:null,routes:[],selected:null,parts:[]};current=context;
    try {
      const result=await api(`route&movement_id=${id}`);
      if(current!==context || !container.isConnected || !modal.open) return;
      context.routes=[...(result.points.length?[{id:'phone',name:'GPS automatique · DriverMan',maxGapSeconds:DriverManRoute.passiveGapSeconds,segments:[result.points]}]:[]),...(result.imports||[]).map(route=>({...route,name:`Import ${route.format} · ${route.name}`}))];
      container.innerHTML=`<div class="route-refresh"><p>${movement.end_at?'Parcours du départ au retour':'Course en cours · dernières positions reçues'}</p><button type="button" class="btn secondary small" data-route-refresh>Actualiser le tracé</button></div><label class="route-source" for="route-source">Tracé affiché<select id="route-source" class="select select-bordered" ${context.routes.length?'':'disabled'}>${context.routes.length?context.routes.map(route=>`<option value="${esc(route.id)}">${esc(route.name)}</option>`).join(''):'<option>Aucun tracé disponible</option>'}</select></label><div id="route-view"></div>${state.data.demo?'<p class="field-hint">Les imports GPS sont disponibles dans votre espace réel.</p>':`<details class="route-import"><summary>Importer un ancien tracé (facultatif)</summary><p>Dans UTM Geo Map, exportez uniquement la ligne de cette course en GPX, KML ou GeoJSON (WGS84), puis choisissez le fichier. Vérifiez la carte avant de le rattacher.</p><label for="route-file">Fichier de l’itinéraire · 2 Mo / 20 000 points maximum</label><input id="route-file" type="file" accept=".gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json"><p id="route-import-status" role="status"></p><button type="button" class="btn primary" data-route-import hidden>Rattacher ce tracé à la course</button><p class="field-hint">Chaque fichier reste distinct des relevés du téléphone. Sans horaires dans le fichier, seules sa forme et ses coordonnées sont conservées.</p><a href="https://www.utmgeomap.com/export_file.html" target="_blank" rel="noopener noreferrer">Guide d’export UTM Geo Map</a></details>`}<p class="field-hint">Les positions du téléphone du chauffeur sont consultables ici sur le web, dans la PWA iPhone et dans l’application Android. Le suivi démarre à la confirmation du départ et s’arrête au retour.</p>`;
      const selected=context.routes.find(route=>String(route.id)===String(selectedId))||context.routes[0];
      if(selected) container.querySelector('#route-source').value=selected.id;
      draw(context,selected);
    } catch(error) {if(container.isConnected) container.textContent=error.message;}
  }

  async function download(format,button) {
    const context=current;
    if(!context?.selected || !context.parts.length) return;
    if(context.exporting)return;
    context.exporting=true;
    context.container.querySelectorAll('[data-route-export]').forEach(el=>el.disabled=true);
    const {movement,parts,selected}=context;
    const selectedMap=map;
    const isCurrent=()=>current===context && context.selected===selected && map===selectedMap && context.container.isConnected;
    try {
      const name=`${movement.plate} · ${movement.destination} · ${selected.name}`;
      if(!['pdf','jpeg','gpx','kml'].includes(format))return;
      const content=['pdf','jpeg'].includes(format)
        ?await DriverManMapExport.file(format,selectedMap,tileLayer,parts,movement,selected.name,isCurrent)
        :DriverManRoute[format](parts,name);
      if(!isCurrent())return;
      const filename=`itineraire-${movement.id}-${movement.plate.replace(/[^a-z0-9_-]/gi,'_')}.${format}`;
      if(window.DriverManMobile) await window.DriverManMobile.saveFile(filename,content);
      else {
        const mime={pdf:'application/pdf',jpeg:'image/jpeg',gpx:'application/gpx+xml',kml:'application/vnd.google-earth.kml+xml'}[format];
        const url=URL.createObjectURL(new Blob([content],{type:mime}));
        const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
      toast(['pdf','jpeg'].includes(format)?`Carte ${format.toUpperCase()} générée.`:'Fichier GPS généré.');
    } catch(error) {toast(error.message);} finally {context.exporting=false;context.container.querySelectorAll('[data-route-export]').forEach(el=>el.disabled=false);}
  }

  document.addEventListener('change',async event=>{
    const context=current;
    if(!context?.container.isConnected) return;
    if(event.target.id==='route-source') {
      context.preview=null;
      const confirm=context.container.querySelector('[data-route-import]');if(confirm)confirm.hidden=true;
      draw(context,context.routes.find(route=>String(route.id)===event.target.value));
    }
    if(event.target.id!=='route-file') return;
    const input=event.target,file=input.files[0];if(!file)return;
    const status=context.container.querySelector('#route-import-status'),confirm=context.container.querySelector('[data-route-import]');
    context.preview=null;confirm.hidden=true;input.disabled=true;status.textContent='Lecture du tracé…';
    try {
      if(file.size>2*1024*1024)throw new Error('Choisissez un fichier de 2 Mo maximum.');
      const payload={movement_id:context.movement.id,name:file.name.slice(0,150),content:await file.text()};
      const result=await api('preview-route',payload);
      if(current!==context||!input.isConnected)return;
      context.preview=payload;draw(context,result.route,true);confirm.hidden=false;
      status.textContent=`${number(result.route.point_count)} positions lues. Vérifiez que ce tracé correspond à la course avant de le rattacher.`;
    } catch(error) {status.textContent=error.message;}
    finally {input.disabled=false;input.value='';}
  });

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.action==='route')show(Number(button.dataset.id));
    if(button.hasAttribute('data-route-refresh')&&current)await show(current.movement.id,current.selected?.id);
    if(button.dataset.routeExport) await download(button.dataset.routeExport,button);
    if(button.hasAttribute('data-route-import') && current?.preview) {
      const context=current;button.disabled=true;
      try {
        const result=await api('import-route',context.preview);
        if(current===context&&context.container.isConnected)await show(context.movement.id,result.id);
        toast(result.duplicate?'Ce fichier était déjà rattaché à la course.':'Tracé rattaché à la course.');
      } catch(error) {if(context.container.isConnected)context.container.querySelector('#route-import-status').textContent=error.message;}
      finally {button.disabled=false;}
    }
    if(button.dataset.action==='mobile-settings' && isAdmin()) {
      openModal('Adresse du serveur mobile','À renseigner lorsque votre serveur HTTPS est prêt.',`<form id="record-form" method="post" data-action="save-mobile-settings"><div class="field"><label for="mobile-public-url">Adresse HTTPS de DriverMan</label><input id="mobile-public-url" name="public_url" type="url" maxlength="2048" placeholder="https://votre-serveur/driverman/" value="${esc(state.data.mobile_public_url||'')}"></div><p class="field-hint">La version mobile 1.2 utilise déjà https://driverman.trackkintrans.com/. Pour une autre adresse, utilisez « Modifier » sur son écran de connexion. Elle doit être accessible aux téléphones, y compris en déplacement. Son enregistrement ne publie pas le serveur Wamp.</p><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></form>`);
    }
  });
  document.addEventListener('DOMContentLoaded',()=>document.querySelector('#modal').addEventListener('close',()=>{map?.remove();map=null;current=null;}));
  const settingsPanel=()=>`<section class="mobile-tracking"><h2>Configuration du serveur mobile</h2><p>L’administrateur définit ici l’adresse HTTPS que les chauffeurs utiliseront dans l’application Android ou iPhone.</p><p class="mobile-server-url"><strong>${state.data.mobile_public_url?'Adresse enregistrée':'Adresse à définir'}</strong><br>${esc(state.data.mobile_public_url||'Aucune adresse configurée pour le moment.')}</p><button type="button" class="btn secondary" data-action="mobile-settings">${state.data.mobile_public_url?'Modifier l’adresse HTTPS':'Définir l’adresse HTTPS'}</button></section>`;
  return {segments,show,settingsPanel};
})();
