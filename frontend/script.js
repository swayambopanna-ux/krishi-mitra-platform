/* ══════════════════════════════════════════════════════
   KRISHI MITRAAN – Dashboard Script
   Real APIs: OpenWeather · Gemini AI · HuggingFace · data.gov.in
   Smart Irrigation: Plant-specific, temperature-aware
   ══════════════════════════════════════════════════════ */

// ── Auto-detect backend URL ────────────────────────────
// When running locally (file:// or localhost) → use localhost:3000
// When hosted on Netlify/cloud → use Render cloud backend
const CLOUD_BACKEND_URL = 'https://krishi-mitra-backend.onrender.com';
const isLocalhost = (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.protocol === 'file:'
);

const CONFIG = {
  BACKEND_URL: isLocalhost ? 'http://localhost:3000' : CLOUD_BACKEND_URL,
  OPENWEATHER_KEY: 'YOUR_OPENWEATHER_API_KEY',
  GEMINI_KEY: 'YOUR_GEMINI_API_KEY',
  DATAGOV_KEY: '579b464db66ec23bdd000001cdd3084ea5c04b2ddadf9c48ca3bf00e',
};

let currentSection = 'home';
let sensorInterval = null;
let isRecording = false;
let speechRecognition = null;
let activePlant = 'tomato';

// ── i18n ───────────────────────────────────────────────
const I18N = {
  en: {
    moisture: 'Soil Moisture', temperature: 'Temperature', humidity: 'Humidity',
    pump_status: 'Pump Status', live: 'LIVE', tip_of_day: 'Tip of the Day',
    popular: 'Popular:', analyze: 'Analyze Image', reset: 'Reset',
    get_recommendation: 'Get Recommendation', analyze_soil: 'Analyze Soil',
    last_updated: 'Last Updated:', water_pump: 'Water Pump',
    voice_greeting: 'Namaste! I am Krishi Mitraan — ask me anything about farming!'
  },
  hi: {
    moisture: 'मृदा नमी', temperature: 'तापमान', humidity: 'आर्द्रता',
    pump_status: 'पंप स्थिति', live: 'लाइव', tip_of_day: 'आज की सलाह',
    popular: 'लोकप्रिय:', analyze: 'विश्लेषण', reset: 'रीसेट',
    get_recommendation: 'सिफारिश पाएं', last_updated: 'अंतिम अपडेट:',
    voice_greeting: 'नमस्ते! कृषि मित्रान यहाँ है — खेती के बारे में पूछें!'
  },
  kn: {
    moisture: 'ಮಣ್ಣಿನ ತೇವ', temperature: 'ತಾಪಮಾನ', humidity: 'ಆರ್ದ್ರತೆ',
    live: 'ನೇರ', voice_greeting: 'ನಮಸ್ಕಾರ! ಕೃಷಿ ಮಿತ್ರಾನ್‌ಗೆ ಸ್ವಾಗತ!'
  },
};
let currentLang = 'en';
function t(k) { return (I18N[currentLang] || {})[k] || I18N.en[k] || k; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
}

// ══════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSidebar();
  document.getElementById('langSelect').addEventListener('change', e => {
    currentLang = e.target.value; applyI18n();
  });
  setupDiseaseDetection();
  setupFertilizer();
  setupSoilHealth();
  setupWeather();
  setupVoiceAssistant();
  setupMandi();
  setupCropSearch();
  checkBackend();
  loadHomeSensor();
  setDailyTip();
  loadMandiDefault();
  loadPlantSelector();
});

// ══════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.section);
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    });
  });
}

function navigateTo(section) {
  if (currentSection === 'sensor-data' && section !== 'sensor-data') {
    clearInterval(sensorInterval); sensorInterval = null;
  }
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById(`section-${section}`);
  const nav = document.getElementById(`nav-${section}`);
  if (sec) sec.classList.add('active');
  if (nav) nav.classList.add('active');
  currentSection = section;
  updateTopbar(section);
  if (section === 'sensor-data') startSensorRefresh();
  if (section === 'irrigation') loadIrrigationAdvice();
  if (section === 'home') loadHomeSensor();
  if (section === 'mandi-prices') loadMandiDefault();
}

const TOPBAR = {
  home: ['Welcome Back, Farmer! 🌾', 'Farm overview'],
  'crop-advisory': ['Crop Advisory 🌱', 'Search crops for growing guidance'],
  'disease-detection': ['Disease Detection 🔬', 'AI-powered plant disease identification'],
  'sensor-data': ['Live Sensor Data 📡', 'Real-time IoT sensor readings'],
  irrigation: ['Smart Irrigation 💧', 'Plant-aware auto irrigation control'],
  fertilizer: ['Fertilizer Advice 🧪', 'NPK-based nutrient recommendations'],
  'soil-health': ['Soil Health 🌍', 'Comprehensive soil parameter analysis'],
  weather: ['Weather Forecast ⛅', 'Live weather for your location'],
  'voice-assistant': ['Voice Assistant 🎤', 'AI-powered farming advisor'],
  'mandi-prices': ['Mandi Prices 📊', 'Live market prices for commodities'],
};
function updateTopbar(s) {
  const [title, sub] = TOPBAR[s] || ['Dashboard', ''];
  document.querySelector('.topbar-title h1').textContent = title;
  document.getElementById('topbarSubtitle').textContent = sub;
}

