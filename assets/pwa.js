'use strict';

const DriverManPwa=(()=>{
  if(window.DriverManMobile) return {buttonHtml:()=>'',refresh:()=>{}};
  const base=new URL('../',document.currentScript.src);
  const key=`driverman-pwa:${base.pathname}:`;
  const standalone=window.matchMedia('(display-mode: standalone)');
  const read=name=>{try{return localStorage.getItem(key+name);}catch{return null;}};
  const save=(name,value)=>{try{if(value===null)localStorage.removeItem(key+name);else localStorage.setItem(key+name,value);}catch{/* Stockage privé indisponible : conserver seulement l'état en mémoire. */}};
  const launched=()=>standalone.matches||navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // Safari ne peut pas confirmer qu’une icône précédemment ajoutée existe encore.
  let installed=launched()||(!ios&&read('installed')==='1'),deferred=null,seen=read('seen')==='1',dialog=null,prompting=false,initialChecked=false;
  function buttonHtml(){return `<button type="button" class="nav-link pwa-sidebar-button" data-pwa-install ${installed?'disabled':''}><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${installed?'<path d="m5 12 4 4L19 6"/>':'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'}</svg><span>${installed?'Installé':'Installer l’application'}</span></button>`;}
  function androidLinkHtml(){return `<a class="nav-link pwa-sidebar-button android-sidebar-link" data-android-download href="${new URL('android.php',base).href}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M12 6v7m-3-3 3 3 3-3"/></svg><span>Application Android <small>APK</small></span></a>`;}
  function refresh(){
    for(const container of document.querySelectorAll('.entry-install,.sidebar-bottom')) {
      if(!container.querySelector('[data-pwa-install]')) {
        container.insertAdjacentHTML('afterbegin',buttonHtml());
      }
      if(!container.querySelector('[data-android-download]')) container.querySelector('[data-pwa-install]').insertAdjacentHTML('afterend',androidLinkHtml());
    }
    document.querySelectorAll('[data-pwa-install]').forEach(button=>{const template=document.createElement('template');template.innerHTML=buttonHtml();button.replaceWith(template.content.firstElementChild);});
  }
  function setInstalled(value){installed=value;save('installed',value?'1':null);if(value){seen=true;save('seen','1');dialog?.close();}refresh();}
  function instructions(){
    if(!window.isSecureContext) return 'L’installation nécessite une adresse HTTPS, ou localhost sur l’ordinateur du serveur. Ouvrez DriverMan avec une adresse sécurisée pour l’installer sur cet appareil.';
    if(ios)return 'Dans Safari, ouvrez le menu de partage (dans « Plus » selon la version), choisissez « Sur l’écran d’accueil », gardez « Ouvrir comme app web » activé si cette option apparaît, puis validez avec « Ajouter ». Retrouvez ensuite l’icône DriverMan sur votre écran d’accueil.';
    return 'Dans Chrome ou Edge, ouvrez le menu du navigateur puis « Installer DriverMan » ou « Installer cette page en tant qu’application ». Sur mobile, l’option peut s’appeler « Ajouter à l’écran d’accueil ». Si elle est absente, utilisez un navigateur compatible et vérifiez l’adresse du site.';
  }
  function show(){
    if(installed||prompting)return;
    if(document.querySelector('dialog[open]')&&!dialog?.open)return;
    seen=true;save('seen','1');
    if(!dialog){dialog=document.createElement('dialog');dialog.className='pwa-dialog';dialog.setAttribute('aria-labelledby','pwa-title');document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
    dialog.innerHTML=`<button type="button" class="pwa-close" data-pwa-dismiss aria-label="Fermer l’invitation">×</button><img class="pwa-app-icon" src="assets/pwa/icon-192.png" width="76" height="76" alt=""><p class="pwa-eyebrow">DRIVERMAN TELESOL</p><h2 id="pwa-title">${ios?'DriverMan sur votre iPhone ou iPad.':'Votre parc, à portée de main.'}</h2><p>Retrouvez votre espace administrateur ou chauffeur directement depuis votre écran d’accueil.</p><p class="pwa-connection">Une connexion au serveur reste nécessaire pour gérer le parc.</p><p class="pwa-instructions" id="pwa-instructions" ${deferred?'hidden':''}></p>${ios?'<p class="pwa-connection">Vous pouvez consulter les itinéraires reçus et relever votre position pour un achat de carburant. Le suivi automatique des courses écran verrouillé nécessite l’application Android native.</p>':''}<p id="pwa-status" role="status"></p><div class="pwa-dialog-actions">${ios?'<button type="button" class="btn primary" data-pwa-dismiss>Compris</button>':'<button type="button" class="btn secondary" data-pwa-dismiss>Plus tard</button><button type="button" class="btn primary" data-pwa-confirm>Installer l’application</button>'}</div>`;
    dialog.querySelector('#pwa-instructions').textContent=instructions();dialog.showModal();
  }
  async function install(){
    if(prompting)return;
    if(!deferred){const hint=dialog.querySelector('#pwa-instructions');hint.hidden=false;hint.textContent=instructions();return;}
    prompting=true;const request=deferred;deferred=null;
    const button=dialog.querySelector('[data-pwa-confirm]');button.disabled=true;
    try{await request.prompt();const choice=await request.userChoice;if(choice.outcome==='accepted'){dialog.querySelector('#pwa-status').textContent='Installation acceptée. Votre navigateur termine l’installation.';}else{dialog.close();}}
    catch{dialog.querySelector('#pwa-status').textContent='L’installation n’a pas pu démarrer. Utilisez le menu de votre navigateur ou réessayez.';}
    finally{prompting=false;button.disabled=false;}
  }
  async function detect(){
    if(launched()){setInstalled(true);return;}
    if(navigator.getInstalledRelatedApps&&window.isSecureContext){try{const apps=await navigator.getInstalledRelatedApps();setInstalled(apps.some(app=>app.platform==='webapp'&&app.url&&new URL(app.url,base).href===new URL('manifest.webmanifest',base).href));}catch{/* Certains navigateurs ne prennent pas cette détection en charge. */}}
  }
  function firstVisit(){if(initialChecked||seen||installed)return;initialChecked=true;const retry=()=>{if(seen||installed)return;if(document.querySelector('dialog[open]')){setTimeout(retry,1500);return;}show();};setTimeout(retry,900);}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;setInstalled(false);if(dialog?.open){dialog.querySelector('#pwa-instructions').hidden=true;dialog.querySelector('#pwa-status').textContent='L’installation est prête.';}});
  window.addEventListener('appinstalled',()=>{deferred=null;setInstalled(true);});
  standalone.addEventListener('change',()=>{if(launched())setInstalled(true);});
  document.addEventListener('click',event=>{if(event.target.closest('[data-pwa-install]')&&!installed)show();if(event.target.closest('[data-pwa-dismiss]'))dialog?.close();if(event.target.closest('[data-pwa-confirm]'))install();});
  document.addEventListener('DOMContentLoaded',async()=>{
    await detect();refresh();firstVisit();
    if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname}).catch(()=>{/* L'application en ligne reste accessible. */});
  });
  window.addEventListener('pageshow',()=>{if(launched())setInstalled(true);});
  return {buttonHtml,androidLinkHtml,refresh};
})();
