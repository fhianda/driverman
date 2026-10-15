'use strict';

const DriverManMapExport = (() => {
  const colors={track:'#d65b22',gap:'#365c85',start:'#15803d',end:'#c2410c'};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function visibleTiles(layer,box) {
    return [...layer.getContainer().querySelectorAll('img.leaflet-tile')].filter(image=>{
      const r=image.getBoundingClientRect();
      return r.right>box.left && r.left<box.right && r.bottom>box.top && r.top<box.bottom;
    });
  }

  async function capture(map,layer,parts,isCurrent) {
    // Réutiliser uniquement les images de la vue affichée : aucun téléchargement de zone.
    const element=map.getContainer();
    for(let attempt=0;attempt<100;attempt++) {
      if(!isCurrent()||!element.isConnected) throw new Error('Le tracé a changé. Relancez l’export.');
      const tiles=visibleTiles(layer,element.getBoundingClientRect());
      if(tiles.length && !layer.isLoading() && tiles.every(tile=>tile.complete)) break;
      await delay(100);
    }
    if(!isCurrent()||!element.isConnected) throw new Error('Le tracé a changé. Relancez l’export.');
    const box=element.getBoundingClientRect(),tiles=visibleTiles(layer,box);
    if(!tiles.length||layer.isLoading()||tiles.some(tile=>!tile.complete||!tile.naturalWidth||tile.dataset.mapError==='true')) {
      throw new Error('Le fond de carte n’est pas chargé. Vérifiez votre connexion, puis réessayez l’export.');
    }
    const canvas=document.createElement('canvas'),scale=2;
    canvas.width=Math.round(box.width*scale);canvas.height=Math.round(box.height*scale);
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#e7eced';ctx.fillRect(0,0,box.width,box.height);
    for(const tile of tiles) {
      const r=tile.getBoundingClientRect();
      ctx.drawImage(tile,r.left-box.left,r.top-box.top,r.width,r.height);
    }
    const coordinates=DriverManRoute.coordinates(parts);
    const pixel=point=>map.latLngToContainerPoint(point);
    function line(points,dashed=false) {
      ctx.beginPath();points.forEach((p,i)=>{const v=pixel(p);if(i)ctx.lineTo(v.x,v.y);else ctx.moveTo(v.x,v.y);});
      ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(dashed?[8,8]:[]);
      ctx.strokeStyle='white';ctx.lineWidth=dashed?5:7;ctx.stroke();
      ctx.strokeStyle=dashed?colors.gap:colors.track;ctx.lineWidth=dashed?3:4;ctx.stroke();ctx.setLineDash([]);
    }
    function dot(point,radius,color) {
      const p=pixel(point);ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='white';ctx.stroke();
    }
    for(const gap of DriverManRoute.connections(coordinates)) line(gap,true);
    for(const part of coordinates) {if(part.length>1)line(part);else dot(part[0],3,colors.track);}
    const points=coordinates.flat();dot(points[0],8,colors.start);dot(points[points.length-1],6,colors.end);
    // Vérifie le droit de lecture du canvas avant de produire un fichier incomplet.
    try {ctx.getImageData(0,0,1,1);} catch {throw new Error('Ce fond de carte ne peut pas être exporté. Actualisez la carte puis réessayez.');}
    return canvas;
  }

  function documentCanvas(mapImage,parts,movement,source) {
    const canvas=document.createElement('canvas'),width=1200,padding=40;
    const mapHeight=Math.min(1100,Math.round(1120*mapImage.height/mapImage.width));
    canvas.width=width;canvas.height=mapHeight+480;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,canvas.height);
    ctx.fillStyle='#1b212c';ctx.fillRect(0,0,width,100);
    ctx.fillStyle='#f59c68';ctx.font='bold 20px Arial';ctx.fillText('DRIVERMAN · TELESOL',padding,37);
    ctx.fillStyle='#ffffff';ctx.font='bold 30px Arial';ctx.fillText('ITINÉRAIRE DE LA COURSE',padding,78);
    const text=(value,y,size=21,bold=false)=>{
      ctx.fillStyle='#243040';ctx.font=`${bold?'bold ':''}${size}px Arial`;
      let label=String(value??'').replace(/\s+/g,' ');
      if(ctx.measureText(label).width>width-padding*2) {
        while(label && ctx.measureText(label+'…').width>width-padding*2) label=label.slice(0,-1);
        label+='…';
      }
      ctx.fillText(label,padding,y);
    };
    const date=value=>value?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)} ${value.slice(11,16)}`:'En cours';
    text(`${movement.plate} · Course n° ${movement.id} · ${movement.driver_name||'Chauffeur'}`,136,23,true);
    text(movement.destination,168);
    text(`${date(movement.start_at)} → ${date(movement.end_at)} · ${source}`,198,18);
    const summary=DriverManRoute.stats(parts),gaps=DriverManRoute.connections(parts);
    text(`${summary.count} positions · ${summary.parts} segment(s) · ${(summary.meters/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})} km entre relevés GPS`,230,19);
    const top=250,ratio=Math.min(1120/mapImage.width,mapHeight/mapImage.height);
    const imageWidth=mapImage.width*ratio,imageHeight=mapImage.height*ratio;
    ctx.drawImage(mapImage,(width-imageWidth)/2,top+(mapHeight-imageHeight)/2,imageWidth,imageHeight);
    ctx.strokeStyle='#d3d9df';ctx.lineWidth=1;ctx.strokeRect((width-imageWidth)/2,top+(mapHeight-imageHeight)/2,imageWidth,imageHeight);
    let y=top+mapHeight+30;
    text('© OpenStreetMap contributors · openstreetmap.org/copyright',y,17);
    y+=34;
    ctx.fillStyle=colors.start;ctx.beginPath();ctx.arc(47,y-6,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#243040';ctx.font='19px Arial';ctx.fillText('Premier point',64,y);
    ctx.fillStyle=colors.end;ctx.beginPath();ctx.arc(267,y-6,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#243040';ctx.fillText('Dernier point',284,y);
    y+=33;
    ctx.strokeStyle=colors.track;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(40,y-6);ctx.lineTo(80,y-6);ctx.stroke();
    ctx.fillStyle='#243040';ctx.fillText('Positions GPS reliées',94,y);
    if(gaps.length) {
      ctx.strokeStyle=colors.gap;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(400,y-6);ctx.lineTo(450,y-6);ctx.stroke();ctx.setLineDash([]);
      ctx.fillText('Liaison indicative · trajet non enregistré',465,y);
    }
    text('Les lignes relient les positions disponibles ; elles ne calculent pas un itinéraire routier.',y+33,18);
    text('Les liaisons entre segments ne sont pas incluses dans la distance GPS.',y+60,18);
    if(summary.timed!==summary.count) text('Certaines positions ne comportent pas d’horaire.',y+87,18);
    return canvas;
  }

  async function file(format,map,layer,parts,movement,source,isCurrent) {
    const image=await capture(map,layer,parts,isCurrent);
    const canvas=documentCanvas(image,parts,movement,source);
    if(format==='jpeg') return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('La création du JPEG a échoué.')),'image/jpeg',0.94));
    await loadReportScript('jspdf.umd.min.js');
    const doc=new window.jspdf.jsPDF({orientation:canvas.width>canvas.height?'landscape':'portrait',unit:'mm',format:'a4',compress:true});
    doc.setProperties({title:`Itinéraire ${movement.plate} · course ${movement.id}`,author:'DriverMan TELESOL',subject:'Positions GPS et liaisons indicatives'});
    const page=doc.internal.pageSize,scale=Math.min((page.getWidth()-20)/canvas.width,(page.getHeight()-20)/canvas.height);
    const w=canvas.width*scale,h=canvas.height*scale;
    doc.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',(page.getWidth()-w)/2,10,w,h);
    return new Blob([doc.output('arraybuffer')],{type:'application/pdf'});
  }
  return {file};
})();