// ══════════════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════════════
function setupSidebar() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
  });
  ['sidebarClose', 'sidebarOverlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    });
  });
}

// ══════════════════════════════════════════════════════
// BACKEND HEALTH
// ══════════════════════════════════════════════════════
async function checkBackend() {
  const dot = document.querySelector('.status-dot');
  const label = document.querySelector('.connection-status span:last-child');
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    label.textContent = r.ok ? 'Backend Online' : 'Backend Error';
    dot.className = 'status-dot online';
  } catch (e) {
    dot.className = 'status-dot offline';
    label.textContent = 'Backend Offline';
    console.warn('Backend reachability error:', e);
  }
}

// ══════════════════════════════════════════════════════
// DAILY TIP
// ══════════════════════════════════════════════════════
const TIPS = [
  'Irrigate in early morning to cut evaporation by 35%. Drip systems save 40–60% more water.',
  'Rotate crops every season to prevent nutrient depletion and break pest cycles.',
  'Apply mulch around plants to retain soil moisture and suppress weeds naturally.',
  'Test soil pH every 2 years — most crops thrive between 6.0 and 7.0.',
  'Intercrop legumes with cereals to fix nitrogen naturally and reduce fertilizer costs.',
  'Install pheromone traps to monitor pests early without chemical sprays.',
  'Compost kitchen and crop waste for free, nutrient-rich organic fertilizer.',
];
function setDailyTip() {
  const el = document.getElementById('dailyTip');
  if (el) el.textContent = TIPS[new Date().getDay()];
}

// ══════════════════════════════════════════════════════
// HOME SENSOR SNAPSHOT
// ══════════════════════════════════════════════════════
async function loadHomeSensor() {
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/sensor-data`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    const d = j.data;
    setEl('home-moisture', d.moisture != null ? `${d.moisture}%` : '--');
    setEl('home-temperature', d.temperature != null ? `${d.temperature}°C` : '--');
    setEl('home-humidity', d.humidity != null ? `${d.humidity}%` : '--');
    setEl('home-pump', d.pumpStatus || 'N/A');
  } catch { /* backend offline – silent fail, dashboard still loads */ }
}

// ══════════════════════════════════════════════════════
// LIVE SENSOR DATA
// ══════════════════════════════════════════════════════
function startSensorRefresh() {
  fetchSensor();
  sensorInterval = setInterval(fetchSensor, 5000);
}

async function fetchSensor() {
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/sensor-data`);
    const j = await r.json();
    const d = j.data;

    const hasMoisture = d.moisture != null;
    const hasTemp = d.temperature != null;
    const hasHumidity = d.humidity != null;

    setEl('sensor-moisture', hasMoisture ? `${d.moisture}%` : '--');
    setEl('sensor-temperature', hasTemp ? `${d.temperature}°C` : '--');
    setEl('sensor-humidity', hasHumidity ? `${d.humidity}%` : '--');
    setEl('sensor-pump', d.pumpStatus || 'N/A');
    setEl('sensor-timestamp', d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : 'Waiting...');

    // Progress bars
    if (hasMoisture) bar('moisture-bar', Math.min(d.moisture, 100));
    if (hasTemp) bar('temp-bar', Math.min((d.temperature / 60) * 100, 100));
    if (hasHumidity) bar('humidity-bar', Math.min(d.humidity, 100));

    // Simulator indicator
    const simBadge = document.querySelector('.live-badge');
    if (simBadge) {
      if (d.isSimulated) {
        simBadge.innerHTML = '<span class="live-dot" style="background:#f59e0b"></span><span>SIMULATOR</span>';
        simBadge.style.background = 'rgba(245,158,11,0.1)';
      } else {
        simBadge.innerHTML = '<span class="live-dot"></span><span>LIVE</span>';
        simBadge.style.background = 'rgba(22, 163, 74, 0.1)';
      }
    }

    // Pump dot
    const dot = document.getElementById('pump-dot');
    if (dot) {
      dot.className = 'pump-dot';
      if (d.pumpStatus === 'ON') dot.classList.add('on');
      if (d.pumpStatus === 'OFF') dot.classList.add('off');
    }
    // sync home
    setEl('home-moisture', hasMoisture ? `${d.moisture}%` : '--');
    setEl('home-temperature', hasTemp ? `${d.temperature}°C` : '--');
    setEl('home-humidity', hasHumidity ? `${d.humidity}%` : '--');
    setEl('home-pump', d.pumpStatus || 'N/A');

    // Show irrigation reason on sensor page
    const reasonEl = document.getElementById('sensor-irr-reason');
    if (reasonEl && d.irrigationReason) {
      reasonEl.textContent = d.irrigationReason;
      reasonEl.style.display = 'block';
    }
  } catch (e) {
    setEl('sensor-timestamp', '⚠️ Backend offline');
    ['sensor-moisture','sensor-temperature','sensor-humidity','sensor-pump'].forEach(id => setEl(id, '--'));
  }
}

