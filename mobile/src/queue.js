export const GPS_INTERVAL_MS = 15 * 1000;

export class PositionQueue {
  constructor({read,write,send,uuid=()=>crypto.randomUUID(),now=()=>Date.now(),limit=10000,intervalMs=GPS_INTERVAL_MS}) {
    Object.assign(this,{read,write,send,uuid,now,limit,intervalMs});
    this.points=[];this.lastRecordedAt={};this.serial=Promise.resolve();this.syncing=null;
  }
  async load() {
    const saved=await this.read();
    if (saved == null || Array.isArray(saved)) {
      // Migration sans perte de l’ancienne file de positions.
      this.points=saved || [];this.lastRecordedAt={};
    } else {
      if (saved.version!==2 || !Array.isArray(saved.points) || !saved.lastRecordedAt || typeof saved.lastRecordedAt!=='object' || Array.isArray(saved.lastRecordedAt)) throw new Error('Le stockage GPS doit être récupéré avant de reprendre le suivi.');
      if (Object.entries(saved.lastRecordedAt).some(([id,time])=>!/^\d+$/.test(id)||!Number.isSafeInteger(time)||time<0)) throw new Error('Le calendrier GPS enregistré est invalide.');
      this.points=saved.points;this.lastRecordedAt={...saved.lastRecordedAt};
    }
    for(const point of this.points) {
      if(!point || !Number.isInteger(point.movement_id) || !Number.isSafeInteger(point.recorded_at)) throw new Error('Une position conservée est illisible.');
      this.lastRecordedAt[point.movement_id]=Math.max(this.lastRecordedAt[point.movement_id]??0,point.recorded_at);
    }
  }
  nextSampleAt(movementId) {
    const last=this.lastRecordedAt[movementId];
    return last===undefined ? null : last+this.intervalMs;
  }
  mutate(fn) {
    const work=this.serial.then(async()=>{
      const current={version:2,points:this.points,lastRecordedAt:this.lastRecordedAt};
      const next=fn(current);
      if(next===current) return;
      await this.write(next);
      this.points=next.points;this.lastRecordedAt=next.lastRecordedAt;
    });
    this.serial=work.catch(()=>{});
    return work;
  }
  isUsable(location) {
    const {latitude,longitude,accuracy,time,simulated}=location;
    return !simulated && Number.isFinite(latitude) && Math.abs(latitude)<=90 && Number.isFinite(longitude) && Math.abs(longitude)<=180 && Number.isFinite(accuracy) && accuracy>0 && accuracy<=50 && Number.isInteger(time) && time>=this.now()-30000 && time<=this.now()+1000;
  }
  async add(location,movementId,segmentId,{final=false}={}) {
    if (!this.isUsable(location)) return false;
    const {latitude,longitude,accuracy,time}=location;
    let added=false;
    await this.mutate(current=>{
      const {points,lastRecordedAt}=current;
      const last=lastRecordedAt[movementId];
      if (last!==undefined && (time<=last || (!final && time-last<this.intervalMs))) return current;
      if (points.length>=this.limit) throw new Error('Stockage GPS plein : synchronisez les positions avant de reprendre. Aucun ancien point n’a été effacé.');
      added=true;
      const times={...lastRecordedAt,[movementId]:time};
      // Garder les courses récentes, y compris après accusé de réception ou redémarrage.
      const history=Object.fromEntries(Object.entries(times).sort((a,b)=>b[1]-a[1]).slice(0,128));
      return {version:2,lastRecordedAt:history,points:[...points,{movement_id:movementId,sample_id:this.uuid(),segment_id:segmentId,recorded_at:time,latitude,longitude,accuracy}]};
    });
    return added;
  }
  flush(onEnded=()=>{}) {
    if (this.syncing) return this.syncing;
    this.syncing=(async()=>{
      await this.serial;
      while(this.points.length) {
        const movementId=this.points[0].movement_id;
        const batch=this.points.filter(p=>p.movement_id===movementId).slice(0,200);
        const result=await this.send(movementId,batch);
        const acknowledged=new Set([...(result.accepted||[]),...(result.discarded||[])]);
        const sent=new Set(batch.map(p=>p.sample_id));
        if (!batch.some(p=>acknowledged.has(p.sample_id))) throw new Error('Le serveur n’a pas confirmé la réception des positions.');
        await this.mutate(current=>({...current,points:current.points.filter(p=>!(sent.has(p.sample_id)&&acknowledged.has(p.sample_id)))}));
        if (result.ended) await onEnded(movementId);
      }
    })().finally(()=>{this.syncing=null;});
    return this.syncing;
  }
}
