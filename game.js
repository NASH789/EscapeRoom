// --- Utility: stable, deterministic codes from a shared seed ---
// No server needed: both players with the same seed will generate the same answers/codes.

function getSeed() {
  const url = new URL(location.href);
  return url.searchParams.get("g") || "";
}

function setSeed(seed) {
  const url = new URL(location.href);
  url.searchParams.set("g", seed);
  history.replaceState({}, "", url.toString());
}

// Tiny deterministic hash -> 6-char code
function codeFrom(seed, label) {
  const str = `${seed}::${label}`;
  let h = 2166136261; // FNV-ish
  for (let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // base32-ish output
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let x = (h >>> 0);
  for (let i=0;i<6;i++){
    out += alphabet[x % alphabet.length];
    x = Math.floor(x / alphabet.length);
  }
  return out;
}

// Local progress saved per seed + role
function key(role){ return `escape_${role}_${getSeed()}`; }

function loadState(role){
  try{ return JSON.parse(localStorage.getItem(key(role)) || "{}"); }
  catch{ return {}; }
}
function saveState(role, state){
  localStorage.setItem(key(role), JSON.stringify(state));
}

// Gate helper
function unlockSection(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("locked");
  el.querySelectorAll("input,button").forEach(x => x.disabled = false);
}

function lockSection(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("locked");
  el.querySelectorAll("input,button").forEach(x => x.disabled = true);
}

// Initialize locked sections
function initLocks(sectionIds, role){
  const state = loadState(role);
  sectionIds.forEach((id, idx) => {
    if (idx === 0 || state[id] === true) unlockSection(id);
    else lockSection(id);
  });
  return state;
}

function markUnlocked(role, id){
  const state = loadState(role);
  state[id] = true;
  saveState(role, state);
}

function requireSeedOrRedirect(){
  if (!getSeed()){
    // If someone opens player page without seed, push them to home
    location.href = "./";
  }
}

// Simple gate: check partner code
function gatePartnerCode({role, expectedLabel, inputId, nextSectionId, messageId}){
  const seed = getSeed();
  const expected = codeFrom(seed, expectedLabel);
  const input = document.getElementById(inputId);
  const msg = document.getElementById(messageId);

  const attempt = () => {
    const v = (input.value || "").trim().toUpperCase();
    if (v === expected){
      msg.textContent = "✅ Correct! Section unlocked.";
      unlockSection(nextSectionId);
      markUnlocked(role, nextSectionId);
    } else {
      msg.textContent = "❌ Not quite — ask your partner again 🙂";
    }
  };

  return { expected, attempt };
}
