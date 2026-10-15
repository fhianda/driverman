// A GPS session belongs to one departure form, and is never saved before departure.
export class DepartureGps {
  constructor({gps,permissions,notifications,isUsable,onChange=()=>{},timeoutMs=45000}) {
    Object.assign(this,{gps,permissions,notifications,isUsable,onChange,timeoutMs});
    this.session=null;
  }
  notify(session,message,action='retry') {
    if(this.session===session) this.onChange({message,action,ready:Boolean(session.location&&this.isUsable(session.location))});
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
      if(!status.precise) {this.notify(session,'Autorisez la position précise pour enregistrer votre parcours.','app-settings');return;}
      let permission=await this.notifications.checkPermissions();
      if(permission.display!=='granted'&&request)permission=await this.notifications.requestPermissions();
      if(this.session!==session)return;
      if(permission.display!=='granted'){this.notify(session,'Autorisez les notifications pour afficher le suivi pendant la course.','app-settings');return;}
      if(!status.background){this.notify(session,'Pour continuer écran verrouillé, choisissez Localisation → Toujours autoriser dans les réglages Android.','background');return;}
      if(!status.locationEnabled){this.notify(session,'Activez la localisation du téléphone pour continuer.','location-settings');return;}
      this.notify(session,'Recherche de votre position… Restez à l’extérieur si possible.','');
      session.timer=setTimeout(()=>{
        if(this.session!==session||session.consumer)return;
        this.cancel().then(()=>this.onChange({message:'Aucune position assez précise reçue. Réessayez dans un endroit dégagé.',action:'retry',ready:false}));
      },this.timeoutMs);
      const id=await this.gps.addWatcher({backgroundTitle:'DriverMan · Suivi GPS',backgroundMessage:'Votre parcours est enregistré de la confirmation du départ jusqu’au retour.',requestPermissions:false,stale:false,distanceFilter:0},(location,error)=>{
        if(this.session!==session)return;
        if(session.consumer){session.consumer(location,error);return;}
        if(error){session.location=null;this.notify(session,'La position est indisponible. Vérifiez le GPS et réessayez.','retry');return;}
        if(this.isUsable(location)){
          session.location={...location};clearTimeout(session.timer);
          this.notify(session,`GPS prêt · précision ± ${Math.ceil(location.accuracy)} m. Le suivi restera actif jusqu’au retour.`,'retry');
        }
      });
      if(this.session!==session)await this.gps.removeWatcher({id});
      else session.id=id;
    }catch(error){if(this.session===session){await this.cancel();this.onChange({message:'Le suivi GPS n’a pas pu démarrer. Vérifiez les autorisations et réessayez.',action:'retry',ready:false});}}
    finally {if(this.session===session||!this.session)this.checking=false;}
  }
  async verify() {
    const session=this.session;
    const status=await this.permissions.status(),permission=await this.notifications.checkPermissions();
    if(this.session!==session||!session?.id||!status.precise||!status.background||!status.locationEnabled||permission.display!=='granted'||!session.location||!this.isUsable(session.location)) {
      if(session)session.location=null;
      throw new Error('Le GPS doit être prêt avant le départ. Touchez « Vérifier le GPS » pour continuer.');
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
    if(session){clearTimeout(session.timer);if(session.id)await this.gps.removeWatcher({id:session.id});}
  }
  release() {this.session=null;}
}
