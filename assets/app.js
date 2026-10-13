'use strict';

// Composants Alpine CSP : pas de JavaScript évalué dynamiquement.
document.addEventListener('alpine:init', () => {
  Alpine.data('loginUi', () => ({
    passwordVisible: false,
    destination: state.page,
    chooseDestination(event) {
      this.destination = event.currentTarget.dataset.destination;
      state.page = this.destination;
      document.querySelector('#auth-email')?.focus();
    },
    togglePassword() { this.passwordVisible = !this.passwordVisible; },
    get passwordType() { return this.passwordVisible ? 'text' : 'password'; },
    get passwordLabel() { return this.passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'; },
  }));
  Alpine.data('workspaceUi', () => ({
    mobileOpen: false,
    toggleMenu() { this.mobileOpen = !this.mobileOpen; },
    closeMenu() { this.mobileOpen = false; },
    get sidebarClass() { return this.mobileOpen ? 'is-open' : ''; },
  }));
  Alpine.data('listUi', () => ({
    filter: state.filter,
    search(event) { state.query = event.target.value; renderResults(); },
    chooseFilter(event) {
      this.filter = event.currentTarget.dataset.filter;
      state.filter = this.filter;
      renderResults();
    },
  }));
  Alpine.data('accountUi', () => ({
    role: 'admin',
    init() { this.role = this.$el.dataset.initialRole || 'admin'; },
    get isDriver() { return this.role === 'driver'; },
    get isAdmin() { return this.role === 'admin'; },
  }));
});

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  car: '<path d="m5 8 2-5h10l2 5M3 10l2-2h14l2 2v8H3zM5 18v3m14-3v3M3 13h18M6 16h2m8 0h2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m4 0h2m-8 3h2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  logout: '<path d="M9 3H4v18h5m0-9h12m-5-5 5 5-5 5"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  phone: '<path d="m7 3 3 5-3 3a14 14 0 0 0 6 6l3-3 5 3-1 4C10 22 2 14 3 4l4-1Z"/>',
  id: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0m3-6h5m-5 4h5"/>',
  tool: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-6 6-4-4 6-6a7 7 0 0 1 9-9z"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  fuel: '<path d="M4 21V3h10v18M2 21h14M4 9h10m0 2h2v6a2 2 0 0 0 4 0V8l-3-3"/>',
  truck: '<path d="M2 5h12v12H2zm12 5h5l3 4v3h-8M17 10v4h5"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  pickup: '<path d="M2 10h10V7h5l4 5v5H2zM12 10v7m0-4h9m-7-4h2l2 3h-4z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  van: '<path d="M3 6h14l4 5v7H3zM3 12h18M7 6v6m5-6v6m5-6v6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  bike: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-8 5 8H5m5-8h7l2 8M8 6h4m4-3h3l-2 6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="14" r="4"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.car}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => new Intl.NumberFormat('fr-FR').format(value || 0);
const initials = name => String(name).trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
const date = (value, time = false) => value ? new Intl.DateTimeFormat('fr-FR', {day:'2-digit',month:'short', ...(time ? {hour:'2-digit',minute:'2-digit'} : {year:'numeric'})}).format(new Date(value.replace(' ', 'T'))) : '—';
const shortTime = value => value ? value.substring(11, 16) : '—';
const state = {csrf:'', authenticated:false, needsSetup:false, page:'overview', query:'', filter:'all', data:null, authMode:'login'};
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let toastTimer;
let busy = false;

function brand(light = false) {
  return `<div class="brand"><img src="assets/telesol-logo${light ? '-white' : ''}.png" alt="TELESOL"><span class="brand-divider"></span><div><strong>DriverMan<span class="brand-dot">.</span></strong><span class="brand-caption">GESTION DE PARC</span></div></div>`;
}

