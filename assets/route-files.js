'use strict';

const DriverManRoute = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const radians = value => value * Math.PI / 180;
  const distance = (a,b) => 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(radians(b.latitude-a.latitude)/2)**2 + Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(radians(b.longitude-a.longitude)/2)**2)));
  const valid = point => point && Number.isFinite(point.latitude) && Math.abs(point.latitude)<=90 && Number.isFinite(point.longitude) && Math.abs(point.longitude)<=180;
  const hasTime = point => Number.isFinite(point.recorded_at);
  const passiveGapSeconds = 10 * 60 + 30;
  function split(lines,{maxGapSeconds=120}={}) {
    const result=[];
    for (const line of lines) {
      let previous;
      for (const point of line) {
        if (!valid(point)) {previous=null;continue;}
        const timed = previous && hasTime(point) && hasTime(previous);
        const seconds = timed ? (point.recorded_at-previous.recorded_at)/1000 : null;
        if (!previous || point.segment_id!==previous.segment_id || (timed && (seconds<=0 || seconds>maxGapSeconds || distance(previous,point)/seconds>70))) result.push([]);
        result[result.length-1].push(point);
        previous=point;
      }
    }
    return result;
  }
  function stats(lines) {
    const points=lines.flat();
    let meters=0, timed=0;
    for (const line of lines) line.forEach((point,i)=>{if(i) meters+=distance(line[i-1],point);if(hasTime(point)) timed++;});
    return {count:points.length,meters,timed,parts:lines.length};
  }
  function gpx(lines,name) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DriverMan TELESOL" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escape(name)}</name>${lines.map(line=>`<trkseg>${line.map(p=>`<trkpt lat="${p.latitude}" lon="${p.longitude}">${hasTime(p)?`<time>${new Date(p.recorded_at).toISOString()}</time>`:''}</trkpt>`).join('')}</trkseg>`).join('')}</trk></gpx>`;
  }
  function kml(lines,name) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${escape(name)}</name>${lines.map((line,index)=>`<Placemark><name>${escape(name)} · ${index+1}</name>${line.every(hasTime)?`<gx:Track>${line.map(p=>`<when>${new Date(p.recorded_at).toISOString()}</when>`).join('')}${line.map(p=>`<gx:coord>${p.longitude} ${p.latitude} 0</gx:coord>`).join('')}</gx:Track>`:line.length===1?`<Point><coordinates>${line[0].longitude},${line[0].latitude}</coordinates></Point>`:`<LineString><coordinates>${line.map(p=>`${p.longitude},${p.latitude}`).join(' ')}</coordinates></LineString>`}</Placemark>`).join('')}</Document></kml>`;
  }
  // Projection Web Mercator : les lignes et le fond OSM partagent les mêmes coordonnées.
  function mapSvg(lines) {
    const points=lines.flat();
    if(!points.length) throw new Error('Aucun point à cartographier.');
    const width=1120,height=640,anchor=points[0].longitude;
    const project=p=>{
      let lon=p.longitude;
      while(lon-anchor>180) lon-=360;
      while(lon-anchor< -180) lon+=360;
      const lat=radians(Math.max(-85.05112878,Math.min(85.05112878,p.latitude)));
      return [(lon+180)/360,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2];
    };
    const projected=points.map(project);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of projected){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const zoom=Math.max(0,Math.min(17,Math.floor(Math.log2(Math.min((width-100)/(256*Math.max(maxX-minX,1e-10)),(height-100)/(256*Math.max(maxY-minY,1e-10)))))));
    const size=256*2**zoom, left=(minX+maxX)*size/2-width/2, top=(minY+maxY)*size/2-height/2;
    const pixel=p=>{const [x,y]=project(p);return [(x*size-left).toFixed(2),(y*size-top).toFixed(2)];};
    let tiles='';
    const n=2**zoom;
    for(let x=Math.floor(left/256);x<=Math.floor((left+width)/256);x++) for(let y=Math.floor(top/256);y<=Math.floor((top+height)/256);y++) {
      if(y<0||y>=n) continue;
      tiles+=`<image href="https://tile.openstreetmap.org/${zoom}/${((x%n)+n)%n}/${y}.png" x="${x*256-left}" y="${y*256-top}" width="256" height="256"/>`;
    }
    const first=pixel(points[0]),last=pixel(points[points.length-1]);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Carte du tracé de la course"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5df"/></pattern></defs><rect width="100%" height="100%" fill="#edf1f5"/><rect width="100%" height="100%" fill="url(#grid)"/>${tiles}${lines.map(line=>line.length===1?`<circle cx="${pixel(line[0])[0]}" cy="${pixel(line[0])[1]}" r="4" fill="#dc581f"/>`:`<polyline points="${line.map(p=>pixel(p).join(',')).join(' ')}" fill="none" stroke="#d95119" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}<circle cx="${first[0]}" cy="${first[1]}" r="9" fill="#15803d" stroke="white" stroke-width="3"/><circle cx="${last[0]}" cy="${last[1]}" r="6" fill="#c2410c" stroke="white" stroke-width="2"/><rect x="${width-230}" y="${height-27}" width="230" height="27" fill="white" opacity="0.9"/><text x="${width-220}" y="${height-9}" font-family="sans-serif" font-size="12">© OpenStreetMap contributors</text></svg>`;
  }
  function html(lines,movement,source) {
    const summary=stats(lines),points=lines.flat();
    const coords=p=>`${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://tile.openstreetmap.org; style-src 'unsafe-inline'; base-uri 'none'"><title>Itinéraire ${escape(movement.plate)} · course ${movement.id}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#172332;margin:28px auto;padding:0 24px;max-width:1120px}h1{font-size:26px;margin-bottom:6px}p{margin:7px 0}svg{display:block;width:100%;margin:20px 0;border:1px solid #cbd5df}small{color:#48576a}.summary{display:flex;gap:24px;flex-wrap:wrap;padding:12px 0;border-block:1px solid #ddd}a{color:#973610}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0;padding:0;font-size:10px;max-width:none}h1{font-size:18px}svg{max-height:142mm;margin:10px 0}.instructions{display:none}p{margin:3px 0}}</style></head><body><p>TELESOL · DRIVERMAN · COURSE #${movement.id}</p><h1>Itinéraire · ${escape(movement.plate)}</h1><p>${escape(movement.driver_name)} · ${escape(movement.destination)}</p><p>Départ : ${escape(movement.start_at)} · Retour : ${escape(movement.end_at||'Course en cours')}</p><p>Source : ${escape(source)}</p><div class="summary"><span>${summary.count} positions</span><span>${summary.parts} segments</span><span>${(summary.meters/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})} km entre relevés</span></div>${mapSvg(lines)}<p>● Vert : premier point (${coords(points[0])}) · Orange : dernier point (${coords(points[points.length-1])})</p><p>${summary.timed===summary.count?'Les horaires présents dans le fichier GPS sont conservés.':'Horaires absents pour tout ou partie du tracé : les heures de passage ne peuvent pas être vérifiées.'}</p><small>Les lignes relient les relevés sans recalcul routier. Les interruptions restent séparées. Cette distance ne remplace pas le compteur du véhicule. Le tracé reste visible sans connexion ; le fond de carte nécessite Internet. <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>.</small><p class="instructions">Pour créer un PDF : ouvrir le menu Imprimer du navigateur, puis choisir Enregistrer au format PDF (paysage). Attendre le chargement du fond de carte avant l’impression.</p></body></html>`;
  }
  return {split,stats,gpx,kml,html,mapSvg,passiveGapSeconds};
})();