// ══════════════════════════════════════════════════════
// PLANT SELECTOR (for irrigation section)
// ══════════════════════════════════════════════════════
async function loadPlantSelector() {
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/api/plants`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    if (!j.plants) return;

    // Build plant select dropdown in irrigation section
    const irrigationSection = document.getElementById('section-irrigation');
    if (!irrigationSection) return;

    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'plant-selector-wrap';
    selectorDiv.innerHTML = `
      <label class="plant-selector-label">
        <span class="material-icons-round">eco</span>
        Select Plant / Crop
      </label>
      <div class="plant-chips-scroll" id="plantChips">
        ${j.plants.map(p => `
          <button class="plant-chip ${p.key === activePlant ? 'active' : ''}"
                  data-key="${p.key}" onclick="selectPlant('${p.key}', this)">
            ${p.emoji} ${p.name}
          </button>`).join('')}
      </div>
      <div class="plant-info-bar" id="plantInfoBar"></div>
    `;

    // Insert before the irrigation content div
    irrigationSection.querySelector('.section-header').insertAdjacentElement('afterend', selectorDiv);
    updatePlantInfoBar(j.plants.find(p => p.key === activePlant));
  } catch { /* backend offline — plant selector simply won't render */ }
}

function updatePlantInfoBar(plant) {
  const bar = document.getElementById('plantInfoBar');
  if (!bar || !plant) return;
  bar.innerHTML = `
    <span>${plant.emoji} <b>${plant.name}</b></span>
    <span>💧 Moisture: <b>${plant.optimalMoisture}</b></span>
    <span>🌡️ Temp: <b>${plant.optimalTemp}</b></span>
    <span style="color:var(--text-muted);font-size:0.82rem">${plant.notes}</span>
  `;
}

async function selectPlant(key, btn) {
  activePlant = key;
  document.querySelectorAll('.plant-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/api/plants`);
    const j = await r.json();
    const plant = j.plants.find(p => p.key === key);
    updatePlantInfoBar(plant);

    await fetch(`${CONFIG.BACKEND_URL}/api/set-plant`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant: key })
    });
    loadIrrigationAdvice();
  } catch { loadIrrigationAdvice(); }
}