async function api(action, data) {
  if(action==='logout') await window.DriverManNotifications?.beforeLogout();
  if (window.DriverManMobile) return window.DriverManMobile.call(action,data);
  const multipart = data instanceof FormData;
  const [name, ...params] = action.split('&');
  const response = await fetch(`api.php?action=${encodeURIComponent(name)}${params.length ? '&'+params.join('&') : ''}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : {...(multipart ? {} : {'Content-Type':'application/json'}),'X-CSRF-Token':state.csrf},
    ...(data === undefined ? {} : {body:multipart ? data : JSON.stringify(data)}),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Le serveur ne répond pas correctement. Vérifiez que PHP est activé.'); }
  if (!response.ok) {
    if (response.status === 401 && state.authenticated) {
      state.authenticated = false;
      modal.close();
      await boot();
    }
    throw new Error(result.error || 'Une erreur est survenue.');
  }
  if (result.csrf) state.csrf = result.csrf;
  return result;
}

function toast(message) {
  const box = document.querySelector('#toast');
  box.innerHTML = `${icon('check')}<span>${esc(message)}</span>`;
  box.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('visible'), 4500);
}

async function boot() {
  try {
    if (window.DriverManMobile) await window.DriverManMobile.ready;
    const status = await api('status');
    Object.assign(state, status);
    if (state.authenticated) await loadData();
    else renderLogin();
  } catch (error) {
    app.innerHTML = `<div class="boot error-state">${icon('tool')}<h1>Connexion au serveur impossible</h1><p>${esc(error.message)}</p><button class="btn btn-primary primary" data-action="retry">Réessayer ${icon('arrow')}</button></div>`;
  }
}

function renderLogin() {
  const setup = state.needsSetup;
  document.title = 'DriverMan TELESOL — Connexion';
  app.innerHTML = `<main class="entry-page" x-data="loginUi">
    <div class="entry-frame">
      <aside class="entry-sidebar">
        <a class="entry-brand" href="#overview" data-destination="overview" x-on:click="chooseDestination" aria-label="DriverMan TELESOL — Accueil">
          <img src="assets/telesol-logo-white.png" alt="TELESOL" width="123" height="42">
          <span>DriverMan<span class="entry-brand-dot">.</span></span>
        </a>
        <nav class="entry-nav" aria-label="Votre espace après connexion">
          ${[['overview','Tableau de bord'],['drivers','Chauffeurs'],['vehicles','Véhicules'],['movements','Mouvements'],['accounts','Administration']].map(([destination,label]) => `<a href="#${destination}" data-destination="${destination}" x-on:click="chooseDestination" x-bind:class="destination === '${destination}' ? 'is-active' : ''">${label}</a>`).join('')}
        </nav>
        <span class="entry-copyright">© ${new Date().getFullYear()} TELESOL</span>
      </aside>
      <section class="entry-main" aria-label="Connexion à DriverMan">
        <header class="entry-topline"><a href="https://telesol.net" target="_blank" rel="noopener noreferrer">TELESOL.NET ${icon('arrow')}</a></header>
        <div class="entry-stage">
          <div class="entry-gallery">
            <div class="entry-photo entry-photo-driver"><img src="assets/fleet-driver-gps.png" alt="Chauffeur en polo et képi TELESOL, clé levée, devant le parc automobile et une carte GPS au tracé orange" fetchpriority="high"></div>
            <div class="entry-photo entry-photo-detail"><img src="assets/headlight-color.png" alt="Reflets dorés sur le phare d’un SUV bleu nuit"></div>
          </div>
          <h1 class="entry-title">Votre parc,<br>en mouvement<span>.</span></h1>
          <div class="entry-access"><h2>${setup ? 'Créer l’administrateur' : 'Connexion'}</h2>
        <form id="auth-form" method="post" data-mode="${setup ? 'setup' : 'login'}">
          ${setup ? `<label for="auth-name">Votre nom complet</label><div class="input-wrap">${icon('users')}<input class="input input-bordered" id="auth-name" name="name" placeholder="Prénom et nom" autocomplete="name" maxlength="100" required></div>` : ''}
          <label for="auth-email">Adresse e-mail</label><div class="input-wrap">${icon('mail')}<input class="input input-bordered" id="auth-email" name="email" type="email" placeholder="vous@telesol.net" autocomplete="username" maxlength="150" required></div>
          <label for="auth-password">Mot de passe</label><div class="input-wrap">${icon('lock')}<input class="input input-bordered" id="auth-password" name="password" type="password" x-bind:type="passwordType" placeholder="${setup ? '10 caractères minimum' : 'Saisissez votre mot de passe'}" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="${setup ? 10 : 1}" maxlength="72" required><button type="button" class="eye-button" x-on:click="togglePassword" x-bind:aria-label="passwordLabel" x-bind:aria-pressed="passwordVisible" aria-label="Afficher le mot de passe" aria-pressed="false">${icon('eye')}</button></div>
          <p class="form-error" id="auth-error" role="alert"></p>
          <button class="btn btn-primary primary auth-submit" type="submit">${setup ? 'Créer mon espace' : 'Se connecter'} ${icon('arrow')}</button>
        </form>
          </div>
          <div class="entry-lines" aria-hidden="true"><span></span><span></span></div>
        </div>
      </section>
      </div>
  </main>`;
  DriverManPwa.refresh();
  window.DriverManMobile?.loginRendered();
}

async function loadData() {
  state.data = await api('bootstrap');
  state.authenticated = true;
  if (!canVisit(state.page)) state.page = 'overview';
  renderShell();
  if (window.DriverManMobile) await window.DriverManMobile.onData(state.data);
}

const pages = {
  overview:{label:'Tableau de bord',icon:'grid',kicker:'UNE VUE D’ENSEMBLE',title:'Votre parc, en un coup d’œil.',description:'Les bonnes informations pour organiser chaque déplacement.'},
  vehicles:{label:'Véhicules',icon:'car',kicker:'VOTRE PARC AUTOMOBILE',title:'Une flotte bien organisée.',description:'Retrouvez vos véhicules, leur disponibilité et leur kilométrage.'},
  drivers:{label:'Chauffeurs',icon:'users',kicker:'LES VISAGES DE VOTRE MOBILITÉ',title:'Votre équipe prend la route.',description:'Gérez vos chauffeurs, leurs coordonnées et leurs permis.'},
  movements:{label:'Mouvements',icon:'route',kicker:'DU DÉPART AU RETOUR',title:'Chaque trajet a son histoire.',description:'Enregistrez les sorties, suivez les missions et confirmez les retours.'},
  fuel:{label:'Carburant',icon:'fuel',kicker:'LE SUIVI DE VOTRE CONSOMMATION',title:'Chaque litre compte.',description:'Enregistrez les ravitaillements et suivez les litres, les coûts et la consommation de chaque véhicule.'},
  reports:{label:'Rapports',icon:'activity',kicker:'LES CHIFFRES DE VOTRE ACTIVITÉ',title:'Votre activité, mois après mois.',description:'Courses, kilomètres et carburant : préparez vos bilans et exportez-les en PDF ou Excel.'},
  accounts:{label:'Comptes & accès',icon:'shield',kicker:'LES ACCÈS DE VOTRE ÉQUIPE',title:'À chacun son espace.',description:'Créez des comptes administrateurs et des accès personnels pour les chauffeurs.'},
  notifications:{label:'Notifications',icon:'bell',kicker:'VOS ALERTES PERSONNELLES',title:'Restez au courant.',description:'Choisissez les événements à recevoir et la façon dont votre appareil vous avertit.'},
};

function isAdmin() { return state.data?.user.role === 'admin'; }
function selectableVehicles() { return isAdmin() ? state.data.vehicles : state.data.selectable_vehicles; }
function canVisit(page) { return Boolean(pages[page]) && (isAdmin() || ['overview','vehicles','movements','fuel'].includes(page)); }
function pageInfo(page) {
  if (isAdmin()) return pages[page];
  if (page === 'vehicles') return {...pages.vehicles,title:'Les véhicules du parc.',description:'Consultez les véhicules, leur disponibilité et leur kilométrage.'};
  if (page === 'overview') return {...pages.overview,label:'Mon espace',kicker:'VOTRE ESPACE CHAUFFEUR',title:'Votre feuille de route.',description:'Créez une course, enregistrez vos achats de carburant et confirmez vos retours.'};
  if (page === 'fuel') return {...pages.fuel,label:'Mon carburant',description:'Enregistrez vos achats de carburant et retrouvez vos quantités et dépenses.'};
  return {...pages.movements,label:'Mes missions',title:'Vos trajets, votre historique.',description:'Créez vos courses, retrouvez vos missions et confirmez vos retours.'};
}
function pageAction() {
  if (!canVisit(state.page) || ['reports','notifications'].includes(state.page)) return '';
  if (!isAdmin() && state.page === 'vehicles') return '';
  if (!isAdmin()) return `<button class="btn btn-primary primary" data-action="${state.page === 'fuel' ? 'add-refueling' : 'add-movement'}">${icon('plus')} ${state.page === 'fuel' ? 'Acheter du carburant' : 'Créer une course'}</button>`;
  const action = {drivers:['add-driver','Ajouter un chauffeur'],vehicles:['add-vehicle','Ajouter un véhicule'],fuel:['add-refueling','Enregistrer un ravitaillement'],accounts:['add-account','Créer un compte']}[state.page] || ['add-movement','Nouveau mouvement'];
  return `<button class="btn btn-primary primary" data-action="${action[0]}">${icon('plus')} ${action[1]}</button>`;
}

function accountMenu() {
  const user = state.data.user;
  return `<details class="account-menu"><summary aria-label="Ouvrir le menu du compte"><span class="topbar-avatar">${esc(initials(user.name))}</span>${icon('chevron')}</summary><div class="account-dropdown"><div class="account-summary"><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span><small>${isAdmin() ? 'Administrateur' : 'Chauffeur'}</small></div><button type="button" data-action="profile">${icon('person')} Mon profil</button>${state.data.demo ? '' : `<button type="button" data-action="password">${icon('lock')} Changer le mot de passe</button>`}<button type="button" data-action="help">${icon('help')} Guide d’utilisation</button><button type="button" class="account-logout" data-action="logout">${icon('logout')} Se déconnecter</button></div></details>`;
}

function renderShell() {
  const d = state.data;
  const active = d.movements.filter(m => !m.end_at).length;
  document.title = `${pageInfo(state.page).label} — DriverMan TELESOL`;
  app.innerHTML = `<div class="workspace" x-data="workspaceUi" x-on:keydown.escape.window="closeMenu"><button class="sidebar-overlay" x-cloak x-show="mobileOpen" x-on:click="closeMenu" aria-label="Fermer le menu"></button>
    <aside class="sidebar" x-bind:class="sidebarClass" aria-label="Navigation principale"><a class="sidebar-brand" href="#overview" aria-label="DriverMan TELESOL, tableau de bord">${brand(true)}</a><div class="workspace-label"><span class="workspace-mark">T</span><span><strong>Parc automobile</strong><small>TELESOL · Espace de gestion</small></span></div><p class="nav-caption">ESPACE DE TRAVAIL</p><nav>${Object.entries(pages).filter(([key]) => canVisit(key)).map(([key,p]) => `<a href="#${key}" class="nav-link ${state.page === key ? 'active' : ''}" ${state.page === key ? 'aria-current="page"' : ''}>${icon(p.icon)}<span>${pageInfo(key).label}</span>${key === 'movements' && active ? `<span class="nav-count">${active}</span>` : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-photo" aria-hidden="true"><img src="assets/headlight-color.png" alt=""></div><button class="nav-link help-link" data-action="help">${icon('help')} Guide d’utilisation ${icon('chevron')}</button><div class="user-box"><span class="avatar">${esc(initials(d.user.name))}</span><span class="user-info"><strong>${esc(d.user.name)}</strong><small>${d.demo ? 'Démonstration' : isAdmin() ? 'Administrateur' : 'Chauffeur'}</small></span><button class="icon-button" data-action="logout" aria-label="Se déconnecter" title="Se déconnecter">${icon('logout')}</button></div></div></aside>
    <div class="main-shell"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" x-on:click="toggleMenu" x-bind:aria-expanded="mobileOpen" aria-label="Ouvrir le menu">${icon('menu')}</button><span class="breadcrumb-home">Espace de travail</span><span class="breadcrumb-home">/</span><strong>${pageInfo(state.page).label}</strong></div><div class="topbar-right"><span class="local-status"><span></span> ${d.demo ? 'Mode démonstration' : 'Espace connecté'}</span>${accountMenu()}</div></header>
    ${d.demo ? `<div class="demo-banner"><span>${icon('activity')} Vous explorez des données fictives. Vos essais restent dans cette démonstration.</span><div class="demo-controls"><button data-action="demo-view">${icon(isAdmin() ? 'users':'shield')} ${isAdmin() ? 'Vue chauffeur':'Vue administrateur'}</button><button data-action="logout">Quitter la démo ${icon('arrow')}</button></div></div>` : ''}
    <main id="main-content" tabindex="-1">${isAdmin() && state.page === 'overview' ? '' : `<div class="page-heading"><div class="workspace-hero" aria-hidden="true"><img src="assets/fleet-driver-gps.png" alt=""></div><div class="heading-copy"><span class="eyebrow">${pageInfo(state.page).kicker}</span><h1>${pageInfo(state.page).title}</h1><p>${pageInfo(state.page).description}</p></div>${pageAction()}</div>`}<div id="page-content"></div><footer class="app-footer"><span>DriverMan <strong>TELESOL</strong> <span class="footer-dot">·</span> Chaque mouvement compte.</span><span>Données actualisées ${shortTime(d.now)}</span></footer></main></div></div>`;
  renderPage();
  window.DriverManMobile?.render();
}

function effectiveStatus(item) {
  return Number(item.on_trip) ? 'on_trip' : item.status;
}
function badge(status) {
  const labels = {available:'Disponible',maintenance:'Maintenance',offline:'Indisponible',on_trip:'En déplacement',active:'En cours',completed:'Terminé',late:'Retour attendu'};
  return `<span class="badge ${status}"><span></span>${labels[status] || esc(status)}</span>`;
}
function movementStatus(m) {
  return m.end_at ? 'completed' : m.expected_return && m.expected_return < state.data.now.replace('T',' ') + ':00' ? 'late' : 'active';
}

function renderPage() {
  document.querySelector('#page-content').innerHTML = state.page === 'notifications' ? DriverManNotifications.page() : state.page === 'accounts' ? DriverManTracking.settingsPanel() + listing() : state.page === 'overview' ? (isAdmin() ? overview() : driverOverview()) : state.page === 'fuel' ? fuelPage() : state.page === 'reports' ? reportPage() : listing();
  if (!['overview','fuel','reports','notifications'].includes(state.page)) renderResults();
  if (state.page === 'fuel' || (isAdmin() && state.page === 'overview')) renderFuelInsights();
  if (isAdmin() && state.page === 'reports') renderReport();
  DriverManPwa.refresh();
  window.DriverManNotifications?.onRender();
}

function driverOverview() {
  const d = state.data;
  const current = d.movements.find(m => !m.end_at);
  const complete = d.movements.filter(m => m.end_at);
  const distance = complete.reduce((sum,m) => sum + m.end_km - m.start_km,0);
  const driver = d.drivers[0];
  const stats = [['Missions en cours',d.movements.length-complete.length,'route','blue'],['Missions terminées',complete.length,'check','green'],['Kilomètres parcourus',number(distance),'activity','orange']];
  return `<div class="overview-meta"><span>Bonjour ${esc(d.user.name.split(' ')[0])} <span class="hello-dot">✦</span></span><span>${icon('calendar')} ${date(d.today)}</span></div><div class="stats-grid driver-stats">${stats.map(([label,value,i,color]) => `<div class="card stat-card"><div class="stat-heading"><span>${label}</span><span class="stat-icon ${color}">${icon(i)}</span></div><strong class="stat-value">${value}${i==='activity' ? '<small>km</small>' : ''}</strong><span class="stat-sub">Votre activité personnelle</span></div>`).join('')}</div>
    <section class="panel personal-mission"><div class="panel-heading"><div><h2>${current ? 'Votre mission en cours' : 'Vous êtes au parc'}</h2><p>${current ? 'Toutes les informations pour votre déplacement.' : 'Créez une course pour enregistrer votre prochain départ.'}</p></div>${icon(current ? 'route':'car')}</div>${current ? `<div class="mission-content"><div><span class="eyebrow">DESTINATION</span><h2>${esc(current.destination)}</h2><p>${esc(current.purpose)}</p><div class="mission-meta"><span>${icon('car')} ${esc(current.make)} ${esc(current.model)} · ${esc(current.plate)}</span><span>${icon('clock')} Retour prévu : ${current.expected_return ? date(current.expected_return,true) : 'Non renseigné'}</span><span>${icon('activity')} Compteur au départ : ${number(current.start_km)} km</span></div>${current.notes ? `<p class="mission-notes">${esc(current.notes)}</p>` : ''}</div><button class="btn btn-primary primary" data-action="return" data-id="${current.id}">${icon('back')} Enregistrer mon retour</button></div>` : `<div class="driver-waiting">${icon('shield')}<p>Choisissez Créer une course pour partir avec un véhicule disponible. Vous pourrez ensuite enregistrer votre carburant et confirmer votre retour.</p></div>`}</section>
    <section class="panel personal-fuel"><div class="panel-heading"><div><h2>Mes achats de carburant</h2><p>Enregistrez les litres et le montant de vos achats.</p></div><button class="text-button" data-action="add-refueling" data-id="${current?.vehicle_id || 0}">${icon('plus')} Acheter du carburant</button></div>${fuelTable(d.refuelings.slice(0,5),true)}<div class="panel-heading"><a class="text-button" href="#fuel">Tout voir ${icon('arrow')}</a></div></section>
    <section class="panel personal-history"><div class="panel-heading"><div><h2>Mes derniers mouvements</h2><p>Votre historique de départs et de retours.</p></div><a class="text-button" href="#movements">Tout voir ${icon('arrow')}</a></div>${movementTable(d.movements.slice(0,5),true)}</section>
    ${driver ? `<div class="notice driver-license">${icon('id')}<span>${driver.license && driver.license_expiry ? `Permis <strong>${esc(driver.license)}</strong> · ${driver.license_expiry < d.today ? 'Expiré depuis le' : 'Valide jusqu’au'} ${date(driver.license_expiry)}. Pour une modification, contactez votre administrateur.` : 'Votre fiche chauffeur est à compléter par l’administrateur avant un premier départ.'}</span></div>`:''}`;
}

function overview() {
  const d = state.data;
  const available = d.vehicles.filter(v => effectiveStatus(v) === 'available').length;
  const active = d.movements.filter(m => !m.end_at).length;
  const availableDrivers = d.drivers.filter(v => effectiveStatus(v) === 'available' && v.license_expiry >= d.today).length;
  const distance = d.movements.reduce((n,m) => n + (m.end_at ? m.end_km - m.start_km : 0), 0);
  const stats = [
    ['Véhicules du parc',d.vehicles.length,'car',`${available} disponibles au parking`,'blue'],
    ['Chauffeurs',d.drivers.length,'users',`${availableDrivers} prêts à partir`,'purple'],
    ['Mouvements en cours',active,'route',active ? 'Des équipes sur le terrain' : 'Aucun déplacement en cours','orange'],
    ['Kilomètres parcourus',number(distance),'activity','Sur les trajets terminés','green'],
  ];
  const latestMovements = [...d.movements].sort((a,b) => (b.end_at || b.start_at).localeCompare(a.end_at || a.start_at) || b.id-a.id).slice(0,5);
  const latestRefuelings = [...d.refuelings].sort((a,b) => b.filled_at.localeCompare(a.filled_at) || b.id-a.id).slice(0,5);
  return `<h1 class="sr-only">Tableau de bord</h1><section class="overview-cards" aria-label="Indicateurs du parc">
    <div class="stats-grid">${stats.map(([label,value,i,sub,color]) => `<div class="card stat-card"><div class="stat-heading"><span>${label}</span><span class="stat-icon ${color}">${icon(i)}</span></div><strong class="stat-value">${value}${i === 'activity' ? '<small>km</small>' : ''}</strong><span class="stat-sub">${i === 'car' || i === 'users' ? '<span class="little-dot"></span>' : ''}${sub}</span></div>`).join('')}</div>
    <div id="overview-fuel-summary" aria-label="Indicateurs carburant sur la période du graphique"></div></section>
    ${fuelDashboard()}
    <div class="overview-recent-grid"><section class="panel movements-panel"><div class="panel-heading"><div><h2>Derniers mouvements</h2><p>Les cinq derniers départs ou retours.</p></div><a href="#movements" class="text-button">Tout voir ${icon('arrow')}</a></div>${movementTable(latestMovements, true)}</section>
    <section class="panel overview-refuelings"><div class="panel-heading"><div><h2>Derniers ravitaillements</h2><p>Les cinq derniers ravitaillements du parc.</p></div><a href="#fuel" class="text-button">Tout voir ${icon('arrow')}</a></div>${fuelTable(latestRefuelings, true)}</section></div>`;
}

function addDays(value, days) {
  const d = new Date(value+'T12:00:00');
  d.setDate(d.getDate()+days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function emptyState(title, description, action, label) {
  return `<div class="empty-state"><span>${icon(state.page === 'drivers' ? 'users' : state.page === 'vehicles' ? 'car' : 'route')}</span><h3>${title}</h3><p>${description}</p>${action ? `<button class="btn btn-outline secondary" data-action="${action}">${icon('plus')} ${label}</button>` : ''}</div>`;
}

function movementTable(movements, compact = false) {
  if (!movements.length) return emptyState('Aucun mouvement pour le moment', isAdmin() ? 'Les trajets de vos chauffeurs apparaîtront ici.' : 'Créez votre première course pour commencer.', state.data.movements.length ? null : 'add-movement', 'Enregistrer un départ');
  return `<div class="table-scroll"><table class="table"><thead><tr><th>VÉHICULE / CHAUFFEUR</th><th>DESTINATION</th>${compact ? '' : '<th>DÉPART</th><th>RETOUR</th><th>DISTANCE</th>'}<th>STATUT</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${movements.map(m => `<tr><td><div class="vehicle-cell"><span class="vehicle-symbol">${icon('car')}</span><div><strong>${esc(m.plate)}</strong><small>${esc(m.driver_name)}</small></div></div></td><td><strong class="destination">${esc(m.destination)}</strong><small>${compact ? `${date(m.start_at,true)}` : esc(m.purpose)}</small></td>${compact ? '' : `<td>${date(m.start_at,true)}<small>${number(m.start_km)} km</small></td><td>${m.end_at || m.expected_return ? date(m.end_at || m.expected_return,true) : 'À renseigner au retour'}<small>${m.end_at ? number(m.end_km)+' km' : m.expected_return ? 'Retour prévu' : 'Horaire non prévu'}</small></td><td>${m.end_at ? number(m.end_km-m.start_km)+' km' : '—'}</td>`}<td>${badge(movementStatus(m))}</td><td><button class="icon-button" data-action="route" data-id="${m.id}" aria-label="Voir la trajectoire de ${esc(m.plate)}">${icon('pin')}</button>${m.end_at ? `<button class="icon-button" data-action="details" data-id="${m.id}" aria-label="Détails du mouvement ${m.id}">${icon('chevron')}</button>` : `<button class="${compact ? 'icon-button' : 'btn small secondary'}" data-action="return" data-id="${m.id}" aria-label="Enregistrer le retour de ${esc(m.plate)}">${compact ? icon('back') : 'Retour '+icon('back')}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

function listing() {
  const configs = {
    accounts:{placeholder:'Rechercher un nom, une adresse e-mail…',filters:[['all','Tous les comptes'],['admin','Administrateurs'],['driver','Chauffeurs']]},
    drivers:{placeholder:'Rechercher un chauffeur, un permis…', filters:[['all','Tous'],['available','Disponibles'],['on_trip','En déplacement'],['offline','Indisponibles'],['expiring','Permis à vérifier']]},
    vehicles:{placeholder:'Rechercher un véhicule, une plaque…',filters:[['all','Tous'],['available','Au parking'],['on_trip','En déplacement'],['maintenance','Maintenance']]},
    movements:{placeholder:'Rechercher un trajet, un chauffeur…',filters:[['all','Tous'],['active','En cours'],['completed','Terminés'],['late','Retours attendus']]},
  };
  const conf = configs[state.page];
  return `<section x-data="listUi" class="listing-panel ${['drivers','vehicles'].includes(state.page) ? 'resource-listing driver-listing' : 'panel'}"><div class="listing-toolbar"><div class="input-wrap search-box">${icon('search')}<input class="input input-bordered" id="search" type="search" x-on:input.debounce.150ms="search" aria-label="Rechercher" placeholder="${conf.placeholder}" value="${esc(state.query)}"></div><div class="toolbar-right"><span id="results-count"></span>${state.page === 'movements' ? `<a class="btn btn-outline secondary" href="api.php?action=export" download>${icon('download')} Exporter CSV</a>` : ''}</div></div><div class="filter-tabs" role="group" aria-label="Filtrer par statut">${conf.filters.map(([key,label]) => `<button class="filter-tab" data-filter="${key}" x-on:click="chooseFilter" x-bind:class="filter === '${key}' ? 'selected' : ''" x-bind:aria-pressed="filter === '${key}'" aria-pressed="${state.filter === key}">${label}</button>`).join('')}</div><div id="listing-results"></div></section>`;
}

function renderResults() {
  const records = state.data[state.page];
  const query = state.query.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const results = records.filter(r => {
    const searchValues = state.page === 'accounts' ? [r.name,r.email,r.driver_name || ''] : state.page === 'drivers' ? [r.name,r.phone,r.license] : state.page === 'vehicles' ? [r.plate,r.make,r.model,r.type] : [r.plate,r.driver_name,r.destination,r.purpose];
    const match = searchValues.join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query);
    const status = state.page === 'accounts' ? r.role : state.page === 'movements' ? movementStatus(r) : effectiveStatus(r);
    const filterMatch = state.filter === 'all' || status === state.filter || (state.filter === 'active' && !r.end_at) || (state.filter === 'expiring' && r.license_expiry <= addDays(state.data.today,30));
    return match && filterMatch;
  });
  document.querySelector('#results-count').textContent = `${results.length} résultat${results.length === 1 ? '' : 's'}`;
  let html;
  if (!results.length) {
    const noRecords = !records.length;
    const emptyVehicleList = noRecords && !isAdmin() && state.page === 'vehicles';
    html = emptyState(noRecords ? (emptyVehicleList ? 'Aucun véhicule dans le parc' : 'Votre espace est prêt') : 'Aucun résultat',noRecords ? (emptyVehicleList ? 'Les véhicules ajoutés par votre administrateur apparaîtront ici.' : isAdmin() ? 'Ajoutez votre premier enregistrement pour commencer.' : 'Créez votre première course avec un véhicule disponible.') : 'Essayez une autre recherche ou un autre filtre.',noRecords && (isAdmin() || state.page === 'movements') ? {drivers:'add-driver',vehicles:'add-vehicle',movements:'add-movement',accounts:'add-account'}[state.page] : null,'Ajouter');
  } else if (state.page === 'movements') html = movementTable(results);
  else if (state.page === 'accounts') html = `<div class="table-scroll"><table class="table"><thead><tr><th>UTILISATEUR</th><th>ADRESSE E-MAIL</th><th>RÔLE</th><th>ACCÈS</th></tr></thead><tbody>${results.map(u => `<tr><td><div class="vehicle-cell"><span class="driver-avatar account-avatar">${esc(initials(u.name))}</span><strong>${esc(u.name)}${u.id===state.data.user.id ? ' <span class="muted">(vous)</span>' : ''}</strong></div></td><td>${esc(u.email)}</td><td><span class="badge ${u.role==='admin' ? 'active' : 'available'}">${icon(u.role==='admin' ? 'shield':'users')} ${u.role==='admin' ? 'Administrateur':'Chauffeur'}</span></td><td>${u.role==='admin' ? 'Gestion complète du parc' : 'Missions personnelles'}</td></tr>`).join('')}</tbody></table></div>`;
  else if (state.page === 'vehicles') html = `<div class="resource-grid vehicles-grid">${results.map(vehicleCard).join('')}</div>`;
  else html = `<div class="resource-grid drivers-grid">${results.map(driverCard).join('')}</div>`;
  document.querySelector('#listing-results').innerHTML = html;
}

function driverCard(driver) {
  const trips = state.data.movements.filter(m => m.driver_id === driver.id);
  const distance = trips.reduce((sum,m) => sum + (m.end_at ? m.end_km - m.start_km : 0),0);
  const hasAccount = state.data.accounts.some(a => a.driver_id === driver.id);
  const incomplete = !driver.phone || !driver.license || !driver.license_expiry;
  const expired = driver.license_expiry && driver.license_expiry < state.data.today;
  const expiring = !expired && driver.license_expiry && driver.license_expiry <= addDays(state.data.today,30);
  const status = effectiveStatus(driver);
  const warning = incomplete ? 'Fiche à compléter' : expired ? 'Permis expiré' : expiring ? 'Permis à renouveler bientôt' : '';
  return `<article class="resource-card driver-profile" data-status="${esc(status)}" aria-labelledby="driver-name-${driver.id}">
    <div class="resource-cover driver-cover"><span class="card-serial">CHAUFFEUR / ${String(driver.id).padStart(3,'0')}</span>${badge(status)}${icon('route','cover-route')}</div>
    <div class="resource-body"><div class="resource-identity driver-identity"><span class="profile-avatar tone-${driver.id % 4}" aria-hidden="true">${driver.photo_url ? `<img src="${esc(driver.photo_url)}" alt="" loading="lazy">` : icon('person')}<i class="presence-dot"></i></span><div><h2 id="driver-name-${driver.id}">${esc(driver.name)}</h2><p>Équipe TELESOL</p></div></div>
      <div class="profile-phone">${icon('phone')}<div><span class="card-label">TÉLÉPHONE</span><strong>${esc(driver.phone || 'À renseigner')}</strong></div></div>
      <dl class="resource-facts"><div><dt>${icon('id')} N° de permis</dt><dd>${esc(driver.license || 'À renseigner')}</dd></div><div class="${expired ? 'fact-danger' : incomplete || expiring ? 'fact-warning' : ''}"><dt>${icon('calendar')} Validité</dt><dd>${driver.license_expiry ? date(driver.license_expiry) : 'À renseigner'}</dd></div></dl>
      <div class="resource-metrics"><div><strong>${trips.length}</strong><span>mission${trips.length === 1 ? '' : 's'}</span></div><div><strong>${number(distance)} <small>km</small></strong><span>parcourus</span></div></div>
      ${warning ? `<div class="card-alert ${expired ? 'is-danger' : ''}">${icon('id')} ${warning}</div>` : ''}
    </div><footer class="resource-footer"><div class="card-access">${hasAccount ? `<span>${icon('shield')} Accès activé</span>` : `<button class="text-button" data-action="add-driver-account" data-id="${driver.id}">${icon('plus')} Créer un accès</button>`}</div><div class="card-actions"><button class="card-edit" data-action="edit-driver" data-id="${driver.id}" aria-label="Modifier ${esc(driver.name)}">${icon('edit')} ${incomplete ? 'Compléter' : 'Modifier'}</button>${deleteButton('driver', driver.id, driver.name)}</div></footer>
  </article>`;
}

function vehicleCard(vehicle) {
  const status = effectiveStatus(vehicle);
  const trips = state.data.movements.filter(m => m.vehicle_id === vehicle.id);
  const activeTrip = trips.find(m => !m.end_at);
  const symbol = {Camion:'truck','Pick-up':'pickup',Minibus:'van',Utilitaire:'van',Moto:'bike'}[vehicle.type] || 'car';
  return `<article class="resource-card vehicle-profile" data-status="${esc(status)}" aria-labelledby="vehicle-name-${vehicle.id}">
    <div class="resource-cover vehicle-cover ${vehicle.photo_url ? 'has-photo' : ''}">${vehicle.photo_url ? `<img class="vehicle-photo" src="${esc(vehicle.photo_url)}" alt="${esc(vehicle.make)} ${esc(vehicle.model)} — ${esc(vehicle.plate)}" loading="lazy">` : `<div class="vehicle-illustration" aria-hidden="true">${icon(symbol)}<span></span></div>`}<span class="card-serial">VÉHICULE / ${String(vehicle.id).padStart(3,'0')}</span>${badge(status)}${isAdmin() ? `<button class="card-photo-button" data-action="edit-vehicle" data-id="${vehicle.id}" aria-label="${vehicle.photo_url ? 'Changer' : 'Ajouter'} la photo de ${esc(vehicle.plate)}">${icon('camera')} ${vehicle.photo_url ? 'Changer la photo' : 'Ajouter une photo'}</button>` : ''}</div>
    <div class="resource-body"><div class="resource-identity"><h2 id="vehicle-name-${vehicle.id}">${esc(vehicle.make)} <span>${esc(vehicle.model)}</span></h2><p>Parc automobile TELESOL</p></div>
      <div class="registration"><span>TELESOL</span><strong>${esc(vehicle.plate)}</strong></div>
      <dl class="resource-facts"><div><dt>${icon('car')} Catégorie</dt><dd>${esc(vehicle.type)}</dd></div><div><dt>${icon('fuel')} Énergie</dt><dd>${esc(vehicle.fuel)}</dd></div></dl>
      <div class="vehicle-mileage">${icon('activity')}<div><span class="card-label">COMPTEUR ACTUEL</span><strong>${number(vehicle.mileage)} <small>km</small></strong></div></div>
      <div class="vehicle-assignment ${status === 'on_trip' ? 'has-mission' : ''}">${icon(status === 'on_trip' ? 'route' : status === 'maintenance' ? 'tool' : 'pin')}<div><strong>${activeTrip ? esc(activeTrip.driver_name) : status === 'on_trip' ? 'En déplacement' : status === 'maintenance' ? 'En maintenance' : 'Au parking'}</strong><span>${activeTrip ? esc(activeTrip.destination) : status !== 'available' ? 'Indisponible pour un départ' : 'Disponible pour une affectation'}</span></div></div>
    </div><footer class="resource-footer"><span class="card-trip-count">${isAdmin() ? `${trips.length} trajet${trips.length === 1 ? '' : 's'} enregistré${trips.length === 1 ? '' : 's'}` : `Vos trajets : ${trips.length}`}</span>${isAdmin() ? `<div class="card-actions">${vehicle.fuel!=='Électrique' ? `<button class="card-edit card-fuel" data-action="add-refueling" data-id="${vehicle.id}" aria-label="Ravitailler ${esc(vehicle.plate)}">${icon('fuel')} Ravitaillement</button>` : ''}<button class="card-edit" data-action="edit-vehicle" data-id="${vehicle.id}" aria-label="Modifier ${esc(vehicle.plate)}">${icon('edit')} Modifier</button>${deleteButton('vehicle', vehicle.id, vehicle.plate)}</div>` : ''}</footer>
  </article>`;
}

function deleteButton(type, id, label) {
  return isAdmin() ? `<button type="button" class="card-edit card-delete" data-action="delete-${type}" data-id="${id}" aria-label="Supprimer ${esc(label)}">${icon('trash')} Supprimer</button>` : '';
}

function confirmDelete(type, id) {
  if (!isAdmin()) return;
  const driver = type === 'driver';
  const record = state.data[driver ? 'drivers' : 'vehicles'].find(r => r.id === id);
  if (!record) return;
  const label = driver ? record.name : `${record.make} ${record.model} — ${record.plate}`;
  if (record.on_trip) {
    openModal('Une mission est en cours', label, `<p class="delete-explanation">Enregistrez le retour ${driver ? 'de ce chauffeur' : 'de ce véhicule'} avant de supprimer sa fiche.</p><div class="modal-actions"><button type="button" class="btn btn-outline secondary" data-action="close">Fermer</button></div>`);
    return;
  }
  const hasAccount = driver && state.data.accounts.some(a => a.driver_id === id);
  openModal(driver ? 'Supprimer ce chauffeur ?' : 'Supprimer ce véhicule ?', label, `<form id="record-form" method="post" data-action="delete-${type}"><input type="hidden" name="id" value="${id}"><p class="delete-explanation">Cette fiche sera retirée du parc et ne pourra plus être affectée à un départ. Les trajets déjà enregistrés resteront consultables dans l’historique.</p>${hasAccount ? '<p class="delete-explanation">Le compte de ce chauffeur sera désactivé et ses sessions ouvertes perdront leur accès.</p>' : ''}<p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-outline secondary" data-action="close" autofocus>Annuler</button><button type="submit" class="btn delete-confirm">${icon('trash')} Supprimer ${driver ? 'le chauffeur' : 'le véhicule'}</button></div></form>`);
}

function inputField(label, name, value = '', type = 'text', extra = '', required = true) {
  return `<div class="field"><label for="field-${name}">${label}</label><input class="input input-bordered" id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra} ${required ? 'required' : ''}></div>`;
}
function selectField(label,name,values,selected) {
  return `<div class="field"><label for="field-${name}">${label}</label><select class="select select-bordered" id="field-${name}" name="${name}" required>${values.map(v => `<option value="${esc(v[0])}" ${String(v[0]) === String(selected) ? 'selected' : ''}>${esc(v[1])}</option>`).join('')}</select></div>`;
}
const pair = values => values.map(v => [v,v]);

function photoField(type, record) {
  const label = type === 'driver' ? 'Photo du chauffeur' : 'Photo du véhicule';
  return `<div class="photo-field ${type === 'driver' ? 'is-avatar' : ''}"><div class="photo-preview" data-photo-preview>${record.photo_url ? `<img src="${esc(record.photo_url)}" alt="Aperçu de la photo">` : icon(type === 'driver' ? 'person' : 'camera')}</div><div class="photo-controls"><label for="field-photo">${label} <span class="muted">(facultatif)</span></label><p class="field-hint">JPG, PNG ou WebP · 2 Mo maximum.</p><input type="hidden" name="remove_photo" value="0"><input class="photo-input" id="field-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-error"><button type="button" class="text-button photo-remove" data-action="remove-photo" ${record.photo_url ? '' : 'hidden'}>${icon('close')} Retirer la photo</button><p id="photo-error" class="photo-error" role="alert"></p></div></div>`;
}

function vehicleTypeField(value = '') {
  const types = [...new Set(['SUV','Berline','Pick-up','Minibus','Utilitaire','Camion','Moto',...state.data.vehicles.map(v => v.type)])];
  return `<div class="field"><label for="field-type">Type de véhicule</label><input class="input input-bordered" id="field-type" name="type" list="vehicle-types" value="${esc(value)}" maxlength="60" placeholder="Choisir ou saisir un type" required><datalist id="vehicle-types">${types.map(type => `<option value="${esc(type)}"></option>`).join('')}</datalist><p class="field-hint">Saisissez un nouveau type pour l’ajouter à la liste.</p></div>`;
}

function openForm(type, id = 0) {
  const d = state.data;
  if (!['return','movement'].includes(type) && !isAdmin()) return;
  let title,subtitle,content,action,submit;
  if (type === 'account') {
    title = 'Créer un compte'; subtitle = 'Un accès adapté au rôle de chaque membre de l’équipe.';
    action = 'create-user'; submit = 'Créer le compte';
    const available = d.drivers.filter(driver => !d.accounts.some(a => a.driver_id === driver.id));
    content = `<div x-data="accountUi" data-initial-role="${id ? 'driver':'admin'}"><div class="field"><label for="field-role">Rôle du compte</label><select class="select select-bordered" id="field-role" name="role" x-model="role"><option value="admin">Administrateur</option><option value="driver">Chauffeur</option></select></div><div x-show="isAdmin">${inputField('Nom complet de l’administrateur','name','','text','maxlength="100" autocomplete="off" x-bind:disabled="isDriver"')}</div><div x-show="isDriver" x-cloak><div class="field"><label for="field-driver_id">Fiche chauffeur associée</label><select class="select select-bordered" id="field-driver_id" name="driver_id" x-bind:disabled="isAdmin" required><option value="">Sélectionner un chauffeur</option>${available.map(driver=>`<option value="${driver.id}" ${driver.id===id?'selected':''}>${esc(driver.name)}</option>`).join('')}</select></div>${available.length ? '<p class="field-hint account-hint">Chaque chauffeur dispose d’un seul compte personnel.</p>' : '<p class="field-hint account-hint">Ajoutez d’abord un chauffeur sans compte dans la rubrique Chauffeurs.</p>'}</div>${inputField('Adresse e-mail de connexion','email','','email','maxlength="150" autocomplete="off" placeholder="prenom@telesol.net"')}${inputField('Mot de passe initial','password','','password','minlength="10" maxlength="72" autocomplete="new-password" placeholder="10 caractères minimum"')}<p class="field-hint account-hint">Communiquez les identifiants directement à la personne concernée.</p><div class="permission-summary"><div x-show="isAdmin">${icon('shield')} <span>Gestion des véhicules, chauffeurs, mouvements et création de comptes.</span></div><div x-show="isDriver" x-cloak>${icon('users')} <span>Création de ses courses, achats de carburant et enregistrement de ses retours.</span></div></div></div>`;
  } else if (type === 'driver') {
    const driver = d.drivers.find(v => v.id === id) || {};
    title = id ? 'Modifier le chauffeur' : 'Ajouter un chauffeur';
    subtitle = 'Les informations utiles pour prendre la route.';
    action = 'save-driver'; submit = id ? 'Enregistrer les modifications' : 'Ajouter le chauffeur';
    content = `<input type="hidden" name="id" value="${id}">${photoField('driver',driver)}${inputField('Nom complet','name',driver.name,'text','maxlength="100" autocomplete="name"')}${inputField('Téléphone','phone',driver.phone,'tel','maxlength="40" autocomplete="tel"')}<div class="form-row">${inputField('Numéro de permis','license',driver.license,'text','maxlength="50"')}${inputField('Expiration du permis','license_expiry',driver.license_expiry,'date')}</div>${selectField('Disponibilité','status',[['available','Disponible'],['offline','Indisponible']],driver.status)}`;
  } else if (type === 'vehicle') {
    const v = d.vehicles.find(v => v.id === id) || {};
    title = id ? 'Modifier le véhicule' : 'Ajouter un véhicule';
    subtitle = 'Une fiche claire pour chaque véhicule du parc.';
    action = 'save-vehicle'; submit = id ? 'Enregistrer les modifications' : 'Ajouter le véhicule';
    content = `<input type="hidden" name="id" value="${id}">${photoField('vehicle',v)}${inputField('Immatriculation','plate',v.plate,'text','maxlength="30" placeholder="Ex. KN 1234 AB"')}<div class="form-row">${inputField('Marque','make',v.make,'text','maxlength="60" placeholder="Ex. Toyota"')}${inputField('Modèle','model',v.model,'text','maxlength="60" placeholder="Ex. Hilux"')}</div><div class="form-row">${vehicleTypeField(v.type)}${selectField('Énergie','fuel',pair(['Diesel','Essence','Hybride','Électrique']),v.fuel)}</div><div class="form-row">${inputField('Kilométrage actuel','mileage',v.mileage || 0,'number',`min="${v.mileage || 0}" max="10000000" step="1"`)}${selectField('État du véhicule','status',[['available','Disponible'],['maintenance','En maintenance']],v.status)}</div>`;
  } else if (type === 'movement') {
    const drivers = d.drivers.filter(v => effectiveStatus(v) === 'available' && v.license_expiry >= d.today);
    const vehicles = selectableVehicles().filter(v => effectiveStatus(v) === 'available');
    if (!drivers.length || !vehicles.length) {
      if (!isAdmin()) {
        const reason = d.movements.some(m => !m.end_at) ? 'Enregistrez le retour de votre mission en cours avant de créer une nouvelle course.' : !drivers.length ? 'Votre fiche doit être disponible et votre permis valide. Contactez votre administrateur pour mettre votre fiche à jour.' : 'Aucun véhicule n’est disponible pour le moment.';
        openModal('Préparons votre prochaine course',reason,'<div class="modal-actions"><button class="btn secondary" data-action="close">Fermer</button></div>');
        return;
      }
      openModal('Préparons le prochain départ', 'Un chauffeur et un véhicule disponibles sont nécessaires.', `<div class="notice modal-notice">${icon('help')}<p>${!drivers.length ? 'Ajoutez un chauffeur disponible avec un permis valide, ou enregistrez le retour d’une mission en cours.' : 'Ajoutez un véhicule disponible, ou enregistrez le retour d’un véhicule en déplacement.'}</p></div><div class="modal-actions"><button class="btn btn-outline secondary" data-action="close">Fermer</button><button class="btn btn-primary primary" data-action="${!drivers.length ? 'add-driver' : 'add-vehicle'}">${!drivers.length ? 'Ajouter un chauffeur' : 'Ajouter un véhicule'} ${icon('plus')}</button></div>`);
      return;
    }
    title = isAdmin() ? 'Enregistrer un départ' : 'Créer une course'; subtitle = isAdmin() ? 'Un chauffeur, un véhicule, une destination.' : 'Cette course sera enregistrée à votre nom.';
    action = 'depart'; submit = 'Confirmer le départ';
    content = `<div class="form-row">${isAdmin() ? selectField('Chauffeur disponible','driver_id',drivers.map(v => [v.id,v.name])) : `<div class="field"><label>Chauffeur</label><p>${esc(d.user.name)}</p></div>`}${selectField('Véhicule disponible','vehicle_id',vehicles.map(v => [v.id,v.plate+' · '+v.make+' '+v.model]))}</div>${inputField('Destination','destination','','text','maxlength="150" placeholder="Ex. Aéroport de N’djili"')}${selectField('Motif du déplacement','purpose',pair(['Mission de service','Transport de personnel','Livraison','Déplacement administratif','Autre']))}<div class="form-row">${inputField('Date et heure de départ','start_at',serverNow(),'datetime-local')}${inputField('Retour prévu <span class="muted">(facultatif)</span>','expected_return','','datetime-local','aria-describedby="expected-return-hint"',false)}</div><p id="expected-return-hint" class="field-hint">Vous pouvez laisser cet horaire vide. La date et l’heure du retour réel seront obligatoires au retour.</p>${inputField('Kilométrage au départ','start_km',vehicles[0].mileage,'number',`min="${vehicles[0].mileage}" max="10000000" step="1"`)}<div class="field"><label for="field-notes">Observations <span class="muted">(facultatif)</span></label><textarea class="textarea textarea-bordered" id="field-notes" name="notes" maxlength="1000" placeholder="Une précision pour cette mission…" rows="2"></textarea></div>`;
  } else {
    const m = d.movements.find(v => v.id === id);
    if (!m) return;
    title = 'Enregistrer le retour'; subtitle = `${m.plate} · ${m.driver_name}`;
    action = 'return'; submit = 'Confirmer le retour';
    content = `<input type="hidden" name="id" value="${id}"><div class="return-summary"><span>${icon('pin')} ${esc(m.destination)}</span><p>Départ le ${date(m.start_at,true)} · Compteur : <strong>${number(m.start_km)} km</strong></p></div>${inputField('Date et heure de retour','end_at',serverNow(),'datetime-local',`min="${m.start_at.replace(' ','T').slice(0,16)}"`)}${inputField('Kilométrage au retour','end_km','','number',`min="${m.start_km}" max="10000000" step="1" placeholder="Au moins ${m.start_km} km"`)}<p class="field-hint">${icon('check')} Le chauffeur et le véhicule redeviendront disponibles.</p>`;
  }
  openModal(title,subtitle,`<form id="record-form" method="post" data-action="${action}">${content}<p id="record-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-outline secondary" data-action="close">Annuler</button><button type="submit" class="btn btn-primary primary">${submit} ${icon('check')}</button></div></form>`);
}

function serverNow() {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:state.data.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' ','T');
}

function openModal(title,subtitle,html) {
  modal.innerHTML = `<div class="modal-heading"><div><span class="eyebrow">DRIVERMAN TELESOL</span><h2 id="modal-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button" data-action="close" aria-label="Fermer">${icon('close')}</button></div>${html}`;
  if (!modal.open) modal.showModal();
  requestAnimationFrame(() => (modal.querySelector('[autofocus]') || modal.querySelector('form input:not([type="hidden"]):not(:disabled), form select:not(:disabled)') || modal.querySelector('button'))?.focus());
}

function showDetails(id) {
  const m = state.data.movements.find(v => v.id === id);
  if (!m) return;
  const details = [['Chauffeur',m.driver_name],['Véhicule',`${m.make} ${m.model} · ${m.plate}`],['Destination',m.destination],['Motif',m.purpose],['Départ',date(m.start_at,true)],['Retour prévu',m.expected_return ? date(m.expected_return,true) : 'Non renseigné'],['Retour enregistré',date(m.end_at,true)],['Compteur de départ',number(m.start_km)+' km'],['Compteur de retour',number(m.end_km)+' km'],['Distance parcourue',number(m.end_km-m.start_km)+' km'],['Observations',m.notes || 'Aucune observation']];
  openModal('Détails du mouvement',`Mission #${String(m.id).padStart(4,'0')}`,`<dl class="detail-list">${details.map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="modal-actions"><button type="button" class="btn secondary" data-action="route" data-id="${m.id}">${icon('pin')} Voir l’itinéraire</button><button class="btn btn-primary primary" data-action="close">Fermer</button></div>`);
}

function showHelp() {
  if (state.authenticated && !isAdmin()) {
    openModal('Votre espace chauffeur','Les informations de vos missions, à portée de main.',`<div class="guide"><div><span>01</span><section><h3>Créez votre course</h3><p>Cliquez sur Créer une course, choisissez un véhicule disponible et indiquez la destination, le motif et le compteur. La course est automatiquement créée à votre nom. Les missions affectées par votre administrateur apparaissent aussi dans Mon espace.</p></section></div><div><span>02</span><section><h3>Signalez votre retour</h3><p>Choisissez Enregistrer mon retour, puis indiquez l’heure et le compteur. Votre mission est terminée et le véhicule redevient disponible.</p></section></div><div><span>03</span><section><h3>Enregistrez votre carburant</h3><p>Dans Mon carburant, choisissez Acheter du carburant. Sélectionnez un véhicule disponible ou celui de votre mission en cours, puis saisissez la date, le compteur, les litres et le prix. Vous y retrouvez vos achats personnels.</p></section></div><div><span>04</span><section><h3>Retrouvez vos trajets</h3><p>Dans Mes missions, filtrez les trajets ou exportez votre historique en CSV. Pour modifier votre fiche, contactez votre administrateur.</p></section></div></div><div class="modal-actions"><button class="btn btn-primary primary" data-action="close">C’est compris ${icon('check')}</button></div>`);
    return;
  }
  openModal('Votre guide de prise en main','Quelques étapes pour garder votre parc sous contrôle.',`<div class="guide"><div><span>01</span><section><h3>Ajoutez vos ressources</h3><p>Créez les fiches de vos chauffeurs avec leur permis, puis celles de vos véhicules avec leur kilométrage.</p></section></div><div><span>02</span><section><h3>Enregistrez le départ</h3><p>Choisissez un chauffeur et un véhicule disponibles. Précisez la destination et le compteur. L’horaire de retour prévu est facultatif.</p></section></div><div><span>03</span><section><h3>Confirmez le retour</h3><p>Dans Mouvements, cliquez sur Retour. Renseignez l’heure et le compteur : les ressources sont à nouveau disponibles.</p></section></div><div><span>04</span><section><h3>Retrouvez votre historique</h3><p>Filtrez vos mouvements ou exportez l’historique en CSV. Les fiches peuvent être modifiées sans supprimer les trajets.</p></section></div></div><p class="help-note">L’accès à la démonstration utilise des données fictives séparées de votre espace. Pour un accès perdu, contactez l’administrateur de votre installation.</p><div class="modal-actions"><button class="btn btn-primary primary" data-action="close">C’est compris ${icon('check')}</button></div>`);
}

function showProfile() {
  const user = state.data.user;
  const driver = state.data.drivers.find(d => d.id === user.driver_id);
  const details = [['Nom complet',user.name],['Adresse e-mail',user.email],['Rôle',isAdmin() ? 'Administrateur' : 'Chauffeur']];
  if (driver) details.push(['Téléphone',driver.phone || 'À renseigner'],['N° de permis',driver.license || 'À renseigner']);
  openModal('Mon profil','Les informations de votre compte personnel.',`<div class="account-profile"><span class="profile-avatar" aria-hidden="true">${driver?.photo_url ? `<img src="${esc(driver.photo_url)}" alt="">` : icon('person')}</span><div><strong>${esc(user.name)}</strong><p>${isAdmin() ? 'Gestion du parc TELESOL' : 'Équipe TELESOL'}</p></div></div><dl class="detail-list">${details.map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="modal-actions"><button type="button" class="btn btn-outline secondary" data-action="close">Fermer</button>${state.data.demo ? '' : `<button type="button" class="btn btn-primary primary" data-action="password">${icon('lock')} Changer le mot de passe</button>`}</div>`);
}

function showPasswordForm() {
  if (state.data.demo) return;
  openModal('Changer le mot de passe','Confirmez votre mot de passe actuel pour enregistrer le nouveau.',`<form id="record-form" method="post" data-action="change-password">${inputField('Mot de passe actuel','current_password','','password','autocomplete="current-password" maxlength="72"')}${inputField('Nouveau mot de passe','new_password','','password','autocomplete="new-password" minlength="10" maxlength="72"')}${inputField('Confirmer le nouveau mot de passe','confirm_password','','password','autocomplete="new-password" minlength="10" maxlength="72"')}<p class="field-hint">Entre 10 et 72 caractères.</p><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-outline secondary" data-action="close">Annuler</button><button type="submit" class="btn btn-primary primary">Enregistrer ${icon('check')}</button></div></form>`);
}

document.addEventListener('click', event => {
  const menu = document.querySelector('.account-menu');
  if (menu && (!menu.contains(event.target) || event.target.closest('[data-action]'))) menu.open = false;
});
document.addEventListener('keydown', event => {
  const menu = document.querySelector('.account-menu[open]');
  if (event.key === 'Escape' && menu) {menu.open = false;menu.querySelector('summary').focus();}
});
document.addEventListener('focusin', event => {
  const menu = document.querySelector('.account-menu[open]');
  if (menu && !menu.contains(event.target)) menu.open = false;
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.tagName === 'FORM' || button.disabled) return;
  const action = button.dataset.action;
  const id = Number(button.dataset.id || 0);
  if (action === 'close') { if (!busy) modal.close(); return; }
  if (action === 'auth-mode') { state.authMode = state.authMode === 'login' ? 'setup' : 'login'; renderLogin(); return; }
  if (action === 'help') { showHelp(); return; }
  if (action === 'profile') { showProfile(); return; }
  if (action === 'password') { showPasswordForm(); return; }
  if (action === 'remove-photo') {
    const field = button.closest('.photo-field');
    const input = field.querySelector('[name="photo"]');
    input.value = ''; input.setCustomValidity('');
    field.querySelector('[name="remove_photo"]').value = '1';
    field.querySelector('[data-photo-preview]').innerHTML = icon(field.classList.contains('is-avatar') ? 'person' : 'camera');
    field.querySelector('.photo-error').textContent = '';
    button.hidden = true;
    return;
  }
  if (action === 'add-account' || action === 'add-driver-account') {openForm('account',id);return;}
  if (action === 'details') { showDetails(id); return; }
  if (action === 'add-refueling') {openRefueling(id);return;}
  if (action === 'locate-refueling') {await locateRefueling(button);return;}
  if (action === 'delete-driver' || action === 'delete-vehicle') {confirmDelete(action === 'delete-driver' ? 'driver' : 'vehicle',id);return;}
  if (action === 'add-driver' || action === 'edit-driver') {openForm('driver',id);return;}
  if (action === 'add-vehicle' || action === 'edit-vehicle') {openForm('vehicle',id);return;}
  if (action === 'add-movement') {openForm('movement');return;}
  if (action === 'return') {openForm('return',id);return;}
  if (action === 'retry') {await boot();return;}
  if (action === 'demo-view') {
    button.disabled = true;
    try {
      await api('demo-view',{role:isAdmin() ? 'driver':'admin'});
      state.page = 'overview'; state.query = ''; state.filter = 'all';
      history.replaceState(null,'',location.pathname);
      await loadData();
    } catch (error) {toast(error.message);button.disabled = false;}
    return;
  }
  if (action === 'demo' || action === 'logout') {
    button.disabled = true;
    try {
      await api(action,{});
      state.page = 'overview'; state.query = ''; state.filter = 'all';
      history.replaceState(null,'',location.pathname);
      await boot();
    } catch (error) {toast(error.message);button.disabled = false;}
  }
});

document.addEventListener('submit', async event => {
  // Un champ name="id" masque la propriété form.id : lire l'attribut réel.
  const formId = event.target.getAttribute('id');
  if (!['auth-form','record-form'].includes(formId)) return;
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  const auth = formId === 'auth-form';
  const errorBox = form.querySelector('.form-error');
  const button = form.querySelector('[type="submit"]');
  const original = button.innerHTML;
  errorBox.textContent = '';
  button.disabled = true; busy = true;
  button.innerHTML = `${icon('clock')} ${form.dataset.action?.startsWith('delete-') ? 'Suppression…' : 'Enregistrement…'}`;
  try {
    const multipart = form.querySelector('[name="photo"]');
    const data = multipart ? new FormData(form) : Object.fromEntries(new FormData(form));
    if (form.dataset.action === 'save-refueling') data.full_tank ||= '0';
    if (multipart && !multipart.files.length) data.delete('photo');
    if (form.dataset.action === 'change-password' && data.new_password !== data.confirm_password) throw new Error('Les deux nouveaux mots de passe ne correspondent pas.');
    await api(auth ? form.dataset.mode : form.dataset.action,data);
    if (auth) {await boot();toast('Bienvenue dans DriverMan TELESOL.');}
    else {modal.close();await loadData();toast(form.dataset.action === 'save-mobile-settings' ? 'Adresse HTTPS du serveur mobile enregistrée.' : form.dataset.action === 'save-refueling' ? 'Ravitaillement enregistré.' : form.dataset.action === 'delete-driver' ? 'Le chauffeur a été supprimé du parc.' : form.dataset.action === 'delete-vehicle' ? 'Le véhicule a été supprimé du parc.' : form.dataset.action === 'depart' ? 'Départ enregistré. Bonne route !' : form.dataset.action === 'return' ? 'Retour enregistré. Le parc est à jour.' : form.dataset.action === 'change-password' ? 'Votre mot de passe a été modifié.' : 'Les informations ont été enregistrées.');}
  } catch (error) {errorBox.textContent = error.message;errorBox.scrollIntoView({block:'nearest'});}
  finally {busy = false;button.disabled = false;button.innerHTML = original;}
});

document.addEventListener('change', async event => {
  if (event.target.id === 'field-photo') {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    const field = input.closest('.photo-field');
    const errorBox = field.querySelector('.photo-error');
    errorBox.textContent = '';
    input.setCustomValidity('Préparation de la photo en cours.');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choisissez une photo de 2 Mo maximum.');
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choisissez une photo JPG, PNG ou WebP.');
      const url = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Impossible de lire cette photo.'));
        reader.readAsDataURL(file);
      });
      const preview = new Image();
      preview.src = url;
      await preview.decode();
      if (preview.naturalWidth > 6000 || preview.naturalHeight > 6000 || preview.naturalWidth * preview.naturalHeight > 12000000) throw new Error('Réduisez la photo à 12 mégapixels et 6 000 pixels par côté maximum.');
      if (!input.isConnected || input.files[0] !== file) return;
      preview.alt = 'Aperçu de la photo';
      field.querySelector('[data-photo-preview]').replaceChildren(preview);
      field.querySelector('[name="remove_photo"]').value = '0';
      field.querySelector('.photo-remove').hidden = false;
      input.setCustomValidity('');
    } catch (error) {
      if (!input.isConnected || input.files[0] !== file) return;
      const message = error.name === 'EncodingError' ? 'Cette photo est endommagée ou illisible.' : error.message;
      input.setCustomValidity(message);
      errorBox.textContent = message;
      field.querySelector('.photo-remove').hidden = false;
    }
  }
  if (event.target.id === 'field-vehicle_id') {
    const vehicle = selectableVehicles().find(v => v.id === Number(event.target.value));
    const input = document.querySelector('#field-start_km');
    if (vehicle && input) {input.value = vehicle.mileage;input.min = vehicle.mileage;}
  }
});
modal.addEventListener('cancel', event => {if (busy) event.preventDefault();});
modal.addEventListener('click', event => {if (!busy && event.target === modal) {const r = modal.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) modal.close();}});
window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1);
  if (state.authenticated && canVisit(page)) {state.page = page;state.query = '';state.filter = 'all';renderShell();window.scrollTo(0,0);}
});
if (pages[location.hash.slice(1)]) state.page = location.hash.slice(1);
boot();
