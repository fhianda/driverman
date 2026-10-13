import assert from 'node:assert/strict';

export async function verifyRouteImports({client,driverSession,mobileSession,anonymous,test,gpsPoint}) {
  const xml=`<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"><trk><trkseg><trkpt lat="-4.325" lon="15.322"><time>${new Date(gpsPoint.recorded_at).toISOString()}</time></trkpt><trkpt lat="-4.326" lon="15.323"><time>${new Date(gpsPoint.recorded_at+1000).toISOString()}</time></trkpt></trkseg><trkseg><trkpt lat="-4.328" lon="15.326"/></trkseg></trk></gpx>`;
  const payload={movement_id:3,name:'Course UTM.gpx',content:xml};
  test('Import GPS interdit sans connexion',(await anonymous.call('import-route',payload)).status===401);
  test('Import GPS protégé par CSRF',(await driverSession.call('import-route',payload,{csrf:'invalid'})).status===403);
  test('Aperçu d’une autre course interdit',(await mobileSession.call('preview-route',{...payload,movement_id:2})).status===403);
  test('Import dans une autre course interdit',(await mobileSession.call('import-route',{...payload,movement_id:2})).status===403);
  const preview=await mobileSession.call('preview-route',payload);
  test('Aperçu GPX avec segments et heures UTC',preview.status===200 && preview.result.route.point_count===3 && preview.result.route.segments.length===2 && preview.result.route.segments[0][0].recorded_at===gpsPoint.recorded_at);
  test('Aucune heure ni précision inventée',preview.result.route.segments[1][0].recorded_at===null && !('accuracy' in preview.result.route.segments[1][0]));
  test('Aperçu sans écriture',(await client.call('route&movement_id=3')).result.imports.length===0);
  const imported=await mobileSession.call('import-route',payload);
  test('Import du tracé pour sa course',imported.status===200 && imported.result.id && !imported.result.duplicate);
  const repeated=await mobileSession.call('import-route',payload);
  test('Import réessayé sans doublon',repeated.result.id===imported.result.id && repeated.result.duplicate);
  const saved=await client.call('route&movement_id=3');
  test('Imports et GPS du téléphone conservés séparément',saved.result.imports.length===1 && saved.result.points.length>=1 && saved.result.imports[0].segments.length===2);
  const kml='<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>15.322,-4.325,100 15.324,-4.327,102</coordinates></LineString></Placemark></Document></kml>';
  const kmlResult=await client.call('import-route',{...payload,name:'UTM.kml',content:kml});
  test('Administrateur autorisé à importer un KML',kmlResult.status===200);
  const routes=(await driverSession.call('route&movement_id=3')).result.imports;
  test('Ordre KML longitude latitude correctement interprété',routes[1].segments[0][0].latitude===-4.325 && routes[1].segments[0][0].longitude===15.322 && routes[1].segments[0][0].recorded_at===null);
  const geo=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'UTM'},geometry:{type:'MultiLineString',coordinates:[[[15,-4],[15.1,-4.1]],[[15.2,-4.2]]]}}]});
  test('Import GeoJSON multisegment',(await client.call('import-route',{...payload,name:'UTM.geojson',content:geo})).status===200);
  const gx=`<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><gx:Track><when>${new Date(gpsPoint.recorded_at).toISOString()}</when><gx:coord>15.32 -4.32 0</gx:coord></gx:Track></Placemark></kml>`;
  test('KML gx:Track conserve ses horaires',(await client.call('preview-route',{...payload,content:gx})).result.route.segments[0][0].recorded_at===gpsPoint.recorded_at);
  for(const [label,content] of [
    ['Fichier XML mal formé','<gpx><trk>'],
    ['XML avec entité externe','<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>'],
    ['Position WGS84 invalide',xml.replace('lat="-4.325"','lat="105"')],
    ['Tracé hors période',xml.replace(new Date(gpsPoint.recorded_at).toISOString(),'2000-01-01T00:00:00Z')],
    ['Fuseau horaire absent',xml.replace(new Date(gpsPoint.recorded_at).toISOString(),'2026-10-08T12:00:00')],
    ['Date GPS impossible',xml.replace(new Date(gpsPoint.recorded_at).toISOString(),'2026-02-31T12:00:00Z')],
    ['Fichier sans trajectoire','<gpx><wpt lat="-4" lon="15"/></gpx>'],
    ['GeoJSON en mètres UTM',JSON.stringify({type:'LineString',crs:{properties:{name:'EPSG:32733'}},coordinates:[[15,-4]]})],
    ['Polygone KML',kml.replaceAll('LineString','Polygon')],
    ['Fichier surdimensionné',' '.repeat(2*1024*1024+1)],
    ['Limite du nombre de positions',JSON.stringify({type:'LineString',coordinates:Array.from({length:20001},()=>[15,-4])})],
  ]) test(`${label} refusé`,(await client.call('import-route',{...payload,content})).status===422);
  assert.equal((await client.call('route&movement_id=3')).result.imports.length,3,'Un import invalide ne laisse aucune trace partielle.');
}
