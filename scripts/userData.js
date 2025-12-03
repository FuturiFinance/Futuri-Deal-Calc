<script>
/** =======================
 *  Deal Calc — UserData (Static Option A)
 *  Keeps your Nielsen JSON read-only, and lets users add their own companies.
 *  Data is saved in localStorage and can be exported/imported as JSON.
 * ======================= */

window.UserData = (function () {
  const USER_KEY = 'dealcalc_user_data_v1';
  const norm = s => (s ?? '').toString().trim().replace(/\s+/g,' ').toLowerCase();
  const clone = o => JSON.parse(JSON.stringify(o));

  function normalizeSchema(any){
    if (any && Array.isArray(any.parents)) {
      return {
        parents: any.parents.map(p => ({
          name: String(p.name ?? ''),
          country: p.country ?? null,
          markets: Array.isArray(p.markets) ? p.markets.map(m => ({
            name: String(m.name ?? ''),
            stations: Array.isArray(m.stations) ? m.stations.map(String) : []
          })) : []
        }))
      };
    }
    if (any && typeof any === 'object' && !Array.isArray(any)) {
      const parents = [];
      for (const [parentName, marketsObj] of Object.entries(any)) {
        const markets = [];
        if (marketsObj && typeof marketsObj === 'object') {
          for (const [marketName, stations] of Object.entries(marketsObj)) {
            markets.push({ name: String(marketName), stations: Array.isArray(stations) ? stations.map(String) : [] });
          }
        }
        parents.push({ name: String(parentName), country: null, markets });
      }
      return { parents };
    }
    return { parents: [] };
  }

  function readUser(){
    try { return normalizeSchema(JSON.parse(localStorage.getItem(USER_KEY) || '')); }
    catch { return { parents: [] }; }
  }
  function writeUser(data){ localStorage.setItem(USER_KEY, JSON.stringify(data)); }

  function mergeBaseAndUser(base, user){
    const out = clone(base);
    for (const up of user.parents){
      let p = out.parents.find(pp => norm(pp.name) === norm(up.name));
      if (!p){ out.parents.push(clone(up)); continue; }
      if (!p.country && up.country) p.country = up.country;
      for (const um of up.markets){
        let m = p.markets.find(mm => norm(mm.name) === norm(um.name));
        if (!m){ p.markets.push(clone(um)); continue; }
        const set = new Set(m.stations.map(norm));
        for (const st of um.stations){ if (!set.has(norm(st))) m.stations.push(st); }
      }
    }
    out.parents.sort((a,b)=>a.name.localeCompare(b.name));
    out.parents.forEach(p => {
      p.markets.sort((a,b)=>a.name.localeCompare(b.name));
      p.markets.forEach(m => m.stations.sort());
    });
    return out;
  }

  let baseData = { parents: [] };
  async function init(baseUrl){
    try {
      const res = await fetch(baseUrl || 'radio_data.json', { cache: 'no-store' });
      baseData = normalizeSchema(await res.json());
    } catch (e){
      console.warn('Could not load base radio_data.json; using empty base.', e);
      baseData = { parents: [] };
    }
  }

  function getMerged(){ return mergeBaseAndUser(baseData, readUser()); }

  function addEntry({ parent, country, market, station }){
    const u = readUser();
    if (!parent?.trim() || !market?.trim() || !station?.trim()) return false;
    const pKey = norm(parent), mKey = norm(market), sKey = norm(station);

    let p = u.parents.find(pp => norm(pp.name) === pKey);
    if (!p){ p = { name: parent.trim(), country: country?.trim() || null, markets: [] }; u.parents.push(p); }
    else if (!p.country && country?.trim()) p.country = country.trim();

    let m = p.markets.find(mm => norm(mm.name) === mKey);
    if (!m){ m = { name: market.trim(), stations: [] }; p.markets.push(m); }

    if (!m.stations.map(norm).includes(sKey)) m.stations.push(station.trim());

    writeUser(u);
    return true;
  }

  function exportUser(){
    const blob = new Blob([localStorage.getItem(USER_KEY) || '{"parents":[]}'], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'user_radio_data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  }

  async function importUser(file){
    const text = await file.text();
    const incoming = normalizeSchema(JSON.parse(text));
    const current = readUser();
    const merged = mergeBaseAndUser(current, incoming);
    writeUser(merged);
  }

  return { init, getMerged, addEntry, export: exportUser, import: importUser };
})();
</script>

<script>
(async function boot() {
  await UserData.init('radio_data.json');

  const status = document.getElementById('userDataStatus');
  const showStatus = msg => { status.textContent = msg; if (msg) setTimeout(()=>status.textContent='', 2200); };

  document.getElementById('btnAddCompany').onclick = () => {
    document.getElementById('addCompanyModal').style.display = 'flex';
    document.getElementById('ac_parent').focus();
  };
  document.getElementById('ac_cancel').onclick = () => {
    document.getElementById('addCompanyModal').style.display = 'none';
  };
  document.getElementById('btnExportUserData').onclick = () => {
    UserData.export(); showStatus('Exported user_radio_data.json');
  };
  document.getElementById('inputImportUserData').onchange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    await UserData.import(f);
    showStatus('Imported user data');
    e.target.value = '';
  };

  document.getElementById('ac_save').onclick = () => {
    const P = ac_parent.value.trim(), C = ac_country.value.trim(),
          M = ac_market.value.trim(), S = ac_station.value.trim();
    const err = ac_error;
    if (!P || !M || !S){ err.textContent='Parent, Market, and Station are required.'; err.style.display='block'; return; }
    err.style.display='none';
    UserData.addEntry({ parent:P, country:C, market:M, station:S });
    addCompanyModal.style.display='none';
    showStatus('Saved custom company');
  };

  addCompanyModal.addEventListener('click', e => {
    if (e.target.id === 'addCompanyModal') addCompanyModal.style.display='none';
  });
})();
</script>
