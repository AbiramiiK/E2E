/**
 * EXTRA2ESSENTIAL (E2E) — App Core
 * Connects food providers, shelters/NGOs and volunteers around surplus food
 * that's still safe to eat. Pure front-end: state lives in memory and is
 * mirrored to localStorage so a refresh doesn't wipe a session.
 */

'use strict';

/* ==========================================================================
   Storage helpers — defensive, since localStorage can throw (private mode,
   storage quota, disabled cookies, etc).
   ========================================================================== */

const STORAGE_KEY = 'e2e:state';
const THEME_KEY = 'e2e:theme';

const Storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
};

/* ==========================================================================
   Seed data + application state
   ========================================================================== */

const SEED_ITEMS = [
  {
    id: '1',
    provider: 'Global Events Center',
    type: 'Vegetable Biryani',
    quantity: '30 plates',
    prepTime: '2026-06-19T12:00',
    storage: 'Hot Container',
    status: 'available',
    location: 'Downtown, Sector 5',
    shelter: null
  },
  {
    id: '2',
    provider: 'Corporate Mess',
    type: 'Sandwiches & Salads',
    quantity: '15 packs',
    prepTime: '2026-06-19T08:00',
    storage: 'Refrigerated',
    status: 'available',
    location: 'IT Park, East Wing',
    shelter: null
  },
  {
    id: '3',
    provider: 'Corporate Mess',
    type: 'Sambar',
    quantity: '15 litres',
    prepTime: '2026-06-19T08:00',
    storage: 'Refrigerated',
    status: 'available',
    location: 'VEC, Chennai',
    shelter: null
  }
];

const State = {
  currentRole: null, // 'provider' | 'shelter' | 'volunteer'
  foodItems: SEED_ITEMS.map(item => ({ ...item })),
  filters: {
    providerStatus: 'all',
    shelterSearch: '',
    shelterRank: 'all',
    volunteerStatus: 'all'
  }
};

const ROLE_LABELS = {
  provider: 'Provider',
  shelter: 'Shelter / NGO',
  volunteer: 'Volunteer'
};

function persist() {
  Storage.set(STORAGE_KEY, {
    currentRole: State.currentRole,
    foodItems: State.foodItems
  });
}

/* ==========================================================================
   Freshness engine
   Storage-aware safety windows. Logic is preserved exactly from the original
   prototype — only the presentation (ring + live countdown) is new.
   ========================================================================== */

const SAFETY_WINDOW_HOURS = {
  'Hot Container': 4,
  'Refrigerated': 24,
  'Room Temperature': 3
};

function getFreshness(prepTimeStr, storageType) {
  const prepTime = new Date(prepTimeStr);
  const now = new Date();
  const hoursElapsed = Math.max(0, (now - prepTime) / (1000 * 60 * 60));

  let rank = 'Not Suitable';
  if (storageType === 'Hot Container') {
    if (hoursElapsed < 2) rank = 'Immediate Use';
    else if (hoursElapsed < 4) rank = 'Safe for Later Use';
  } else if (storageType === 'Refrigerated') {
    if (hoursElapsed < 12) rank = 'Safe for Later Use';
    else if (hoursElapsed < 24) rank = 'Immediate Use';
  } else {
    if (hoursElapsed < 3) rank = 'Immediate Use';
  }

  const window = SAFETY_WINDOW_HOURS[storageType] || 3;
  const pct = Math.min((hoursElapsed / window) * 100, 100);

  return { rank, hoursElapsed, pct };
}

// Kept for naming continuity with the original prototype.
function calculateFreshness(prepTimeStr, storageType) {
  return getFreshness(prepTimeStr, storageType).rank;
}

function freshnessMeta(rank) {
  if (rank === 'Immediate Use') {
    return { badgeClass: 'badge-urgent', ring: 'var(--turmeric)', rankColor: 'var(--turmeric-deep)', label: 'Use immediately' };
  }
  if (rank === 'Safe for Later Use') {
    return { badgeClass: 'badge-safe', ring: 'var(--moss)', rankColor: 'var(--moss-deep)', label: 'Safe for later' };
  }
  return { badgeClass: 'badge-expired', ring: 'var(--clay)', rankColor: 'var(--clay)', label: 'Not suitable' };
}

function formatElapsed(hours) {
  if (hours < 1 / 60) return 'moments ago';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
}