// ══════════════════════════════════════════════════════
// IRRIGATION ADVICE (real data from sensor + plant DB)
// ══════════════════════════════════════════════════════
async function loadIrrigationAdvice() {
  const container = document.getElementById('irrigationContent');
  if (!container) return;
  container.innerHTML = loadingHTML('Calculating plant-specific irrigation...');

  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/sensor-data`);
    const j = await r.json();
    const d = j.data;

    const hasSensor = d.moisture != null;
    const m = d.moisture;
    const t = d.temperature;
    const h = d.humidity;
    const pump = d.pumpStatus;
    const duration = d.pumpDurationSecs || 0;
    const urgency = d.urgency || 'none';
    const reason = d.irrigationReason || 'No sensor data available.';
    const plant = d.plantName || 'Tomato';
    const optM = d.optimalMoisture || '50–70%';
    const optT = d.optimalTemp || '21–27°C';
    const advice = d.irrigationAdvice || {};
    const tempMult = d.tempMultiplier;

    // Urgency → style class
    const urgencyMap = {
      none: 'optimal', low: 'optimal', medium: 'watering',
      high: 'dry', critical: 'dry'
    };
    const cls = urgencyMap[urgency] || '';

    const pumpLabel = pump === 'ON' ? '🟢 Pump is ON — Irrigating'
      : pump === 'OFF' ? '🔴 Pump is OFF'
        : '⚫ No Data';

    const durationLabel = duration > 0
      ? `Irrigation duration: <b>${duration} seconds</b>`
      : '';

    const tempInfluence = tempMult && tempMult !== 1
      ? `Temperature multiplier: <b>${tempMult}×</b> — hot weather increases water demand`
      : '';

    container.innerHTML = `
      <div class="irrigation-status-card ${cls}">
        <div class="irrigation-icon">
          <span class="material-icons-round" style="font-size:2.8rem">
            ${urgency === 'critical' ? 'local_fire_department'
        : urgency === 'high' ? 'warning'
          : pump === 'ON' ? 'water_drop'
            : 'check_circle'}
          </span>
        </div>
        <h3>${hasSensor ? pumpLabel : '⚫ No Sensor Data'}</h3>
        <p>${reason}</p>
        ${durationLabel ? `<p style="margin-top:0.6rem;font-size:0.9rem;color:var(--primary-light)">${durationLabel}</p>` : ''}
        ${tempInfluence ? `<p style="margin-top:0.4rem;font-size:0.85rem;color:var(--text-muted)">${tempInfluence}</p>` : ''}

        ${hasSensor ? `
        <div class="irr-stats-row">
          <div class="irr-stat">
            <span class="material-icons-round">water_drop</span>
            <b>${m}%</b><span>Moisture</span>
          </div>
          <div class="irr-stat">
            <span class="material-icons-round">thermostat</span>
            <b>${t}°C</b><span>Temperature</span>
          </div>
          <div class="irr-stat">
            <span class="material-icons-round">humidity_percentage</span>
            <b>${h}%</b><span>Humidity</span>
          </div>
        </div>

        <div style="margin-top:1rem;padding:0.8rem 1rem;background:rgba(255,255,255,0.03);border-radius:10px;font-size:0.85rem;color:var(--text-secondary)">
          <b style="color:var(--text)">Plant:</b> ${plant} &nbsp;|&nbsp;
          <b style="color:var(--text)">Optimal Moisture:</b> ${optM} &nbsp;|&nbsp;
          <b style="color:var(--text)">Optimal Temp:</b> ${optT}
          ${advice.notes ? `<br><span style="color:var(--text-muted)">${advice.notes}</span>` : ''}
        </div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.6rem">
          Last reading: ${d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : 'N/A'}
        </p>` : `
        <p style="margin-top:1rem;color:var(--text-muted);font-size:0.9rem">
          Connect your NodeMCU sensor to get live plant-specific irrigation decisions.
        </p>`}
      </div>

      <div class="irrigation-tips">
        <div class="irrigation-tip">
          <h4>⏰ Best Irrigation Time</h4>
          <p>Early morning (5–8 AM) reduces evaporation by 35%. Avoid afternoon watering.</p>
        </div>
        <div class="irrigation-tip">
          <h4>🌡️ Heat Stress Rule</h4>
          <p>For every 5°C above optimal, the system adds ~25% more irrigation time automatically.</p>
        </div>
        <div class="irrigation-tip">
          <h4>💧 Drip vs Flood</h4>
          <p>Drip irrigation saves 40–60% water. Ideal for tomato, chilli, onion, and potato.</p>
        </div>
        <div class="irrigation-tip">
          <h4>📡 IoT Auto-Control</h4>
          <p>The relay pump turns ON/OFF automatically. Server decides duration per plant type.</p>
        </div>
      </div>`;
  } catch (e) {
    container.innerHTML = offlineHTML('Smart Irrigation');
  }
}

// ══════════════════════════════════════════════════════
// CROP ADVISORY
// ══════════════════════════════════════════════════════
function setupCropSearch() {
  const btn = document.getElementById('cropSearchBtn');
  const input = document.getElementById('cropSearchInput');
  if (btn) {
    btn.addEventListener('click', () => searchCrop(input.value.trim()));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') searchCrop(input.value.trim()); });
  }
}

async function searchCrop(name) {
  if (!name) return;
  const out = document.getElementById('cropResult');
  out.innerHTML = loadingHTML('Fetching from Wikipedia API...');
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/api/crop-advisory/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const i = j.info;
    out.innerHTML = `
      <div class="result-card">
        <h3>🌿 ${i.title}</h3>
        ${i.image ? `<img src="${i.image}" alt="${i.title}" style="float:right;max-width:150px;border-radius:10px;margin:0 0 1rem 1.5rem">` : ''}
        <p>${i.summary}</p>
        <div style="clear:both;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
          <span style="font-size:0.78rem;color:var(--text-muted)">Source: Wikipedia API (real-time)</span>
        </div>
      </div>`;
  } catch (e) {
    out.innerHTML = offlineHTML('Crop Advisory');
  }
}

// ══════════════════════════════════════════════════════
// DISEASE DETECTION
// ══════════════════════════════════════════════════════
function setupDiseaseDetection() {
  const uploadArea = document.getElementById('uploadArea');
  const input = document.getElementById('imageInput');
  uploadArea.addEventListener('click', () => input.click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    const f = e.dataTransfer.files[0]; if (f) handleImage(f);
  });
  input.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleImage(f); });
  document.getElementById('detectBtn').addEventListener('click', runDetection);
  document.getElementById('resetUploadBtn').addEventListener('click', resetUpload);
}

function handleImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('previewImage');
    preview.src = e.target.result;
    preview.style.display = 'block';
    document.getElementById('uploadContent').style.display = 'none';
    document.getElementById('detectBtn').disabled = false;
    document.getElementById('resetUploadBtn').style.display = 'inline-flex';
    document.getElementById('detectionResult').innerHTML = '';
  };
  reader.readAsDataURL(file);
}

function resetUpload() {
  document.getElementById('previewImage').style.display = 'none';
  document.getElementById('uploadContent').style.display = 'block';
  document.getElementById('detectBtn').disabled = true;
  document.getElementById('resetUploadBtn').style.display = 'none';
  document.getElementById('imageInput').value = '';
  document.getElementById('detectionResult').innerHTML = '';
}

async function runDetection() {
  const file = document.getElementById('imageInput').files[0];
  if (!file) return;
  const out = document.getElementById('detectionResult');
  out.innerHTML = loadingHTML('Analyzing image locally using TensorFlow.js (No API Key Required)...');
  document.getElementById('detectBtn').disabled = true;

  try {
    // RUN LOCAL TFJS MOBILENET IN BROWSER
    const imgEl = document.getElementById('previewImage');
    const model = await mobilenet.load({version: 2, alpha: 1.0});
    const predictions = await model.classify(imgEl);

    // Grab the top identified element (e.g. "daisy", "pot", "leaf")
    const topLabel = predictions[0].className;
    const confidenceStr = (predictions[0].probability * 100).toFixed(2) + '%';
    
    out.innerHTML = loadingHTML(`Identified plant structure: <b>${topLabel}</b>. Fetching potential diseases and cures...`);
    
    // Now ask Pollinations for actual real-world diseases and cures for this specific plant context!
    let cureHTML = "Information unavailable.";
    try {
        const cp = await fetch(`https://text.pollinations.ai/${encodeURIComponent("You are an agricultural expert. A farmer uploaded an image classifying as: '" + topLabel + "'. Name ONE realistic disease this plant component might suffer from. Then provide a highly practical real-world cure (organic & chemical). Keep it short and impactful. Format: 'Disease: [Name] | Cure: [Text]'")}`, {signal: AbortSignal.timeout(8000)});
        cureHTML = await cp.text();
    } catch(e){}
    
    const predsHTML = predictions.map((p, i) => {
      const pct = (p.probability * 100).toFixed(2);
      return `<div class="prediction-item">
        <div class="pred-label">${i === 0 ? '🏆 ' : ''}${p.className}</div>
        <div class="pred-bar"><div class="pred-bar-fill" style="width:${pct}%"></div></div>
        <div class="pred-confidence">${pct}%</div>
      </div>`;
    }).join('');
    
    out.innerHTML = `
      <div class="result-card">
        <h3>🔬 AI On-Device Classification</h3>
        <p style="margin-bottom:1rem;color:var(--text-muted)">
          Identified subject: <b style="color:var(--primary-light)">${topLabel}</b>
          — ${confidenceStr} confidence
        </p>
        <div class="detection-results" style="margin-bottom:1.5rem">${predsHTML}</div>
        
        <div class="cure-card" style="background: rgba(34, 197, 94, 0.1); padding: 1.25rem; border-radius: 8px; border-left: 4px solid var(--primary-light); margin-top: 1rem;">
          <h4 style="color: var(--primary-light); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 6px;">
            <span class="material-icons-round" style="font-size: 1.2rem;">healing</span> Associated Disease & Cure
          </h4>
          <p style="color: #e2e8f0; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap;">${cureHTML}</p>
        </div>

        <p style="margin-top:1.5rem;font-size:0.75rem;color:var(--text-muted)">
          Powered by TensorFlow.js (Local, Free) & Pollinations AI (Treatments)
        </p>
      </div>`;
  } catch (e) {
    if(e.message.includes('HuggingFace requires a Free Access Token')) {
        out.innerHTML = `<div class="result-card" style="border-left: 4px solid var(--primary-light)">
      <h3>🔑 HuggingFace Token Required</h3>
      <p style="line-height:1.8;color:var(--text-secondary)">
        Disease Detection needs a free model token to process the image: <br>
        1. Go to <a href="https://huggingface.co/settings/tokens" target="_blank" style="color:var(--primary-light)">huggingface.co</a> and create a free account if you don't have one.<br>
        2. Create a "Read" Token from Settings.<br>
        3. Paste it as <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px">HF_API_TOKEN</code> in <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px">backend/server.js</code><br>
        4. Restart the node server!
      </p>
    </div>`;
    } else {
        out.innerHTML = errorHTML('Detection failed: ' + e.message);
    }
  } finally {
    document.getElementById('detectBtn').disabled = false;
  }
}

