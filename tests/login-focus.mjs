import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const events={},windowEvents={},viewportEvents={},scrolls=[],frames=new Map();
let sequence=0,passwordFocused=false;
let rect={top:280,bottom:332,height:52};
const field={matches:selector=>selector==='#auth-form input',getBoundingClientRect:()=>rect};
const document={activeElement:field,addEventListener:(name,fn)=>events[name]=fn,
  querySelector:()=>({focus:()=>passwordFocused=true})};
const window={innerHeight:700,visualViewport:{offsetTop:0,height:700,addEventListener:(name,fn)=>viewportEvents[name]=fn},
  addEventListener:(name,fn)=>windowEvents[name]=fn,scrollBy:options=>scrolls.push(options.top)};
const context=vm.createContext({document,window,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)});
vm.runInContext(await readFile(new URL('../assets/login-focus.js',import.meta.url),'utf8'),context);
const tick=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};

events.focusin();tick();assert.equal(scrolls.length,0,'Un champ visible ne fait pas sauter la page.');
window.visualViewport.height=300;viewportEvents.resize();tick();assert.ok(scrolls.pop()>0,'Le champ masqué par le clavier remonte.');
rect={top:0,bottom:52,height:52};window.visualViewport.offsetTop=40;viewportEvents.resize();tick();assert.ok(scrolls.pop()<0,'Le décalage du viewport Safari est pris en compte.');
document.activeElement={matches:()=>false};windowEvents.resize();tick();assert.equal(scrolls.length,0,'Aucun défilement hors du formulaire de connexion.');
document.activeElement=field;window.visualViewport=null;window.innerHeight=250;rect={top:300,bottom:352,height:52};windowEvents.resize();tick();assert.ok(scrolls.pop()>0,'Le redimensionnement Android fonctionne sans VisualViewport.');
events.focusin();windowEvents.resize();assert.equal(frames.size,1,'Un seul ajustement par image.');tick();
let prevented=false;events.keydown({key:'Enter',target:{id:'auth-email'},preventDefault:()=>prevented=true});
assert.ok(prevented&&passwordFocused,'Suivant passe de l’adresse au mot de passe sans soumettre.');
console.log('Connexion : champ visible, clavier réduit, viewport décalé, focus et touche Suivant vérifiés.');
