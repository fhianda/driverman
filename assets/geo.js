'use strict';

const DriverManGeo = (() => {
  const recommendedAccuracy = 50;
  const valid = point => point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
  const mapUrl = point => valid(point) ? `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=17/${point.latitude}/${point.longitude}` : '';
  function currentPosition({signal, progress = () => {}, geolocation = navigator.geolocation, timeout = 30000} = {}) {
    return new Promise((resolve, reject) => {
      let watch, timer, best, done = false;
      const started = Date.now();
      const finish = (error, point) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (watch !== undefined) geolocation.clearWatch(watch);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(point);
      };
      const abort = () => finish(new Error('Relevé annulé.'));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, {once:true});
      timer = setTimeout(() => {
        if (best) finish(null, best);
        else finish(new Error('Aucune position récente reçue. Activez la localisation de l’appareil et autorisez ce site à y accéder, puis réessayez.'));
      }, timeout);
      try {
        watch = geolocation.watchPosition(position => {
          if (done) return;
          const point = {...position.coords, latitude:position.coords.latitude, longitude:position.coords.longitude, accuracy:position.coords.accuracy, timestamp:position.timestamp};
          if (!valid(point) || !Number.isFinite(point.accuracy) || point.accuracy <= 0 || point.accuracy > 10000000 || !Number.isFinite(point.timestamp) || point.timestamp < started - 1000 || point.timestamp > Date.now() + 1000) return;
          if (!best || point.accuracy < best.accuracy) { best = point; progress(point); }
          if (point.accuracy <= 20) finish(null, point);
        }, error => {
          if (error.code === 1) finish(new Error('Autorisation refusée. Autorisez la localisation pour ce site dans le navigateur et activez la position précise dans les réglages de l’appareil.'));
        }, {enableHighAccuracy:true, maximumAge:0, timeout});
        if (done) geolocation.clearWatch(watch);
      } catch (error) { finish(error); }
    });
  }

  function geoJsonPoint(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Ce fichier n’est pas un GeoJSON valide.'); }
    const points = [];
    const walk = (item, depth = 0) => {
      if (!item || depth > 5) throw new Error('Structure GeoJSON non prise en charge.');
      if (item.crs && !['EPSG:4326','urn:ogc:def:crs:OGC:1.3:CRS84','urn:ogc:def:crs:EPSG::4326'].includes(item.crs.properties?.name)) throw new Error('Exportez les coordonnées en WGS84 (latitude / longitude), pas en mètres UTM.');
      if (item.type === 'FeatureCollection' && Array.isArray(item.features)) item.features.forEach(feature => walk(feature, depth+1));
      else if (item.type === 'Feature') walk(item.geometry, depth+1);
      else if (item.type === 'Point' && Array.isArray(item.coordinates)) {
        const [longitude, latitude] = item.coordinates;
        if (!valid({latitude,longitude})) throw new Error('Coordonnées WGS84 invalides.');
        points.push({latitude,longitude});
      } else throw new Error('Exportez uniquement le point du ravitaillement (géométrie Point).');
    };
    walk(data);
    if (points.length !== 1) throw new Error('Exportez un seul point : celui de ce ravitaillement.');
    return points[0];
  }
  return {recommendedAccuracy, valid, mapUrl, currentPosition, geoJsonPoint};
})();
