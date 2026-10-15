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
  // Les liaisons visuelles ne modifient ni la distance mesurée, ni les exports GPS.
  function connections(lines) {
    const parts=lines.filter(line=>line.length),result=[];
    for(let i=1;i<parts.length;i++) {
      const from=parts[i-1][parts[i-1].length-1],to=parts[i][0];
      const same=Array.isArray(from)?from[0]===to[0]&&from[1]===to[1]:from.latitude===to.latitude&&from.longitude===to.longitude;
      if(!same)result.push([from,to]);
    }
    return result;
  }
  function coordinates(lines) {
    const anchor=lines.flat()[0]?.longitude??0;
    return lines.map(line=>line.map(point=>{
      let lon=point.longitude;
      while(lon-anchor>180)lon-=360;
      while(lon-anchor< -180)lon+=360;
      return [point.latitude,lon];
    }));
  }
  return {split,stats,gpx,kml,connections,coordinates,passiveGapSeconds};
})();