/* ==========================================================================
   Small utilities
   ========================================================================== */

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function statusLabel(status) {
  return status.replace('_', ' ');
}

/* ==========================================================================
   Form validation
   ========================================================================== */

const Validation = {
  rules: {
    foodType: (v) => {
      if (!v.trim()) return 'Tell us what the dish is.';
      if (v.trim().length < 2) return 'That name looks too short.';
      return '';
    },
    quantity: (v) => {
      if (!v.trim()) return 'Add an amount, e.g. "20 plates" or "10 kg".';
      return '';
    },
    prepTime: (v) => {
      if (!v) return 'Pick when this was prepared.';
      if (new Date(v).getTime() > Date.now()) return "Preparation time can't be in the future.";
      return '';
    }
  },

  validateField(input) {
    const rule = Validation.rules[input.id];
    if (!rule) return true;
    const message = rule(input.value);
    const field = input.closest('.field');
    const errorEl = document.getElementById(`${input.id}-error`);
    if (field) field.classList.toggle('is-invalid', Boolean(message));
    if (errorEl) errorEl.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  },

  validateForm(form) {
    let valid = true;
    form.querySelectorAll('input[id], select[id]').forEach(input => {
      if (!Validation.validateField(input)) valid = false;
    });
    return valid;
  }
};

/* ==========================================================================
   Theme (light / dark, persisted, respects system preference on first run)
   ========================================================================== */

