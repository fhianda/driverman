// A GPS session belongs to one departure form, and is never saved before departure.
export class DepartureGps {
  constructor({gps,permissions,notifications,isUsable,onChange=()=>{},timeoutMs=45000}) {
    Object.assign(this,{gps,permissions,notifications,isUsable,onChange,timeoutMs});
    this.session=null;
  }
  notify(session,message,action='retry') {
    if(this.session!==session)return;
    session.message=message;session.action=action;
    const ready=Boolean(session.id&&session.location&&this.isUsable(session.location));
    this.onChange({message,action,ready});
    if(ready)session.resolve?.();
    else if(action)session.reject?.(new Error(message));
  }
  async acquire() {
    await this.begin({request:true});
    const session=this.session;
    if(!session)throw new Error(this.lastError||'Préparation du GPS annulée.');
    if(session.action&&!session.location)throw new Error(session.message);
    if(!session.location)await new Promise((resolve,reject)=>{session.resolve=resolve;session.reject=reject;});
    return this.verify();
  }
  async begin({request=false}={}) {
    await this.cancel();
    const session={id:null,location:null,consumer:null};this.session=session;
    this.checking=true;
    this.notify(session,'Vérification du GPS…','');
    try {
      let status=await this.permissions.status();
      if(!status.precise&&request) status=await this.permissions.requestForeground();
      if(this.session!==session)return;
      if(!status.precise) {this.notify(session,'La position précise est nécessaire au départ. Autorisez-la dans la demande Android. Si elle est bloquée, rétablissez cette autorisation pour DriverMan.');return;}
      let permission=await this.notifications.checkPermissions();
      if(permission.display!=='granted'&&request)permission=await this.notifications.requestPermissions();
      if(this.session!==session)return;
      if(permission.display!=='granted'){this.notify(session,'Autorisez la notification de suivi de DriverMan pour démarrer la course.');return;}
      // The foreground service starts while the departure form is visible and
      // continues screen locked. It does not need ACCESS_BACKGROUND_LOCATION.
      if(!status.locationEnabled&&request)status=await this.permissions.ensureLocationEnabled();
      if(this.session!==session)return;
      if(!status.locationEnabled){this.notify(session,'La localisation est désactivée. Acceptez son activation dans la demande Android pour démarrer.');return;}
      this.notify(session,'Recherche de votre position… Restez à l’extérieur si possible.','');
      session.timer=setTimeout(()=>{
        if(this.session!==session||session.consumer)return;
        const message='Aucune position assez précise reçue. Réessayez dans un endroit dégagé.';
        this.lastError=message;this.notify(session,message);
        this.cancel().then(()=>this.onChange({message,action:'retry',ready:false}));
      },this.timeoutMs);
      const id=await this.gps.addWatcher({backgroundTitle:'DriverMan · Suivi GPS',backgroundMessage:'Votre parcours est enregistré de la confirmation du départ jusqu’au retour.',requestPermissions:false,stale:false,distanceFilter:0},(location,error)=>{
        if(this.session!==session)return;
        if(session.consumer){session.consumer(location,error);return;}
        if(error){session.location=null;this.notify(session,'La position est indisponible. Vérifiez le GPS et réessayez.','retry');return;}
        if(this.isUsable(location)){
          session.location={...location};clearTimeout(session.timer);
          this.notify(session,'GPS prêt. Démarrage de la course…','');
        }
      });
      if(this.session!==session)await this.gps.removeWatcher({id});
      else {session.id=id;if(session.location)this.notify(session,'GPS prêt. Démarrage de la course…','');}
    }catch(error){if(this.session===session){this.lastError='Le suivi GPS n’a pas pu démarrer. Vérifiez les autorisations et réessayez.';await this.cancel();this.onChange({message:this.lastError,action:'retry',ready:false});}}
    finally {if(this.session===session||!this.session)this.checking=false;}
  }
  async verify() {
    const session=this.session;
    const status=await this.permissions.status(),permission=await this.notifications.checkPermissions();
    if(this.session!==session||!session?.id||!status.precise||!status.locationEnabled||permission.display!=='granted'||!session.location||!this.isUsable(session.location)) {
      if(session)session.location=null;
      throw new Error('Le GPS doit être prêt avant le départ. Réessayez de démarrer la course.');
    }
    return {...session.location};
  }
  transfer(consumer) {
    const session=this.session;
    if(!session?.id)throw new Error('Session GPS indisponible.');
    clearTimeout(session.timer);session.consumer=consumer;
    const id=session.id;
    // Keep callback routing alive; cancel() only owns sessions not handed to a trip.
    session.transferred=true;
    return id;
  }
  async cancel() {
    const session=this.session;
    if(session?.transferred)return;
    this.session=null;
    if(session){session.reject?.(new Error('Préparation du GPS annulée.'));clearTimeout(session.timer);if(session.id)await this.gps.removeWatcher({id:session.id});}
  }
  release() {this.session=null;}
}