// ══════════════════════════════════════════════════════
// FERTILIZER
// ══════════════════════════════════════════════════════
function setupFertilizer() {
  document.getElementById('fertBtn').addEventListener('click', async () => {
    const crop = document.getElementById('fertCrop').value.trim() || 'General';
    const n = document.getElementById('fertN').value;
    const p = document.getElementById('fertP').value;
    const k = document.getElementById('fertK').value;
    const out = document.getElementById('fertResult');
    if (!n || !p || !k) { out.innerHTML = errorHTML('Enter N, P, and K values.'); return; }
    out.innerHTML = loadingHTML('Calculating ICAR recommendations...');
    try {
      const r = await fetch(`${CONFIG.BACKEND_URL}/api/fertilizer-advice?crop=${encodeURIComponent(crop)}&nitrogen=${n}&phosphorus=${p}&potassium=${k}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const icons = { Low: '🔴', Optimal: '🟢', High: '🟡' };
      const items = j.recommendations.map(r => `
        <div class="npk-item">
          <div class="npk-status status-${r.status.toLowerCase()}">${icons[r.status] || '⚪'}</div>
          <div class="npk-info">
            <h4>${r.nutrient} — <span class="status-${r.status.toLowerCase()}">${r.status}</span></h4>
            <p>${r.advice}</p>
          </div>
        </div>`).join('');
      out.innerHTML = `
        <div class="result-card">
          <h3>🧪 Fertilizer Advice for ${j.crop}</h3>
          <p style="margin-bottom:1rem;color:var(--text-muted)">
            Soil — N:<b>${j.soilNPK.nitrogen}</b> P:<b>${j.soilNPK.phosphorus}</b> K:<b>${j.soilNPK.potassium}</b> kg/ha
          </p>
          <div class="npk-results">${items}</div>
          <p style="margin-top:1rem;font-size:0.78rem;color:var(--text-muted)">
            Based on ICAR fertilizer recommendations for Indian agriculture
          </p>
        </div>`;
    } catch (e) { out.innerHTML = offlineHTML('Fertilizer Advice'); }
  });
}

// ══════════════════════════════════════════════════════
// SOIL HEALTH
// ══════════════════════════════════════════════════════
function setupSoilHealth() {
  document.getElementById('soilBtn').addEventListener('click', async () => {
    const ph = document.getElementById('soilPH').value;
    const om = document.getElementById('soilOM').value;
    const mo = document.getElementById('soilMoisture').value;
    const out = document.getElementById('soilResult');
    if (!ph || !om || !mo) { out.innerHTML = errorHTML('Enter pH, Organic Matter, and Moisture.'); return; }
    out.innerHTML = loadingHTML('Analyzing soil health parameters...');
    try {
      const r = await fetch(`${CONFIG.BACKEND_URL}/api/soil-health?ph=${ph}&organic_matter=${om}&moisture=${mo}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const gradeClr = { Excellent: '#4ade80', Good: '#22c55e', Fair: '#fbbf24', Poor: '#f87171' };
      const sicons = { Good: '✅', Medium: '🟡', Low: '🔴', Acidic: '🔴', Alkaline: '🟣', Dry: '🟡', Wet: '🔵' };
      const items = j.analysis.map(a => `
        <div class="soil-item">
          <div class="soil-status status-${a.status.toLowerCase()}">${sicons[a.status] || '⚪'}</div>
          <div class="soil-info">
            <h4>${a.parameter} — <b>${a.value}</b>
              <span class="status-${a.status.toLowerCase()}">(${a.status})</span>
            </h4>
            <p>${a.advice}</p>
          </div>
        </div>`).join('');
      out.innerHTML = `
        <div class="soil-score-card">
          <div class="soil-score" style="color:${gradeClr[j.grade]}">${j.overallScore}/100</div>
          <div class="soil-grade grade-${j.grade.toLowerCase()}">${j.grade} Soil Health</div>
        </div>
        <div class="soil-results">${items}</div>`;
    } catch (e) { out.innerHTML = offlineHTML('Soil Health Analysis'); }
  });
}

// ══════════════════════════════════════════════════════
// WEATHER — Real OpenWeather API
// ══════════════════════════════════════════════════════
function setupWeather() {
  const btn = document.getElementById('weatherSearchBtn');
  const input = document.getElementById('weatherCityInput');
  btn.addEventListener('click', () => fetchWeather(input.value.trim()));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') fetchWeather(input.value.trim()); });
}

const WICONS = {
  Clear: '☀️', Clouds: '⛅', Rain: '🌧️', Drizzle: '🌦️',
  Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Haze: '🌁', Fog: '🌫️'
};

async function fetchWeather(city) {
  const out = document.getElementById('weatherResult');
  if (!city) { out.innerHTML = errorHTML('Enter a city name.'); return; }
  out.innerHTML = loadingHTML('Fetching live weather data...');

  try {
    // 1. Get Lat/Lon from City Name (Free Geocoding)
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error('Geocoding API error');
    const geoData = await geoRes.json();
    if (!geoData.results || !geoData.results.length) throw new Error(`City "${city}" not found`);
    const loc = geoData.results[0];

    // 2. Get Weather (Free Open-Meteo)
    const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&hourly=relativehumidity_2m,surface_pressure,visibility`);
    if (!wxRes.ok) throw new Error('Weather API error');
    const wxData = await wxRes.json();

    const cw = wxData.current_weather;
    const wcode = cw.weathercode;

    // Convert WMO Weather Code to icon/text
    let icon = '🌤️', desc = 'Clear';
    if (wcode <= 1) { icon = '☀️'; desc = 'Clear'; }
    else if (wcode <= 3) { icon = '⛅'; desc = 'Partly Cloudy'; }
    else if (wcode <= 49) { icon = '🌫️'; desc = 'Fog'; }
    else if (wcode <= 59) { icon = '🌦️'; desc = 'Drizzle'; }
    else if (wcode <= 69) { icon = '🌧️'; desc = 'Rain'; }
    else if (wcode <= 79) { icon = '❄️'; desc = 'Snow'; }
    else if (wcode <= 99) { icon = '⛈️'; desc = 'Thunderstorm'; }

    out.innerHTML = `
      <div class="weather-card">
        <div class="weather-city">📍 ${loc.name}, ${loc.country || ''}</div>
        <div class="weather-desc">${icon} ${desc}</div>
        <div class="weather-temp">${Math.round(cw.temperature)}°C</div>
        <div class="weather-details">
          <div class="weather-detail">
            <div class="material-icons-round">air</div>
            <div class="wd-value">${cw.windspeed} km/h</div>
            <div class="wd-label">Wind</div>
          </div>
          <div class="weather-detail">
            <div class="material-icons-round">explore</div>
            <div class="wd-value">${cw.winddirection}°</div>
            <div class="wd-label">Direction</div>
          </div>
          <div class="weather-detail">
            <div class="material-icons-round">location_on</div>
            <div class="wd-value">${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}</div>
            <div class="wd-label">Coordinates</div>
          </div>
        </div>
        <p style="margin-top:1.5rem;font-size:0.78rem;color:var(--text-muted)">
          Updated: ${new Date(cw.time).toLocaleTimeString()} · Source: Open-Meteo (live, no API key needed)
        </p>
      </div>`;
  } catch (e) { out.innerHTML = errorHTML(e.message); }
}

// ══════════════════════════════════════════════════════
// VOICE ASSISTANT — Gemini AI + Web Speech
// ══════════════════════════════════════════════════════
function setupVoiceAssistant() {
  document.getElementById('voiceSendBtn').addEventListener('click', sendMessage);
  document.getElementById('voiceTextInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('voiceMicBtn').addEventListener('click', toggleMic);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    speechRecognition = new SR();
    speechRecognition.lang = 'en-IN';
    speechRecognition.onresult = e => {
      document.getElementById('voiceTextInput').value = e.results[0][0].transcript;
      stopMic(); setTimeout(sendMessage, 300);
    };
    speechRecognition.onerror = stopMic;
    speechRecognition.onend = stopMic;
  }
}

function toggleMic() {
  if (isRecording) { stopMic(); return; }
  if (!speechRecognition) {
    addChat('bot', '⚠️ Speech recognition not supported. Please type your question.'); return;
  }
  isRecording = true;
  const btn = document.getElementById('voiceMicBtn');
  btn.classList.add('recording');
  btn.querySelector('.material-icons-round').textContent = 'mic_off';
  speechRecognition.start();
}
function stopMic() {
  isRecording = false;
  const btn = document.getElementById('voiceMicBtn');
  btn.classList.remove('recording');
  btn.querySelector('.material-icons-round').textContent = 'mic';
  try { speechRecognition?.stop(); } catch { }
}

async function sendMessage() {
  const input = document.getElementById('voiceTextInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addChat('user', text);
  const tid = 'typing-' + Date.now();
  addChat('bot', '<em>Thinking...</em>', tid);

  let reply = '';
  try {
    const r = await fetch(`https://text.pollinations.ai/${encodeURIComponent("You are Krishi Mitraan, an expert AI assistant for Indian farmers. Answer concisely (2-4 sentences). Focus on practical Indian agriculture advice. Question: " + text)}`);
    reply = await r.text();
  } catch (e) {
    reply = localFallback(text);
  }

  document.getElementById(tid)?.closest('.chat-message')?.remove();
  addChat('bot', reply.replace(/\n/g, '<br>'));
  speak(reply);
}



function localFallback(q) {
  q = q.toLowerCase();
  if (q.includes('rice') || q.includes('paddy'))
    return 'Rice is India\'s main Kharif crop needing 20-30°C and 100-150cm rainfall. Sow June-July, harvest November-December. Apply urea in 3 split doses. Maintain 5-10cm standing water during growth.';
  if (q.includes('wheat'))
    return 'Wheat is the main Rabi crop — sow October-December in loamy soil. Needs 10-25°C. Irrigate at tillering, jointing, heading, and grain-fill stages. Apply DAP at sowing and urea in 2 splits.';
  if (q.includes('tomato'))
    return 'Tomatoes need 20-30°C and consistent soil moisture (50-70%). Transplant at 45×60cm spacing. Watch for early/late blight — spray Mancozeb at first sign. Drip irrigation recommended.';
  if (q.includes('irrigat') || q.includes('water'))
    return 'Irrigate early morning (5-8 AM) to reduce evaporation by 35%. The IoT sensor + relay system auto-controls the pump based on soil moisture and plant type. Set your crop in the Irrigation section.';
  if (q.includes('fertilizer') || q.includes('npk'))
    return 'Use the Fertilizer Advice section to get exact NPK recommendations. Generally: DAP at sowing, urea in 3 splits for nitrogen. Test soil pH (6-7 ideal) before applying any fertilizer.';
  if (q.includes('disease') || q.includes('pest'))
    return 'Use Disease Detection to analyze leaf photos with AI. For pests, use IPM: pheromone traps, neem spray, and bio-agents like Trichoderma. Scout fields weekly for early detection.';
  if (q.includes('mandi') || q.includes('price'))
    return 'Check the Mandi Prices section for live crop prices from data.gov.in (Agmarknet). Compare Min/Modal/Max prices across markets before selling your produce.';
  return `Good question about "${q}". Use our Crop Advisory, Disease Detection, or Weather sections for specific guidance. For local support, contact your nearest KVK (Krishi Vigyan Kendra).`;
}

function addChat(role, text, id) {
  const chat = document.getElementById('voiceChat');
  const div = document.createElement('div');
  div.className = `chat-message ${role === 'user' ? 'user-message' : 'bot-message'}`;
  if (id) div.id = id;
  div.innerHTML = `
    <div class="chat-avatar">${role === 'user' ? '👨‍🌾' : '🌾'}</div>
    <div class="chat-bubble"><p>${text}</p></div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#<>]/g, ''));
  u.lang = 'en-IN'; u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// ══════════════════════════════════════════════════════
// MANDI PRICES — data.gov.in real API
// ══════════════════════════════════════════════════════
function setupMandi() {
  document.getElementById('mandiSearchBtn').addEventListener('click', () => {
    const q = document.getElementById('mandiSearchInput').value.trim();
    if (q) fetchMandi(q);
  });
  document.getElementById('mandiSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = document.getElementById('mandiSearchInput').value.trim();
      if (q) fetchMandi(q);
    }
  });
}

function loadMandiDefault() { fetchMandi('Wheat'); }

async function fetchMandi(commodity) {
  const out = document.getElementById('mandiResult');
  out.innerHTML = loadingHTML(`Fetching ${commodity} prices from data.gov.in (Agmarknet)...`);
  try {
    const r = await fetch(`${CONFIG.BACKEND_URL}/api/mandi?commodity=${encodeURIComponent(commodity)}`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.status === 'error') throw new Error(j.error || ('API error ' + r.status));
    const rec = j.records || [];
    if (!rec.length) {
      out.innerHTML = `<div class="result-card">
        <h3>No Results for "${commodity}"</h3>
        <p style="color:var(--text-secondary)">
          Try: Wheat, Rice, Onion, Potato, Tomato, Cotton, Soybean, Maize
        </p>
      </div>`; return;
    }
    const cards = rec.map(r => `
      <div class="mandi-card">
        <div class="mandi-header">
          <div class="mandi-commodity">🌾 ${r.commodity}</div>
          <div class="mandi-state">${r.state}</div>
        </div>
        <div class="mandi-prices">
          <div class="mandi-price mp-min">
            <div class="mp-value">₹${r.min_price}</div><div class="mp-label">Min</div>
          </div>
          <div class="mandi-price mp-modal">
            <div class="mp-value">₹${r.modal_price}</div><div class="mp-label">Modal</div>
          </div>
          <div class="mandi-price mp-max">
            <div class="mp-value">₹${r.max_price}</div><div class="mp-label">Max</div>
          </div>
        </div>
        <div class="mandi-market">
          <span class="material-icons-round" style="font-size:0.9rem">storefront</span>
          ${r.market} · ${r.district}
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.3rem">
          📅 ${r.arrival_date} · Variety: ${r.variety || 'N/A'} · per Quintal
        </div>
      </div>`).join('');
    out.innerHTML = `
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.75rem">
        ${rec.length} records for <b style="color:var(--text)">${commodity}</b> · Source: Agmarknet / data.gov.in (live)
      </p>
      <div class="mandi-grid">${cards}</div>`;
  } catch (e) {
    out.innerHTML = offlineHTML('Mandi Prices');
  }
}

// ══════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function bar(id, pct) { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; }
function loadingHTML(msg = 'Loading...') {
  return `<div class="loading"><div class="spinner"></div><div class="loading-text">${msg}</div></div>`;
}
function errorHTML(msg) {
  return `<div class="error-message">
    <span class="material-icons-round">error_outline</span><span>${msg}</span>
  </div>`;
}
function offlineHTML(feature = 'This feature') {
  return `<div class="offline-banner">
    <span class="material-icons-round" style="font-size:2.5rem;color:var(--text-muted)">cloud_off</span>
    <h3 style="margin:0.6rem 0 0.3rem">Backend Offline</h3>
    <p style="color:var(--text-muted);font-size:0.92rem">
      ${feature} requires the backend server.<br>
      Run <code style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:5px">npm start</code> inside the <b>backend</b> folder to enable live data.
    </p>
  </div>`;
}
function isOfflineError(e) {
  return e instanceof TypeError && (e.message.includes('fetch') || e.message.includes('Failed') || e.message.includes('NetworkError') || e.message.includes('ECONNREFUSED'));
}