const Theme = {
  init() {
    const saved = Storage.get(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    Theme.apply(saved || (prefersDark ? 'dark' : 'light'));
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.set(THEME_KEY, theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const isDark = theme === 'dark';
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    Theme.apply(current === 'dark' ? 'light' : 'dark');
  }
};

/* ==========================================================================
   Toasts
   ========================================================================== */

const TOAST_ICONS = {
  success: '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  error: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
};

function showToast(message, type = 'success', duration = 3600) {
  const region = document.getElementById('toast-region');
  if (!region) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${TOAST_ICONS[type] || TOAST_ICONS.info}</svg>
    <span>${escapeHTML(message)}</span>
    <button class="toast-close" type="button" aria-label="Dismiss notification">&times;</button>
  `;

  const remove = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector('.toast-close').addEventListener('click', remove);
  const timer = setTimeout(remove, duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));

  region.appendChild(toast);
}

/* ==========================================================================
   Shared render fragments
   ========================================================================== */

function statCardHTML(value, label) {
  return `
    <div class="stat-card">
      <span class="stat-value">${value}</span>
      <span class="stat-label">${label}</span>
    </div>
  `;
}

function emptyStateHTML(title, message) {
  return `
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
}

function itemCardHTML(item, actionsHTML) {
  const fresh = getFreshness(item.prepTime, item.storage);
  const meta = freshnessMeta(fresh.rank);

  return `
    <article class="item-card" data-item-id="${item.id}">
      <div class="item-top">
        <div>
          <h4 class="item-name">${escapeHTML(item.type)}</h4>
          <p class="item-provider">${escapeHTML(item.provider)}</p>
        </div>
        <span class="badge ${meta.badgeClass}">${meta.label}</span>
      </div>

      <div class="freshness">
        <div class="freshness-ring" style="--ring-pct:${fresh.pct.toFixed(0)};--ring-color:${meta.ring};"></div>
        <div class="freshness-text">
          <span class="freshness-rank" style="--rank-color:${meta.rankColor};">${fresh.rank}</span>
          <span class="freshness-time">${formatElapsed(fresh.hoursElapsed)} · ${escapeHTML(item.storage)}</span>
        </div>
      </div>

      <div class="item-meta">
        <span>Qty <strong>${escapeHTML(item.quantity)}</strong></span>
        <span>Status <strong>${escapeHTML(statusLabel(item.status))}</strong></span>
      </div>

      ${actionsHTML || ''}
    </article>
  `;
}

function setChipPressed(scopeEl, selector, value) {
  scopeEl.querySelectorAll(selector).forEach(chip => {
    chip.setAttribute('aria-pressed', String(chip.dataset.value === value));
  });
}

/* ==========================================================================
   Views
   ========================================================================== */

const contentArea = document.getElementById('content-area');

const UI = {

  renderLogin() {
    document.getElementById('role-switcher').classList.add('hidden');
    document.getElementById('role-pill').classList.add('hidden');

    contentArea.innerHTML = `
      <div class="view">
        <div class="intro">
          <svg class="intro-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21C7 17 4 13.5 4 9.5C4 6 6.5 3 10 3C11.2 3 12 3.6 12 3.6C12 3.6 12.8 3 14 3C17.5 3 20 6 20 9.5C20 13.5 17 17 12 21Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M12 21V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <h2>Welcome to Extra2Essential</h2>
          <p>Surplus food, redirected fast — before the window to use it safely closes. Choose how you're taking part.</p>
        </div>

        <div class="role-grid">
          <button class="role-card" type="button" data-action="set-role" data-role="provider">
            <span class="role-card-icon">🏢</span>
            <h3>Food Provider</h3>
            <p>Post surplus food the moment it's ready, with storage and timing so it reaches someone while it's still good.</p>
            <span class="role-card-cta">Post surplus →</span>
          </button>

          <button class="role-card" type="button" data-action="set-role" data-role="shelter">
            <span class="role-card-icon">🏠</span>
            <h3>Shelter / NGO</h3>
            <p>Browse what's available nearby right now, ranked by how urgently it needs to be used.</p>
            <span class="role-card-cta">Browse food →</span>
          </button>

          <button class="role-card" type="button" data-action="set-role" data-role="volunteer">
            <span class="role-card-icon">🚴</span>
            <h3>Volunteer</h3>
            <p>Pick up claimed donations and get them to the shelter that's waiting on them.</p>
            <span class="role-card-cta">View pickups →</span>
          </button>
        </div>
      </div>
    `;
  },

  renderProviderDashboard() {
    const allMine = State.foodItems.filter(f => f.status !== 'delivered');
    const statusChips = [
      { value: 'all', label: 'All' },
      { value: 'available', label: 'Available' },
      { value: 'accepted', label: 'Claimed' },
      { value: 'picked_up', label: 'Out for delivery' }
    ];

    contentArea.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div>
            <h2>Provider dashboard</h2>
            <p class="view-sub">Post what's left over, track who's claimed it.</p>
          </div>
          <button class="btn btn-outline btn-sm" type="button" data-action="reset-data">Reset demo data</button>
        </div>

        <div class="stats-strip" style="--stat-count:3;">
          ${statCardHTML(State.foodItems.length, 'Total posted')}
          ${statCardHTML(allMine.filter(i => i.status === 'available').length, 'Awaiting claim')}
          ${statCardHTML(allMine.filter(i => i.status !== 'available').length, 'Claimed')}
        </div>

        <div class="panel panel-accent">
          <div class="panel-head"><h3>Post surplus food</h3></div>
          <form id="food-form" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="foodType">Food type</label>
                <input type="text" id="foodType" placeholder="e.g. Vegetable Biryani" autocomplete="off">
                <span class="field-error" id="foodType-error" role="alert"></span>
              </div>
              <div class="field">
                <label for="quantity">Quantity</label>
                <input type="text" id="quantity" placeholder="e.g. 20 plates, 10 kg" autocomplete="off">
                <span class="field-error" id="quantity-error" role="alert"></span>
              </div>
              <div class="field">
                <label for="prepTime">Preparation time</label>
                <input type="datetime-local" id="prepTime">
                <span class="field-error" id="prepTime-error" role="alert"></span>
              </div>
              <div class="field">
                <label for="storage">Storage condition</label>
                <select id="storage">
                  <option>Room Temperature</option>
                  <option>Refrigerated</option>
                  <option>Hot Container</option>
                </select>
                <span class="field-error"></span>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Post food request</button>
            </div>
          </form>
        </div>

        <div class="view-head" style="margin-top: 28px;">
          <h2 style="font-size: 1.1rem;">Active requests</h2>
          <div class="chip-row" id="provider-status-chips">
            ${statusChips.map(c => `<button class="chip" type="button" data-action="filter-provider" data-value="${c.value}" aria-pressed="${c.value === State.filters.providerStatus}">${c.label}</button>`).join('')}
          </div>
        </div>

        <div id="provider-grid"></div>
      </div>
    `;

    UI.renderProviderGrid();
  },

  renderProviderGrid() {
    const grid = document.getElementById('provider-grid');
    if (!grid) return;

    const items = State.foodItems
      .filter(f => f.status !== 'delivered')
      .filter(f => State.filters.providerStatus === 'all' || f.status === State.filters.providerStatus);

    grid.innerHTML = items.length
      ? `<div class="item-grid">${items.map(item => itemCardHTML(item)).join('')}</div>`
      : emptyStateHTML('Nothing here yet', 'Post your first surplus batch above and it\'ll show up here, visible to nearby shelters.');
  },

  renderShelterDashboard() {
    const accepted = State.foodItems.filter(f => f.shelter === 'My Shelter');

    contentArea.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div>
            <h2>Nearby surplus food</h2>
            <p class="view-sub">Ranked by how urgently it needs to be used.</p>
          </div>
        </div>

        <div class="stats-strip" style="--stat-count:3;">
          ${statCardHTML(State.foodItems.filter(f => f.status === 'available').length, 'Available now')}
          ${statCardHTML(accepted.length, 'Claimed by you')}
          ${statCardHTML(accepted.filter(f => f.status === 'delivered').length, 'Delivered')}
        </div>

        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-3.8-3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <label for="shelter-search" class="sr-only">Search available food</label>
            <input type="search" id="shelter-search" placeholder="Search by dish or provider…" value="${escapeHTML(State.filters.shelterSearch)}" autocomplete="off">
          </div>
          <div class="chip-row" id="shelter-rank-chips">
            ${['all', 'Immediate Use', 'Safe for Later Use'].map(v => `
              <button class="chip" type="button" data-action="filter-shelter-rank" data-value="${v}" aria-pressed="${v === State.filters.shelterRank}">${v === 'all' ? 'All' : v}</button>
            `).join('')}
          </div>
        </div>

        <div id="shelter-grid"></div>

        <div id="shelter-orders" style="margin-top: 28px;"></div>
      </div>
    `;

    UI.renderShelterGrid();
    UI.renderShelterOrders();
  },

  renderShelterGrid() {
    const grid = document.getElementById('shelter-grid');
    if (!grid) return;

    const search = State.filters.shelterSearch.trim().toLowerCase();

    const items = State.foodItems
      .filter(f => f.status === 'available')
      .filter(f => !search || f.type.toLowerCase().includes(search) || f.provider.toLowerCase().includes(search))
      .filter(f => State.filters.shelterRank === 'all' || getFreshness(f.prepTime, f.storage).rank === State.filters.shelterRank);

    grid.innerHTML = items.length
      ? `<div class="item-grid">${items.map(item => itemCardHTML(item, `
          <div class="btn-row">
            <button class="btn btn-secondary btn-sm" type="button" data-action="accept-food" data-id="${item.id}" data-usage="now">Use now</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="accept-food" data-id="${item.id}" data-usage="later">Use later</button>
          </div>
        `)).join('')}</div>`
      : emptyStateHTML('No surplus nearby right now', 'Check back soon — providers post new batches throughout the day.');
  },

  renderShelterOrders() {
    const wrap = document.getElementById('shelter-orders');
    if (!wrap) return;

    const myOrders = State.foodItems.filter(f => f.shelter === 'My Shelter');
    if (!myOrders.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = `
      <h2 style="font-size: 1.1rem; margin-bottom: 14px;">Delivery status</h2>
      <div class="item-grid">
        ${myOrders.map(item => `
          <article class="item-card">
            <div class="item-top">
              <div>
                <h4 class="item-name">${escapeHTML(item.type)}</h4>
                <p class="item-provider">${escapeHTML(item.provider)}</p>
              </div>
              <span class="badge badge-neutral">${escapeHTML(statusLabel(item.status))}</span>
            </div>
            <div class="item-meta"><span>Qty <strong>${escapeHTML(item.quantity)}</strong></span></div>
          </article>
        `).join('')}
      </div>
    `;
  },

  renderVolunteerDashboard() {
    contentArea.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div>
            <h2>Pickup &amp; delivery</h2>
            <p class="view-sub">Tasks waiting on a volunteer in your area.</p>
          </div>
        </div>

        <div class="stats-strip" style="--stat-count:2;">
          ${statCardHTML(State.foodItems.filter(f => f.status === 'accepted').length, 'Awaiting pickup')}
          ${statCardHTML(State.foodItems.filter(f => f.status === 'picked_up').length, 'Out for delivery')}
        </div>

        <div class="chip-row" id="volunteer-chips" style="margin-bottom: 16px;">
          ${[
            { value: 'all', label: 'All tasks' },
            { value: 'accepted', label: 'Needs pickup' },
            { value: 'picked_up', label: 'Needs delivery' }
          ].map(c => `<button class="chip" type="button" data-action="filter-volunteer" data-value="${c.value}" aria-pressed="${c.value === State.filters.volunteerStatus}">${c.label}</button>`).join('')}
        </div>

        <div id="volunteer-grid"></div>
      </div>
    `;

    UI.renderVolunteerGrid();
  },

  renderVolunteerGrid() {
    const grid = document.getElementById('volunteer-grid');
    if (!grid) return;

    const tasks = State.foodItems
      .filter(f => f.status === 'accepted' || f.status === 'picked_up')
      .filter(f => State.filters.volunteerStatus === 'all' || f.status === State.filters.volunteerStatus);

    grid.innerHTML = tasks.length
      ? `<div class="item-grid">${tasks.map(item => `
          <article class="item-card" data-item-id="${item.id}">
            <div class="item-top">
              <div>
                <span class="badge badge-urgent" style="margin-bottom: 8px; display:inline-block;">${item.status === 'accepted' ? 'Needs pickup' : 'Needs delivery'}</span>
                <h4 class="item-name">${escapeHTML(item.type)}</h4>
              </div>
            </div>
            <div class="item-meta"><span>Qty <strong>${escapeHTML(item.quantity)}</strong></span></div>
            <div class="location-box">
              <p><strong>📍 Pickup —</strong> ${escapeHTML(item.location)}</p>
              <p><strong>📍 Drop —</strong> ${escapeHTML(item.shelter || 'Shelter Center')}</p>
            </div>
            ${item.status === 'accepted'
              ? `<button class="btn btn-primary" type="button" data-action="update-status" data-id="${item.id}" data-status="picked_up">Confirm pickup</button>`
              : `<button class="btn btn-primary" type="button" data-action="update-status" data-id="${item.id}" data-status="delivered">Confirm delivery</button>`
            }
          </article>
        `).join('')}</div>`
      : emptyStateHTML('No deliveries assigned', 'New pickup tasks will appear here once a shelter claims a donation.');
  }
};

function renderCurrentRole() {
  if (State.currentRole === 'provider') UI.renderProviderDashboard();
  else if (State.currentRole === 'shelter') UI.renderShelterDashboard();
  else if (State.currentRole === 'volunteer') UI.renderVolunteerDashboard();
}

// Lighter periodic refresh used by the freshness ticker — re-renders only
// the item grid (never the toolbar/search input) so typing and scroll
// position are never disturbed.
function refreshCurrentGrid() {
  if (State.currentRole === 'provider') UI.renderProviderGrid();
  else if (State.currentRole === 'shelter') { UI.renderShelterGrid(); UI.renderShelterOrders(); }
  else if (State.currentRole === 'volunteer') UI.renderVolunteerGrid();
}

/* ==========================================================================
   App controller
   ========================================================================== */

window.App = {

  init() {
    Theme.init();

    const saved = Storage.get(STORAGE_KEY);
    if (saved && Array.isArray(saved.foodItems)) State.foodItems = saved.foodItems;
    if (saved && saved.currentRole) State.currentRole = saved.currentRole;

    if (State.currentRole) {
      document.getElementById('role-switcher').classList.remove('hidden');
      const pill = document.getElementById('role-pill');
      pill.classList.remove('hidden');
      pill.textContent = ROLE_LABELS[State.currentRole];
      renderCurrentRole();
    } else {
      UI.renderLogin();
    }

    wireStaticEvents();
    wireDelegatedEvents();

    // Freshness ranks shift with elapsed time — keep cards current without
    // disturbing whatever the person is doing.
    setInterval(refreshCurrentGrid, 30000);
  },

  setRole(role) {
    State.currentRole = role;
    State.filters = { providerStatus: 'all', shelterSearch: '', shelterRank: 'all', volunteerStatus: 'all' };
    persist();

    document.getElementById('role-switcher').classList.remove('hidden');
    const pill = document.getElementById('role-pill');
    pill.classList.remove('hidden');
    pill.textContent = ROLE_LABELS[role];

    renderCurrentRole();
  },

  logout() {
    State.currentRole = null;
    persist();
    UI.renderLogin();
  },

  addFood(form) {
    if (!Validation.validateForm(form)) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner spinner-sm" aria-hidden="true"></span> Posting…';

    // Brief simulated delay so the loading state is visible — there's no
    // real network call since this app has no backend yet.
    setTimeout(() => {
      const type = form.querySelector('#foodType').value.trim();
      const quantity = form.querySelector('#quantity').value.trim();
      const prepTime = form.querySelector('#prepTime').value;
      const storage = form.querySelector('#storage').value;

      State.foodItems.unshift({
        id: Date.now().toString(),
        provider: 'Global Events Center',
        type,
        quantity,
        prepTime,
        storage,
        status: 'available',
        location: 'Downtown, Sector 5',
        shelter: null
      });

      persist();
      UI.renderProviderDashboard();
      showToast(`${type} posted — nearby shelters can now see it.`, 'success');
    }, 550);

    // Restore the button immediately if something goes wrong with render.
    void originalLabel;
  },

  acceptFood(id, usage) {
    const item = State.foodItems.find(f => f.id === id);
    if (!item) { showToast('That item is no longer available.', 'error'); UI.renderShelterGrid(); return; }

    item.status = 'accepted';
    item.shelter = 'My Shelter';
    item.plannedUsage = usage;
    persist();
    UI.renderShelterDashboard();
    showToast(`${item.type} claimed — a volunteer will be notified.`, 'success');
  },

  updateStatus(id, status) {
    const item = State.foodItems.find(f => f.id === id);
    if (!item) { showToast('That task is no longer available.', 'error'); UI.renderVolunteerGrid(); return; }

    item.status = status;
    persist();
    UI.renderVolunteerDashboard();
    showToast(status === 'delivered' ? 'Delivery confirmed — thank you!' : 'Pickup confirmed. Time to deliver.', 'success');
  },

  setProviderFilter(value) {
    State.filters.providerStatus = value;
    setChipPressed(document, '#provider-status-chips .chip', value);
    UI.renderProviderGrid();
  },

  setShelterRankFilter(value) {
    State.filters.shelterRank = value;
    setChipPressed(document, '#shelter-rank-chips .chip', value);
    UI.renderShelterGrid();
  },

  setShelterSearch(value) {
    State.filters.shelterSearch = value;
    UI.renderShelterGrid();
  },

  setVolunteerFilter(value) {
    State.filters.volunteerStatus = value;
    setChipPressed(document, '#volunteer-chips .chip', value);
    UI.renderVolunteerGrid();
  },

  resetDemoData() {
    State.foodItems = SEED_ITEMS.map(item => ({ ...item }));
    persist();
    renderCurrentRole();
    showToast('Demo data reset.', 'info');
  }
};

/* ==========================================================================
   Event wiring
   ========================================================================== */

function wireStaticEvents() {
  document.getElementById('role-switcher').addEventListener('click', () => App.logout());
  document.getElementById('brand-home').addEventListener('click', () => App.logout());
  document.getElementById('theme-toggle').addEventListener('click', () => Theme.toggle());
}

function wireDelegatedEvents() {
  const debouncedSearch = debounce((value) => App.setShelterSearch(value), 200);

  contentArea.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    switch (el.dataset.action) {
      case 'set-role': App.setRole(el.dataset.role); break;
      case 'accept-food': App.acceptFood(el.dataset.id, el.dataset.usage); break;
      case 'update-status': App.updateStatus(el.dataset.id, el.dataset.status); break;
      case 'filter-provider': App.setProviderFilter(el.dataset.value); break;
      case 'filter-shelter-rank': App.setShelterRankFilter(el.dataset.value); break;
      case 'filter-volunteer': App.setVolunteerFilter(el.dataset.value); break;
      case 'reset-data': App.resetDemoData(); break;
    }
  });

  contentArea.addEventListener('submit', (e) => {
    if (e.target.id === 'food-form') {
      e.preventDefault();
      App.addFood(e.target);
    }
  });

  contentArea.addEventListener('input', (e) => {
    if (e.target.id === 'shelter-search') debouncedSearch(e.target.value);
    if (e.target.closest('#food-form') && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      Validation.validateField(e.target);
    }
  });

  contentArea.addEventListener('focusout', (e) => {
    if (e.target.closest('#food-form') && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      Validation.validateField(e.target);
    }
  });
}

App.init();