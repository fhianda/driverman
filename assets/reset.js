'use strict';
const DriverManReset=(()=>{
  const panel=()=>state.data.demo?'':`<section class="mobile-tracking reset-panel"><h2>Nouvelle utilisation</h2><p>Repartir avec un parc vide en conservant les comptes administrateurs.</p><button type="button" class="btn secondary" data-reset-open>Préparer la remise à zéro</button></section>`;
  async function open() {
    const result=await api('reset-preview',{}),c=result.counts;
    openModal('Nouvelle utilisation','Les comptes administrateurs restent disponibles.',`<form id="reset-form" method="post"><p>Cette action supprime les chauffeurs et leurs comptes, les véhicules et leurs photos, les courses, les achats de carburant, les tracés et l’historique des notifications.</p><dl class="detail-list"><div><dt>Chauffeurs</dt><dd>${number(c.drivers)}</dd></div><div><dt>Véhicules</dt><dd>${number(c.vehicles)}</dd></div><div><dt>Courses</dt><dd>${number(c.movements)}</dd></div><div><dt>Achats de carburant</dt><dd>${number(c.refuelings)}</dd></div><div><dt>Administrateurs conservés</dt><dd>${number(c.admins)}</dd></div></dl><p>Une sauvegarde sera créée avant la suppression et pourra être téléchargée. Sa restauration nécessite une intervention sur la base de données. L’adresse du serveur et les réglages de notifications des administrateurs sont conservés.</p>${c.active?'<p class="form-error">Enregistrez d’abord le retour des '+number(c.active)+' courses en cours.</p>':''}${inputField('Votre mot de passe administrateur','password','','password','autocomplete="current-password" maxlength="72"')}${inputField('Saisissez REINITIALISER pour confirmer','confirmation','','text','autocomplete="off" pattern="REINITIALISER" maxlength="20"')}<p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary" ${c.active?'disabled':''}>Effacer et recommencer</button></div></form>${result.backup_id?`<button type="button" class="text-button" data-reset-download="${esc(result.backup_id)}">Télécharger la dernière sauvegarde</button>`:''}`);
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-reset-open')){
      button.disabled=true;
      try{await open();}catch(error){toast(error.message);}finally{button.disabled=false;}
    }
    if(button.dataset.resetDownload){
      button.disabled=true;
      try{
        const file=await api('reset-backup',{backup_id:button.dataset.resetDownload});
        if(window.DriverManMobile)await window.DriverManMobile.saveFile(file.filename,file.content);
        else {const url=URL.createObjectURL(new Blob([file.content],{type:'application/sql;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      }catch(error){toast(error.message);}finally{button.disabled=false;}
    }
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(form.id!=='reset-form')return;
    event.preventDefault();const button=form.querySelector('[type="submit"]'),error=form.querySelector('[role="alert"]');if(button.disabled)return;
    button.disabled=true;error.textContent='';
    try{
      const result=await api('reset-workspace',Object.fromEntries(new FormData(form)));
      form.reset();await loadData();
      openModal('Votre espace est prêt','Les comptes administrateurs ont été conservés.',`<p>Vous pouvez ajouter les nouveaux chauffeurs et véhicules.</p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">Fermer</button><button type="button" class="btn primary" data-reset-download="${esc(result.backup_id)}">Télécharger la sauvegarde</button></div>`);
    }catch(failure){error.textContent=failure.message;error.scrollIntoView({block:'nearest'});button.disabled=false;}
  });
  return {panel};
})();
