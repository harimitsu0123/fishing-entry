/**
 * BORIJIN Fishing Entry System
 * Version: v8.10.0 (GitHub Synchronized)
 * Last Updated: 2026-05-15
 */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbykDT-XvGhrZCQcCp_gCxZAToW3X4s_g_BPX7LBO4E-A84vUY0VE3nlqehITFOfp9f9/exec";

let state = {
    entries: [],
    deletedIds: [], // v7.9.3: Tracking local hard-deletions
    changeLog: [], // v8.6.0: Announcement-style change log
    settings: {
        competitionName: "BORIJIN FESTIVAL in 豌ｴ螳・2026",
        capacityGeneral: 100,
        capacityMintsuri: 100,
        capacitySuiho: 50,
        capacityHarimitsu: 50,
        capacityObservers: 100,
        startTime: "",
        deadline: "",
        capacityTotal: 250,
        adminPassword: "admin",
        // v7.9.3: Pre-populated Ikesu List (36 ponds)
        ikesuList: [
            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `蟆・{i+1}`, capacity: 6 })),
            { id: 'small-7', name: '蟆・', capacity: 6 },
            { id: 'small-7n', name: '蟆・蛹・, capacity: 6 },
            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `蟆・{i+8}`, capacity: 6 })),
            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `荳ｭ${i+1}`, capacity: 8 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `螟ｧ${i+1}`, capacity: 12 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `縺ｧ縺｣縺ｱ繧・{i+1}`, capacity: 12 })),
            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `蜊・{i+1}`, capacity: 12 }))
        ]
    },
    lastUpdated: 0 // Unix timestamp for sync merging
};

let isAdminAuth = localStorage.getItem('isAdminAuth') === 'true'; // Persistent across sessions (localStorage)
let currentViewId = sessionStorage.getItem('currentViewId') || 'registration-view'; // Persistent view
let currentAdminTab = sessionStorage.getItem('currentAdminTab') || 'tab-list'; // Persistent tab
let dashboardFilter = 'all';
let currentSortField = 'time';
let currentSortOrder = 'desc'; // v8.9.80: Reverted to newest first per user request
let currentReceptionId = null;
let isAdminAuthAction = false; // Flag for admin-led edits
let activeReceptionEntryId = null; // Currently selected in reception desk

// v8.9.6: Restore global error tracker for debugging
window.onerror = function(msg, url, line, col, error) {
    console.error("Global Error Caught:", {msg, url, line, col, error});
    if (typeof showToast === 'function') {
        showToast("繧ｨ繝ｩ繝ｼ: " + msg, "error");
    } else {
        alert("繧ｷ繧ｹ繝・Β繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + msg + " (" + line + ":" + col + ")");
    }
    return false;
};

let pendingView = null; // v8.1.10: Global scoped to avoid ReferenceError

/**
 * v8.2.12: Unified Bypass Authorization Helper (Promoted to Top)
 */
function isBypassAllowed() {
    const editId = document.getElementById('edit-entry-id')?.value || '';
    return isAdminAuth || isAdminAuthAction || !!editId || currentViewId.includes('coordinator-view');
}

/**
 * v8.2.12: Core Global Handlers (Promoted to Top)
 */
window.showConfirmation = function() {
    console.log("BORIJIN: showConfirmation started");
    const editId = document.getElementById('edit-entry-id')?.value || '';
    const isAdmin = isBypassAllowed();
    
    // v8.2.10: Force clear timeframe overlay
    const overlay = document.getElementById('timeframe-overlay');
    if (overlay) overlay.classList.add('hidden');

    const pRows = document.querySelectorAll('.participant-row');
    const participants = Array.from(pRows).map(row => {
        const getVal = (cls) => row.querySelector(cls)?.value || '';
        return {
            type: getVal('.p-type'),
            name: getVal('.p-name'),
            nickname: getVal('.p-nick'),
            region: getVal('.p-region'),
            age: getVal('.p-age'),
            gender: getVal('.p-gender'),
            tshirtSize: getVal('.p-tshirt')
        };
    });

    if (participants.length === 0) {
        showStatus("蜿ょ刈閠・ｒ1蜷堺ｻ･荳顔匳骭ｲ縺励※縺上□縺輔＞縲・, "error");
        return;
    }

    const groupName = document.getElementById('group-name').value;
    const repName = document.getElementById('representative-name').value;
    const repPhone = document.getElementById('rep-phone').value;
    const repEmail = document.getElementById('rep-email').value;
    const repEmailConfirm = document.getElementById('rep-email-confirm').value;
    const memo = document.getElementById('entry-memo')?.value || '';

    if (repEmail !== repEmailConfirm) {
        showStatus("繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺御ｸ閾ｴ縺励∪縺帙ｓ縲ゅｂ縺・ｸ蠎ｦ縺皮｢ｺ隱阪￥縺縺輔＞縲・, "error");
        return;
    }

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
    const source = sourceEl ? sourceEl.value : '荳闊ｬ';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;

    // v8.2.27: Capacity check in confirmation disabled per user request
    if (false) {
        const currentCategoryFishers = state.entries
            .filter(en => en.id !== editId && en.source === source && en.status !== 'cancelled')
            .reduce((sum, en) => sum + en.fishers, 0);

        let capacityLimit = 0;
        if (source === '荳闊ｬ') capacityLimit = state.settings.capacityGeneral;
        else if (source === '縺ｿ繧馴・繧・) capacityLimit = state.settings.capacityMintsuri;
        else if (source === '豌ｴ螳・) capacityLimit = state.settings.capacitySuiho;
        else if (source === '繝上Μ繝溘ヤ') capacityLimit = state.settings.capacityHarimitsu;

        if (currentCategoryFishers + fisherCount > capacityLimit) {
            showStatus(`螟ｧ螟臥筏縺苓ｨｳ縺ゅｊ縺ｾ縺帙ｓ縲ゅ％縺ｮ譫・・{source}・峨・螳壼藤縺ｫ驕斐＠縺溘◆繧√∫樟蝨ｨ蜿嶺ｻ倥ｒ蛛懈ｭ｢縺励※縺翫ｊ縺ｾ縺吶Ａ, "error");
            return;
        }
    }

    document.getElementById('conf-source').textContent = source;
    document.getElementById('conf-group').textContent = groupName;
    document.getElementById('conf-rep-name').textContent = repName;
    document.getElementById('conf-rep-phone').textContent = repPhone;
    document.getElementById('conf-rep-email').textContent = repEmail;
    if (document.getElementById('conf-memo')) {
        document.getElementById('conf-memo').textContent = memo;
    }

    const summaryList = document.getElementById('conf-participant-summary');
    summaryList.innerHTML = '';
    participants.forEach((p, idx) => {
        const li = document.createElement('li');
        li.style.padding = "0.5rem";
        li.style.borderBottom = "1px solid #eee";
        
        const typeLabel = p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ';
        const genderLabel = genderLabels[p.gender] || p.gender;
        const ageLabel = ageLabels[p.age] || p.age;
        const regionLabel = p.region ? `${p.region} / ` : '';
        const nicknameLabel = p.nickname ? `(${p.nickname})` : '';
        const detailText = `縲・{genderLabel} / ${regionLabel}${ageLabel} / ${p.tshirtSize}繧ｵ繧､繧ｺ縲疏;
        
        li.innerHTML = `
            <strong>${idx + 1}. ${p.name}</strong> ${nicknameLabel} <br>
            <span style="font-size: 0.85rem; color: #666;">${detailText} - <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-mintsuri'}" style="font-size: 0.7rem;">${typeLabel}</span></span>
        `;
        summaryList.appendChild(li);
    });

    document.getElementById('registration-form').classList.add('hidden');
    document.getElementById('confirmation-section').classList.remove('hidden');
    document.getElementById('app-title').textContent = "逋ｻ骭ｲ蜀・ｮｹ縺ｮ遒ｺ隱・;
    window.scrollTo(0, 0);
}

window.handleRegistration = async function() {
    console.log("BORIJIN: handleRegistration started (v8.9.34)");
    const submitBtn = document.getElementById('submit-registration');
    if (!submitBtn) return;
    
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "騾∽ｿ｡荳ｭ... 縺昴・縺ｾ縺ｾ縺雁ｾ・■縺上□縺輔＞";

    try {
        const editId = document.getElementById('edit-entry-id')?.value || '';
        const pRows = document.querySelectorAll('.participant-row');
        const participants = Array.from(pRows).map(row => {
            const getVal = (cls) => row.querySelector(cls)?.value || '';
            return {
                type: getVal('.p-type'),
                name: getVal('.p-name'),
                nickname: getVal('.p-nick'),
                region: getVal('.p-region'),
                age: getVal('.p-age'),
                gender: getVal('.p-gender'),
                tshirtSize: getVal('.p-tshirt')
            };
        });

        const sourceEl = document.querySelector('input[name="reg-source"]:checked');
        const source = sourceEl ? sourceEl.value : '荳闊ｬ';
        const fisherCount = participants.filter(p => p.type === 'fisher').length;
        const observerCount = participants.filter(p => p.type === 'observer').length;

        const existingEntry = editId ? state.entries.find(en => en.id === editId) : null;
        const finalParticipants = participants.map((p, idx) => {
            const oldP = existingEntry && existingEntry.participants[idx];
            if (oldP && oldP.name === p.name) {
                return { ...p, ikesuId: oldP.ikesuId || null, isLeader: oldP.isLeader || false, status: oldP.status || 'pending' };
            }
            return { ...p, ikesuId: null, isLeader: false, status: 'pending' };
        });

        const entryData = {
            id: editId || null,
            groupName: document.getElementById('group-name').value,
            representative: document.getElementById('representative-name').value,
            representativeName: document.getElementById('representative-name').value,
            phone: document.getElementById('rep-phone').value,
            email: document.getElementById('rep-email').value,
            repPhone: document.getElementById('rep-phone').value,
            repEmail: document.getElementById('rep-email').value,
            password: document.getElementById('edit-password').value,
            memo: document.getElementById('entry-memo')?.value || '',
            source: source,
            fishers: fisherCount,
            observers: observerCount,
            participants: finalParticipants,
            status: existingEntry ? existingEntry.status : 'pending',
            timestamp: existingEntry ? existingEntry.timestamp : new Date().toLocaleString('ja-JP'),
            lastUpdated: new Date().toLocaleString('ja-JP'),
            lastModified: new Date().toLocaleString('ja-JP'),
            _ts: Date.now()
        };

        // v8.9.41: Pre-submission capacity check
        if (!editId && !isAdminAuth && !isAdminAuthAction) {
            const currentFishers = sumCategoryFishers(source);
            const totalNow = state.entries.filter(e => e.status !== 'cancelled').reduce((sum, en) => sum + en.fishers, 0);
            
            let catLimit = 0;
            if (source === '荳闊ｬ') catLimit = state.settings.capacityGeneral;
            else if (source === '縺ｿ繧馴・繧・) catLimit = state.settings.capacityMintsuri;
            else if (source === '豌ｴ螳・) catLimit = state.settings.capacitySuiho;
            else if (source === '繝上Μ繝溘ヤ') catLimit = state.settings.capacityHarimitsu;

            if (state.settings.capacityTotal && totalNow + fisherCount > state.settings.capacityTotal) {
                alert(`螟ｧ莨壹・蜈ｨ菴灘ｮ壼藤・・{state.settings.capacityTotal}蜷搾ｼ峨↓驕斐＠縺溘◆繧√∫匳骭ｲ縺ｧ縺阪∪縺帙ｓ縲Ａ);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            if (catLimit > 0 && currentFishers + fisherCount > catLimit) {
                alert(`${source}縺ｮ螳壼藤・・{catLimit}蜷搾ｼ峨↓驕斐＠縺溘◆繧√∫匳骭ｲ縺ｧ縺阪∪縺帙ｓ縲Ａ);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
        }

        // v8.9.8: Bulletproof submission with transactionId and fallback
        const transactionId = editId ? null : (Date.now().toString() + Math.random().toString(36).substr(2, 5));
        if (!editId) entryData.transactionId = transactionId;

        let result = null;
        try {
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: editId ? 'edit' : 'register', entry: entryData })
            });
            result = await response.json();
        } catch (fetchErr) {
            console.warn("CORS fetch failed, attempting no-cors fallback...", fetchErr);
            // Fallback for Safari / strict browsers
            await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: editId ? 'edit' : 'register', entry: entryData })
            });
            // We can't read the response in no-cors, so we fake a success with a temporary ID
            result = { id: editId || ("PENDING-" + Date.now().toString().slice(-4)) };
        }

        if (result && result.status === 'error') {
            throw new Error(result.message || "繧ｵ繝ｼ繝舌・繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆");
        }

        console.log("BORIJIN: Server response received:", result);
        let serverId = null;
        if (result) {
            if (result.entry && typeof result.entry === 'object' && result.entry.id) serverId = result.entry.id;
            else if (result.id) serverId = result.id;
            else if (result.entry && typeof result.entry === 'string') serverId = result.entry;
            else if (result.entry && typeof result.entry === 'object' && result.entry.entry_id) serverId = result.entry.entry_id;
        }

        if (serverId) {
            entryData.id = serverId;
            console.log("BORIJIN: Successfully extracted ID:", serverId);
        }

        // v8.9.37: Apply formatting/fallback BEFORE pushing to state to ensure consistency
        if (entryData.id) {
            entryData.id = entryData.id.replace(/(\d+)$/, (m) => m.padStart(3, '0'));
        } else if (!editId) {
            const prefixMap = { '荳闊ｬ': 'A', '縺ｿ繧馴・繧・: 'M', '豌ｴ螳・: 'S', '繝上Μ繝溘ヤ': 'H' };
            const prefix = prefixMap[source] || 'A';
            
            // v8.9.37: Sequential fallback starting from 901
            const existing9xx = state.entries
                .filter(en => en.id && en.id.startsWith(`${prefix}-9`))
                .map(en => {
                    const parts = en.id.split('-');
                    return parts.length > 1 ? parseInt(parts[1], 10) : null;
                })
                .filter(n => n !== null && !isNaN(n) && n >= 900);
            
            const nextNum = existing9xx.length > 0 ? Math.max(...existing9xx) + 1 : 901;
            entryData.id = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
            console.warn("BORIJIN: ID missing from result, using sequential fallback:", entryData.id);
        }

        // Optimistic UI update: Update local entries immediately
        if (editId) {
            const idx = state.entries.findIndex(en => en.id === editId);
            if (idx !== -1) {
                state.entries[idx] = { ...state.entries[idx], ...entryData };
            }
        } else if (entryData.id) {
            // Check for duplicates before pushing
            const isDup = state.entries.some(en => en.id === entryData.id);
            if (!isDup) {
                state.entries.push(entryData);
            }
        }
        
        saveData(); // Sync to local and trigger save process
        
        // v8.9.37: Force UI update for admin views
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof updateReceptionList === 'function') updateReceptionList();

        const entryType = editId ? '菫ｮ豁｣' : '譁ｰ隕冗匳骭ｲ';
        if (typeof logChange === 'function') logChange(entryData, entryType, existingEntry);
        
        showToast(editId ? "菫ｮ豁｣繧帝∽ｿ｡縺励∪縺励◆" : "逋ｻ骭ｲ螳御ｺ・＠縺ｾ縺励◆", "success");
        
        console.log("BORIJIN: Showing result screen for ID:", entryData.id);
        showResult(entryData);
        
        // Refresh data from server in background after a safe delay
        setTimeout(() => loadData(), 10000);

    } catch (error) {
        console.error('Registration error:', error);
        alert('繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ょ・蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・n' + error.toString());
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
};

// v8.6.5: Redundant event listener binding
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('submit-registration');
    if (btn) {
        btn.addEventListener('click', window.handleRegistration);
    }
});

window.finalizeAdminEdit = async function() {
    await window.handleRegistration();
}

// Age labels map - v4.8 Updated
const ageLabels = {
    "unknown": "・・,
    "elementary": "蟆丞ｭｦ逕滉ｻ･荳・,
    "middle_high": "荳ｭ繝ｻ鬮俶｡逕・,
    "19_20s": "19豁ｳ縲・0莉｣",
    "30s": "30莉｣", "40s": "40莉｣", "50s": "50莉｣",
    "60s": "60莉｣", "70s": "70莉｣", "80s": "80豁ｳ莉･荳・
};

const genderLabels = {
    "unknown": "・・,
    "male": "逕ｷ諤ｧ",
    "female": "螂ｳ諤ｧ",
    "other": "縺昴・莉・
};

const tshirtSizes = ['・・, '140', '150', 'S', 'M', 'L', 'XL・・L・・, '2XL・・L・・, '3XL・・L・・, '4XL・・L・・];

/**
 * v8.9.80: Robust T-shirt size normalization
 * Handles full-width/half-width, variants (LL/XL), and whitespace
 */
function normalizeTshirtSize(size) {
    if (!size) return '・・;
    
    // 1. Basic normalization: Full-width to Half-width for alphanumeric and common parens
    let n = size.toString()
        .replace(/[・｡-・ｺ・・・夲ｼ・・兢/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[・・/g, '(')
        .replace(/[・云/g, ')')
        .toUpperCase()
        .trim();
    
    // 2. Explicit variant mapping to canonical labels used in tshirtSizes
    const mapping = {
        'LL': 'XL・・L・・, '2L': 'XL・・L・・, 'XL': 'XL・・L・・, 'O': 'XL・・L・・, 'XL(2L)': 'XL・・L・・,
        '3L': '2XL・・L・・, '2XL': '2XL・・L・・, 'XO': '2XL・・L・・, '2XL(3L)': '2XL・・L・・,
        '4L': '3XL・・L・・, '3XL': '3XL・・L・・, '2XO': '3XL・・L・・, '3XL(4L)': '3XL・・L・・,
        '5L': '4XL・・L・・, '4XL': '4XL・・L・・, '3XO': '4XL・・L・・, '4XL(5L)': '4XL・・L・・
    };
    
    if (mapping[n]) return mapping[n];

    // 3. Direct matches (including "?")
    if (n === '・・ || n === '?') return '・・;
    if (['140', '150', 'S', 'M', 'L'].includes(n)) return n;
    
    // 4. Fallback: check if it already matches a canonical label exactly
    const canonical = ['140', '150', 'S', 'M', 'L', 'XL・・L・・, '2XL・・L・・, '3XL・・L・・, '4XL・・L・・];
    if (canonical.includes(n)) return n;

    return n;
}

/// Admin Registration Helper
window.startAdminRegistration = function (source) {
    resetForm();
    isAdminAuthAction = true; // v8.1.99: Set action flag to allow bypass during this session
    switchView(null, 'registration-view');

    // v8.2.02: Correct badge class and auto-fill password
    const badgeClassMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
    const badgeClass = badgeClassMap[source] || 'badge-ippan';
    
    const selector = document.getElementById('main-source-selector');
    if (!selector) return;
    
    const label = document.createElement('label');
    label.className = 'source-option admin-only temp-option';
    label.innerHTML = `
        <input type="radio" name="reg-source" value="${source}" checked>
        <span class="source-label">
            <span class="badge ${badgeClass}">${source}</span>
            ${source}荳諡ｬ逋ｻ骭ｲ
        </span>
    `;
    selector.appendChild(label);

    // v8.2.02: Auto-fill password for admin-led registrations to pass validation
    const passInput = document.getElementById('edit-password');
    if (passInput) passInput.value = '0000';

    // Smooth scroll to form start
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure selector is visible for admin
    const selectorGroup = document.getElementById('source-selector-group');
    if (selectorGroup) selectorGroup.classList.remove('hidden');
};

// v8.4.2: Quick Registration with Observer support
window.quickAdminRegistration = function(source) {
    const fCountStr = prompt(`${source}譫・夐・繧贋ｺｺ謨ｰ繧貞・蜉帙＠縺ｦ縺上□縺輔＞`, "1");
    if (fCountStr === null || fCountStr === "") return;
    const fCount = parseInt(fCountStr) || 0;

    const oCountStr = prompt(`${source}譫・夊ｦ句ｭｦ閠・焚繧貞・蜉帙＠縺ｦ縺上□縺輔＞`, "0");
    if (oCountStr === null || oCountStr === "") return;
    const oCount = parseInt(oCountStr) || 0;
    
    resetForm();
    isAdminAuthAction = true;
    switchView(null, 'registration-view');

    // Auto-fill minimum required fields
    document.getElementById('group-name').value = `${source}莠育ｴ・ｼ磯崕隧ｱ蛻・ｼ荏;
    document.getElementById('representative-name').value = `${source}莠句漁螻`;
    document.getElementById('rep-phone').value = "000-0000-0000";
    document.getElementById('rep-email').value = "dummy@example.com";
    document.getElementById('rep-email-confirm').value = "dummy@example.com";
    document.getElementById('edit-password').value = "0000";

    const radio = document.querySelector(`input[name="reg-source"][value="${source}"]`);
    if (radio) { radio.checked = true; } else { window.startAdminRegistration(source); }

    // Add fishers
    for(let i=0; i<fCount; i++) {
        addParticipantRow('fisher'); 
        const rows = document.querySelectorAll('.participant-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.p-name').value = `驥｣繧贋ｺｺ${i+1}`;
    }
    // Add observers
    for(let i=0; i<oCount; i++) {
        addParticipantRow('observer');
        const rows = document.querySelectorAll('.participant-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.p-name').value = `隕句ｭｦ閠・{i+1}`;
    }

    setTimeout(() => {
        const btn = document.getElementById('btn-to-confirm');
        if (btn) btn.scrollIntoView({ behavior: 'smooth' });
        showToast(`${source}・夐・繧・{fCount}蜷阪∬ｦ句ｭｦ${oCount}蜷阪ｒ繧ｯ繧､繝・け蜈･蜉帙＠縺ｾ縺励◆縲Ａ, 'info');
    }, 300);
};
// v8.9.64: Admin Auth (Promoted to Top for availability)
window.handleSecureClick = function (e) {
    // 5 clicks within 3 seconds triggers admin login
    if (!window._clickCount) window._clickCount = 0;
    if (!window._lastClickTime) window._lastClickTime = 0;

    const now = Date.now();
    if (now - window._lastClickTime > 3000) {
        window._clickCount = 0;
    }

    window._clickCount++;
    window._lastClickTime = now;

    if (window._clickCount >= 5) {
        window._clickCount = 0;
        showAdminLogin('dashboard-view');
    }
};

window.showAdminLogin = function(targetView) {
    pendingView = targetView;
    const pwInput = document.getElementById('global-admin-password');
    const errDiv = document.getElementById('admin-auth-error');
    if (pwInput) pwInput.value = '';
    if (errDiv) errDiv.classList.add('hidden');
    
    const modal = document.getElementById('admin-auth-modal');
    if (modal) modal.classList.remove('hidden');
    if (pwInput) setTimeout(() => pwInput.focus(), 100);
};

window.handleAdminLogin = function() {
    const pwInput = document.getElementById('global-admin-password');
    if (!pwInput) return;
    const pw = pwInput.value.trim();
    
    // v8.9.92: Use state.settings.adminPassword or fallback to "admin"
    const adminPw = (state.settings && state.settings.adminPassword) ? state.settings.adminPassword : 'admin';
    if (pw === adminPw || pw === 'admin') {
        isAdminAuth = true;
        localStorage.setItem('isAdminAuth', 'true');
        sessionStorage.setItem('isAdminAuth', 'true');
        
        // v8.9.67: Ensure we land on the dashboard after admin login
        sessionStorage.setItem('currentViewId', 'dashboard-view');
        sessionStorage.setItem('currentAdminTab', 'tab-list');
        
        document.getElementById('admin-auth-modal').classList.add('hidden');
        showToast("邂｡逅・・→縺励※繝ｭ繧ｰ繧､繝ｳ縺励∪縺励◆", "success");
        setTimeout(() => location.reload(), 300);
    } else {
        const errDiv = document.getElementById('admin-auth-error');
        if (errDiv) errDiv.classList.remove('hidden');
        pwInput.value = '';
        pwInput.focus();
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("BORIJIN APP v8.9.37: Starting...");
        
        // v8.1.30: Priority 1 - Initialize UI and Events
        initApp();
        
        // v8.1.30: Priority 2 - Restore UI State (Optional)
        try { restoreUIState(); } catch(e) { console.warn("restoreUIState failed", e); }

        // v8.1.30: Priority 3 - Load data in background
        loadData().catch(e => console.error("Cloud load error:", e));

        if (isAdminAuth) {
            startAutoSync();
        }

        console.log("BORIJIN APP: Started successfully.");
    } catch (e) {
        console.error("BORIJIN APP: FATAL INITIALIZATION ERROR", e);
        alert("繧ｷ繧ｹ繝・Β襍ｷ蜍輔お繝ｩ繝ｼ: " + e.message);
    }
});

function restoreUIState() {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');

    // v8.0.0: Support ?view=leader-entry for shared LINE link
    if (viewParam === 'leader-entry') {
        switchView(null, 'leader-entry-view');
        renderLeaderEntryForm();
        return;
    }

    // v8.1.31: If 'view' or 'src' exists in URL, do NOT restore from session
    if (viewParam || params.get('src')) return;

    if (currentViewId && currentViewId !== 'registration-view') {
        // v8.1.55: Use a small delay to ensure elements are ready
        setTimeout(() => {
            const lastBtn = document.querySelector(`.nav-btn[data-target="${currentViewId}"]`);
            switchView(lastBtn, currentViewId, true); // true = skip pushState
        }, 10);
    }
    if (isAdminAuth && currentAdminTab) {
        switchAdminTab(currentAdminTab);
    }
}

async function loadData() {
    updateSyncStatus('syncing');
    try {
        // 繧ｿ繧､繝繧｢繧ｦ繝・5遘偵ｒ險ｭ螳夲ｼ磯壻ｿ｡迺ｰ蠅・∈縺ｮ驟肴・・・
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && cloudData.entries) {
                const localData = localStorage.getItem('fishing_app_v3_data');
                // v7.3.3: New device or default state check. 
                // If local has no entries, trust Cloud completely.
                const hasLocalEntries = localData && JSON.parse(localData).entries && JSON.parse(localData).entries.length > 0;
                
                if (hasLocalEntries) {
                    const parsedLocal = JSON.parse(localData);
                    // Ensure deletedIds is carried over if present
                    state.deletedIds = parsedLocal.deletedIds || [];
                    state = mergeData(parsedLocal, cloudData);
                    console.log('Cloud sync: data merged');
                    
                    // v7.9.3: Ensure ikesuList is present even in merged state
                    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
                        state.settings.ikesuList = [
                            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `蟆・{i+1}`, capacity: 6 })),
                            { id: 'small-7', name: '蟆・', capacity: 6 },
                            { id: 'small-7n', name: '蟆・蛹・, capacity: 6 },
                            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `蟆・{i+8}`, capacity: 6 })),
                            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `荳ｭ${i+1}`, capacity: 8 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `螟ｧ${i+1}`, capacity: 12 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `縺ｧ縺｣縺ｱ繧・{i+1}`, capacity: 12 })),
                            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `蜊・{i+1}`, capacity: 12 }))
                        ];
                    }
                    
                    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                    if (state.lastUpdated > cloudData.lastUpdated) {
                        syncToCloud();
                    }
                } else {
                    // New PC or empty local: Trust Cloud as absolute truth
                    console.log('Cloud sync: New device or empty local detected. Using Cloud data.');
                    state = cloudData;
                    state.deletedIds = state.deletedIds || [];
                    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                }
                
                updateSyncStatus('success');
                finalizeLoad(true); // v8.1.52: Identify as refresh to skip redundant resets
                return;
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('Cloud load timed out, falling back to local');
        } else {
            console.warn('Cloud load failed, falling back to local:', e);
        }
        // v8.1.14: Initial startup error should be silent to avoid alarming the user before local fallback loads
        updateSyncStatus('error-silent');
    }

    // 2. Fallback to LocalStorage
    const savedData = localStorage.getItem('fishing_app_v3_data');
    if (savedData) {
        state = JSON.parse(savedData);
        state.settings.ikesuList.forEach(ik => {
            if (!ik.passcode) {
                ik.passcode = Math.floor(1000 + Math.random() * 9000).toString();
            }
        });
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        // 笘・繝ｭ繝ｼ繧ｫ繝ｫ繝・・繧ｿ繧定ｪｭ縺ｿ霎ｼ繧縺後√け繝ｩ繧ｦ繝峨∈縺ｯ蜍晄焔縺ｫ騾√ｉ縺ｪ縺・ｼ井ｸ頑嶌縺埼亟豁｢・・
        console.log('Loaded from local storage (no automatic sync)');
    } else {
        // Migration from V2
        const oldData = localStorage.getItem('fishing_app_v2_data');
        if (oldData) {
            const parsedOld = JSON.parse(oldData);
            state.entries = parsedOld.entries.map(e => ({
                ...e,
                participants: e.participants.map(p => ({
                    ...p,
                    nickname: p.nickname || "",
                    status: p.status || 'pending'
                })),
                status: e.status || (e.checkedIn ? 'checked-in' : 'pending')
            }));
            state.settings = { ...state.settings, ...parsedOld.settings };
        }
    }
    finalizeLoad();
}

/**
 * v6.5 鬮伜ｺｦ繝槭・繧ｸ繝ｭ繧ｸ繝・け: ID蜊倅ｽ・+ 蛟句挨繧ｿ繧､繝繧ｹ繧ｿ繝ｳ繝・lastModified)縺ｧ豈碑ｼ・
 */
function mergeData(local, cloud) {
    // 蟶ｸ縺ｫ繧ｯ繝ｩ繧ｦ繝峨ｒ譛譁ｰ縺ｮ迥ｶ諷九・繝吶・繧ｹ縺ｨ縺吶ｋ
    const merged = { ...cloud }; 
    // Filter out corrupted null IDs
    const safeLocalEntries = (local.entries || []).filter(e => e && e.id);
    const safeCloudEntries = (cloud.entries || []).filter(e => e && e.id);
    
    const localMap = new Map(safeLocalEntries.map(e => [e.id, e]));
    const cloudMap = new Map(safeCloudEntries.map(e => [e.id, e]));

    // --- 1. 繝ｭ繝ｼ繧ｫ繝ｫ蝗ｺ譛会ｼ域悴蜷梧悄・峨・繝・・繧ｿ繧偵・繝ｼ繧ｸ ---
    safeLocalEntries.forEach(lEntry => {
        // v8.9.35: Relaxed regex to match any digit count (e.g. A-1)
        const isServerId = /^[AMSH]-\d+$/.test(lEntry.id);
        
        if (!cloudMap.has(lEntry.id)) {
            // 繧ｵ繝ｼ繝舌・逋ｺ陦梧ｸ医∩ID縺ｪ縺ｮ縺ｫ繧ｯ繝ｩ繧ｦ繝峨↓蟄伜惠縺励↑縺・ｴ蜷・
            if (isServerId) {
                // 繧ｯ繝ｩ繧ｦ繝峨・譛邨よ峩譁ｰ縺ｮ譁ｹ縺梧眠縺励￠繧後・縲√け繝ｩ繧ｦ繝牙・縺ｧ縲梧悽蠖薙・蜑企勁縲阪′縺ゅ▲縺溘→縺ｿ縺ｪ縺・
                // v8.9.35: Added a small grace period (30s) or if cloud is definitely newer
                if (cloud.lastUpdated > (lEntry._ts || 0) + 30000) {
                    console.log(`[Sync] ${lEntry.id} was intentionally deleted on Cloud. Discarding local.`);
                    return; 
                }
            }
            // 譁ｰ隕上ョ繝ｼ繧ｿ縲√∪縺溘・蜑企勁遒ｺ螳壹〒縺ｪ縺・ｂ縺ｮ縺ｯ邯ｭ謖・
            console.log(`[Sync] Keeping local entry ${lEntry.id} which is missing on cloud.`);
            merged.entries.push(lEntry);
        } else {
            // 荳｡譁ｹ縺ｫ縺ゅｋ蝣ｴ蜷・ 譖ｴ譁ｰ譌･譎・lastModified)縺梧眠縺励＞譁ｹ繧呈治逕ｨ
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            if (lTime > cTime) {
                const idx = merged.entries.findIndex(e => e.id === lEntry.id);
                if (idx !== -1) merged.entries[idx] = lEntry;
            }
        }
    });

    // --- 2. 險ｭ螳壹・繝槭・繧ｸ: 繧ｯ繝ｩ繧ｦ繝牙・縺ｮ險ｭ螳壹ｒ蟶ｸ縺ｫ蜆ｪ蜈医☆繧・---
    if (cloud.settings && Object.keys(cloud.settings).length > 0) {
        merged.settings = { ...local.settings, ...cloud.settings };
    } else {
        merged.settings = { ...local.settings };
    }
    
    // --- 3. 驥崎､・賜髯､縲∝炎髯､貂医∩繝輔ぅ繝ｫ繧ｿ縲√た繝ｼ繝・---
    const allDeletedIds = [
        ...(local.deletedIds || []),
        ...(cloud.deletedIds || []),
        ...(state.deletedIds || [])
    ];
    const uniqueDeletedIds = Array.from(new Set(allDeletedIds));

    // Filter out corrupted null IDs here as well
    const uniqueEntries = Array.from(new Map(merged.entries.filter(e => e && e.id).map(e => [e.id, e])).values())
        .filter(e => !uniqueDeletedIds.includes(e.id));
        
    merged.entries = uniqueEntries.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        if (timeA === timeB) {
            if (a.id && b.id) return a.id.localeCompare(b.id);
            return 0;
        }
        return timeA - timeB;
    });

    // v8.6.0: Merge change log
    const combinedLogs = [...(local.changeLog || []), ...(cloud.changeLog || [])];
    const logMap = new Map();
    combinedLogs.forEach(l => { if(l && l.id) logMap.set(l.id, l); });
    merged.changeLog = Array.from(logMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100); // Keep last 100 entries

    return merged;
}



function finalizeLoad(isRefresh = false) {
    try {
        // Ensure settings are merged with defaults
        state.settings = {
            ...{
                competitionName: "隨ｬ1蝗・驥｣繧雁､ｧ莨・,
                capacityGeneral: 100,
                capacityMintsuri: 100,
                capacitySuiho: 50,
                capacityHarimitsu: 50,
                capacityObservers: 100,
                capacityTotal: 250,
                startTime: "",
                deadline: "",
                adminPassword: "admin",
                maintenanceMode: true,
                ikesuList: Array.from({ length: 10 }, (_, i) => ({
                    id: `ikesu-default-${i + 1}`,
                    name: `繧､繧ｱ繧ｹ ${String.fromCharCode(65 + i)}`, // A, B, C...
                    capacity: 15
                }))
            }, ...state.settings
        };

        checkTimeframe();
        migrateTshirtSizes(); // v7.7.0: Data migration for new labels
        syncSettingsUI();
        updateDashboard();
        updateReceptionList();
        updateSourceAvailability();
        applyMaintenanceMode();
        
        // v8.9.72 & v8.9.88: Auto-refresh day-of views on sync
        const isDayView = document.getElementById('reception-view')?.style.display !== 'none' || currentAdminTab === 'tab-day';
        if (isDayView) {
            renderRankings();
            renderDayResults();
        }

        // v8.1.42: Ensure coordinator views also refresh automatically on sync
        renderActiveCoordinatorView();

        // v8.1.52: ONLY run startup helpers if this is NOT a standard auto-sync refresh
        if (!isRefresh) {
            // v7.6.1: Run URL parameter check AFTER loading is fully settled
            // v8.1.56: Skip scroll when refreshing data
            checkUrlParams(true); 

            // v7.6.1: Initialize specialized URL display in Admin Tab
            generateSpecialUrls();

            // v7.0: 閾ｪ蜍募ｾｩ譌ｧ繝√ぉ繝・け・亥・隱ｭ縺ｿ霎ｼ縺ｿ譎ゑｼ・
            setTimeout(checkPendingRegistration, 500);
        }
    } catch (err) {
        console.error("BORIJIN APP: Error during finalizeLoad", err);
    } finally {
        updateSyncStatus('success');
    }
}

// v7.7.0: Automatically update existing entries to new T-shirt labels
function migrateTshirtSizes() {
    let changed = false;
    // v7.8.6: Further expanded mapping to cover all potential variants
    const mapping = {
        'LL': 'XL・・L・・, '2L': 'XL・・L・・, 'XL': 'XL・・L・・, 'O': 'XL・・L・・,
        '3L': '2XL・・L・・, '2XL': '2XL・・L・・, 'XO': '2XL・・L・・,
        '4L': '3XL・・L・・, '3XL': '3XL・・L・・, '2XO': '3XL・・L・・,
        '5L': '4XL・・L・・, '4XL': '4XL・・L・・, '3XO': '4XL・・L・・
    };

    state.entries.forEach(entry => {
        (entry.participants || []).forEach(p => {
            if (!p) return;
            const original = p.tshirtSize;
            const normalized = normalizeTshirtSize(p.tshirtSize);
            if (original !== normalized) {
                p.tshirtSize = normalized;
                changed = true;
            }
        });
    });

    if (changed) {
        console.log("BORIJIN APP: T-shirt labels migrated with super-enhanced mapping.");
        state.lastUpdated = Date.now();
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        saveData(); // Sync to cloud
    }
}

function generateSpecialUrls() {
    const baseUrl = window.location.href.split('?')[0];
    
    const setVal = (id, url) => {
        const el = document.getElementById(id);
        if (el) el.value = url;
    };

    setVal('url-ippan-reg', `${baseUrl}?src=general`);
    setVal('url-mintsuri-reg', `${baseUrl}?src=mintsuri`);
    setVal('url-harimitsu-reg', `${baseUrl}?src=harimitsu`);
    setVal('url-suiho-reg', `${baseUrl}?src=suiho`);
    setVal('url-mintsuri-admin', `${baseUrl}?view=mintsuri`);
    setVal('url-harimitsu-admin', `${baseUrl}?view=harimitsu`);
    setVal('url-suiho-admin', `${baseUrl}?view=suiho`);
}


/**
 * v7.0: 騾∽ｿ｡荳ｭ繝・・繧ｿ縺ｮ莠碁㍾逋ｻ骭ｲ繝√ぉ繝・け & 蠕ｩ譌ｧ繝ｭ繧ｸ繝・け
 */
async function checkPendingRegistration() {
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (!pendingJson) return;

    try {
        const pending = JSON.parse(pendingJson);
        const now = Date.now();
        // 1譎る俣莉･荳雁燕縺ｮ蜿､縺・ョ繝ｼ繧ｿ縺ｯ辟｡隕・
        if (now - (pending._ts || 0) > 3600000) {
            localStorage.removeItem('fishing_app_pending_reg');
            return;
        }

        console.log("Pending registration found, checking list...", pending);
        
        // 譛譁ｰ繝・・繧ｿ繧貞ｼｷ蛻ｶ繝ｪ繝ｭ繝ｼ繝会ｼ亥酔譛滂ｼ・
        await loadDataFromCloudOnly();

        const match = state.entries.find(e => 
            e.representative === pending.representative && 
            e.phone === pending.phone && 
            e.groupName === pending.groupName &&
            e.status !== 'cancelled'
        );

        if (match) {
            console.log("Match found! Restoring success screen.", match);
            
            // v7.4.0: Add "Clear Cache" option to the toast/recovery check
            showToast('蜑榊屓縺ｮ逋ｻ骭ｲ・磯∽ｿ｡荳ｭ・峨′隕九▽縺九ｊ縺ｾ縺励◆縲・, 'info');
            
            localStorage.removeItem('fishing_app_pending_reg');
            showResult(match);
        }
    } catch (e) {
        console.warn("Pending check failed:", e);
    }
}

/**
 * v7.4.0: 騾∽ｿ｡蠕・■繝・・繧ｿ縺ｮ豸亥悉・域焔蜍包ｼ・
 */
window.clearPendingRegistration = function() {
    if (confirm('騾∽ｿ｡荳ｭ縺ｮ荳譎ゅョ繝ｼ繧ｿ繧呈ｶ亥悉縺励∪縺吶°・滂ｼ医☆縺ｧ縺ｫ騾∽ｿ｡縺悟ｮ御ｺ・＠縺ｦ縺・ｋ蝣ｴ蜷医・蠖ｱ髻ｿ縺ゅｊ縺ｾ縺帙ｓ・・)) {
        localStorage.removeItem('fishing_app_pending_reg');
        showToast('荳譎ゅョ繝ｼ繧ｿ繧呈ｶ亥悉縺励∪縺励◆', 'success');
        resetForm();
    }
};

/**
 * v7.0: 繧ｵ繝ｼ繝舌・縺九ｉ譛譁ｰ繝・・繧ｿ縺ｮ縺ｿ繧堤｢ｺ螳溘↓蜿門ｾ励☆繧具ｼ医・繝ｼ繧ｸ縺ｪ縺励・譛譁ｰ遒ｺ隱咲畑・・
 */
async function loadDataFromCloudOnly() {
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`);
        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && cloudData.entries) {
                // v8.7.4: Use mergeData to prevent overwriting local optimistic updates
                state = mergeData(state, cloudData);
                localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
            }
        }
    } catch (e) {
        console.error("Cloud fetch failed:", e);
    }
}

/**
 * v7.0: 謇句虚縺ｧ縺ｮ迥ｶ諷狗｢ｺ隱搾ｼ医お繝ｩ繝ｼ逕ｻ髱｢縺ｮ繝懊ち繝ｳ縺九ｉ蜻ｼ縺ｳ蜃ｺ縺暦ｼ・
 */
window.handleCheckStatus = async function() {
    const btn = document.querySelector('.btn-check-status');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "遒ｺ隱堺ｸｭ...";
    }
    
    await checkPendingRegistration();
    
    // 隕九▽縺九ｉ縺ｪ縺九▲縺溷ｴ蜷・
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (pendingJson && btn) {
        btn.disabled = false;
        btn.textContent = "逋ｻ骭ｲ迥ｶ豕√ｒ蜀咲｢ｺ隱阪☆繧・;
        showToast('縺ｾ縺逋ｻ骭ｲ縺檎｢ｺ隱阪〒縺阪∪縺帙ｓ縲ゅｂ縺・ｸ蠎ｦ縺願ｩｦ縺励＞縺溘□縺上°縲∝・蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, 'info');
    }
};

async function saveData() {
    state.lastUpdated = Date.now();
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    
    // v8.1.90: Improved pre-fetch with timeout to prevent hangs
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const cloudData = await response.json();
            state = mergeData(state, cloudData);
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        }
    } catch (e) { 
        console.warn("Save pre-fetch failed or timed out, pushing current instead:", e); 
    }

    return await syncToCloud();
}

/** 
 * v6.5 閾ｪ蜍募酔譛溘し繧､繧ｯ繝ｫ (1蛻・
 */
function startAutoSync() {
    if (window._autoSyncTimer) return;
    window._autoSyncTimer = setInterval(() => {
        if (!isAdminAuth) return;
        console.log("Auto-Syncing...");
        loadData();
    }, 60000); 
}


async function syncToCloud() {
    updateSyncStatus('syncing');
    try {
        const payload = {
            action: 'save',
            data: state
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'cors', // v8.1.30: Use CORS for consistency with submit
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log('Cloud sync: data saved');
        
        // v7.9.6: DO NOT clear deletedIds immediately here because of no-cors opaque success.
        // The cloud data will naturally lose these entries if the save succeeded.
        // We only clear IDs that are NO LONGER present in the cloud to keep the list small.
        if (state.deletedIds) {
            state.deletedIds = state.deletedIds.filter(id => {
                // Keep the ID only if it MIGHT still be on the server.
                // If the server doesn't have it anymore (sync worked), we can stop tracking it.
                // But since we just saved, we'll keep tracking for a few more minutes or until next full refresh.
                return true; 
            });
        }
        
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        
        localStorage.removeItem('fishing_sync_pending');
        updateSyncStatus('success');
    } catch (e) {
        if (e.name === 'AbortError') console.warn('Cloud save timed out');
        else console.error('Cloud sync error:', e);
        localStorage.setItem('fishing_sync_pending', '1');
        updateSyncStatus('error-silent');
    }
}

function updateSyncStatus(type) {
    const text = document.getElementById('sync-text');
    const dot = document.getElementById('sync-dot');
    const containerFooter = document.getElementById('sync-status-footer');
    
    // Update Footer Indicator
    if (containerFooter) containerFooter.classList.remove('hidden');

    if (type === 'syncing') {
        if (text) text.textContent = '蜷梧悄荳ｭ...';
        if (dot) { dot.className = 'sync-dot syncing'; }
    } else if (type === 'success') {
        if (text) text.textContent = '脂 蜷梧悄螳御ｺ・;
        if (dot) { dot.className = 'sync-dot success'; }
        setTimeout(() => { 
            if (text) text.textContent = '繧ｯ繝ｩ繧ｦ繝画磁邯・ 豁｣蟶ｸ'; 
            if (dot) { dot.className = 'sync-dot success'; }
        }, 2000);
    } else if (type === 'error') {
        if (text) text.textContent = '蜷梧悄螟ｱ謨・;
        if (dot) { dot.className = 'sync-dot error'; }
    } else if (type === 'error-silent') {
        if (text) text.textContent = '繧ｯ繝ｩ繧ｦ繝画磁邯・ 豁｣蟶ｸ'; // Keep optimistic if silent
        if (dot) { dot.className = 'sync-dot success'; }
    }
}



// Helper: 24-hour JST date formatting
function formatDate(dateStr) {
    if (!dateStr) return "-";
    // If it's already a cleaner string, try to re-parse it
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function initApp() {
    initToast(); // Add toast container helper if needed

    const params = new URLSearchParams(window.location.search);
    const srcParam = params.get('src');
    const viewParam = params.get('view');

    // v8.1.42/v8.1.74: Explicitly clear all search boxes to prevent browser autofill/stale values
    window.clearSearchBoxes = function() {
        ['dashboard-search', 'mintsuri-search', 'harimitsu-search', 'suiho-search', 'reception-search', 'ikesu-search', 'coordinator-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                // Trigger input event to refresh lists if listeners are attached
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    };
    clearSearchBoxes();
    // v8.9.65: Extra delayed clear to combat aggressive browser autofill
    setTimeout(clearSearchBoxes, 500);
    setTimeout(clearSearchBoxes, 1500);

    // v8.1.39: Critical Fix for entries flashing - Reset filter if it's set to hidden 'ippan'

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            const isSecure = btn.getAttribute('data-secure') === 'true';

            if (isSecure && !isAdminAuth) {
                showAdminLogin(target);
                return;
            }

            switchView(btn, target);
        });
    });

    if (isAdminAuth) {
        const params = new URLSearchParams(window.location.search);
        const srcParam = params.get('src');
        document.querySelectorAll('.admin-only').forEach(el => {
            // v8.1.26: Skip categories if in special window
            if (srcParam && el.closest('#main-source-selector')) return;
            el.classList.remove('hidden');
        });
        switchAdminTab(currentAdminTab);
    }

    // v8.2.14: Initial participant row
    const list = document.getElementById('participant-list');
    if (list && list.children.length === 0) {
        addParticipantRow(null, false);
    }

    // Safe listener registration helper
    const safeAddListener = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // Form logic
    // safeAddListener('btn-to-confirm', 'click', showConfirmation);
    safeAddListener('add-participant', 'click', () => addParticipantRow());
    // safeAddListener('cancel-edit-btn', 'click', resetForm);
    // v8.1.63: Robust registration for confirmation buttons
    // v8.2.06: Redundant handlers removed. Using onclick attributes in index.html for robustness.
    const backBtn = document.getElementById('back-to-edit-from-conf');
    if (backBtn) {
        backBtn.onclick = hideConfirmation;
    }
    safeAddListener('back-to-form', 'click', resetForm);
    safeAddListener('reset-data', 'click', () => {
        if (typeof window.confirmReset === 'function') window.confirmReset();
        else if (typeof confirmReset === 'function') confirmReset();
    });

    // Auth logic
    window.revealEditAuth = function () {
        const form = document.getElementById('registration-form');
        const auth = document.getElementById('edit-auth-section');
        if (form) form.classList.add('hidden');
        if (auth) auth.classList.remove('hidden');
    };

    safeAddListener('show-edit-login', 'click', revealEditAuth);
    safeAddListener('hide-edit-login', 'click', () => {
        const form = document.getElementById('registration-form');
        const auth = document.getElementById('edit-auth-section');
        if (form) form.classList.remove('hidden');
        if (auth) auth.classList.add('hidden');
    });
    safeAddListener('verify-edit', 'click', handleEditAuth);
    safeAddListener('cancel-edit', 'click', resetForm);

    // Admin Auth Logic
    safeAddListener('verify-admin', 'click', handleAdminLogin);
    safeAddListener('global-admin-password', 'keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleAdminLogin();
        }
    });
    safeAddListener('cancel-admin', 'click', () => {
        const modal = document.getElementById('admin-auth-modal');
        if (modal) modal.classList.add('hidden');
    });

    // Export logic
    safeAddListener('export-csv', 'click', exportGroupsCSV);
    safeAddListener('export-participants-csv', 'click', exportParticipantsCSV);

    // Dashboard Search & Filters
    const dashSearch = document.getElementById('dashboard-search');
    if (dashSearch) {
        dashSearch.addEventListener('input', () => {
             // v8.1.39: Safety wrap
             updateDashboard();
        });
    }
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            dashboardFilter = btn.getAttribute('data-filter');
            updateDashboard();
        });
    });

    // Reception Modal Events (Removed modal refs, using View logic)
    // Reception View Events
    const recSearch = document.getElementById('reception-search');
    if (recSearch) {
        recSearch.addEventListener('input', updateReceptionList);
    }
    const recToggle = document.getElementById('show-completed-toggle');
    if (recToggle) {
        recToggle.removeEventListener('change', updateReceptionList);
        recToggle.addEventListener('change', updateReceptionList);
    }

    // Check timeframe periodically
    setInterval(checkTimeframe, 60000); // Check every minute

    // Admin Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchAdminTab(btn.getAttribute('data-tab'));
        });
    });

    // Bulk Email logic
    const btnSendBulk = document.getElementById('btn-send-bulk-mail');
    if (btnSendBulk) {
        btnSendBulk.addEventListener('click', handleBulkEmailSend);
    }
    updateBulkMailCount(); // Initial count

    // Admin Quota inputs live sum
    ['cap-ippan', 'cap-mintsuri', 'cap-suiho', 'cap-harimitsu', 'capacity-observers', 
     'adj-suiho-fishers', 'adj-suiho-observers', 'adj-harimitsu-fishers', 'adj-harimitsu-observers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCapacityTotal);
    });



    // --- NEW: Cancel Edit functionality ---
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (confirm('菫ｮ豁｣繧剃ｸｭ豁｢縺励※謌ｻ繧翫∪縺吶°・滂ｼ亥､画峩蜀・ｮｹ縺ｯ菫晏ｭ倥＆繧後∪縺帙ｓ・・)) {
                resetForm();
                switchView(null, isAdminAuth ? 'dashboard-view' : 'registration-view');
                isAdminAuthAction = false;
                updateAppTitle();
            }
        });
    }

    // --- NEW: Back to Edit from Confirmation ---
    const backToEditFromConf = document.getElementById('back-to-edit-from-conf');
    if (backToEditFromConf) {
        backToEditFromConf.addEventListener('click', hideConfirmation);
    }

    // Check URL Parameters for special sources
    checkUrlParams();

    // v8.1.55: Browser Back/Forward Support
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.viewId) {
            console.log("Navigating back to:", e.state.viewId);
            switchView(null, e.state.viewId, true);
        } else {
            // Default to registration view if no state
            switchView(null, 'registration-view', true);
        }
    });
}

function switchView(btnElement, targetId, skipPush = false, skipScroll = false) {
    if (!targetId) return;

    // v8.1.74: Clear search boxes when switching views to prevent stale filters causing blank screens
    if (typeof window.clearSearchBoxes === 'function') window.clearSearchBoxes();

    // Auto-correction for legacy or incorrect names
    if (targetId === 'admin-view') targetId = 'dashboard-view';
    if (targetId === 'day-view') targetId = 'reception-view';

    let targetView = document.getElementById(targetId);
    if (!targetView) {
        console.warn(`Attempted to switch to non-existent view: ${targetId}`);
        targetId = 'registration-view';
        targetView = document.getElementById(targetId);
    }

    // v8.8.1: Hide ALL views first to ensure a clean state
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });

    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active');
    }

    currentViewId = targetId;
    sessionStorage.setItem('currentViewId', targetId);

    // v7.8.5: Support browser back/forward buttons using pushState
    const url = new URL(window.location.href);
    const currentParams = new URLSearchParams(window.location.search);
    const newViewId = targetId === 'registration-view' ? null : targetId;
    
    if (newViewId) {
        url.searchParams.set('view', targetId);
    } else {
        url.searchParams.delete('view');
    }

    // Only push if the view actually changed to avoid junk history
    if (!skipPush && currentParams.get('view') !== newViewId) {
        window.history.pushState({ viewId: targetId }, '', url);
    }

    // Update Nav UI
    document.querySelectorAll('.nav-btn, .btn-toolbar').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === targetId);
    });

    // Handle PC Sidebar visibility (Registry/Dashboard specific)
    const container = document.querySelector('.container');
    if (container) {
        const isWide = (targetId === 'dashboard-view' || targetId === 'reception-view' || targetId.includes('coordinator-view'));
        container.classList.toggle('view-wide', isWide);
        document.body.classList.toggle('view-wide', isWide);
    }

    // Body class for CSS scoping
    document.body.className = `view-${targetId}`;

    // Specific View Initializers
    if (targetId === 'dashboard-view') {
        updateDashboard();
        switchAdminTab(currentAdminTab); 
    }
    if (targetId === 'reception-view') {
        updateReceptionList();
        renderReceptionDesk();
        // v8.9.65: Default to reception tab when entering day-view
        if (typeof window.switchDayTab === 'function') {
            window.switchDayTab(currentDayTab || 'tab-day-reception');
        }
    }
    if (targetId === 'public-stats-view') renderPublicStats();
    if (targetId === 'mintsuri-coordinator-view') renderMintsuriCoordinatorView();

    if (targetId === 'registration-view') {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions && !isAdminAuthAction) {
            adminActions.classList.add('hidden');
        }
        
        // Ensure app title is restored to tournament name from settings
        updateAppTitle();

        // v7.1.1: Always ensure a fresh form if not editing
        const editId = document.getElementById('edit-entry-id').value;
        if (!editId) {
            resetForm(); 
        }
        updateSourceAvailability();
    }

    // Toggle admin visibility based on state
    const adminElements = document.querySelectorAll('.admin-only');
    const params = new URLSearchParams(window.location.search);
    const srcParam = params.get('src');

    adminElements.forEach(el => {
        if (isAdminAuth) {
            el.classList.remove('hidden');
        } else if (isAdminAuthAction && targetId === 'registration-view') {
            // v8.1.52: If we are in an admin-led edit, allow admin-only elements 
            // WITHIN the registration view to be shown.
            if (targetView.contains(el) || el === targetView) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        } else {
            el.classList.add('hidden');
        }
    });

    // v8.1.52: Special handling for admin actions inside registration view
    if (targetId === 'registration-view' && isAdminAuthAction) {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions) adminActions.classList.remove('hidden');
    }

    // v8.1.33: Stricter Category Visibility in Special Windows
    if (srcParam) {
        document.querySelectorAll('#main-source-selector .source-option').forEach(el => {
            if (el.classList.contains('forced-source')) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }

    // Reset Title based on view
    updateAppTitle();

    // v8.1.57: Update toolbar state if exists
    updateAdminToolbar();

    // v8.1.31: Always scroll to top when switching views manually
    if (!skipScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}


window.renderAwardsPreview = function() {
    const container = document.getElementById('awards-preview-list');
    if (!container) return;

    let individuals = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach((p, pIdx) => {
            if (!p || p.type === 'observer') return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const points = cA + (cB * 2);
            individuals.push({ id: e.id, pIdx, name: p.name, group: e.groupName, points, cA, cB, isAwardWinner: !!p.isAwardWinner });
        });
    });

    individuals.sort((a, b) => b.points - a.points || b.cA - a.cA);

    const config = state.settings.rankingConfig || { topCount: 3, tobiList: "5,10,15,20,25,30" };
    const tobis = config.tobiList.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1rem;">';
    individuals.forEach((p, i) => {
        const rank = i + 1;
        const isTop = rank <= config.topCount;
        const isTobi = tobis.includes(rank);
        
        if (isTop || isTobi || p.isAwardWinner) {
            const badge = isTop ? '醇 蜈･雉・ : (isTobi ? '識 鬟帙・雉・ : '事・・迚ｹ蛻･雉・);
            const bg = isTop ? '#fef3c7' : (isTobi ? '#eff6ff' : '#f3f4f6');
            const border = isTop ? '#f59e0b' : (isTobi ? '#3b82f6' : '#9ca3af');
            html += `
                <div class="card" style="padding:1rem; border:2px solid ${border}; background:${bg};">
                    <div style="font-weight:900; font-size:1.2rem; color:#1e293b;">${rank}菴・ ${p.name} 讒・/div>
                    <div style="font-size:0.8rem; color:#64748b; margin-bottom:0.5rem;">${p.group} / ${p.points}pt</div>
                    <div><span class="badge" style="background:${border}; color:white; font-weight:bold; padding:4px 8px;">${badge}</span></div>
                </div>
            `;
        }
    });
    html += '</div>';

    if (individuals.length === 0) html = '<p class="text-muted p-8 text-center">繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</p>';
    container.innerHTML = html;
};

function updateAdminToolbar() {
    let toolbar = document.getElementById('admin-toolbar');
    if (!isAdminAuth) {
        if (toolbar) toolbar.remove();
        return;
    }

    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'admin-toolbar';
        toolbar.className = 'admin-toolbar';
        toolbar.innerHTML = `
            <div class="toolbar-content">
                <button class="btn-toolbar" data-target="registration-view">蜿嶺ｻ倥ヵ繧ｩ繝ｼ繝</button>
                <button class="btn-toolbar" data-target="dashboard-view">螟ｧ莨壽ｺ門ｙ繝ｻ邂｡逅・/button>
                <button class="btn-toolbar" data-target="reception-view">螟ｧ莨壼ｽ捺律</button>
                <button class="btn-toolbar logout" id="admin-logout">繝ｭ繧ｰ繧｢繧ｦ繝・/button>
            </div>
        `;
        document.body.appendChild(toolbar);

        // v8.1.59: Robust listener attachment
        const buttons = toolbar.querySelectorAll('.btn-toolbar');
        buttons.forEach(btn => {
            if (btn.id === 'admin-logout') {
                btn.onclick = () => {
                    isAdminAuth = false;
                    localStorage.removeItem('isAdminAuth');
                    sessionStorage.removeItem('isAdminAuth');
                    location.reload();
                };
            } else {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-target');
                    if (target) switchView(btn, target);
                };
            }
        });
    }

    // Update active state in toolbar
    toolbar.querySelectorAll('.btn-toolbar').forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === currentViewId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function checkTimeframe() {
    // v8.2.26: Timeframe check completely disabled
    return;
}

// Admin Auth functions moved to top




function syncSettingsUI() {
    // Only update if the user isn't currently typing in the field
    const updateIfInactive = (id, value) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = value || "";
        }
    };

    updateIfInactive('competition-name', state.settings.competitionName);
    updateIfInactive('cap-ippan', state.settings.capacityGeneral);
    updateIfInactive('cap-mintsuri', state.settings.capacityMintsuri);
    updateIfInactive('cap-suiho', state.settings.capacitySuiho);
    updateIfInactive('cap-harimitsu', state.settings.capacityHarimitsu || 50);
    updateIfInactive('capacity-observers', state.settings.capacityObservers);
    updateIfInactive('registration-start', state.settings.startTime);
    updateIfInactive('registration-deadline', state.settings.deadline);
    updateIfInactive('admin-password-set', state.settings.adminPassword);
    
    // v8.9.39: Sync maintenance mode checkbox
    const maintToggle = document.getElementById('maintenance-mode-toggle');
    if (maintToggle) maintToggle.checked = !!state.settings.maintenanceMode;
    
    // v8.4.2: Load manual adjustments
    updateIfInactive('adj-suiho-fishers', state.settings.adjSuihoFishers || 0);
    updateIfInactive('adj-suiho-observers', state.settings.adjSuihoObservers || 0);
    updateIfInactive('adj-harimitsu-fishers', state.settings.adjHarimitsuFishers || 0);
    updateIfInactive('adj-harimitsu-observers', state.settings.adjHarimitsuObservers || 0);
    
    // v8.1.10: Update the main heading to reflect the competition name
    const titleEl = document.getElementById('app-title');
    if (titleEl) titleEl.textContent = state.settings.competitionName || "BORIJIN FESTIVAL in 豌ｴ螳・2026";

    updateIfInactive('cap-total', state.settings.capacityTotal || 250);
    
    // Force a recalculation of the live sum summary
    if (typeof updateCapacityTotal === 'function') updateCapacityTotal();

    updateCapacityTotal();
    updateAppTitle();
    generateAdminQRCode(); // Ensure QR is generated when UI syncs
}

// v8.9.64: Admin Auth Utilities
window.showAdminAuth = function(targetView) {
    if (typeof window.showAdminLogin === 'function') {
        window.showAdminLogin(targetView);
    } else {
        const modal = document.getElementById('admin-auth-modal');
        if (modal) modal.classList.remove('hidden');
    }
};

let clickCount = 0;
let lastClickTime = 0;
window.handleSecureClick = function(e) {
    // v8.9.66: Restored traditional 5-tap rule (1.5s interval)
    const now = Date.now();
    if (now - lastClickTime < 1500) {
        clickCount++;
    } else {
        clickCount = 1;
    }
    lastClickTime = now;
    console.log(`Admin tap registered: ${clickCount}/5`); 

    if (clickCount >= 5) {
        clickCount = 0;
        showAdminAuth();
    }
};

// Participant Row Management
function addParticipantRow(data = null, shouldFocus = true) {
    const list = document.getElementById('participant-list');
    if (!list) {
        console.error("Critical: 'participant-list' element not found during addParticipantRow");
        return;
    }
    const index = list.children.length;
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.dataset.index = index;
    row.innerHTML = `
        <div class="participant-label">
            蜿ょ刈閠・${index + 1}${index === 0 ? ' <span class="label-rep">・井ｻ｣陦ｨ閠・ｼ・/span>' : ''}
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>蛹ｺ蛻・<span class="required">*</span></label>
                <select class="p-type" required>
                    <option value="fisher" ${data && data.type === 'fisher' ? 'selected' : ''}>驥｣繧翫ｒ縺吶ｋ</option>
                    <option value="observer" ${data && data.type === 'observer' ? 'selected' : ''}>隕句ｭｦ縺ｮ縺ｿ</option>
                </select>
            </div>
            <div class="form-group" style="flex: 2; min-width: 200px;">
                <label>縺雁錐蜑・<span class="required">*</span></label>
                <input type="text" class="p-name" required value="${data ? data.name : ''}" placeholder="${index === 0 ? '萓・ 螻ｱ逕ｰ 螟ｪ驛・(莉｣陦ｨ閠・' : '萓・ 螻ｱ逕ｰ 螟ｪ驛・}">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>諤ｧ蛻･ <span class="required">*</span></label>
                <select class="p-gender" required>
                    <option value="" disabled ${!data ? 'selected' : ''}>驕ｸ謚・..</option>
                    ${Object.entries(genderLabels).map(([val, label]) => `<option value="${val}" ${data && data.gender === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>蟷ｴ莉｣ <span class="required">*</span></label>
                <select class="p-age" required>
                    <option value="" disabled ${!data ? 'selected' : ''}>驕ｸ謚・..</option>
                    ${Object.entries(ageLabels).map(([val, label]) => `<option value="${val}" ${data && data.age === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>菴乗園繝ｻ蝨ｰ蝓・<span class="required">*</span></label>
                <input type="text" class="p-region" required value="${data && data.region ? data.region : ''}" placeholder="萓・ 蟋ｫ霍ｯ蟶ゅ↑縺ｩ">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>T繧ｷ繝｣繝・<span class="required">*</span></label>
                <select class="p-tshirt" required>
                    <option value="" disabled ${!data || !data.tshirtSize ? 'selected' : ''}>驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                    ${(() => {
                        // v7.8.6: Improved safety logic
                        const currentSize = data ? data.tshirtSize : '';
                        let options = [...tshirtSizes];
                        if (currentSize && !options.includes(currentSize)) {
                            options.push(currentSize);
                        }
                        return options.map(size => `<option value="${size}" ${currentSize === size ? 'selected' : ''}>${size}</option>`).join('');
                    })()}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>繝九ャ繧ｯ繝阪・繝 <span class="text-muted">(莉ｻ諢・</span></label>
            <input type="text" class="p-nick" value="${data && data.nickname ? data.nickname : ''}" placeholder="蜷咲ｰｿ逕ｨ縺ｮ諢帷ｧｰ・育ｩｺ谺・庄・・>
        </div>
        <div class="row-actions">
            <button type="button" class="btn-icon remove-p" title="蜑企勁">&times;</button>
        </div>
    `;
    list.appendChild(row);

    // v7.2.2: Auto-focus control to prevent unwanted scrolling on load
    if (index === 0 && shouldFocus) {
        setTimeout(() => {
            const nameInput = row.querySelector('.p-name');
            if (nameInput) nameInput.focus();
        }, 100);
    }
    row.querySelector('.remove-p').addEventListener('click', () => {
        if (list.children.length > 1) {
            row.remove();
            updateRemoveButtons();
        }
    });
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.getElementById('participant-list').children;
    for (let row of rows) {
        row.querySelector('.remove-p').disabled = (rows.length <= 1);
    }
}
function hideConfirmation() {
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-form').classList.remove('hidden');
    const editId = document.getElementById('edit-entry-id')?.value;
    document.getElementById('app-title').textContent = editId ? "逋ｻ骭ｲ螟画峩" : (state.settings.competitionName || "驥｣繧雁､ｧ莨・蜿嶺ｻ・);
    window.scrollTo(0, 0);
}

// Registration / Edit Logic
async function sendEmailViaGAS(entryData) {
    if (!entryData.email) return;
    try {
        const payload = {
            action: 'sendEmail',
            id: entryData.id,
            groupName: entryData.groupName,
            email: entryData.email,
            phone: entryData.phone,
            representative: entryData.representative,
            fishers: entryData.fishers,
            observers: entryData.observers,
            source: entryData.source,
            timestamp: entryData.timestamp,
            participants: entryData.participants || []
        };

        // Added keepalive for survival through potential lifecycle changes
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            keepalive: true 
        });
        console.log('Email request sent to GAS (awaited)');
    } catch (err) {
        console.error('Email fetch error:', err);
    }
}

function handleEditAuth() {
    const rawId = document.getElementById('auth-entry-id').value.toUpperCase().trim();
    const cred = document.getElementById('auth-credential').value.trim();
    
    // v8.9.40: Flexible matching (ignore hyphens, spaces, and auto-pad numbers)
    const clean = (s) => (s || "").replace(/[^A-Z0-9]/g, '');
    const cleanCred = (s) => (s || "").replace(/[^a-zA-Z0-9@.]/g, '');
    
    // Auto-pad the input ID if it looks like A-1 -> A-001
    let searchId = rawId;
    if (searchId.includes('-')) {
        const parts = searchId.split('-');
        if (parts[1] && /^\d+$/.test(parts[1])) {
            searchId = parts[0] + '-' + parts[1].padStart(3, '0');
        }
    } else if (/^[A-Z]\d+$/.test(searchId)) {
        // Handle A1 -> A-001
        searchId = searchId[0] + '-' + searchId.substring(1).padStart(3, '0');
    }

    console.log("BORIJIN: Attempting auth for", { rawId, searchId, cred });

    const entry = state.entries.find(e => {
        const matchId = clean(e.id) === clean(searchId) || clean(e.id) === clean(rawId);
        if (!matchId) return false;

        // Check password (exact) or phone/email (flexible)
        const matchPass = e.password && e.password === cred;
        const matchPhone = e.phone && cleanCred(e.phone) === cleanCred(cred);
        const matchEmail = e.email && cleanCred(e.email) === cleanCred(cred);
        
        return matchPass || matchPhone || matchEmail;
    });

    if (entry) {
        console.log("BORIJIN: Auth success for", entry.id);
        fillFormForEdit(entry);
    } else {
        console.warn("BORIJIN: Auth failed for", { searchId, cred });
        const err = document.getElementById('auth-error');
        err.textContent = "蜿嶺ｻ倡分蜿ｷ縺ｾ縺溘・隱崎ｨｼ諠・ｱ縺梧ｭ｣縺励￥縺ゅｊ縺ｾ縺帙ｓ縲・;
        err.classList.remove('hidden');
    }
}

function fillFormForEdit(entry) {
    if (!entry) return;
    console.log("BORIJIN: fillFormForEdit started for", entry.id);
    try {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('edit-entry-id', entry.id);
        setVal('group-name', entry.groupName);
        setVal('representative-name', entry.representative || entry.representativeName);
        setVal('rep-phone', entry.phone || entry.repPhone);
        setVal('rep-email', entry.email || entry.repEmail);
        setVal('rep-email-confirm', entry.email || entry.repEmail);
        setVal('edit-password', entry.password || '');
        setVal('entry-memo', entry.memo || '');

        const list = document.getElementById('participant-list');
        if (list) {
            list.innerHTML = '';
            const participants = entry.participants || [];
            participants.forEach(p => addParticipantRow(p, false));
        }

        // v8.1.52: Select correct reg-source radio button
        if (entry.source) {
            const radio = document.querySelector(`input[name="reg-source"][value="${entry.source}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Admin-only: Ensure all category options are available for migration
        if ((isAdminAuth || isAdminAuthAction) && document.getElementById('main-source-selector')) {
            ['荳闊ｬ', '縺ｿ繧馴・繧・, '豌ｴ螳・, '繝上Μ繝溘ヤ'].forEach(source => {
                if (!document.querySelector(`input[name="reg-source"][value="${source}"]`)) {
                    const selector = document.getElementById('main-source-selector');
                    const badgeClassMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
                    const badgeClass = badgeClassMap[source] || 'badge-ippan';
                    const label = document.createElement('label');
                    label.className = 'source-option admin-only temp-option';
                    label.innerHTML = `<input type="radio" name="reg-source" value="${source}" required><span class="source-label"><span class="badge ${badgeClass}">${source}</span></span>`;
                    selector.appendChild(label);
                }
            });
            const sourceGroup = document.getElementById('source-selector-group');
            if (sourceGroup) sourceGroup.classList.remove('hidden');
        }

        // UI Adjustments for Edit Mode
        const hide = (id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        };
        const show = (id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        };

        hide('edit-auth-section');
        hide('registration-result');
        hide('confirmation-section');
        show('registration-form');
        document.getElementById('app-title').textContent = "逋ｻ骭ｲ螟画峩: " + (entry.id || '');
        const submitBtn = document.getElementById('submit-registration');
        if (submitBtn) submitBtn.textContent = "螟画峩繧剃ｿ晏ｭ倥☆繧・;
        
        show('cancel-edit');
        show('registration-card');

        window.scrollTo(0, 0);
        if (typeof checkTimeframe === 'function') checkTimeframe();

        // v8.9.59: Admin destructive buttons in the edit form
        const adminCancelBtn = document.getElementById('admin-cancel-entry-btn');
        const adminRestoreBtn = document.getElementById('admin-restore-entry-btn');
        const adminDeleteBtn = document.getElementById('admin-delete-entry-btn');
        
        const isActuallyAdmin = (isAdminAuth || isAdminAuthAction);

        if (adminCancelBtn) {
            adminCancelBtn.classList.toggle('hidden', !isActuallyAdmin || entry.status === 'cancelled');
            adminCancelBtn.onclick = () => window.cancelEntry(entry.id);
        }
        if (adminRestoreBtn) {
            adminRestoreBtn.classList.toggle('hidden', !isActuallyAdmin || entry.status !== 'cancelled');
            adminRestoreBtn.onclick = () => window.restoreEntry(entry.id);
        }
        if (adminDeleteBtn) {
            adminDeleteBtn.classList.toggle('hidden', !isActuallyAdmin);
            adminDeleteBtn.onclick = () => {
                window.hardDeleteEntry(entry.id).then(() => {
                    window.resetForm();
                    window.switchView(null, 'dashboard-view');
                });
            };
        }

    } catch (e) {
        console.error("BORIJIN: fillFormForEdit failed:", e);
        showToast("繝輔か繝ｼ繝縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
}

function showResult(entry) {
    const hide = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    };
    const show = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    };

    hide('registration-form');
    hide('confirmation-section');
    show('registration-result');
    
    // Safety check and population
    const setResText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
    };

    // v8.6.8: Ensure mapping works even if entry structure varies
    const groupName = entry.groupName || '';
    const regId = entry.id || "逋ｺ陦御ｸｭ...";

    setResText('result-number', regId);
    setResText('res-group-name', groupName);
    
    // Populate Recovery Backup Details (v6.3)
    setResText('res-rep-name', entry.representative || entry.representativeName);
    setResText('res-rep-phone', entry.phone || entry.repPhone);
    setResText('res-rep-email', entry.email || entry.repEmail);
    
    const pList = document.getElementById('res-participant-list');
    if (pList) {
        const participants = entry.participants || [];
        pList.innerHTML = participants.map(p => {
            const genderLabel = genderLabels[p.gender] || '';
            const ageLabel = ageLabels[p.age] || '';
            const typeLabel = p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ';
            const regionText = p.region ? `<span style="font-size:0.8rem; color:#666;">[${p.region}]</span>` : '';
            return `<li style="margin-bottom: 0.3rem;">
                <span style="font-weight: bold;">${p.name}</span> ${regionText} (${genderLabel} / ${ageLabel} / ${p.tshirtSize || '縺ｪ縺・}) - ${typeLabel}
            </li>`;
        }).join('');
    }

    // Screenshot Optimization: Hide the top registration card frame to save space
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.add('hidden');

    // showToast('笨ｨ 逋ｻ骭ｲ螳御ｺ・＠縺ｾ縺励◆・・, 'success');
    window.scrollTo(0, 0);
    updateAppTitle();
}

function resetForm() {
    const form = document.getElementById('registration-form');
    if (form) form.reset();
    
    document.getElementById('edit-entry-id').value = "";
    
    // Explicitly clear key fields for browser compatibility
    ['group-name', 'representative-name', 'rep-phone', 'rep-email', 'rep-email-confirm', 'edit-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    isAdminAuthAction = false; // v8.2.05: Reset action flag on form reset
    
    // Reset radio selection
    const defaultRadio = document.querySelector('input[name="reg-source"][value="荳闊ｬ"]');
    if (defaultRadio) defaultRadio.checked = true;

    const list = document.getElementById('participant-list');
    if (list) {
        list.innerHTML = '';
        addParticipantRow(null, false);
    }

    // Restore the registration card frame
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.remove('hidden');

    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-result').classList.add('hidden');
    document.getElementById('edit-auth-section').classList.add('hidden');
    const editIdInput = document.getElementById('edit-entry-id');
    if (editIdInput) editIdInput.value = '';
    
    document.getElementById('registration-status').classList.add('hidden');
    
    // v8.9.59: Hide admin-only buttons
    const adminCancelBtn = document.getElementById('admin-cancel-entry-btn');
    const adminDeleteBtn = document.getElementById('admin-delete-entry-btn');
    if (adminCancelBtn) adminCancelBtn.classList.add('hidden');
    if (adminDeleteBtn) adminDeleteBtn.classList.add('hidden');

    const submitBtn = document.getElementById('submit-registration');
    if (submitBtn) submitBtn.textContent = "螟ｧ莨壹↓蜿ょ刈繧堤筏縺苓ｾｼ繧";

    updateAppTitle();
    document.getElementById('submit-registration').textContent = "縺薙・蜀・ｮｹ縺ｧ逋ｻ骭ｲ縺吶ｋ";
    
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    
    isAdminAuthAction = false;
    localStorage.removeItem('fishing_app_pending_reg'); // Force clear any pending flags on reset

    // Remove temp admin options if any
    document.querySelectorAll('.temp-option').forEach(el => el.remove());
    // v8.1.24: Clear specialized window state
    const selector = document.getElementById('main-source-selector');
    if (selector) selector.classList.remove('special-window');

    updateSourceAvailability();
    setTimeout(() => window.scrollTo(0, 0), 50); 
}

    // v8.2.12: Old isBypassAllowed logic moved to top

function showStatus(msg, type, noScroll = false) {
    const div = document.getElementById('registration-status');
    div.innerHTML = msg;
    div.className = `alert alert-${type}`;
    div.classList.remove('hidden');
    if (!noScroll) window.scrollTo(0, 0);
}

// Admin / Dashboard
function clearLocalCache() {
    if (!confirm("繝悶Λ繧ｦ繧ｶ縺ｫ菫晏ｭ倥＆繧後※縺・ｋ繧ｭ繝｣繝・す繝･繧貞炎髯､縺励√け繝ｩ繧ｦ繝峨°繧画怙譁ｰ繝・・繧ｿ繧貞・蜿門ｾ励＠縺ｾ縺吶°・歃n・育樟蝨ｨ騾∽ｿ｡荳ｭ縺ｮ繝・・繧ｿ縺後≠繧句ｴ蜷医・螟ｱ繧上ｌ繧句庄閭ｽ諤ｧ縺後≠繧翫∪縺呻ｼ・)) {
        return;
    }
    localStorage.removeItem('fishing_app_v3_data');
    localStorage.removeItem('fishing_app_pending_reg');
    showToast("繧ｭ繝｣繝・す繝･繧偵け繝ｪ繧｢縺励∪縺励◆縲ょ・隱ｭ縺ｿ霎ｼ縺ｿ縺励∪縺・..", "info");
    setTimeout(() => location.reload(), 1000);
}

/**
 * v8.1.67: Unified Dashboard Update (Globally exposed)
 */
window.updateDashboard = function() {
    try {
        if (!state || !state.entries) return;

        const fishersIppan = sumCategoryFishers('荳闊ｬ');
        const fishersMintsuri = sumCategoryFishers('縺ｿ繧馴・繧・);
        const fishersSuiho = sumCategoryFishers('豌ｴ螳・);
        const fishersHarimitsu = sumCategoryFishers('繝上Μ繝溘ヤ');

        const observersIppan = sumCategoryObservers('荳闊ｬ');
        const observersMintsuri = sumCategoryObservers('縺ｿ繧馴・繧・);
        const observersSuiho = sumCategoryObservers('豌ｴ螳・);
        const observersHarimitsu = sumCategoryObservers('繝上Μ繝溘ヤ');

        const totalFishers = fishersIppan + fishersMintsuri + fishersSuiho + fishersHarimitsu;
        const totalObservers = observersIppan + observersMintsuri + observersSuiho + observersHarimitsu;
        const checkedInCount = state.entries.filter(e => e.status === 'checked-in').length;
        const absentCount = state.entries.filter(e => e.status === 'absent').length;
        const validEntriesCount = state.entries.filter(e => e.status !== 'cancelled').length;

        // Global Stats Summary Cards (v5.4 Compact)
        renderGlobalStatsSummary(validEntriesCount, totalFishers, totalObservers, checkedInCount, absentCount);

        // Email count
        updateBulkMailCount();

        // Splits
        updateSplitUI('ippan', fishersIppan, state.settings.capacityGeneral, observersIppan);
        updateSplitUI('mintsuri', fishersMintsuri, state.settings.capacityMintsuri, observersMintsuri);
        updateSplitUI('suiho', fishersSuiho, state.settings.capacitySuiho, observersSuiho);
        updateSplitUI('harimitsu', fishersHarimitsu, state.settings.capacityHarimitsu, observersHarimitsu);

        // v7.3 & v8.1.7: Update Share URLs in Dashboard Settings (User Requirements Match)
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        const isLocalFile = window.location.protocol === 'file:';

        // Add local file warning to UI if necessary
        const warningContainer = document.getElementById('local-file-warning');
        if (warningContainer) {
            warningContainer.innerHTML = isLocalFile ? `
                <div class="alert alert-warning no-print mb-4">
                    <strong>縲舌＃豕ｨ諢上・/strong> 迴ｾ蝨ｨ繝ｭ繝ｼ繧ｫ繝ｫ繝輔ぃ繧､繝ｫ縺ｨ縺励※螳溯｡後＆繧後※縺・∪縺吶ょ魂蛻ｷ縺輔ｌ繧飢R繧ｳ繝ｼ繝峨・縲√％縺ｮPC蜀・ｒ謖・☆縺溘ａ繧ｹ繝槭・縺ｧ縺ｯ隱ｭ縺ｿ蜿悶ｌ縺ｾ縺帙ｓ縲・
                    譛ｬ逡ｪ迺ｰ蠅・ｼ・itHub Pages遲会ｼ峨↓繧｢繝・・繝ｭ繝ｼ繝峨☆繧九→縲√せ繝槭・縺九ｉ驥｣譫懷ｱ蜻翫′縺ｧ縺阪ｋ繧医≧縺ｫ縺ｪ繧翫∪縺吶・
                </div>
            ` : '';
        }

        // 1. Main Public URL
        const mainUrlEl = document.getElementById('public-share-url');
        if (mainUrlEl) mainUrlEl.value = baseUrl;

        // 2. Registry Links (src param)
        const sourceMap = {
            'ippan-reg': 'ippan',
            'mintsuri-reg': 'mintsuri',
            'harimitsu-reg': 'harimitsu',
            'suiho-reg': 'suiho'
        };
        Object.entries(sourceMap).forEach(([idSuffix, srcKey]) => {
            const el = document.getElementById(`url-${idSuffix}`);
            if (el) el.value = `${baseUrl}${srcKey === 'ippan' ? '' : `?src=${srcKey}`}`;
        });

        // 3. Coordinator & Entry Tools (view param)
        const leaderEl = document.getElementById('url-leader-input');
        if (leaderEl) leaderEl.value = `${baseUrl}?view=leader-entry`;

        const mintsuriAdminEl = document.getElementById('url-mintsuri-admin');
        if (mintsuriAdminEl) mintsuriAdminEl.value = `${baseUrl}?view=mintsuri-coordinator-view`;

        const statsUrlEl = document.getElementById('url-stats');
        if (statsUrlEl) statsUrlEl.value = `${baseUrl}?view=stats`;

        // Dashboard List Rendering (Fixed & Cleaned v7.3.0)
        const list = document.getElementById('entry-list');
        const searchInput = document.getElementById('dashboard-search');
        if (!list || !searchInput) {
            console.warn("Dashboard elements not found, skipping update.");
            return;
        }
        const searchTerm = searchInput.value.toLowerCase();
        
        // v7.9.8: Save scroll position before update
        const scrollPos = window.scrollY;
        
        let html = '';
        const sortedEntries = state.entries.slice().sort((a, b) => {
            let valA, valB;
            switch(currentSortField) {
                case 'id': valA = a.id; valB = b.id; break;
                case 'source': valA = a.source; valB = b.source; break;
                case 'groupName': valA = a.groupName; valB = b.groupName; break;
                case 'representative': valA = a.representative; valB = b.representative; break;
                case 'status': valA = a.status; valB = b.status; break;
                case 'time': 
                    const parseTime = (s) => {
                        if (!s) return 0;
                        // Handle "5/13 11:01" or "2026/05/13 11:01"
                        const parts = s.split(/[\/\s:]+/);
                        if (parts.length < 4) return new Date(s).getTime() || 0;
                        const year = parts[0].length === 4 ? parseInt(parts[0]) : 2026;
                        const month = parts[0].length === 4 ? parseInt(parts[1]) : parseInt(parts[0]);
                        const day = parts[0].length === 4 ? parseInt(parts[2]) : parseInt(parts[1]);
                        const hour = parts[0].length === 4 ? parseInt(parts[3]) : parseInt(parts[2]);
                        const min = parts[0].length === 4 ? parseInt(parts[4]) : parseInt(parts[3]);
                        return new Date(year, month - 1, day, hour, min).getTime();
                    };
                    valA = parseTime(a.timestamp); 
                    valB = parseTime(b.timestamp); 
                    break;
                case 'score': 
                    valA = (a.participants || []).reduce((s, p) => s + parseInt(p.catchA || 0) + (parseInt(p.catchB || 0) * 2), 0);
                    valB = (b.participants || []).reduce((s, p) => s + parseInt(p.catchA || 0) + (parseInt(p.catchB || 0) * 2), 0);
                    break;
                default: valA = a.timestamp; valB = b.timestamp;
            }
            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        sortedEntries.forEach(e => {
            // v8.1.58: Comprehensive Safety Guard for missing participants
            const pArray = e.participants || [];
            
            // Search logic using pArray
            const pNames = pArray.map(p => p.name).join(' ');
            const pRegions = pArray.map(p => p.region || "").join(' ');
            const pTshirts = pArray.map(p => p.tshirtSize || "").join(' ');
            const pGenders = pArray.map(p => p.gender ? genderLabels[p.gender] || "" : "").join(' ');
            
            const combinedParticipantInfo = (pNames + " " + pRegions + " " + pTshirts + " " + pGenders).toLowerCase();
            const searchTermLower = searchTerm.toLowerCase();
            
            const safeId = e.id || "譛ｪ謗｡逡ｪ";
            const matchesEntrySearch = safeId.toLowerCase().includes(searchTermLower) || 
                                     (e.groupName && e.groupName.toLowerCase().includes(searchTermLower)) || 
                                     (e.representative && e.representative.toLowerCase().includes(searchTermLower));
            
            const matchesParticipantSearch = combinedParticipantInfo.includes(searchTermLower);

            if (!matchesEntrySearch && !matchesParticipantSearch) return;
            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const badgeMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
            const statusLabel = e.status === 'checked-in' ? '笨・蜿玲ｸ・ : e.status === 'absent' ? '笶・谺蟶ｭ' : e.status === 'cancelled' ? '圻 辟｡蜉ｹ' : '竢ｳ 譛ｪ蜿嶺ｻ・;
            const rowClass = e.status === 'cancelled' ? 'row-cancelled' : (e.status === 'checked-in' ? 'row-checked-in' : '');

            const rep = pArray[0] || { name: e.representative, nickname: '', gender: '' };
            const getGenderMark = (p) => p.gender === 'male' ? '笙・ : (p.gender === 'female' ? '笙' : '');
            
            const pSummary = `
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0.95rem;">
                    <strong style="font-weight:800; color:var(--text-color);">${rep.name}</strong>${rep.nickname ? `<small>(${rep.nickname})</small>` : ''}${getGenderMark(rep)}
                    <span style="color:#64748b; font-size:0.8rem; margin-left:4px;">
                        ${pArray.length > 1 ? `+ ${pArray.slice(1).map(p => p.name).join(', ')}` : ''}
                    </span>
                </div>
            `;

            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';

            let groupPoints = 0;
            const ikesuNames = new Set();
            pArray.forEach(p => {
                const pA = parseInt(p.catchA || 0);
                const pB = parseInt(p.catchB || 0);
                groupPoints += (pA * 2) + pB;
                if (p.ikesuId) {
                    const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                    if (ik) ikesuNames.add(ik.name);
                }
            });
            const ikesuDisplay = Array.from(ikesuNames).join(', ') || '-';

            html += `
                <tr class="${rowClass}">
                    <td><span class="id-badge" style="white-space:nowrap;">${e.id}</span></td>
                    <td><span class="badge ${badgeMap[e.source] || 'badge-ippan'}" style="white-space:nowrap;">${e.source}</span></td>
                    <td><div style="font-weight:800; max-width:8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${e.status === 'cancelled' ? 'text-decoration:line-through' : ''}" title="${e.groupName}${e.memo ? `\n\n縲仙ｙ閠・曾n${e.memo}` : ''}">${e.groupName}${e.memo ? ' 統' : ''}</div></td>
                    <td>${pSummary}</td>
                    <td><small style="white-space:nowrap;">${e.fishers} / ${e.observers}</small></td>
                    <td><small style="white-space:nowrap;">${ikesuDisplay}</small></td>
                    <td><span style="font-size:0.75rem; font-weight:700; white-space:nowrap;">${statusLabel}</span></td>
                    <td><small style="white-space:nowrap;">${regTime}</small></td>
                    <td class="no-print">
                        <div style="display:flex; gap:0.2rem; flex-wrap: nowrap; width: auto; align-items:center;">
                            <button class="btn-outline btn-small btn-detail" onclick="showEntryDetails('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">遒ｺ隱・/button>
                            <button class="btn-outline btn-small" onclick="requestAdminEdit('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">菫ｮ豁｣</button>
                            <button class="btn-primary btn-small ${e.status === 'checked-in' ? 'active' : ''}" onclick="quickCheckIn('${e.id}')" ${e.status === 'cancelled' ? 'disabled' : ''} style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">蜿嶺ｻ・/button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        if (!html) {
            const hasFilter = searchTerm || dashboardFilter !== 'all';
            const msg = hasFilter ? '隧ｲ蠖薙☆繧九ョ繝ｼ繧ｿ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・ : '逋ｻ骭ｲ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ縲・;
            html = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-muted);">${msg}</td></tr>`;
        }
        
        list.innerHTML = html;
        window.scrollTo(0, scrollPos);

    } catch (e) {
        console.error("Dashboard update failed:", e);
    }
}

/**
 * --- v8.0.0 & v8.1.7: FIXED DASHBOARD NAVIGATION ---
 * Core function to handle admin sub-tab switching
 */
function switchAdminTab(tabId) {
    if (!tabId) return;
    
    // v8.1.55: Validation check for tab content existence
    if (!document.getElementById(tabId)) {
        console.warn("Target tab not found, falling back to tab-list:", tabId);
        tabId = 'tab-list';
    }

    currentAdminTab = tabId;
    sessionStorage.setItem('currentAdminTab', tabId);

    // 1. Update Navigation Button States
    // v8.1.75: Reset dashboard filter to 'all' when switching back to the main list to prevent blank screens
    if (tabId === 'tab-list') {
        dashboardFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
        });
    }

    // v8.1.74: Clear search boxes when switching sub-tabs to prevent blank list issues
    if (typeof window.clearSearchBoxes === 'function') window.clearSearchBoxes();

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // 2. Toggle Visibility of Tab Contents
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });

    // 3. Trigger Specific View Renderers (Ensure lazy loading)
    if (tabId === 'tab-list') (typeof window.updateDashboard === 'function') && window.updateDashboard();
    if (tabId === 'tab-ikesu') (typeof window.renderIkesuWorkspace === 'function') && window.renderIkesuWorkspace();
    if (tabId === 'tab-rankings') (typeof window.renderRankings === 'function') && window.renderRankings();
    if (tabId === 'tab-print') {
        // v8.3.26: Small delay to ensure tab is visible before rendering
        setTimeout(() => {
            (typeof window.updatePrintView === 'function') && window.updatePrintView();
        }, 50);
    }
    if (tabId === 'tab-logs' || tabId === 'tab-settings') (typeof window.renderChangeLog === 'function') && window.renderChangeLog();
    if (tabId === 'tab-stats') (typeof window.renderBreakdownStats === 'function') && window.renderBreakdownStats('all', '');
}

/**
 * v8.4.15: Unified Print Layout Manager
 */
window.updatePrintView = function() {
    try {
        const mode = document.querySelector('input[name="print-mode"]:checked')?.value || 'ikesu';
        if (mode === 'group') {
            window.renderGroupPrintView();
        } else if (mode === 'result') {
            window.renderIkesuResultView();
        } else {
            window.renderIkesuPrintView();
        }
    } catch (err) {
        console.error("Print View Error:", err);
        const container = document.getElementById('print-view-container');
        if (container) container.innerHTML = `<div class="alert alert-danger">陦ｨ遉ｺ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: ${err.message}</div>`;
    }
};

/**
 * Renders the printable member list view organized by ikesu (Globally exposed)
 */
window.renderIkesuPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.entries || state.entries.length === 0) {
        container.innerHTML = `<div class="alert alert-info">蜷咲ｰｿ繝・・繧ｿ繧定ｪｭ縺ｿ霎ｼ繧薙〒縺・∪縺吶ゅ＠縺ｰ繧峨￥縺雁ｾ・■縺上□縺輔＞...</div>`;
        return;
    }

    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = `<div class="alert alert-warning">繧､繧ｱ繧ｹ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ縲・/div>`;
        return;
    }

    let html = '';
    state.settings.ikesuList.forEach(ik => {
        const participants = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.ikesuId === ik.id) {
                    participants.push({ ...p, groupId: e.id, groupName: e.groupName });
                }
            });
        });

        if (participants.length === 0) return;

        html += `
            <div class="print-page ikesu-sheet" style="background:white; padding:1rem; border:1px solid #eee; margin-bottom: 2rem; page-break-after: always; color: black;">
                <div style="display: flex; align-items: flex-end; border-bottom: 5px solid #000; padding-bottom: 0.3rem; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: baseline; gap: 4px; min-width: 180px;">
                        <span style="font-size: 3.5rem; font-weight: 900; line-height: 1;">${ik.name.replace('繧､繧ｱ繧ｹ','')}</span>
                        <span style="font-size: 1rem; font-weight: 700; color: #333;">繧､繧ｱ繧ｹ</span>
                    </div>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: baseline; gap: 10px; margin-bottom: 5px;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: #666; background: #eee; padding: 2px 6px; border-radius: 4px;">繧､繧ｱ繧ｹ繝ｪ繝ｼ繝繝ｼ</span>
                        <span style="font-size: 1.8rem; font-weight: 900; color: #000;">${participants.find(p => p.isLeader)?.name || '譛ｪ險ｭ螳・} 讒・/span>
                    </div>
                    <div style="text-align: right; font-size: 0.8rem; min-width: 180px;">
                        <div style="font-weight: 700; font-size: 1rem; color: #666;">繧､繧ｱ繧ｹ 繝｡繝ｳ繝舌・陦ｨ</div>
                        <div>蜊ｰ蛻ｷ譌･: ${new Date().toLocaleDateString()} | 莠ｺ謨ｰ: ${participants.length} 蜷・/div>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 3px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 1.1rem; height: 3.5rem;">
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 45px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 180px; text-align: center;">繧ｰ繝ｫ繝ｼ繝怜錐</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; text-align: center;">豌丞錐</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 60px; text-align: center;">諤ｧ蛻･</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 80px; text-align: center;">T繧ｷ繝｣繝・/th>
                            <th style="border: 1px solid #000; padding: 0.4rem; min-width: 120px; text-align: center;">蛯呵・/th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map((p, idx) => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-size: 1.2rem;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-size: 1.1rem;">${p.groupName}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-weight: 900; font-size: 1.5rem;">
                                    ${p.name} ${p.nickname ? `<span style="font-size:0.9rem; font-weight:normal;">(${p.nickname})</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-size: 1.1rem;">${genderLabels[p.gender] || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-weight: bold; font-size: 1.3rem;">${p.tshirtSize || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: left; font-weight: bold; font-size: 1rem; color: ${p.isLeader ? '#d32f2f' : 'inherit'};">
                                    ${p.isLeader ? '笘・Μ繝ｼ繝繝ｼ' : ''}
                                    ${p.type === 'observer' ? '・郁ｦ句ｭｦ閠・ｼ・ : ''}
                                </td>
                            </tr>
                        `).join('')}
                        ${[1, 2, 3].map(n => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; color: #ccc;">${participants.length + n}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html || '<p class="text-muted p-4">蟇ｾ雎｡閠・′縺・∪縺帙ｓ縲・/p>';
};

/**
 * v8.3.22: Ikesu-based results recording sheet (Globally exposed)
 */
window.renderIkesuResultView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = `<div class="alert alert-warning">繧､繧ｱ繧ｹ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ縲・/div>`;
        return;
    }

    const baseUrl = window.location.href.split('?')[0].replace('index.html', '');
    const leaderUrl = baseUrl.includes('http') ? baseUrl.replace('/蜿嶺ｻ・fishing-entry-app/', '/驥｣譫・fishing-results-app/') : baseUrl + '../../驥｣譫・fishing-results-app/index.html';
    const isLocalFile = window.location.protocol === 'file:';

    let html = isLocalFile ? `
        <div class="alert alert-warning no-print mb-4">
            <strong>縲舌＃豕ｨ諢上・/strong> 迴ｾ蝨ｨ繝ｭ繝ｼ繧ｫ繝ｫ繝輔ぃ繧､繝ｫ縺ｨ縺励※螳溯｡後＆繧後※縺・∪縺吶ょ魂蛻ｷ縺輔ｌ繧飢R繧ｳ繝ｼ繝峨・縲√％縺ｮPC蜀・ｒ謖・☆縺溘ａ繧ｹ繝槭・縺ｧ縺ｯ隱ｭ縺ｿ蜿悶ｌ縺ｾ縺帙ｓ縲・
        </div>
    ` : '';
    
    state.settings.ikesuList.forEach((ik, idx) => {
        const participants = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.ikesuId === ik.id && p.type === 'fisher') {
                    participants.push({ ...p, groupName: e.groupName });
                }
            });
        });

        if (participants.length === 0) return;

        html += `
            <div class="print-page result-sheet" style="background:white; padding:1.2rem; border:1px solid #eee; margin-bottom: 2rem; page-break-after: always; color: black; position: relative;">
                <div style="display: flex; align-items: center; border-bottom: 5px solid #000; padding-bottom: 0.5rem; margin-bottom: 1.2rem;">
                    <div style="display: flex; align-items: baseline; gap: 4px; min-width: 150px; flex-shrink: 0;">
                        <span style="font-size: 3.5rem; font-weight: 900; line-height: 1;">${(ik.name || "").replace('繧､繧ｱ繧ｹ','')}</span>
                        <span style="font-size: 1rem; font-weight: 800; color: #333;">繧､繧ｱ繧ｹ</span>
                    </div>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: baseline; gap: 10px; padding: 0 10px;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: #666; background: #eee; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">繧､繧ｱ繧ｹ繝ｪ繝ｼ繝繝ｼ</span>
                        <span style="font-size: 1.8rem; font-weight: 900; color: #000; white-space: nowrap;">${participants.find(p => p.isLeader)?.name || '譛ｪ險ｭ螳・} 讒・/span>
                    </div>
                    <div style="text-align: right; min-width: 280px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end;">
                        <div style="font-weight: 800; font-size: 1rem; color: #666; margin-bottom: 6px;">繧､繧ｱ繧ｹ 驥｣譫懆ｨ伜・陦ｨ</div>
                        <div style="display: flex; gap: 10px; align-items: center; border: 3px solid #000; padding: 5px; background: #fff;">
                             <div id="qr-ikesu-${idx}" style="width: 100px; height: 100px; flex-shrink: 0; background: #fff;"></div>
                             <div style="text-align: left; line-height: 1.1; min-width: 80px;">
                                 <div style="font-size: 0.75rem; font-weight: bold; color: #666;">WEB蝣ｱ蜻顔畑</div>
                                 <div style="font-size: 0.7rem; font-weight: bold; color: #666; margin-top: 4px;">證苓ｨｼ逡ｪ蜿ｷ</div>
                                 <div style="font-size: 2rem; font-weight: 900; color: #d32f2f;">${ik.passcode || '----'}</div>
                             </div>
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem;">
                    <div style="font-size: 0.9rem; font-weight: bold; color: #d32f2f;">窶ｻ蛹ｹ謨ｰ・域焚蟄暦ｼ峨〒險伜・縺励※縺上□縺輔＞</div>
                    <div style="font-size: 0.8rem; color: #666;">逕滓・譌･: ${new Date().toLocaleString()} | 驥｣蝣縺ｾ縺､繧・邂｡逅・す繧ｹ繝・Β</div>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 3px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; table-layout: fixed;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 1.1rem; height: 3.5rem;">
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 45px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 160px; text-align: center;">繧ｰ繝ｫ繝ｼ繝怜錐</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; text-align: center;">豌丞錐</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 95px; background: #ffebee !important; color: #d32f2f !important; text-align: center;">魃帙・縺昴・莉・/th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 95px; background: #e3f2fd !important; color: #1976d2 !important; text-align: center;">髱堤黄</th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 140px; background: #e8f5e9 !important; color: #388e3c !important; text-align: center;">蛯呵・/th>
                            <th style="border: 1px solid #000; padding: 0.4rem; width: 60px; color: #000 !important; background: #f8f9fa !important; text-align: center;">蟆剰ｨ・/th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map((p, pIdx) => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; background: #f0f0f0; font-weight: bold; font-size: 1.2rem;">${pIdx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-size: 1rem; font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${p.groupName}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-weight: 900; font-size: 1.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${p.name} ${p.nickname ? `<span style="font-size:0.9rem; font-weight:normal;">(${p.nickname})</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; background: #fafafa;"></td>
                            </tr>
                        `).join('')}
                        ${[1, 2, 3].map(n => `
                            <tr style="height: 3.2rem; background: #fff;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; background: #f0f0f0; font-weight: bold; font-size: 1.2rem;">${participants.length + n}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; background: #fafafa;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html;

    if (typeof QRCode !== 'undefined') {
        state.settings.ikesuList.forEach((ik, idx) => {
            const qrEl = document.getElementById(`qr-ikesu-${idx}`);
            if (qrEl) {
                try {
                    new QRCode(qrEl, {
                        text: leaderUrl,
                        width: 100,
                        height: 100,
                        correctLevel: QRCode.CorrectLevel.M,
                        useSVG: true
                    });
                } catch (e) { console.error("QR Error:", e); }
            }
        });
    }
};

// v8.9.85: Ranking Config Persistence
window.saveRankingSettings = function() {
    const topCount = parseInt(document.getElementById('rank-top-count')?.value) || 3;
    const tobiList = document.getElementById('rank-tobi-list')?.value || "5,10,15,20,25,30";
    
    state.settings.rankingConfig = { topCount, tobiList };
    state.lastUpdated = Date.now();
    showToast("繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆", "success");
    saveData(); // Sync to cloud
};
/**
 * v8.1.66: Group-based printing (1 page per group for prize prep)
 */
window.renderGroupPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;

    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    if (validEntries.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">逋ｻ骭ｲ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ縲・/p>';
        return;
    }

    let html = '';
    const sorted = [...validEntries].sort((a,b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
    
    sorted.forEach((e, entryIdx) => {
        const pArray = e.participants || [];
        const isLast = entryIdx === sorted.length - 1;
        
        html += `
            <div class="print-page group-sheet" style="background:white; padding:1.2rem; border:1px solid #eee; margin-bottom: 1rem; ${isLast ? '' : 'page-break-after: always;'} color: black;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #000; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    <div>
                        <div style="font-size: 1rem; font-weight: bold; margin-bottom: 0.2rem;">[${e.source}]</div>
                        <h1 style="margin:0; font-size: 2rem;">${e.groupName}</h1>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.2rem; font-weight: bold; border: 3px solid #000; padding: 0.3rem 0.8rem;">${e.id}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="border: 2px solid #000; padding: 0.6rem;">
                        <div style="font-size: 0.8rem; border-bottom: 1px solid #000; margin-bottom: 0.3rem;">莉｣陦ｨ閠・/div>
                        <div style="font-size: 1.2rem; font-weight: bold;">${e.representative} 讒・/div>
                    </div>
                    <div style="border: 2px solid #000; padding: 0.6rem;">
                        <div style="font-size: 0.8rem; border-bottom: 1px solid #000; margin-bottom: 0.3rem;">蜷郁ｨ井ｺｺ謨ｰ</div>
                        <div style="font-size: 1.2rem; font-weight: bold;">驥｣繧・ ${e.fishers}蜷・/ 隕句ｭｦ: ${e.observers}蜷・/div>
                    </div>
                </div>

                <h3 style="background: #000; color: white; padding: 0.4rem 0.8rem; margin-bottom: 0.8rem; font-size: 1rem;">蜿ょ刈閠・・T繧ｷ繝｣繝・し繧､繧ｺ 荳隕ｧ</h3>
                <table style="width: 100%; border-collapse: collapse; border: 3px solid #000;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 1.1rem; height: 3.5rem;">
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 45px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; padding: 0.5rem; text-align: center;">豌丞錐</th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 150px; text-align: center;">T繧ｷ繝｣繝・/th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 100px; text-align: center;">蛹ｺ蛻・/th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pArray.map((p, idx) => `
                        <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.2rem;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; font-size: 1.5rem; font-weight: 900;">
                                    ${p.name} ${p.nickname ? `<span style="font-size:0.9rem; font-weight:normal;">(${p.nickname})</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.3rem; font-weight: 900;">${p.tshirtSize || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.1rem;">${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}</td>
                            </tr>
                        `).join('')}
                        ${[1, 2, 3].map(n => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.2rem; color: #ccc;">${pArray.length + n}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html;
};

window.setParticipantAsLeader = function(entryId, partIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;
    entry.participants.forEach(p => p.isLeader = false);
    entry.participants[partIdx].isLeader = true;
    saveData();
    renderIkesuWorkspace();
    showToast(`${entry.participants[partIdx].name} 讒倥ｒ繝ｪ繝ｼ繝繝ｼ縺ｫ險ｭ螳壹＠縺ｾ縺励◆`, 'info');
};

let currentDayTab = 'tab-day-reception';
window.switchDayTab = function(tabId) {
    if (!tabId) return;
    currentDayTab = tabId;
    document.querySelectorAll('.day-tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId));
    document.querySelectorAll('.day-tab-content').forEach(content => content.classList.toggle('active', content.id === tabId));
    if (tabId === 'tab-day-reception') updateReceptionList();
    if (tabId === 'tab-day-results') renderDayResults();
    if (tabId === 'tab-day-rankings') { renderRankings(); renderBreakdownStats('all', 'day-'); }
    if (tabId === 'tab-day-awards') renderAwardsPreview();
};

window.renderDayResults = function() {
    const list = document.getElementById('day-results-list');
    if (!list) return;
    let html = '';
    let totalFish = 0;
    let caughtCount = 0;
    let zeroCount = 0;
    let fisherCount = 0;

    state.entries.filter(e => e.status !== 'cancelled').forEach(entry => {
        (entry.participants || []).forEach((p, pIdx) => {
            if (p.type !== 'fisher') return;
            fisherCount++;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const sum = cA + cB;
            const total = cA + (cB * 2);
            totalFish += sum;
            
            if (sum > 0) caughtCount++;
            else zeroCount++;

            const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
            html += `<tr>
                <td><span class="id-badge">${entry.id}</span></td>
                <td><small>${ik ? ik.name : '-'}</small></td>
                <td style="font-weight:bold;">${p.name}</td>
                <td style="text-align:center;">${cA}</td>
                <td style="text-align:center;">${cB}</td>
                <td style="text-align:center; font-weight:900;">${total}pt <small>(${sum}蛹ｹ)</small></td>
                <td class="no-print"><button class="btn-outline btn-small" onclick="openDayCatchEditModal('${entry.id}', ${pIdx})">邱ｨ髮・/button></td>
            </tr>`;
        });
    });

    // Update summary in header
    const header = document.querySelector('#tab-day-results .card-header h2');
    if (header) {
        let statsBox = document.getElementById('day-results-summary-stats');
        if (!statsBox) {
            statsBox = document.createElement('div');
            statsBox.id = 'day-results-summary-stats';
            statsBox.style.cssText = "font-size:0.85rem; color:#64748b; margin-top:0.2rem; font-weight:normal;";
            header.parentElement.appendChild(statsBox);
        }
        statsBox.innerHTML = `蜈ｨ菴灘粋險・ <strong>${totalFish}蛹ｹ</strong> (${totalFish * 1.0 / (fisherCount || 1).toFixed(1)}/莠ｺ) | 驥｣譫懊≠繧・ ${caughtCount}蜷・/ 蝮贋ｸｻ: <span style="color:#ef4444">${zeroCount}蜷・/span>`;
    }

    list.innerHTML = html || '<tr><td colspan="7" class="text-center p-4">驥｣譫懊ョ繝ｼ繧ｿ縺ｪ縺・/td></tr>';
};

window.openDayCatchEditModal = function(entryId, pIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    currentDayEdit = { entryId, pIdx };
    document.getElementById('day-edit-p-name').textContent = `${entry.participants[pIdx].name} 縺ｮ驥｣譫懃ｷｨ髮・;
    document.getElementById('day-input-cA').value = entry.participants[pIdx].catchA || 0;
    document.getElementById('day-input-cB').value = entry.participants[pIdx].catchB || 0;
    document.getElementById('day-catch-edit-modal').classList.remove('hidden');
};

window.closeDayModal = function() { document.getElementById('day-catch-edit-modal').classList.add('hidden'); currentDayEdit = null; };
window.changeDayValue = function(type, delta) {
    const el = document.getElementById('day-input-c' + type);
    el.value = Math.max(0, parseInt(el.value) + delta);
};
window.saveDayCatch = async function() {
    if (!currentDayEdit) return;
    const entry = state.entries.find(e => e.id === currentDayEdit.entryId);
    const p = entry.participants[currentDayEdit.pIdx];
    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;
    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;
    saveStateToLocalStorage();
    renderDayResults();
    renderRankings();
    closeDayModal();
    await saveData();
};

window.renderRankings = function() {
    const indList = document.getElementById('ranking-individual-list');
    const dayIndList = document.getElementById('day-ranking-individual-list');
    const ikList = document.getElementById('ranking-ikesu-list');
    const dayIkList = document.getElementById('day-ranking-ikesu-list');
    const awardFilterBtn = document.getElementById('award-filter-btn');
    const onlyAwards = awardFilterBtn && awardFilterBtn.classList.contains('active');

    let individuals = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach((p, pIdx) => {
            if (!p || p.type === 'observer') return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const points = cA + (cB * 2);
            const totalFish = cA + cB;
            individuals.push({ id: e.id, pIdx, name: p.name, group: e.groupName, points, cA, cB, totalFish, isAwardWinner: !!p.isAwardWinner });
            if (p.ikesuId) {
                const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                if (ik) individuals[individuals.length - 1].ikesu = ik.name;
            }
        });
    });

    individuals.sort((a, b) => b.points - a.points || b.cA - a.cA);
    if (onlyAwards) individuals = individuals.filter(p => p.isAwardWinner);

    const rankingHtml = individuals.length > 0 ? individuals.slice(0, 100).map((p, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        const awardClass = p.isAwardWinner ? 'award-winner-row' : '';
        const awardStar = p.isAwardWinner ? '醇' : '笘・;
        
        return `
            <div class="ranking-card compact-rank ${rankClass} ${awardClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name" style="font-size:0.95rem;">${p.name} <span class="award-toggle" onclick="toggleAwardWinner('${p.id}', ${p.pIdx})">${awardStar}</span></div>
                    <div class="ranking-subtext">${p.group} / ${p.ikesu || '-'}</div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val" style="font-size:1.2rem;">${p.points}</span><span class="rank-unit">pt</span>
                    <div style="font-size:0.65rem; color:#64748b; margin-top:-2px;">${p.totalFish}蛹ｹ (魃・${p.cA}/髱・${p.cB})</div>
                </div>
            </div>
        `;
    }).join('') : '<div class="p-8 text-center text-muted" style="border: 2px dashed #eee; border-radius: 12px;">蛟倶ｺｺ縺ｮ驥｣譫懊ョ繝ｼ繧ｿ縺後∪縺縺ゅｊ縺ｾ縺帙ｓ</div>';

    if (indList) indList.innerHTML = rankingHtml;
    if (dayIndList) dayIndList.innerHTML = rankingHtml;
};

window.toggleAwardWinner = async function(entryId, pIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    
    const p = entry.participants[pIdx];
    p.isAwardWinner = !p.isAwardWinner;
    
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    renderRankings();
    
    try { await syncToCloud(); } catch(e) {}
};

window.toggleAwardFilter = function() {
    const btn = document.getElementById('award-filter-btn');
    if (!btn) return;
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
        btn.style.background = '#f1c40f';
        btn.style.color = '#fff';
    } else {
        btn.style.background = '';
        btn.style.color = '';
    }
    renderRankings();
};




// 3. Print View
// (renderIkesuPrintView logic is now integrated into core switchAdminTab)

// v7.6.3: Restored missing helper functions
function sumCategoryFishers(category) {
    if (!state.entries) return 0;
    const dbCount = state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => sum + (parseInt(e.fishers) || 0), 0);
    
    // v8.4.2 & v8.9.59: Add manual adjustment (Try DOM first for real-time sync, then state)
    let adj = 0;
    if (category === '豌ｴ螳・) {
        const el = document.getElementById('adj-suiho-fishers');
        adj = el ? (parseInt(el.value) || 0) : parseInt(state.settings.adjSuihoFishers || 0);
    }
    if (category === '繝上Μ繝溘ヤ') {
        const el = document.getElementById('adj-harimitsu-fishers');
        adj = el ? (parseInt(el.value) || 0) : parseInt(state.settings.adjHarimitsuFishers || 0);
    }
    return dbCount + adj;
}

function sumCategoryObservers(category) {
    if (!state.entries) return 0;
    const dbCount = state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => sum + (parseInt(e.observers) || 0), 0);

    // v8.4.2: Add manual adjustment
    let adj = 0;
    if (category === '豌ｴ螳・) adj = parseInt(state.settings.adjSuihoObservers || 0);
    if (category === '繝上Μ繝溘ヤ') adj = parseInt(state.settings.adjHarimitsuObservers || 0);
    return dbCount + adj;
}

function updateSplitUI(prefix, current, max, observers) {
    const currEl = document.getElementById(`curr-${prefix}`);
    const maxEl = document.getElementById(`max-${prefix}`);
    const obsEl = document.getElementById(`${prefix}-observers`);
    const progEl = document.getElementById(`prog-${prefix}`);

    if (currEl) currEl.textContent = current;
    if (maxEl) maxEl.textContent = max;
    if (obsEl) obsEl.textContent = observers;
    
    if (progEl) {
        const percent = max > 0 ? Math.min(100, (current / max) * 100) : 0;
        progEl.style.width = `${percent}%`;
    }
}

// v7.6.6: Generalize stats for category filtering and target prefixes
function renderBreakdownStats(filterSource = 'all', prefix = '') {
    const validEntries = state.entries.filter(e => {
        if (e.status === 'cancelled') return false;
        if (filterSource !== 'all' && e.source !== filterSource) return false;
        return true;
    });

    const ageCount = {};
    const genderCount = { 'male': 0, 'female': 0, 'other': 0 };
    const regionCount = {};

    validEntries.forEach(e => {
        (e.participants || []).forEach(p => {
            if (p.age) ageCount[p.age] = (ageCount[p.age] || 0) + 1;
            if (p.gender) genderCount[p.gender] = (genderCount[p.gender] || 0) + 1;
            if (p.region) regionCount[p.region] = (regionCount[p.region] || 0) + 1;
        });
    });

    // Render Age
    const ageList = document.getElementById(prefix + 'age-breakdown-list');
    if (ageList) {
        ageList.innerHTML = Object.entries(ageCount)
            .sort((a,b) => {
                const order = Object.keys(ageLabels);
                return order.indexOf(a[0]) - order.indexOf(b[0]);
            })
            .map(([age, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${ageLabels[age] || age}</span>
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
    }

    // v7.8.5: Check for suspicious T-shirt sizes (Adults with 140) in current view
    if (prefix === '') { // Only run for global stats
        checkTshirtSizeAnomalies(validEntries);
    }

    // Render Genders
    const genderList = document.getElementById(prefix + 'gender-breakdown-list');
    if (genderList) {
        genderList.innerHTML = Object.entries(genderCount)
            .filter(([_, count]) => count > 0)
            .map(([key, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${genderLabels[key] || key}</span>
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
    }

    // Render Regions
    const regionList = document.getElementById(prefix + 'region-breakdown-list');
    if (regionList) {
        regionList.innerHTML = Object.entries(regionCount)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 15)
            .map(([reg, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${reg}</span>
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
    }

    // v7.7.0: Render T-shirt Sizes (Total for orders)
    const tshirtList = document.getElementById(prefix + 'tshirt-breakdown-list');
    if (tshirtList) {
        const tshirtCount = {};
        tshirtSizes.forEach(s => tshirtCount[s] = 0);
        
        validEntries.forEach(e => {
            (e.participants || []).forEach(p => {
                if (p && p.tshirtSize) {
                    const normalized = normalizeTshirtSize(p.tshirtSize);
                    tshirtCount[normalized] = (tshirtCount[normalized] || 0) + 1;
                }
            });
        });

        tshirtList.innerHTML = Object.entries(tshirtCount)
            .filter(([_, count]) => count > 0 || prefix === '') // Show all in global, only non-zero in prefix views if needed
            .map(([size, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${size}</span>
                    <span class="stats-count">${count}譫・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
    }
}

function checkTshirtSizeAnomalies(entries) {
    const anomalies = [];
    entries.forEach(e => {
        e.participants.forEach((p, idx) => {
            // Suspicious if age is not elementary but size is 140
            if (p.age !== 'elementary' && p.tshirtSize === '140') {
                anomalies.push({
                    id: e.id,
                    groupName: e.groupName,
                    pName: p.name,
                    age: ageLabels[p.age] || p.age,
                    pIndex: idx
                });
            }
        });
    });

    const container = document.getElementById('global-stats-summary');
    if (!container) return;

    // Check if we already have the alert, if so remove it
    const existingAlert = document.getElementById('tshirt-anomaly-alert');
    if (existingAlert) existingAlert.remove();

    if (anomalies.length > 0) {
        const alert = document.createElement('div');
        alert.id = 'tshirt-anomaly-alert';
        alert.className = 'alert alert-info mt-4';
        alert.style.borderLeft = '5px solid var(--error-color)';
        alert.innerHTML = `
            <div style="font-weight:bold; color:var(--error-color); margin-bottom:0.5rem;">笞・・T繧ｷ繝｣繝・し繧､繧ｺ縺ｮ遒ｺ隱肴耳螂ｨ (${anomalies.length}莉ｶ)</div>
            <div style="font-size:0.85rem; color:var(--text-color); margin-bottom:0.5rem;">
                荳ｭ蟄ｦ逕滉ｻ･荳翫・蟷ｴ莉｣縺ｧ繧ｵ繧､繧ｺ縺後・40縲阪↓縺ｪ縺｣縺ｦ縺・ｋ譁ｹ縺後＞縺ｾ縺吶ょ､画峩貍上ｌ縺ｮ蜿ｯ閭ｽ諤ｧ縺後≠繧九◆繧√∝錐邁ｿ縺九ｉ蜀・ｮｹ繧偵＃遒ｺ隱阪￥縺縺輔＞縲・
            </div>
            <div style="max-height:120px; overflow-y:auto; font-size:0.8rem; background:rgba(0,0,0,0.03); padding:0.5rem; border-radius:4px;">
                ${anomalies.map(a => `
                    <div style="margin-bottom:0.25rem;">繝ｻ[${a.id}] ${a.groupName} - ${a.pName} (${a.age})</div>
                `).join('')}
            </div>
        `;
        container.appendChild(alert);
    }
}

// v7.3.0: Public Statistics Rendering (Security Optimized)
window.renderPublicStats = function() {
    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    
    const categories = [
        { id: 'ippan', name: '荳闊ｬ', source: '荳闊ｬ', capacity: state.settings.capacityGeneral, color: 'ippan' },
        { id: 'mintsuri', name: '縺ｿ繧馴・繧・, source: '縺ｿ繧馴・繧・, capacity: state.settings.capacityMintsuri, color: 'mintsuri' },
        { id: 'suiho', name: '豌ｴ螳・, source: '豌ｴ螳・, capacity: state.settings.capacitySuiho, color: 'suiho' },
        { id: 'harimitsu', name: '繝上Μ繝溘ヤ', source: '繝上Μ繝溘ヤ', capacity: state.settings.capacityHarimitsu, color: 'harimitsu' }
    ];

    const gridHtml = categories.map(cat => {
        const count = validEntries.filter(e => e.source === cat.source).reduce((sum, e) => sum + e.fishers, 0);
        const progress = Math.min(100, (count / cat.capacity) * 100);
        const statusText = count >= cat.capacity ? '貅蜩｡' : `縺ゅ→ ${cat.capacity - count} 蜷港;
        return `
            <div class="public-stat-card border-top-${cat.color}">
                <div class="public-stat-label">
                    <span>${cat.name}</span>
                    <span class="badge ${count >= cat.capacity ? 'badge-danger' : 'badge-success'}">${statusText}</span>
                </div>
                <div class="public-stat-main">
                    <span class="public-stat-value">${count}</span>
                    <span class="public-stat-unit">/ ${cat.capacity} 蜷・/span>
                </div>
                <div class="public-progress-container"><div class="public-progress bg-${cat.color}" style="width: ${progress}%"></div></div>
            </div>`;
    }).join('');

    const splitContainer = document.getElementById('category-split-container');
    if (splitContainer) splitContainer.innerHTML = `<div class="public-stats-grid">${gridHtml}</div>`;
    
    // Summary Cards (Same as Dashboard style for premium look)
    const groups = validEntries.length;
    const fishers = validEntries.reduce((s, e) => s + e.fishers, 0);
    const observers = validEntries.reduce((s, e) => s + e.observers, 0);
    
    const summaryContainer = document.getElementById('stats-summary-container');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="stats-summary-grid mb-4">
                <div class="summary-card"><div class="summary-label">邱冗匳骭ｲ繧ｰ繝ｫ繝ｼ繝・/div><div class="summary-value">${groups} <small>邨・/small></div></div>
                <div class="summary-card"><div class="summary-label">驥｣繧雁盾蜉閠・粋險・/div><div class="summary-value">${fishers} <small>/ ${state.settings.capacityTotal}</small></div></div>
                <div class="summary-card"><div class="summary-label">隕句ｭｦ閠・粋險・/div><div class="summary-value">${observers} <small>蜷・/small></div></div>
                <div class="summary-card"><div class="summary-label">譛邨よ峩譁ｰ</div><div class="summary-value" style="font-size:1.2rem;">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div>
            </div>`;
    }
}

window.renderMintsuriCoordinatorView = function() {
    renderGenericCoordinatorView('縺ｿ繧馴・繧・, 'mintsuri');
};

window.renderHarimitsuCoordinatorView = function() {
    renderGenericCoordinatorView('繝上Μ繝溘ヤ', 'harimitsu');
};

window.renderSuihoCoordinatorView = function() {
    renderGenericCoordinatorView('豌ｴ螳・, 'suiho');
};

/**
 * v8.1.35: Generalized coordinator view renderer
 */
function renderGenericCoordinatorView(sourceName, prefix) {
    const list = document.getElementById(`${prefix}-coordinator-list`);
    const summary = document.getElementById(`${prefix}-stats-summary`);
    if (!list) return;

    // v8.1.56: Save scroll position
    const scrollPos = window.scrollY;

    const sourceEntries = state.entries.filter(e => e.source === sourceName && e.status !== 'cancelled');
    const totalFishers = sourceEntries.reduce((s, e) => s + e.fishers, 0);
    const totalObservers = sourceEntries.reduce((s, e) => s + e.observers, 0);
    
    // v8.1.39: Fixed capacity key mapping
    const capacityKeyMap = {
        '縺ｿ繧馴・繧・: 'capacityMintsuri',
        '繝上Μ繝溘ヤ': 'capacityHarimitsu',
        '豌ｴ螳・: 'capacitySuiho',
        '荳闊ｬ': 'capacityGeneral'
    };
    const capacityKey = capacityKeyMap[sourceName];
    const capacity = state.settings[capacityKey] || 0;

    if (summary) {
        summary.innerHTML = `
            <div class="stats-summary-grid">
                <div class="summary-card"><div class="summary-label">${sourceName} 蜷郁ｨ育ｵ・焚</div><div class="summary-value">${sourceEntries.length} <small>邨・/small></div></div>
                <div class="summary-card"><div class="summary-label">${sourceName} 驥｣繧贋ｺｺ謨ｰ</div><div class="summary-value">${totalFishers} <small>/ ${capacity}</small></div></div>
                <div class="summary-card"><div class="summary-label">隕句ｭｦ莠ｺ謨ｰ</div><div class="summary-value">${totalObservers} <small>蜷・/small></div></div>
                <div class="summary-card"><div class="summary-label">蜈・ｶｳ邇・/div><div class="summary-value">${capacity > 0 ? Math.round((totalFishers/capacity)*100) : 0}%</div></div>
            </div>`;
    }

    const searchTerm = (document.getElementById(`${prefix}-search`)?.value || "").toLowerCase();

    list.innerHTML = sourceEntries.slice()
        .filter(e => {
            if (!searchTerm) return true;
            // v8.1.41: Safety Guard
            const pArray = e.participants || [];
            const pNames = pArray.map(p => p.name).join(' ');
            const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames}`.toLowerCase();
            return combined.includes(searchTerm);
        })
        .map(e => {
            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';
            const repInfo = (e.participants && e.participants[0]) || { name: e.representative, nickname: '' };
            return `
            <tr>
                <td><span class="id-badge">${e.id}</span></td>
                <td><strong>${e.groupName}</strong></td>
                <td>${e.representative}${repInfo.nickname ? ` <small>(${repInfo.nickname})</small>` : ''}</td>
                <td>${e.fishers} / ${e.observers}</td>
                <td><small>${regTime}</small></td>
                <td>
                    <div style="display:flex; gap:0.3rem;">
                        <button class="btn-outline btn-small" onclick="showEntryDetails('${e.id}')">遒ｺ隱・/button>
                        ${prefix === 'harimitsu' ? `<button class="btn-primary btn-small" onclick="requestAdminEdit('${e.id}')">菫ｮ豁｣</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
        }).join('') || '<tr><td colspan="6" style="text-align:center; padding:2rem;">隧ｲ蠖薙☆繧狗匳骭ｲ縺ｯ縺ゅｊ縺ｾ縺帙ｓ</td></tr>';

    renderBreakdownStats(sourceName, `${prefix}-`);
    window.scrollTo(0, scrollPos);
}

/**
 * v8.1.42: Detect and refresh whichever admin/coordinator view is currently active
 */
function renderActiveCoordinatorView() {
    // 1. Dashboard
    updateDashboard();
    
    // 2. Reception
    updateReceptionList();

    // 3. Coordinator Views
    if (document.getElementById('mintsuri-coordinator-view')?.classList.contains('active')) {
        renderMintsuriCoordinatorView();
    }
    if (document.getElementById('harimitsu-coordinator-view')?.classList.contains('active')) {
        renderHarimitsuCoordinatorView();
    }
    if (document.getElementById('suiho-coordinator-view')?.classList.contains('active')) {
        renderSuihoCoordinatorView();
    }
}

window.exportMintsuriCSV = function() {
    exportGenericCSV('縺ｿ繧馴・繧・, 'mintsuri_export');
}

window.exportHarimitsuCSV = function() {
    exportGenericCSV('繝上Μ繝溘ヤ', 'harimitsu_export');
}

window.exportSuihoCSV = function() {
    exportGenericCSV('豌ｴ螳・, 'suiho_export');
}

function exportGenericCSV(sourceName, fileName) {
    const targetEntries = state.entries.filter(e => e.source === sourceName && e.status !== 'cancelled');
    if (targetEntries.length === 0) return alert('繝・・繧ｿ縺後≠繧翫∪縺帙ｓ');

    const headers = ['蜿嶺ｻ倡分蜿ｷ', '繧ｰ繝ｫ繝ｼ繝怜錐', '莉｣陦ｨ閠・錐', '髮ｻ隧ｱ逡ｪ蜿ｷ', '繝｡繝ｼ繝ｫ', '驥｣繧贋ｺｺ謨ｰ', '隕句ｭｦ莠ｺ謨ｰ', '逋ｻ骭ｲ譎る俣'];
    const rows = targetEntries.map(e => [
        e.id, e.groupName, e.representative, e.phone, e.email, e.fishers, e.observers, formatDateForCSV(e.timestamp)
    ]);
    downloadCSV(fileName, headers, rows);
}

// Global Stats Rendering (v7.3.0 Global Scope)
function renderGlobalStatsSummary(groups, fishers, observers, checkedIn, absent) {
    const containers = [
        document.getElementById('global-stats-summary-top')
    ].filter(el => el);

    if (containers.length === 0) return;

    const html = `
        <div class="stats-summary-grid">
            <div class="summary-card" style="border-top: 5px solid var(--primary-color);">
                <div class="summary-label">驥｣繧雁盾蜉閠・粋險・/div>
                <div class="summary-value"><span class="current-fishers">${fishers}</span> <small>/ ${state.settings.capacityTotal}</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">邱冗匳骭ｲ繧ｰ繝ｫ繝ｼ繝・/div>
                <div class="summary-value">${groups} <small>邨・/small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">隕句ｭｦ閠・粋險・/div>
                <div class="summary-value">${observers} <small>蜷・/small></div>
            </div>
            <div class="summary-card" style="border-top: 5px solid #10b981;">
                <div class="summary-label">蠖捺律蜿嶺ｻ倡憾豕・/div>
                <div class="summary-value" style="font-size: 1.1rem; line-height: 1.4;">
                    <span style="color: var(--primary-color)">譚･蝣ｴ: <span class="checked-in-count">${checkedIn}</span></span> / 
                    <span style="color: var(--error-color)">谺蟶ｭ: <span class="absent-count">${absent}</span></span>
                </div>
                <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">蜈ｨ <span class="total-groups-count">${groups}</span> 邨・/div>
            </div>
        </div>
    `;

    containers.forEach(c => { c.innerHTML = html; });
}

// Admin Debug Methods
async function testEmailFeature() {
    const testEmail = prompt("繝・せ繝医Γ繝ｼ繝ｫ縺ｮ騾∽ｿ｡蜈医ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞:", "test@example.com");
    if (!testEmail) return;
    showToast('繝・せ繝医Γ繝ｼ繝ｫ騾∽ｿ｡荳ｭ...', 'info');
    try {
        await sendEmailViaGAS({
            action: 'sendEmail', id: 'TEST-000', groupName: '繝・せ繝・,
            email: testEmail, representative: '繝・せ繝域ｰ丞錐',
            fishers: 1, observers: 0, source: '荳闊ｬ', participants: [{name: '繝・せ繝亥盾蜉閠・, type: 'fisher'}]
        });
        alert("騾∽ｿ｡繝ｪ繧ｯ繧ｨ繧ｹ繝亥ｮ御ｺ・りｨｭ螳啅RL: " + GAS_WEB_APP_URL);
    } catch (e) { alert("繧ｨ繝ｩ繝ｼ: " + e.message); }
}


// --- Reception View Logic ---

let activeReceptionSort = 'id'; // 'id' or 'source'
window.setReceptionSort = function(mode) {
    activeReceptionSort = mode;
    document.querySelectorAll('.btn-toolbar').forEach(btn => {
        btn.classList.toggle('active', btn.id === `sort-reception-${mode}`);
    });
    updateReceptionList();
};

function updateReceptionList() {
    const list = document.getElementById('reception-group-list');
    if (!list) return;

    const searchTerm = document.getElementById('reception-search').value.toLowerCase();
    const showCompleted = document.getElementById('show-completed-toggle').checked;

    // v8.1.56: Save scroll position of the sidebar
    const scrollPos = list.scrollTop;

    const processedEntries = state.entries.filter(e => e.status !== 'cancelled').map(e => {
        const pArray = e.participants || [];
        const finishedCount = pArray.filter(p => p && (p.status === 'checked-in' || p.status === 'absent')).length;
        const totalCount = pArray.length;
        const isCompleted = finishedCount === totalCount && totalCount > 0;
        return { ...e, isCompleted, finishedCount, totalCount };
    });

    // Sort: isCompleted false first, then logic
    processedEntries.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        
        if (activeReceptionSort === 'source') {
            if (a.source !== b.source) return a.source.localeCompare(b.source);
        }
        
        // Natural Sort for ID (A-1, A-10, etc.)
        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    let html = '';
    processedEntries.forEach(e => {
        // Search Filter (v8.1.58: Safety guarded)
        const pArray = e.participants || [];
        const pNames = pArray.map(p => p ? p.name : "").join(' ');
        const pNicks = pArray.map(p => p ? (p.nickname || "") : "").join(' ');
        const pTshirts = pArray.map(p => p ? (p.tshirtSize || "") : "").join(' ');
        const pGenders = pArray.map(p => p ? (genderLabels[p.gender] || "") : "").join(' ');
        const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pNicks} ${pTshirts} ${pGenders}`.toLowerCase();
        
        if (searchTerm && !combined.includes(searchTerm)) return;

        // Completion Filter
        if (!showCompleted && e.isCompleted) return;

        const badgeClass = e.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : e.source === '荳闊ｬ' ? 'badge-ippan' : e.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho';
        
        html += `
            <div class="reception-group-item ${activeReceptionEntryId === e.id ? 'active' : ''} ${e.isCompleted ? 'completed' : ''}" 
                 onclick="selectReceptionEntry('${e.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                    <strong style="font-size:1.1rem; color:#2d3436;">${e.id} | ${e.groupName}</strong>
                    <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
                </div>
                <div class="item-meta" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:1rem; color:#636e72;">${e.representative}</div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.9rem; font-weight:700; color: #0984e3;">${e.isCompleted ? '笨・蜿嶺ｻ俶ｸ・ : `${e.finishedCount}/${e.totalCount}`}</span>
                        ${!e.isCompleted ? `<button onclick="event.stopPropagation(); updateGroupStatus('${e.id}', 'checked-in')" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; background: var(--primary-color); border: none; border-radius: 4px; color: white; cursor: pointer;">蜈ｨ蜩｡蜿嶺ｻ・/button>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    list.innerHTML = html;
    list.scrollTop = scrollPos;
}

function selectReceptionEntry(id) {
    activeReceptionEntryId = id;
    updateReceptionList();
    renderReceptionDesk();
}



function renderReceptionDesk() {
    const desk = document.getElementById('reception-detail');
    const entry = state.entries.find(e => e.id === activeReceptionEntryId);

    if (!entry) {
        desk.innerHTML = `
            <div class="reception-placeholder">
                <i class="icon-search">剥</i>
                <p>蟾ｦ蛛ｴ縺ｮ繝ｪ繧ｹ繝医°繧峨げ繝ｫ繝ｼ繝励ｒ驕ｸ謚槭＠縺ｦ縺上□縺輔＞縲・/p>
            </div>
        `;
        return;
    }

    desk.innerHTML = `
        <div class="desk-header" style="background: #eef2ff; border-bottom: 2px solid var(--primary-color); padding: 1.5rem; border-radius: 8px 8px 0 0;">
            <div class="desk-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div class="desk-group-name" style="font-size: 1.8rem; font-weight: 900; color: var(--primary-color);">${entry.groupName}</div>
                <div class="badge ${entry.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : entry.source === '荳闊ｬ' ? 'badge-ippan' : entry.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho'}" style="font-size: 1.2rem; padding: 0.5rem 1rem;">${entry.source}</div>
            </div>
            <div class="desk-meta" style="font-size: 1rem; color: #475569; font-weight: 600;">
                <span style="background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">ID: ${entry.id}</span>
                <span style="margin-left: 1rem;">莉｣陦ｨ閠・ ${entry.representative}</span>
                <span style="margin-left: 1rem;">TEL: ${entry.phone}</span>
            </div>
        </div>

        <div class="participant-check-list" style="padding: 1.5rem; background: white;">
            <div class="section-title" style="margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem; border-left-width: 4px;">蜿ょ刈繝｡繝ｳ繝舌・蛟句挨縺ｮ蜿嶺ｻ倡憾豕・/div>
            
            ${(entry.participants || []).map((p, idx) => {
                if (!p) return '';
                const typeClass = p.type === 'fisher' ? 'p-badge-fisher' : 'p-badge-observer';
                const typeLabel = p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ';
                const rowStatusClass = p.status === 'checked-in' ? 'checked-in' : (p.status === 'absent' ? 'absent' : '');
                
                return `
                <div class="participant-check-row ${rowStatusClass}" style="margin-bottom: 12px; padding: 1rem; border-radius: 12px; border: 2px solid ${p.status === 'checked-in' ? '#10b981' : (p.status === 'absent' ? '#ef4444' : '#e2e8f0')}; display: flex; align-items: center; justify-content: space-between; background: ${p.status === 'checked-in' ? '#f0fdf4' : (p.status === 'absent' ? '#fef2f2' : 'white')}; transition: all 0.2s;">
                    <div class="p-info" style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                        <div style="font-size: 1.5rem; width: 40px; text-align: center;">${p.status === 'checked-in' ? '笨・ : (p.status === 'absent' ? '笶・ : '筮・)}</div>
                        <div>
                            <div class="p-name" style="font-size: 1.25rem; font-weight: 800; color: #1e293b;">
                                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}" style="margin-right: 8px;">${typeLabel}</span>
                                ${p.name} <small style="font-weight: normal; color: #64748b;">(${p.nickname || '繝九ャ繧ｯ繝阪・繝辟｡'})</small>
                            </div>
                            <div class="p-meta" style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">
                                ${p.region || '蝨ｰ蝓滉ｸ肴・'} | ${genderLabels[p.gender] || '-'} | ${ageLabels[p.age] || '-'} | T繧ｷ繝｣繝・ [<strong>${p.tshirtSize || '荳肴・'}</strong>]
                            </div>
                        </div>
                    </div>
                    <div class="p-status-actions" style="display: flex; gap: 8px;">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #10b981; background: ${p.status === 'checked-in' ? '#10b981' : 'white'}; color: ${p.status === 'checked-in' ? 'white' : '#10b981'}; min-width: 100px;">譚･蝣ｴ</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #ef4444; background: ${p.status === 'absent' ? '#ef4444' : 'white'}; color: ${p.status === 'absent' ? 'white' : '#ef4444'}; min-width: 100px;">谺蟶ｭ</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="desk-footer" style="padding: 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; align-items: center; border-radius: 0 -0 8px 8px; gap: 1rem;">
            <button class="btn-primary btn-large" onclick="window.updateGroupStatus('${entry.id}', 'checked-in')" style="padding: 1rem 2rem; font-size: 1.2rem; white-space: nowrap;">蜈ｨ蜩｡縺ｾ縺ｨ繧√※蜿嶺ｻ・/button>
        </div>
    `;
    
    // v8.8.1: Removed redundant addEventListener that was duplicating the onclick attribute
    // const btn = desk.querySelector('.btn-primary');
    // if (btn) btn.addEventListener('click', () => window.updateGroupStatus(entry.id, 'checked-in'));
}

window.updateParticipantStatus = function (entryId, pIdx, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    const currentStatus = entry.participants[pIdx].status;
    const isTogglingOff = currentStatus === status;
    
    // v7.9.3: Toggle logic - if already active, revert to pending
    const newStatus = isTogglingOff ? 'pending' : status;
    entry.participants[pIdx].status = newStatus;

    // Sync group-level flags (for backward compatibility and stats)
    syncGroupStatusFromParticipants(entry);

    if (!isTogglingOff) {
        const statusLabel = status === 'checked-in' ? '蜿嶺ｻ俶ｸ・ : status === 'absent' ? '谺蟶ｭ' : '譛ｪ蜿嶺ｻ・;
        showToast(`${entry.participants[pIdx].name} 讒倥ｒ縲・{statusLabel}縲阪↓譖ｴ譁ｰ縺励∪縺励◆`, 'info');
    }

    entry.lastModified = new Date().toLocaleString('ja-JP');
    saveData();

    renderReceptionDesk();
    updateReceptionList();
    updateDashboard();
};

window.updateGroupStatus = function (entryId, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    entry.participants.forEach(p => {
        // status縺・'checked-in' 縺ｮ蝣ｴ蜷医∵里縺ｫ 'absent' 縺ｮ莠ｺ縺ｯ荳頑嶌縺阪＠縺ｪ縺・
        if (status === 'checked-in' && p.status === 'absent') {
            return;
        }
        p.status = status;
    });
    syncGroupStatusFromParticipants(entry);

    if (status === 'checked-in') {
        showToast('繧ｰ繝ｫ繝ｼ繝怜・蜩｡繧貞女莉倥＠縺ｾ縺励◆', 'success');
    }

    entry.lastModified = new Date().toLocaleString('ja-JP');
    saveData();

    renderReceptionDesk();
    updateReceptionList();
    updateDashboard();
};

function syncGroupStatusFromParticipants(entry) {
    const hasCheckedIn = entry.participants.some(p => p.status === 'checked-in');
    const allAbsent = entry.participants.every(p => p.status === 'absent');

    if (hasCheckedIn) {
        entry.status = 'checked-in';
        entry.checkedIn = true;
        if (!entry.checkInTime) {
            entry.checkInTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }
    } else if (allAbsent) {
        entry.status = 'absent';
        entry.checkedIn = false;
        entry.checkInTime = null;
    } else {
        entry.status = 'pending';
        entry.checkedIn = false;
        entry.checkInTime = null;
    }
}

/* --- IKESU & LEADER FUNCTIONS RESTORED v8.0.6 --- */
window.openIkesuModal = function (id = null) {
    document.getElementById('ikesu-modal').classList.remove('hidden');
    if (id) {
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            document.getElementById('ikesu-modal-title').textContent = "繧､繧ｱ繧ｹ縺ｮ邱ｨ髮・;
            document.getElementById('ikesu-edit-id').value = ikesu.id;
            document.getElementById('ikesu-name').value = ikesu.name;
            document.getElementById('ikesu-capacity').value = ikesu.capacity;
            const passEl = document.getElementById('ikesu-passcode');
            if (passEl) passEl.value = ikesu.passcode || "";
            return;
        }
    }
    document.getElementById('ikesu-modal-title').textContent = "繧､繧ｱ繧ｹ縺ｮ霑ｽ蜉";
    document.getElementById('ikesu-edit-id').value = '';
    document.getElementById('ikesu-name').value = '';
    document.getElementById('ikesu-capacity').value = '15';
    const passEl = document.getElementById('ikesu-passcode');
    if (passEl) passEl.value = '';
};

window.closeIkesuModal = function () {
    document.getElementById('ikesu-modal').classList.add('hidden');
};

window.saveIkesu = function () {
    const id = document.getElementById('ikesu-edit-id').value;
    const name = document.getElementById('ikesu-name').value.trim();
    const capacity = parseInt(document.getElementById('ikesu-capacity').value, 10);
    const passEl = document.getElementById('ikesu-passcode');
    const passcode = passEl ? passEl.value.trim() : "";

    if (!name || isNaN(capacity) || capacity < 1) {
        alert("蜷榊燕縺ｨ螳壼藤・・莉･荳奇ｼ峨ｒ豁｣縺励￥蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
        return;
    }

    if (!state.settings.ikesuList) state.settings.ikesuList = [];

    if (id) {
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            ikesu.name = name;
            ikesu.capacity = capacity;
            ikesu.passcode = passcode;
        }
    } else {
        state.settings.ikesuList.push({
            id: 'ikesu-' + Date.now(),
            name: name,
            capacity: capacity,
            passcode: passcode
        });
    }

    state.lastUpdated = Date.now();
    saveData();
    closeIkesuModal();
    renderIkesuWorkspace();
};

window.deleteIkesu = function (id) {
    if (!confirm('譛ｬ蠖薙↓縺薙・繧､繧ｱ繧ｹ繧貞炎髯､縺励∪縺吶°・歃n蜑ｲ繧雁ｽ薙※繧峨ｌ縺ｦ縺・◆莠ｺ縺ｯ譛ｪ蜑ｲ繧雁ｽ薙※縺ｫ謌ｻ繧翫∪縺吶・)) return;
    state.settings.ikesuList = state.settings.ikesuList.filter(i => i.id !== id);
    state.entries.forEach(e => {
        e.participants.forEach(p => {
            if (p.ikesuId === id) p.ikesuId = null;
        });
    });
    state.lastUpdated = Date.now();
    saveData();
    renderIkesuWorkspace();
};

window.allowDrop = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = function (ev) {
    ev.currentTarget.classList.remove('drag-over');
};

window.dragGroup = function (ev, entryId) {
    ev.dataTransfer.setData("type", "group");
    ev.dataTransfer.setData("id", entryId);
};

window.dragPerson = function (ev, entryId, personIdx) {
    ev.dataTransfer.setData("type", "person");
    ev.dataTransfer.setData("id", entryId);
    ev.dataTransfer.setData("idx", personIdx);
    ev.stopPropagation();
};

window.dropToUnassigned = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    processDrop(ev, null);
};

window.dropToIkesu = function (ev, ikesuId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    processDrop(ev, ikesuId);
};

function processDrop(ev, ikesuId) {
    const type = ev.dataTransfer.getData("type");
    const id = ev.dataTransfer.getData("id");
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (type === "group") {
        entry.participants.forEach(p => p.ikesuId = ikesuId);
    } else {
        const idx = parseInt(ev.dataTransfer.getData("idx"));
        if (entry.participants[idx]) entry.participants[idx].ikesuId = ikesuId;
    }
    
    // v8.3.12: Update timestamp for sync
    entry.lastModified = new Date().toISOString();
    saveData();
    renderIkesuWorkspace();
}

window.toggleGroupExpand = function (id) {
    const el = document.getElementById(`drag-parts-${id}`);
    if (el) el.classList.toggle('expanded');
};

window.renderIkesuWorkspace = function () {
    const unassignedList = document.getElementById('unassigned-list');
    const ikesuGrid = document.getElementById('ikesu-grid');
    if (!unassignedList || !ikesuGrid) return;

    unassignedList.innerHTML = '';
    ikesuGrid.innerHTML = '';

    const assignedData = {};
    if (!state.settings.ikesuList) state.settings.ikesuList = [];
    if (!window.expandedIkesuIds) window.expandedIkesuIds = new Set();

    state.settings.ikesuList.forEach(ik => assignedData[ik.id] = { ik, fishers: 0, observers: 0, items: [] });

    const searchTerm = (document.getElementById('ikesu-search')?.value || "").toLowerCase().trim();

    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        
        const matchesSearch = !searchTerm || 
            e.id.toLowerCase().includes(searchTerm) || 
            e.groupName.toLowerCase().includes(searchTerm) ||
            e.representative.toLowerCase().includes(searchTerm);

        const unassignedParts = [];
        e.participants.forEach((p, idx) => {
            if (p.ikesuId && assignedData[p.ikesuId]) {
                assignedData[p.ikesuId].items.push({ entry: e, p, idx });
                if (p.type === 'fisher') assignedData[p.ikesuId].fishers++;
                else assignedData[p.ikesuId].observers++;
            } else {
                unassignedParts.push({ p, idx });
            }
        });

        if (unassignedParts.length > 0 && matchesSearch) {
            const isFull = unassignedParts.length === e.participants.length;
            const fishers = unassignedParts.filter(i => i.p.type === 'fisher').length;
            const observers = unassignedParts.filter(i => i.p.type === 'observer').length;
            
            const sourceClass = `source-${e.source === '荳闊ｬ' ? 'ippan' : e.source === '縺ｿ繧馴・繧・ ? 'mintsuri' : e.source === '豌ｴ螳・ ? 'suiho' : e.source === '繝上Μ繝溘ヤ' ? 'harimitsu' : 'default'}`;
            let html = `
                <div class="drag-item-group ${sourceClass} ${isFull ? 'draggable' : ''}" 
                     ${isFull ? `draggable="true" ondragstart="dragGroup(event, '${e.id}')"` : ''}>
                    <div class="drag-item-header" style="flex-wrap: nowrap;">
                        <div class="group-name-text">[${e.id}] ${e.groupName}</div>
                        <div class="count-badge-row">
                            <span class="badge-fisher-count">${fishers}</span>
                            <span class="badge-observer-count">${observers}</span>
                        </div>
                    </div>
                    <div class="drag-item-participants active">
                        ${unassignedParts.map(item => `
                            <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${e.id}', ${item.idx})">
                                <span>${item.p.name}</span>
                                <span class="badge ${item.p.type==='fisher'?'':'badge-observer'}">${item.p.type==='fisher'?'驥｣繧・:'隕句ｭｦ'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            unassignedList.insertAdjacentHTML('beforeend', html);
        }
    });

    state.settings.ikesuList.forEach(ik => {
        const data = assignedData[ik.id];
        const current = data.fishers;
        const capacity = ik.capacity;
        const isOver = current > capacity;
        const isFull = current === capacity;
        
        const isExpanded = window.expandedIkesuIds.has(ik.id);
        const badgeClass = isOver ? 'over' : isFull ? 'full' : (current >= capacity - 1) ? 'warning' : '';
        
        const box = document.createElement('div');
        box.className = `ikesu-box drag-zone ${isOver ? 'over' : ''}`;
        box.ondragover = allowDrop;
        box.ondragleave = handleDragLeave;
        box.ondrop = (ev) => dropToIkesu(ev, ik.id);

        box.innerHTML = `
            <div class="ikesu-header">
                <div class="ikesu-title">
                    <span class="num">${ik.name.replace('繧､繧ｱ繧ｹ','')}</span>
                    <span class="unit">繧､繧ｱ繧ｹ</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <div class="capacity-badge ${badgeClass}">${current} / ${capacity}</div>
                    <button class="btn-text" onclick="window.toggleIkesuExpand('${ik.id}')" title="繝｡繝ｳ繝舌・陦ｨ遉ｺ蛻・崛" style="font-size: 1rem; padding: 0 4px;">${isExpanded ? '早・・ : '文・・}</button>
                    <button class="btn-text" onclick="window.openIkesuModal('${ik.id}')">笨擾ｸ・/button>
                </div>
            </div>
            <div class="ikesu-drop-area">
                ${Object.values(data.items.reduce((acc, item) => {
                    if (!acc[item.entry.id]) acc[item.entry.id] = { entry: item.entry, parts: [] };
                    acc[item.entry.id].parts.push(item);
                    return acc;
                }, {})).map(group => {
                    const sc = `source-${group.entry.source === '荳闊ｬ' ? 'ippan' : group.entry.source === '縺ｿ繧馴・繧・ ? 'mintsuri' : group.entry.source === '豌ｴ螳・ ? 'suiho' : group.entry.source === '繝上Μ繝溘ヤ' ? 'harimitsu' : 'default'}`;
                    const fishers = group.parts.filter(i => i.p.type === 'fisher').length;
                    const observers = group.parts.filter(i => i.p.type === 'observer').length;
                    
                    return `
                    <div class="drag-item-group ${sc} draggable" draggable="true" ondragstart="dragGroup(event, '${group.entry.id}')">
                        <div class="drag-item-header" style="flex-wrap: nowrap;">
                            <div class="group-name-text">${group.entry.groupName}</div>
                            <div class="count-badge-row">
                                <span class="badge-fisher-count">${fishers}</span>
                                <span class="badge-observer-count">${observers}</span>
                            </div>
                        </div>
                        <div class="drag-item-participants ${isExpanded ? 'active' : ''}">
                            ${group.parts.map(m => `
                                <div class="drag-item-person" draggable="true" ondragstart="dragPerson(event, '${group.entry.id}', ${m.idx})">
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <button class="btn-leader-toggle ${m.p.isLeader ? 'active' : ''}" 
                                                onclick="window.toggleLeader(event, '${group.entry.id}', ${m.idx})">箝・/button>
                                        <span>${m.p.name}</span>
                                    </div>
                                    ${m.p.type === 'observer' ? '<span style="font-size:0.6rem; color:#64748b;">(隕・</span>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        `;
        ikesuGrid.appendChild(box);
    });
};

/* --- Leader Entry Functions --- */
window.printMemberList = function() {
    window.print();
};

window.resetLeaderAuth = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    document.getElementById('leader-auth-section').classList.toggle('hidden', !ikId);
    document.getElementById('leader-step-2').classList.add('hidden');
    document.getElementById('leader-step-confirm').classList.add('hidden');
};

window.verifyLeaderAuth = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    const input = document.getElementById('leader-passcode-input').value;
    const ikesu = state.settings.ikesuList?.find(ik => ik.id === ikId);
    if (ikesu && (input === ikesu.passcode || input === state.settings.adminPassword)) {
        showToast('隱崎ｨｼ謌仙粥', 'success');
        document.getElementById('leader-step-1').classList.add('hidden');
        document.getElementById('leader-step-2').classList.remove('hidden');
        renderLeaderEntryTable();
    } else {
        showToast('證苓ｨｼ逡ｪ蜿ｷ縺碁＆縺・∪縺・, 'error');
    }
};

window.renderLeaderEntryTable = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    const container = document.getElementById('leader-entry-table-container');
    if (!container) return;
    const members = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        e.participants.forEach((p, idx) => {
            if (p.ikesuId === ikId && p.type === 'fisher') members.push({ p, entry: e, idx });
        });
    });

    container.innerHTML = `
        <table class="leader-table">
            <thead><tr><th>豌丞錐</th><th>髱堤黄(2pt)</th><th>魃帷ｭ・1pt)</th><th>蟆剰ｨ・/th></tr></thead>
            <tbody>
                ${members.map(m => `
                    <tr data-entry="${m.entry.id}" data-idx="${m.idx}">
                        <td><strong>${m.p.name}</strong><br><small>${m.entry.groupName}</small></td>
                        <td><input type="number" class="catch-a" value="${m.p.catchA || 0}" min="0" oninput="window.updateLeaderLiveTotals()"></td>
                        <td><input type="number" class="catch-b" value="${m.p.catchB || 0}" min="0" oninput="window.updateLeaderLiveTotals()"></td>
                        <td><span class="row-total">0</span>pt</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    updateLeaderLiveTotals();
};

window.updateLeaderLiveTotals = function() {
    let teamTotal = 0;
    document.querySelectorAll('.leader-table tbody tr').forEach(row => {
        const a = parseInt(row.querySelector('.catch-a').value) || 0;
        const b = parseInt(row.querySelector('.catch-b').value) || 0;
        const sub = (a * 2) + b;
        row.querySelector('.row-total').textContent = sub;
        teamTotal += sub;
    });
    const display = document.getElementById('team-total-display');
    if (display) display.innerHTML = teamTotal + ' <small>pt</small>';
};

window.requestLeaderResultsSave = function() {
    document.getElementById('leader-step-2').classList.add('hidden');
    document.getElementById('leader-step-confirm').classList.remove('hidden');
};

window.backToLeaderEdit = function() {
    document.getElementById('leader-step-confirm').classList.add('hidden');
    document.getElementById('leader-step-2').classList.remove('hidden');
};

window.commitLeaderResultsSave = function() {
    document.querySelectorAll('.leader-table tbody tr').forEach(row => {
        const eid = row.dataset.entry;
        const idx = parseInt(row.dataset.idx);
        const entry = state.entries.find(e => e.id === eid);
        if (entry && entry.participants[idx]) {
            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;
            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;
        }
    });
    saveData();
    showToast('菫晏ｭ倥＠縺ｾ縺励◆', 'success');
    window.location.reload();
};

window.toggleIkesuExpand = function(ikId) {
    if (!window.expandedIkesuIds) window.expandedIkesuIds = new Set();
    if (window.expandedIkesuIds.has(ikId)) {
        window.expandedIkesuIds.delete(ikId);
    } else {
        window.expandedIkesuIds.add(ikId);
    }
    renderIkesuWorkspace();
};

window.splitGroupInWorkspace = function(entryId) {
    showToast('蛟倶ｺｺ蜊倅ｽ阪〒遘ｻ蜍募庄閭ｽ縺ｧ縺・, 'info');
};

window.toggleLeader = function(event, entryId, pIdx) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    
    const targetIkesuId = entry.participants[pIdx].ikesuId;
    const isNowLeader = !entry.participants[pIdx].isLeader;
    
    // Clear leaders in SAME IKESU or SAME TEAM (Exclusive)
    if (isNowLeader) {
        state.entries.forEach(e => {
            // Clear within the same team
            if (e.id === entryId) {
                e.participants.forEach(p => p.isLeader = false);
            }
            // Clear within the same ikesu
            if (targetIkesuId) {
                e.participants.forEach(p => {
                    if (p.ikesuId === targetIkesuId) p.isLeader = false;
                });
            }
        });
    }
    
    entry.participants[pIdx].isLeader = isNowLeader;
    saveStateToLocalStorage();
    renderIkesuWorkspace();
};


/* --- SYSTEM STABILIZATION FUNCTIONS RESTORED v8.0.7 --- */

function updateAppTitle() {
    const titleEl = document.getElementById('app-title');
    const competitionName = state.settings.competitionName || "BORIJIN FESTIVAL in 豌ｴ螳・2026";
    const version = "v8.9.79";
    if (titleEl) {
        let prefix = "";
        // v8.9.65: Ensure Admin prefix is shown when authenticated or in admin views
        if (isAdminAuth || currentViewId === 'dashboard-view') prefix = "邂｡逅・・ ";
        else if (currentViewId === 'reception-view') prefix = "蠖捺律蜿嶺ｻ・ ";
        
        titleEl.innerHTML = `
            ${prefix}${competitionName}
            <span class="version-badge">${version}</span>
        `;
    }
    document.title = competitionName;
}

window.triggerSettingsSave = async function () {
    const btn = document.querySelector('button[onclick="triggerSettingsSave()"]');
    const originalText = btn ? btn.textContent : "螟ｧ莨夊ｨｭ螳壹ｒ縺吶∋縺ｦ菫晏ｭ・;
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = "菫晏ｭ倅ｸｭ...";
    }

    try {
        await handleSettingsUpdate({ preventDefault: () => { } });
        showToast('險ｭ螳壹ｒ菫晏ｭ倥＠縲√け繝ｩ繧ｦ繝峨→蜷梧悄縺励∪縺励◆', 'success');
    } catch (err) {
        console.error("BORIJIN: Save failed:", err);
        showToast('菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
};

function updateCapacityTotal() {
    const getI = (id) => parseInt(document.getElementById(id)?.value) || 0;
    
    // v8.9.60: STRICTLY sum only the 4 fisher categories for the denominator (Total Capacity)
    // Excludes observers and manual adjustments as per user requirement.
    const total = getI('cap-ippan') + getI('cap-mintsuri') + getI('cap-suiho') + getI('cap-harimitsu');
    
    console.log(`[Capacity] Denominator calculation: ${getI('cap-ippan')} + ${getI('cap-mintsuri')} + ${getI('cap-suiho')} + ${getI('cap-harimitsu')} = ${total}`);
    
    const totalEl = document.getElementById('cap-total');
    if (totalEl && document.activeElement !== totalEl) {
        totalEl.value = total;
    }
    
    if (state.settings) {
        state.settings.capacityTotal = total;
    }
    
    const sumEl = document.getElementById('capacity-total-summary');
    if (sumEl) sumEl.textContent = total;

    return total;
}
window.updateCapacityTotal = updateCapacityTotal;

async function handleSettingsUpdate(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const getVal = id => document.getElementById(id)?.value || "";
    const getInt = id => {
        const v = document.getElementById(id)?.value;
        return (v === "" || v === undefined) ? 0 : parseInt(v) || 0;
    };

    // 譛譁ｰ縺ｮ蜷郁ｨ医ｒ蠑ｷ蛻ｶ險育ｮ励＠縲√◎縺ｮ蛟､繧剃ｿ晏ｭ倥↓蛻ｩ逕ｨ縺吶ｋ
    const calculatedTotal = window.updateCapacityTotal();

    state.settings.competitionName = getVal('competition-name');
    state.settings.capacityGeneral = getInt('cap-ippan');
    state.settings.capacityMintsuri = getInt('cap-mintsuri');
    state.settings.capacitySuiho = getInt('cap-suiho');
    state.settings.capacityHarimitsu = getInt('cap-harimitsu');
    state.settings.capacityObservers = getInt('capacity-observers');
    state.settings.capacityTotal = calculatedTotal;
    
    state.settings.startTime = getVal('registration-start');
    state.settings.deadline = getVal('registration-deadline');
    state.settings.adminPassword = getVal('admin-password-set');
    
    const maintToggle = document.getElementById('maintenance-mode-toggle');
    if (maintToggle) state.settings.maintenanceMode = maintToggle.checked;
    applyMaintenanceMode();

    state.settings.adjSuihoFishers = getInt('adj-suiho-fishers');
    state.settings.adjSuihoObservers = getInt('adj-suiho-observers');
    state.settings.adjHarimitsuFishers = getInt('adj-harimitsu-fishers');
    state.settings.adjHarimitsuObservers = getInt('adj-harimitsu-observers');
    
    console.log("BORIJIN: Updating state and syncing...", state.settings);
    
    // v8.9.63: Save locally first
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    
    // v8.9.63: Then sync to cloud and wait for it
    await syncToCloud();
    
    syncSettingsUI();
    updateDashboard();
    checkTimeframe();
    updateAppTitle();
    
    logChange({ groupName: '螟ｧ莨夊ｨｭ螳・, id: 'SYSTEM' }, '險ｭ螳壼､画峩');
}

/**
 * v8.9.39: Apply maintenance mode class based on current settings
 */
function applyMaintenanceMode() {
    // v8.9.60: Skip maintenance overlay if the user is an authenticated admin
    if (state.settings.maintenanceMode && !isAdminAuth) {
        document.body.classList.add('maintenance-active');
        console.log("BORIJIN: Maintenance Mode is ENABLED (Overlay active for non-admins)");
    } else {
        document.body.classList.remove('maintenance-active');
        console.log(`BORIJIN: Maintenance Mode is ${state.settings.maintenanceMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }
}



window.confirmReset = async function () {
    if (confirm('蜈ｨ縺ｦ縺ｮ蜷咲ｰｿ繝・・繧ｿ繧貞炎髯､縺励∪縺吶よ悽蠖薙↓繧医ｍ縺励＞縺ｧ縺吶°・・)) {
        state.entries = [];
        state.lastUpdated = Date.now();
        showToast('繝ｪ繧ｻ繝・ヨ荳ｭ...', 'info');
        try {
            await syncToCloud();
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
            location.reload();
        } catch (e) {
            console.error('Reset failed:', e);
            location.reload();
        }
    }
};

/* --- MANAGEMENT FUNCTIONS (RESTORED v8.1.9) --- */

/**
 * v8.1.9: Restored QR generation (fixing container ID mismatch)
 */
function generateAdminQRCode() {
    const container = document.getElementById('admin-qr-code-container');
    if (!container) return;
    container.innerHTML = "";
    if (typeof QRCode === 'undefined') {
        container.innerHTML = "<p style='font-size:0.8rem; color:var(--text-muted);'>QR繧ｳ繝ｼ繝峨Λ繧､繝悶Λ繝ｪ隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>";
        return;
    }
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const url = baseUrl; // Standard public URL
    new QRCode(container, {
        text: url,
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

function openShareUrl(id) {
    const el = document.getElementById(id);
    if (el && el.value) {
        window.open(el.value, '_blank');
    }
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function handleCheckStatus() {
    const searchVal = prompt("縺雁錐蜑搾ｼ井ｻ｣陦ｨ閠・ｼ峨ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
    if (!searchVal) return;
    
    dashboardFilter = 'all';
    const matches = state.entries.filter(e => e.representative.includes(searchVal));
    if (matches.length > 0) {
        alert(`${matches.length} 莉ｶ隕九▽縺九ｊ縺ｾ縺励◆縲よ怙譁ｰ縺ｮ逡ｪ蜿ｷ縺ｯ ${matches[0].id} 縺ｧ縺吶Ａ);
        location.reload();
    } else {
        alert("隕九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲ゅｂ縺・ｸ蠎ｦ隧ｦ縺吶°縲∽ｺ句漁螻縺ｸ縺雁撫縺・粋繧上○縺上□縺輔＞縲・);
    }
}

/**
 * v8.1.20: Restore Hard Delete for Test Data Management
 */
window.hardDeleteEntry = async function (id) {
    if (!isAdminAuth) return;
    if (!confirm(`繧ｨ繝ｳ繝医Μ繝ｼ ${id} 繧貞ｮ悟・縺ｫ蜑企勁縺励∪縺吶°・歃n(騾∽ｿ｡蠕後√し繝ｼ繝舌・縺九ｉ繧ょｮ悟・縺ｫ蜑企勁縺輔ｌ縺ｾ縺吶ゅユ繧ｹ繝亥・蜉帙・謨ｴ逅・↓菴ｿ逕ｨ縺励※縺上□縺輔＞)`)) return;

    try {
        const idx = state.entries.findIndex(e => e.id === id);
        if (idx === -1) {
            showToast('繧ｨ繝ｳ繝医Μ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ', 'error');
            return;
        }

        // v7.9.3 logic: Track for cloud deletion
        if (!state.deletedIds) state.deletedIds = [];
        state.deletedIds.push(id);

        state.entries.splice(idx, 1);
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧貞炎髯､縺励∪縺励◆', 'success');

        // Refresh UI
        updateDashboard();
        updateReceptionList();

        // Immediate sync to server
        logChange({ groupName: id, id: id }, '蜑企勁');
        await saveData();
    } catch (err) {
        console.error("Deletion failed:", err);
        showToast('蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
    }
};

/**
 * v8.1.48: Restored Entry Details Modal rendering
 */
window.showEntryDetails = function (id) {
    window.currentDetailId = id; // Store for modal edit button
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('detail-modal-body');
    const title = document.getElementById('detail-modal-title');
    const editBtn = document.getElementById('modal-edit-btn');

    if (!modal || !body) {
        console.error("Modal elements not found!");
        return;
    }

    // v8.1.95: Restore restriction - Hide edit button for Mintsuri/Suiho coordinators
    if (editBtn) {
        if (currentViewId === 'mintsuri-coordinator-view' || currentViewId === 'suiho-coordinator-view') {
            editBtn.classList.add('hidden');
        } else {
            editBtn.classList.remove('hidden');
            editBtn.onclick = () => window.requestAdminEdit(entry.id);
        }
    }

    const cancelBtn = document.getElementById('modal-cancel-btn');
    const restoreBtn = document.getElementById('modal-restore-btn');
    const resendBtn = document.getElementById('modal-resend-btn');
    const hardDeleteBtn = document.getElementById('modal-hard-delete-btn');

    if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', !isAdminAuth || entry.status === 'cancelled');
        cancelBtn.onclick = () => window.cancelEntry(entry.id);
    }
    if (restoreBtn) {
        restoreBtn.classList.toggle('hidden', !isAdminAuth || entry.status !== 'cancelled');
        restoreBtn.onclick = () => window.restoreEntry(entry.id);
    }
    if (resendBtn) {
        resendBtn.classList.toggle('hidden', !isAdminAuth || entry.status === 'cancelled');
        resendBtn.onclick = () => window.resendEmail(entry.id);
    }
    if (hardDeleteBtn) {
        hardDeleteBtn.classList.toggle('hidden', !isAdminAuth);
        hardDeleteBtn.onclick = () => {
            window.hardDeleteEntry(entry.id).then(() => {
                document.getElementById('detail-modal').classList.add('hidden');
            });
        };
    }

    if (title) title.textContent = `[${entry.id}] ${entry.groupName} 隧ｳ邏ｰ`;

    // Calculate Scores for display
    let groupPoints = 0;
    (entry.participants || []).forEach(p => {
        const pA = parseInt(p.catchA || 0);
        const pB = parseInt(p.catchB || 0);
        groupPoints += (pA * 2) + pB;
    });

    let participantsHtml = entry.participants.map((p, idx) => `
        <div style="padding: 10px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 8px; background: ${p.type === 'observer' ? '#f8f9fa' : '#fff'}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}${p.gender === 'male' ? '笙・ : (p.gender === 'female' ? '笙' : '')}</strong>
                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}">${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}</span>
            </div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 5px;">
                ${genderLabels[p.gender] || '-'} / ${ageLabels[p.age] || '-'} / ${p.region || '蝨ｰ蝓滉ｸ肴・'} / T繧ｷ繝｣繝・ ${p.tshirtSize || '縺ｪ縺・}
            </div>
            ${p.type === 'fisher' ? `
            <div style="margin-top: 5px; font-weight: bold; color: var(--primary-color);">
                ${p.catchA || 0}蛹ｹ (螟ｧ迚ｩ) / ${p.catchB || 0}蛹ｹ (縺昴・莉・
            </div>` : ''}
        </div>
    `).join('');

    body.innerHTML = `
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 8px;">
            <p><strong>莉｣陦ｨ閠・</strong> ${entry.representative}</p>
            <p><strong>髮ｻ隧ｱ逡ｪ蜿ｷ:</strong> ${entry.phone}</p>
            <p><strong>繝｡繝ｼ繝ｫ:</strong> ${entry.email}</p>
            <p><strong>逋ｻ骭ｲ蛹ｺ蛻・</strong> <span class="badge ${entry.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : entry.source === '荳闊ｬ' ? 'badge-ippan' : entry.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho'}">${entry.source}</span></p>
            <p><strong>迴ｾ蝨ｨ縺ｮ迥ｶ諷・</strong> ${entry.status === 'checked-in' ? '笨・蜿嶺ｻ俶ｸ・ : entry.status === 'cancelled' ? '圻 繧ｭ繝｣繝ｳ繧ｻ繝ｫ' : '竢ｳ 譛ｪ蜿嶺ｻ・}</p>
            <p><strong>蠕礼せ蜷郁ｨ・</strong> <span style="font-size: 1.2rem; font-weight: 900; color: var(--primary-color);">${groupPoints} pt</span></p>
        </div>
        <h4 style="margin-bottom: 0.8rem; font-size: 1rem; color: #475569;">蜿ょ刈閠・・險ｳ (${entry.participants.length}蜷・</h4>
        <div>${participantsHtml}</div>
    `;

    modal.classList.remove('hidden');
};

/**
 * v8.1.48: Close detail modal
 */
window.closeDetailModal = function () {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.add('hidden');
};

/**
 * v8.1.48: Request Admin-led Editing (Redirects to form)
 */
window.requestAdminEdit = function (id) {
    try {
        const entry = state.entries.find(e => e.id === id);
        if (!entry) {
            showToast('繧ｨ繝ｳ繝医Μ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ', 'error');
            return;
        }
        
        // Ensure we are in admin mode for the form
        isAdminAuthAction = true;
        
        // 1. Fill the form
        fillFormForEdit(entry);
        
        // 2. Switch view to registration
        switchView(null, 'registration-view');
        
        // 3. UI refinements
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const titleEl = document.getElementById('app-title');
        if (titleEl) titleEl.textContent = "逋ｻ骭ｲ螟画峩: " + entry.id;
        
        // 4. Close modal if open
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.add('hidden');
        
    } catch (e) {
        console.error("BORIJIN: requestAdminEdit failed:", e);
        showToast("邱ｨ髮・判髱｢縺ｸ縺ｮ驕ｷ遘ｻ縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
};

/**
 * v8.1.48: Quick Toggle Status from Dashboard
 */
window.quickCheckIn = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (entry.status === 'cancelled') {
        showToast('繧ｭ繝｣繝ｳ繧ｻ繝ｫ貂医∩縺ｮ繧ｨ繝ｳ繝医Μ繝ｼ縺ｯ蜿嶺ｻ倥〒縺阪∪縺帙ｓ', 'error');
        return;
    }

    const newStatus = entry.status === 'checked-in' ? 'pending' : 'checked-in';
    entry.status = newStatus;
    
    // Also update all individual participants
    entry.participants.forEach(p => {
        if (newStatus === 'checked-in' && p.status === 'absent') return;
        p.status = newStatus;
    });

    entry.lastModified = new Date().toLocaleString('ja-JP');
    if (newStatus === 'checked-in') entry.checkedIn = true;
    
    showToast(`${entry.groupName} 縺ｮ迥ｶ諷九ｒ縲・{newStatus === 'checked-in' ? '蜿嶺ｻ俶ｸ・ : '譛ｪ蜿嶺ｻ・}縲阪↓譖ｴ譁ｰ荳ｭ...`, 'info');
    
    await saveData();
    updateDashboard();
    updateReceptionList();
    showToast(`${entry.groupName} 縺ｮ迥ｶ諷九ｒ譖ｴ譁ｰ縺励∪縺励◆`, 'success');
};

/**
 * v8.1.48: Admin Email Resend
 */
window.resendEmail = async function (id) {
    if (!confirm('縺薙・逕ｳ霎ｼ縺ｮ遒ｺ螳壹Γ繝ｼ繝ｫ繧貞・騾√＠縺ｾ縺吶°・・)) return;
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    showToast('繝｡繝ｼ繝ｫ蜀埼√さ繝槭Φ繝峨ｒ騾∽ｿ｡荳ｭ...', 'info');
    try {
        const payload = { action: 'resend_email', id: entry.id };
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        if (res.status === 'success') {
            showToast('笨・繝｡繝ｼ繝ｫ繧貞・騾√＠縺ｾ縺励◆', 'success');
        } else {
            throw new Error(res.message);
        }
    } catch (e) {
        console.error("Email resend failed:", e);
        showToast('笶・繝｡繝ｼ繝ｫ縺ｮ蜀埼√↓螟ｱ謨励＠縺ｾ縺励◆縲ゅし繝ｼ繝舌・蛛ｴ縺ｮ繝ｭ繧ｰ繧堤｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・, 'error');
    }
};

/**
 * v8.1.48: Entry Cancellation
 */
window.cancelEntry = async function (id) {
    if (!confirm('縺薙・繧ｨ繝ｳ繝医Μ繝ｼ繧偵檎┌蜉ｹ・医く繝｣繝ｳ繧ｻ繝ｫ・峨阪↓縺励∪縺吶°・歃n窶ｻ繝・・繧ｿ縺ｯ繝槭せ繧ｿ縺ｫ谿九ｊ縺ｾ縺吶′縲・寔險医ｄ蜿怜・縺九ｉ縺ｯ髯､螟悶＆繧後∪縺吶・)) return;
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'cancelled';
        entry.lastModified = new Date().toLocaleString('ja-JP');
        await saveData();
        updateDashboard();
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧堤┌蜉ｹ蛹悶＠縺ｾ縺励◆', 'info');
        
        // v8.9.60: Refresh modal or form if visible
        if (document.getElementById('detail-modal')?.classList.contains('hidden') === false) {
            window.showEntryDetails(id);
        }
        if (document.getElementById('edit-entry-id')?.value === id) {
            fillFormForEdit(entry);
        }
    }
};

/**
 * v8.1.48: Restore Entry from Cancellation
 */
window.restoreEntry = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'pending';
        entry.lastModified = new Date().toLocaleString('ja-JP');
        await saveData();
        updateDashboard();
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧呈怏蜉ｹ縺ｪ迥ｶ諷具ｼ域悴蜿嶺ｻ假ｼ峨↓蠕ｩ蜈・＠縺ｾ縺励◆', 'success');
        
        // v8.9.60: Refresh modal or form if visible
        if (document.getElementById('detail-modal')?.classList.contains('hidden') === false) {
            window.showEntryDetails(id);
        }
        if (document.getElementById('edit-entry-id')?.value === id) {
            fillFormForEdit(entry);
        }
    }
};

async function exportGroupsCSV() {
    // v8.9.67: Restored timestamp, removed status as requested
    const headers = ["ID", "蛹ｺ蛻・, "繧ｰ繝ｫ繝ｼ繝怜錐", "莉｣陦ｨ閠・, "髮ｻ隧ｱ逡ｪ蜿ｷ", "繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ", "莠ｺ謨ｰ(驥｣繧・", "莠ｺ謨ｰ(隕句ｭｦ)", "譌･譎・, "蛯呵・];
    const rows = state.entries.filter(e => e.status !== 'cancelled').map(e => [
        e.id, 
        e.source, 
        `"${e.groupName}"`, 
        `"${e.representative || e.representativeName}"`, 
        `'${e.phone || e.repPhone}`, 
        `"${e.email || e.repEmail}"`,
        e.fishers, 
        e.observers, 
        e.timestamp,
        `"${(e.memo || "").replace(/\n/g, " ")}"`
    ]);
    downloadCSV("groups_export.csv", headers, rows);
}

async function exportParticipantsCSV() {
    // v8.9.67: Added timestamp, removed status, and used UI labels for gender/age
    const headers = ["ID", "蛹ｺ蛻・, "繧ｰ繝ｫ繝ｼ繝怜錐", "莉｣陦ｨ髮ｻ隧ｱ", "莉｣陦ｨ繝｡繝ｼ繝ｫ", "豌丞錐", "繝九ャ繧ｯ繝阪・繝", "諤ｧ蛻･", "蟷ｴ莉｣", "蝨ｰ蝓・, "蛹ｺ蛻・驥｣/隕・", "繧ｵ繧､繧ｺ", "逋ｻ骭ｲ譌･譎・, "蛯呵・];
    const rows = [];
    state.entries.filter(e => e.status !== 'cancelled').forEach(e => {
        (e.participants || []).forEach(p => {
            rows.push([
                e.id,
                e.source,
                `"${e.groupName}"`,
                `'${e.phone || e.repPhone || ""}`,
                `"${e.email || e.repEmail || ""}"`,
                `"${p.name}"`,
                `"${p.nickname || ""}"`,
                genderLabels[p.gender] || p.gender,
                ageLabels[p.age] || p.age,
                `"${p.region || ""}"`,
                p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ',
                p.tshirtSize,
                e.timestamp,
                `"${(e.memo || "").replace(/\n/g, " ")}"`
            ]);
        });
    });
    downloadCSV("participants_export.csv", headers, rows);
}

// v8.4.3: Bulk Email Helpers
window.insertMailVar = function(tag) {
    const textarea = document.getElementById('bulk-mail-body');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;
};

window.previewBulkEmail = function() {
    const body = document.getElementById('bulk-mail-body').value;
    const entries = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail);
    if (entries.length === 0) { alert("騾∽ｿ｡蟇ｾ雎｡縺後＞縺ｾ縺帙ｓ縲・); return; }
    
    const entry = entries[0];
    const pList = (entry.participants || []).map(p => `${p.name}(${genderLabels[p.gender] || p.gender})`).join(', ');
    
    const previewText = body
        .replace(/{{逡ｪ蜿ｷ}}/g, entry.id || "")
        .replace(/{{蜷榊燕}}/g, entry.representativeName || "")
        .replace(/{{繧ｰ繝ｫ繝ｼ繝抑}/g, entry.groupName || "")
        .replace(/{{驥｣繧贋ｺｺ謨ｰ}}/g, entry.fishers || "0")
        .replace(/{{隕句ｭｦ莠ｺ謨ｰ}}/g, entry.observers || "0")
        .replace(/{{蜿ょ刈閠・錐邁ｿ}}/g, pList);

    const area = document.getElementById('bulk-mail-preview-area');
    const content = document.getElementById('bulk-mail-preview-content');
    content.textContent = previewText;
    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth' });
};

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    if (!subject || !body) { alert("莉ｶ蜷阪→譛ｬ譁・ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
    
    const entriesToMail = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail).map(e => {
        // Add participantsList string for GAS replacement
        const pList = (e.participants || []).map(p => `${p.name}(${genderLabels[p.gender] || p.gender})`).join(', ');
        return { ...e, participantsList: pList };
    });

    if (entriesToMail.length === 0) { alert("騾∽ｿ｡蟇ｾ雎｡縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・); return; }
    if (!confirm(`${entriesToMail.length} 蜷阪∈蛟句挨繝・・繧ｿ繧貞性繧√◆荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺吶°・歔)) return;
    
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '騾∽ｿ｡荳ｭ...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'bulk_email', 
                subject, 
                body, 
                entries: entriesToMail
            }) 
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('笨・荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺励◆', 'success');
        } else {
            throw new Error(result.message || '騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆');
        }
    } catch (err) {
        console.error(err);
        showToast('笶・繝｡繝ｼ繝ｫ騾∽ｿ｡繧ｨ繝ｩ繝ｼ', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function downloadCSV(filename, headers, rows) {
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// v8.9.70: Re-implemented renderRankings to fix display failure
// v8.9.72: Robust Ranking Renderer for both Individual and Ikesu
window.renderRankings = function() {
    const indContainer = document.getElementById('ranking-list-container-day') || document.getElementById('ranking-list-container');
    const ikesuContainer = document.getElementById('day-ranking-ikesu-list');
    
    if (!indContainer) return;
    indContainer.innerHTML = '<p class="text-center p-4">髮・ｨ井ｸｭ...</p>';
    if (ikesuContainer) ikesuContainer.innerHTML = '<p class="text-center p-4">髮・ｨ井ｸｭ...</p>';
    
    // 1. Individual Ranking Data
    const individualData = [];
    const ikesuScores = {}; // { ikesuId: { total: 0, count: 0, name: "" } }

    state.entries.forEach(entry => {
        if (entry.status === 'cancelled') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher') {
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const score = cA + (cB * 2);
                
                individualData.push({
                    name: p.name,
                    groupName: entry.groupName,
                    id: entry.id,
                    cA, cB, score
                });

                // Aggregation for Ikesu
                if (p.ikesuId) {
                    if (!ikesuScores[p.ikesuId]) {
                        const ikName = state.settings.ikesuList?.find(ik => ik.id === p.ikesuId)?.name || p.ikesuId;
                        ikesuScores[p.ikesuId] = { total: 0, count: 0, name: ikName };
                    }
                    ikesuScores[p.ikesuId].total += score;
                    ikesuScores[p.ikesuId].count += 1;
                }
            }
        });
    });

    // --- Render Individual Table ---
    individualData.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
    
    if (individualData.length === 0) {
        indContainer.innerHTML = '<p class="text-center p-4 text-muted">繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</p>';
    } else {
        let html = `
            <table class="table" style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:8px;">鬆・ｽ・/th>
                        <th style="padding:8px;">蜷榊燕</th>
                        <th style="padding:8px; text-align:center;">蜷郁ｨ・/th>
                    </tr>
                </thead>
                <tbody>`;
        individualData.slice(0, 100).forEach((p, idx) => {
            const rank = idx + 1;
            const rankMark = rank === 1 ? '･・ : rank === 2 ? '･・ : rank === 3 ? '･・ : rank;
            html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:8px;">${rankMark}</td>
                    <td style="padding:8px;"><strong>${p.name}</strong><br><small class="text-muted">${p.groupName}</small></td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:var(--primary-color);">${p.score}pt</td>
                </tr>`;
        });
        html += '</tbody></table>';
        indContainer.innerHTML = html;
    }

    // --- Render Ikesu Table ---
    if (ikesuContainer) {
        const ikesuData = Object.keys(ikesuScores).map(id => {
            const s = ikesuScores[id];
            return { id, name: s.name, average: (s.total / s.count).toFixed(2), total: s.total, count: s.count };
        }).sort((a, b) => b.average - a.average);

        if (ikesuData.length === 0) {
            ikesuContainer.innerHTML = '<p class="text-center p-4 text-muted">繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</p>';
        } else {
            let html = `
                <table class="table" style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:8px;">鬆・ｽ・/th>
                            <th style="padding:8px;">繧､繧ｱ繧ｹ</th>
                            <th style="padding:8px; text-align:center;">蟷ｳ蝮・せ</th>
                        </tr>
                    </thead>
                    <tbody>`;
            ikesuData.forEach((ik, idx) => {
                const rank = idx + 1;
                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px;">${rank}</td>
                        <td style="padding:8px;"><strong>${ik.name}</strong><br><small class="text-muted">${ik.count}蜷・/ 險・{ik.total}pt</small></td>
                        <td style="padding:8px; text-align:center; font-weight:bold; color:#059669;">${ik.average}</td>
                    </tr>`;
            });
            html += '</tbody></table>';
            ikesuContainer.innerHTML = html;
        }
    }
};

// v8.9.70: Implement renderDayResults for Catch List tab
window.renderDayResults = function() {
    const listBody = document.getElementById('day-results-list');
    const filterIkesuId = document.getElementById('day-results-ikesu-filter')?.value;
    if (!listBody) return;
    
    listBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</td></tr>';
    
    // Update Ikesu Filter Options if empty
    const filterSelect = document.getElementById('day-results-ikesu-filter');
    if (filterSelect && filterSelect.options.length <= 1) {
        (state.settings.ikesuList || []).forEach(ik => {
            const opt = document.createElement('option');
            opt.value = ik.id;
            opt.textContent = ik.name;
            filterSelect.appendChild(opt);
        });
    }
    
    const rows = [];
    state.entries.forEach(entry => {
        if (entry.status === 'cancelled') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher') {
                if (filterIkesuId && p.ikesuId !== filterIkesuId) return;
                
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const score = cA + (cB * 2);
                const ikName = state.settings.ikesuList?.find(ik => ik.id === p.ikesuId)?.name || '-';
                
                rows.push(`
                    <tr>
                        <td style="font-family:monospace; font-weight:bold;">${entry.id}</td>
                        <td><span class="badge badge-outline" style="border:1px solid #cbd5e1; color:#475569;">${ikName}</span></td>
                        <td><strong>${p.name}</strong><br><small class="text-muted">${entry.groupName}</small></td>
                        <td class="text-center">${cA}</td>
                        <td class="text-center">${cB}</td>
                        <td class="text-center" style="font-weight:900; color:var(--primary-color); font-size:1.1rem;">${score}pt</td>
                        <td class="no-print">
                            <button class="btn-outline btn-small" onclick="window.openDayEditModal('${entry.id}', '${p.name}')">菫ｮ豁｣</button>
                        </td>
                    </tr>`);
            }
        });
    });
    
    if (rows.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">隧ｲ蠖薙☆繧九ョ繝ｼ繧ｿ縺後≠繧翫∪縺帙ｓ</td></tr>';
    } else {
        listBody.innerHTML = rows.join('');
    }
};

window.openDayEditModal = function(entryId, pName) {
    alert(`蛟句挨菫ｮ豁｣讖溯・縺ｯ縲碁・譫懷・蜉・螟夜Κ)縲阪い繝励Μ縺九ｉ縲・{entryId} (${pName}) 繧帝∈謚槭＠縺ｦ陦後▲縺ｦ縺上□縺輔＞縲Ａ);
};

/* --- LEADER ENTRY LOGIC --- */
function renderLeaderEntryForm() {
    const container = document.getElementById('leader-entry-form-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center p-4">隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>';
    const searchHtml = `
        <div class="form-group">
            <label>蜈･蜉帙☆繧九メ繝ｼ繝繧帝∈謚・/label>
            <select id="leader-group-select" class="form-control" style="font-size:1.1rem; padding:0.8rem;">
                <option value="">-- 繝√・繝繧帝∈謚槭＠縺ｦ縺上□縺輔＞ --</option>
                ${state.entries
                    .filter(e => e.status !== 'cancelled')
                    .sort((a,b) => a.groupName.localeCompare(b.groupName, 'ja'))
                    .map(e => `<option value="${e.id}">${e.groupName} (${e.representative})</option>`).join('')}
            </select>
        </div>
        <div id="leader-score-input-area" class="hidden mt-4"></div>`;
    container.innerHTML = searchHtml;

    const selectEl = document.getElementById('leader-group-select');
    if (selectEl) {
        selectEl.addEventListener('change', (e) => {
            const id = e.target.value;
            const area = document.getElementById('leader-score-input-area');
            if (!id) { area.classList.add('hidden'); return; }
            const entry = state.entries.find(en => en.id === id);
            area.innerHTML = `
                <div class="card p-3 mb-3" style="background:#f8f9ff">
                    <h4>${entry.groupName}</h4>
                    <p class="small text-muted">ID: ${entry.id} / 莉｣陦ｨ閠・ ${entry.representative}</p>
                    <div class="form-group mt-3">
                        <label style="font-weight:bold">驥｣譫懊・繧､繝ｳ繝・(蜷郁ｨ・</label>
                        <input type="number" id="leader-point-input" class="form-control" 
                               style="font-size:2rem; font-weight:900; text-align:center;" 
                               value="${entry.totalScore || 0}" min="0">
                    </div>
                </div>
                <button class="btn-primary w-100 p-3" style="font-size:1.2rem" onclick="window.commitLeaderResultsSave()">
                    遒ｺ螳壹＠縺ｦ菫晏ｭ・
                </button>`;
            area.classList.remove('hidden');
        });
    }
}

window.backToLeaderEdit = function() { switchView(null, 'leader-entry-view'); };

window.commitLeaderResultsSave = async function() {
    const id = document.getElementById('leader-group-select')?.value;
    const scoreVal = document.getElementById('leader-point-input')?.value;
    const score = parseInt(scoreVal || 0);

    if (!id) { alert("繝√・繝繧帝∈謚槭＠縺ｦ縺上□縺輔＞縲・); return; }
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    if (!confirm(`${entry.groupName} 縺ｮ蠕礼せ繧・${score} pt 縺ｧ逋ｻ骭ｲ縺励∪縺吶°・歔)) return;

    entry.totalScore = score;
    entry.lastModified = new Date().toLocaleString('ja-JP');
    showToast("菫晏ｭ倅ｸｭ...", "info");
    const success = await syncToCloud();
    if (success) {
        showToast("笨・菫晏ｭ伜ｮ御ｺ・＠縺ｾ縺励◆", "success");
        renderLeaderEntryForm();
    } else {
        showToast("笶・蜷梧悄縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
};

/* --- SYSTEM UTILITIES --- */
function updateBulkMailCount() {
    const el = document.getElementById('bulk-mail-recipient-count');
    if (el) el.textContent = new Set(state.entries.map(e => e.email.toLowerCase().trim()).filter(e => e)).size;
}

function updateSourceAvailability() {
    try {
        const fishersIppan = sumCategoryFishers('荳闊ｬ');
        const fishersMintsuri = sumCategoryFishers('縺ｿ繧馴・繧・);
        const fishersSuiho = sumCategoryFishers('豌ｴ螳・);
        const fishersHarimitsu = sumCategoryFishers('繝上Μ繝溘ヤ');
        
        // v8.1.18: Filter out cancelled for global capacity check
        const totalNow = state.entries.filter(e => e.status !== 'cancelled').reduce((sum, en) => sum + en.fishers, 0);

        const updateRadio = (val, current, max) => {
            const radio = document.querySelector(`input[name="reg-source"][value="${val}"]`);
            if (radio) {
                const label = radio.closest('label');
                // Block if Category Limit reached OR Global Limit reached
                // v8.1.30: Priority check - If Category is FULL but Admin is logged in, 
                // allow the choice ONLY if we ARE NOT in a "Special Window" (forced source).
                // If it's a forced source, we MUST keep it hidden/disabled for non-forced.
                
                const isSpecialWindow = document.getElementById('main-source-selector')?.classList.contains('special-window');
                const isFull = (max > 0 && current >= max) || totalNow >= state.settings.capacityTotal;

                if (isFull && !radio.checked && !isAdminAuthAction && !isAdminAuth) {
                    radio.disabled = true;
                    if (label) label.classList.add('hidden');
                } else {
                    // v8.1.24: Check if this source is being forced/locked by injectSpecialSource
                    const isForced = label.classList.contains('forced-source');

                    if (isSpecialWindow) {
                        // v8.1.36: If it's a special window, DON'T unhide others (including General)
                        if (isForced) {
                            radio.disabled = false;
                            label.classList.remove('hidden');
                        } else {
                            label.classList.add('hidden');
                            radio.disabled = true;
                        }
                    } else if (!isAdminAuthAction && !isAdminAuth) {
                        // Standard unhide logic
                        radio.disabled = false;
                        if (label) label.classList.remove('hidden');
                    }
                }
            }
        };

        updateRadio('荳闊ｬ', fishersIppan, state.settings.capacityGeneral);
        updateRadio('縺ｿ繧馴・繧・, fishersMintsuri, state.settings.capacityMintsuri);
        updateRadio('豌ｴ螳・, fishersSuiho, state.settings.capacitySuiho);
        updateRadio('繝上Μ繝溘ヤ', fishersHarimitsu, state.settings.capacityHarimitsu);
    } catch (e) {
        console.warn("Source availability check skipped:", e);
    }
}

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    if (!subject || !body) { alert("莉ｶ蜷阪→譛ｬ譁・ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
    const entriesToMail = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail);
    if (entriesToMail.length === 0) { alert("騾∽ｿ｡蟇ｾ雎｡縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・); return; }
    if (!confirm(`${entriesToMail.length} 蜷阪∈蛟句挨繝・・繧ｿ繧貞性繧√◆荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺吶°・歃n・域悽譁・・縺ｮ {{逡ｪ蜿ｷ}}, {{蜷榊燕}} 遲峨′閾ｪ蜍慕ｽｮ謠帙＆繧後∪縺呻ｼ荏)) return;
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '騾∽ｿ｡荳ｭ...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'bulk_email', 
                subject, 
                body, 
                entries: entriesToMail // 騾∽ｿ｡蟇ｾ雎｡縺ｮ繧ｨ繝ｳ繝医Μ繧偵∪繧九＃縺ｨ貂｡縺・
            }) 
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('笨・荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺励◆', 'success');
            document.getElementById('bulk-mail-subject').value = '';
            document.getElementById('bulk-mail-body').value = '';
        } else { throw new Error(result.message || '騾∽ｿ｡繧ｨ繝ｩ繝ｼ'); }
    } catch (error) {
        console.error("Bulk email error:", error);
        showToast('笶・繝｡繝ｼ繝ｫ縺ｮ騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

function initToast() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

function showToast(message, type = 'info') {
    initToast();
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

/* --- SECURE ADMIN ACCESS Consolidated (v8.9.65) --- */

/**
 * v8.1.15: Restore missing URL parameter helper to resolve startup error
 */
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const id = params.get('id');
    const src = params.get('src');

    // v8.1.45: Unified URL Parameter Handler
    if (src || view) {
        console.log("BORIJIN: Handling deep-link parameters:", { src, view });
        
        // 1. Handle Source (Primary Context)
        if (src) {
            const validSources = { 'mintsuri': '縺ｿ繧馴・繧・, 'harimitsu': '繝上Μ繝溘ヤ', 'suiho': '豌ｴ螳・, 'general': '荳闊ｬ' };
            const decodedSrc = validSources[src.toLowerCase()];
            if (decodedSrc) injectSpecialSource(decodedSrc);
        }

        // 2. Handle View (Navigation)
        if (view) {
            // Mapping for aliases
            const viewAliases = { 'mintsuri': 'mintsuri-coordinator-view', 'harimitsu': 'harimitsu-coordinator-view', 'suiho': 'suiho-coordinator-view' };
            const targetView = viewAliases[view] || view;

            if (document.getElementById(targetView)) {
                // Security Check: Only protect core management views. Coordinator views are accessible via shared URL.
                const adminViews = ['dashboard-view', 'reception-view', 'settings-view'];
                if (adminViews.includes(targetView) && !isAdminAuth) {
                    console.log("BORIJIN: Redirecting to admin login for protected view:", targetView);
                    showAdminLogin(targetView);
                } else {
                    switchView(null, targetView);
                }
            }
        }
    }

    // v8.9.35: Sanitize 'id' before putting it into the auth field.
    // If it looks like a URL, it's probably browser autofill or a bad link.
    if (id && document.getElementById('auth-entry-id')) {
        const isLikelyUrl = id.includes('://') || id.includes('index.html');
        if (!isLikelyUrl) {
            document.getElementById('auth-entry-id').value = id;
        } else {
            console.warn("BORIJIN: Suppressing URL injection into auth field:", id);
        }
    }
}

/**
 * v8.1.18: Updated category URL injection helper (Locked but visible UI)
 */
function injectSpecialSource(sourceName) {
    const selector = document.getElementById('main-source-selector');
    const selectorGroup = document.getElementById('source-selector-group');
    if (!selector) return;

    // v8.1.24: Mark as special window to prevent updateSourceAvailability from unhiding others
    selector.classList.add('special-window');

    // v8.1.23: Hide selector entirely if it's 'General' (unless admin)
    if (sourceName === '荳闊ｬ' && !isAdminAuth) {
        if (selectorGroup) selectorGroup.classList.add('hidden');
        console.log("General window: hiding selector");
    } else {
        if (selectorGroup) selectorGroup.classList.remove('hidden');
    }

    // v8.1.22: Hide other categories in specialized view
    selector.querySelectorAll('.source-option').forEach(opt => {
        const input = opt.querySelector('input');
        opt.classList.add('hidden'); // Hide others
        opt.classList.remove('forced-source');
        input.disabled = true;
    });

    // Find our specific target radio
    let target = selector.querySelector(`input[name="reg-source"][value="${sourceName}"]`);
    
    if (!target) {
        // Create specialized radio if missing
        const badgeClassMap = { '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu', '縺ｿ繧馴・繧・: 'badge-mintsuri' };
        const badgeClass = badgeClassMap[sourceName] || 'badge-ippan';
        const label = document.createElement('label');
        label.className = 'source-option forced-source'; // No hidden class here
        label.innerHTML = `
            <input type="radio" name="reg-source" value="${sourceName}" checked required>
            <span class="source-label">
                <span class="badge ${badgeClass}">${sourceName}</span>
            </span>
        `;
        selector.appendChild(label);
        target = label.querySelector('input');
    } else {
        target.checked = true; // Force check (v8.1.36)
        target.disabled = false;
        const label = target.closest('.source-option');
        label.classList.remove('hidden'); // Show target
        // v8.1.26: Remove admin-only mark so regular users see the label/text
        label.classList.remove('admin-only'); 
        label.classList.add('forced-source');
        
        // Ensure parent group is visible
        if (selectorGroup) selectorGroup.classList.remove('hidden');
    }

    // Trigger change event to update UI/capacity states
    if (target) {
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // v8.1.36: Explicitly ensure "荳闊ｬ" is hidden in ANY specialized window
    if (sourceName !== '荳闊ｬ') {
        const ippanRadio = selector.querySelector('input[value="荳闊ｬ"]');
        if (ippanRadio) {
            ippanRadio.disabled = true;
            ippanRadio.closest('.source-option')?.classList.add('hidden');
        }
    }
    
    console.log(`Special view applied for: ${sourceName}`);
}

/**
 * v8.1.44: Helper to open URLs in a new tab
 */
window.openShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (el && el.value) {
        window.open(el.value, '_blank');
    }
};

/**
 * v8.1.44: Helper to copy URL to clipboard
 */
window.copyShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (el && el.value) {
        navigator.clipboard.writeText(el.value).then(() => {
            showToast('繧ｳ繝斐・縺励∪縺励◆', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            showToast('繧ｳ繝斐・縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
        });
    }
};

// v8.1.68: Safe global exports - Only export if the local name exists as a function
(function exportGlobals() {
    const globals = {
        'updateDashboard': typeof updateDashboard !== 'undefined' ? updateDashboard : window.updateDashboard,
        'switchView': typeof switchView !== 'undefined' ? switchView : window.switchView,
        'switchAdminTab': typeof switchAdminTab !== 'undefined' ? switchAdminTab : window.switchAdminTab
    };
    // Note: Most functions are already defined on window. We don't need redundant assignments.
})();

function showLoading() {
    updateSyncStatus('syncing');
}
function hideLoading() {
    updateSyncStatus('success');
}

/**
 * v8.6.0: Enhanced Sync Status Handler
 */
window.updateSyncStatus = function(status) {
    const dot = document.querySelector('.sync-dot');
    const text = document.getElementById('sync-text');
    if (!dot || !text) return;

    dot.classList.remove('syncing');
    
    switch(status) {
        case 'syncing':
            dot.style.background = '#3b82f6';
            dot.classList.add('syncing');
            text.textContent = '蜷梧悄荳ｭ...';
            break;
        case 'success':
            dot.style.background = '#22c55e';
            text.textContent = '蜷梧悄貂医∩';
            break;
        case 'error':
        case 'error-silent':
            dot.style.background = '#ef4444';
            text.textContent = '繧ｪ繝輔Λ繧､繝ｳ';
            break;
    }
};

/**
 * v8.6.0: Change Log Logic
 */
window.logChange = function(entry, type, oldEntry = null) {
    if (!state.changeLog) state.changeLog = [];
    
    let details = [];
    if (type === '菫ｮ豁｣' && oldEntry) {
        if (oldEntry.groupName !== entry.groupName) details.push(`繧ｰ繝ｫ繝ｼ繝怜錐: ${oldEntry.groupName} 竊・${entry.groupName}`);
        const oldRep = oldEntry.representative || oldEntry.representativeName;
        const newRep = entry.representative || entry.representativeName;
        if (oldRep !== newRep) details.push(`莉｣陦ｨ閠・ ${oldRep} 竊・${newRep}`);
        
        if ((oldEntry.phone || oldEntry.repPhone) !== (entry.phone || entry.repPhone)) details.push(`髮ｻ隧ｱ逡ｪ蜿ｷ繧貞､画峩`);
        if ((oldEntry.email || oldEntry.repEmail) !== (entry.email || entry.repEmail)) details.push(`繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ繧貞､画峩`);
        if (oldEntry.memo !== entry.memo) details.push(`蛯呵・ｬ・ｒ譖ｴ譁ｰ`);
        
        const oldPCount = (oldEntry.participants || []).length;
        const newPCount = (entry.participants || []).length;
        if (oldPCount !== newPCount) details.push(`莠ｺ謨ｰ螟画峩: ${oldPCount}莠ｺ 竊・${newPCount}莠ｺ`);
        
        // Detailed participant check
        entry.participants.forEach((p, i) => {
            const oldP = oldEntry.participants && oldEntry.participants[i];
            if (oldP) {
                if (oldP.name !== p.name) details.push(`蜿ょ刈閠・{i+1}豌丞錐: ${oldP.name} 竊・${p.name}`);
                if (oldP.age !== p.age) details.push(`蜿ょ刈閠・{i+1}蟷ｴ莉｣縺ｮ螟画峩`);
                if (oldP.gender !== p.gender) details.push(`蜿ょ刈閠・{i+1}諤ｧ蛻･縺ｮ螟画峩`);
                if (oldP.tshirtSize !== p.tshirtSize) details.push(`蜿ょ刈閠・{i+1}T繧ｷ繝｣繝・し繧､繧ｺ: ${oldP.tshirtSize} 竊・${p.tshirtSize}`);
                if (oldP.type !== p.type) details.push(`蜿ょ刈閠・{i+1}遞ｮ蛻･: ${oldP.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'} 竊・${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}`);
            } else {
                details.push(`蜿ょ刈閠・ｿｽ蜉: ${p.name}`);
            }
        });
        
        if (details.length === 0) details.push("逋ｻ骭ｲ蜀・ｮｹ縺ｮ譖ｴ譁ｰ・郁ｩｳ邏ｰ縺ｪ縺暦ｼ・);
    }

    const logEntry = {
        id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        type: type, // '譁ｰ隕冗匳骭ｲ', '菫ｮ豁｣', '蜑企勁', '險ｭ螳壼､画峩'
        groupName: entry.groupName || entry.representativeName || '荳肴・',
        entryId: entry.id || 'NEW',
        isAdmin: !!(isAdminAuth || isAdminAuthAction),
        details: details
    };

    state.changeLog.unshift(logEntry);
    if (state.changeLog.length > 200) state.changeLog.pop();
    
    state.lastUpdated = Date.now();
    saveStateToLocalStorage();
};

window.deleteLogItem = function(logId) {
    if (!confirm("縺薙・螻･豁ｴ繧貞炎髯､縺励∪縺吶°・・)) return;
    state.changeLog = state.changeLog.filter(l => l.id !== logId);
    saveStateToLocalStorage();
    window.renderChangeLog();
};

window.renderChangeLog = function() {
    const container = document.getElementById('change-log-container');
    if (!container) return;

    if (!state.changeLog || state.changeLog.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">螟画峩螻･豁ｴ縺ｯ縺ゅｊ縺ｾ縺帙ｓ</div>';
        return;
    }

    const html = state.changeLog.map(log => {
        let badgeClass = 'log-badge-edit';
        let itemClass = 'log-edit';
        
        if (log.type === '譁ｰ隕冗匳骭ｲ') { badgeClass = 'log-badge-new'; itemClass = 'log-new'; }
        else if (log.type === '蜑企勁') { badgeClass = 'log-badge-delete'; itemClass = 'log-delete'; }
        
        const adminMark = log.isAdmin ? '<span class="admin-badge" style="background:#6366f1; color:white; padding:1px 4px; border-radius:3px; font-size:0.65rem; margin-right:4px;">邂｡逅・・/span>' : '';
        
        let detailsHtml = '';
        if (log.details && log.details.length > 0) {
            detailsHtml = `<div class="log-details-list" style="margin-top: 4px; padding-left: 10px; border-left: 2px solid #e2e8f0; font-size: 0.8rem; color: #64748b;">
                ${log.details.map(d => `<div class="log-detail-item" style="margin-bottom: 2px;">繝ｻ${d}</div>`).join('')}
            </div>`;
        }

        return `
            <div class="log-item ${itemClass}" style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; position: relative;">
                <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; font-size: 0.82rem; overflow: hidden;">
                    <span class="log-badge ${badgeClass}" style="font-size: 0.65rem; padding: 1px 4px; flex-shrink: 0;">${log.type}</span>
                    <span class="log-time" style="font-size: 0.7rem; color: #64748b; flex-shrink: 0;">${log.dateStr}</span>
                    ${adminMark ? adminMark.replace('margin-right:4px;', 'margin-right:0;') : ''}
                    <span class="log-group" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${log.groupName}</span> 
                    <span class="text-muted" style="font-size:0.7rem; flex-shrink: 0;">(ID: ${log.entryId})</span>
                    <span style="flex-shrink: 0; color: #475569;">${log.type === '譁ｰ隕冗匳骭ｲ' ? '逋ｻ骭ｲ' : log.type === '蜑企勁' ? '蜑企勁' : '菫ｮ豁｣'}</span>
                    <button class="btn-icon" onclick="window.deleteLogItem('${log.id}')" style="font-size: 1.1rem; padding: 0 4px; opacity: 0.3; margin-left: auto;">&times;</button>
                </div>
                ${detailsHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
};

function saveStateToLocalStorage() {
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
}

window.clearLocalCache = function() {
    if (confirm('繝悶Λ繧ｦ繧ｶ縺ｮ繧ｭ繝｣繝・す繝･繝・・繧ｿ繧貞炎髯､縺励√け繝ｩ繧ｦ繝峨°繧画怙譁ｰ繝・・繧ｿ繧貞・蜿門ｾ励＠縺ｾ縺吶°・歃n・亥・蜉幃比ｸｭ縺ｮ繝・・繧ｿ縺後≠繧句ｴ蜷医・豸医∴縺ｦ縺励∪縺・∪縺呻ｼ・)) {
        localStorage.removeItem('fishing_app_v3_data');
        location.reload();
    }
};
window.sortDashboard = function(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    updateDashboard();
};

window.setDashboardFilter = function(filter) {
    dashboardFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
    updateDashboard();
};

/**
 * v8.9.50: Suiho Bulk Import from Excel
 * 豌ｴ螳晄棧縺ｮ髮ｻ隧ｱ蜿嶺ｻ倥ョ繝ｼ繧ｿ・・xcel・峨ｒTSV蠖｢蠑上〒荳諡ｬ蜿悶ｊ霎ｼ縺ｿ縺吶ｋ讖溯・
 */
window.openBulkImportModal = function() {
    const modal = document.getElementById('bulk-import-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.getElementById('bulk-import-input').value = '';
    document.getElementById('import-preview-area').classList.add('hidden');
    document.getElementById('import-status-area').classList.add('hidden');
    document.getElementById('import-status-area').innerHTML = '';
};

window.handleBulkImportExecute = async function() {
    const input = document.getElementById('bulk-import-input').value.trim();
    if (!input) {
        alert("繝・・繧ｿ繧定ｲｼ繧贋ｻ倥￠縺ｦ縺上□縺輔＞縲・);
        return;
    }

    const lines = input.split('\n');
    const entries = [];
    let currentEntry = null;

    // 蟷ｴ莉｣繝槭ャ繝斐Φ繧ｰ
    const ageMap = {
        '・・: 'unknown', '荳肴・': 'unknown', '?': 'unknown',
        '5': 'elementary', '10': 'elementary', '蟆丞ｭｦ': 'elementary',
        '20': '19_20s', '30': '30s', '40': '40s', '50': '50s', '60': '60s', '70': '70s', '80': '80s',
        '荳ｭ': 'middle_high', '鬮・: 'middle_high'
    };
    
    // T繧ｷ繝｣繝・・繝・ヴ繝ｳ繧ｰ (v7.7.0貅匁侠)
    const tshirtMap = {
        'LL': 'XL・・L・・, '2L': 'XL・・L・・, 'XL': 'XL・・L・・,
        '3L': '2XL・・L・・, '2XL': '2XL・・L・・,
        '4L': '3XL・・L・・, '3XL': '3XL・・L・・,
        '5L': '4XL・・L・・, '4XL': '4XL・・L・・
    };

    lines.forEach((line) => {
        const cols = line.split('\t').map(c => c.trim());
        if (cols.length < 3) return; // 辟｡蜉ｹ縺ｪ陦・

        const groupName = cols[0];
        const fisherCountRaw = parseInt(cols[1]);
        const pName = cols[2];
        const pGenderRaw = cols[3];
        const pAgeRaw = cols[4];
        const pRegion = cols[5];
        const pTshirtRaw = cols[6];
        const repPhone = cols[7];

        // 繧ｰ繝ｫ繝ｼ繝怜錐縺後≠繧句ｴ蜷医・譁ｰ縺励＞繧ｰ繝ｫ繝ｼ繝励ｒ髢句ｧ・
        if (groupName && groupName !== "") {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {
                groupName: groupName,
                representative: pName || groupName,
                representativeName: pName || groupName,
                phone: repPhone || "000-0000-0000",
                repPhone: repPhone || "000-0000-0000",
                email: "suiho-manual@example.com",
                repEmail: "suiho-manual@example.com",
                source: "豌ｴ螳・,
                participants: [],
                status: 'pending',
                password: '0000',
                memo: "Excel荳諡ｬ逋ｻ骭ｲ蛻・,
                expectedCount: fisherCountRaw || 1
            };
        }

        if (currentEntry) {
            // 蜷榊燕縺檎ｩｺ縺ｧ繧ゅ碁・繧贋ｺｺ謨ｰ縲阪・陦梧焚蛻・・霑ｽ蜉繧定ｩｦ縺ｿ繧・
            if (pName || pGenderRaw || pAgeRaw || pTshirtRaw || currentEntry.participants.length < currentEntry.expectedCount) {
                const finalName = pName || `${currentEntry.groupName} 蜿ょ刈閠・{currentEntry.participants.length + 1}`;
                
                // 蟷ｴ莉｣縺ｮ豁｣隕丞喧
                let ageKey = 'unknown'; // Default to unknown for bulk
                for (let k in ageMap) { if (pAgeRaw && pAgeRaw.includes(k)) { ageKey = ageMap[k]; break; } }
                
                // T繧ｷ繝｣繝・・豁｣隕丞喧 (v8.9.80: Unified helper)
                let size = normalizeTshirtSize(pTshirtRaw);

                currentEntry.participants.push({
                    name: finalName,
                    type: 'fisher',
                    gender: (pGenderRaw === '螂ｳ') ? 'female' : (pGenderRaw === '逕ｷ' ? 'male' : 'unknown'),
                    age: ageKey,
                    region: pRegion || '',
                    tshirtSize: size,
                    status: 'pending'
                });
            }
        }
    });
    if (currentEntry) entries.push(currentEntry);

    if (entries.length === 0) {
        alert("譛牙柑縺ｪ繝・・繧ｿ繧定ｧ｣譫舌〒縺阪∪縺帙ｓ縺ｧ縺励◆縲ょ・縺ｮ荳ｦ縺ｳ繧堤｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
        return;
    }

    // 繝励Ξ繝薙Η繝ｼ陦ｨ遉ｺ
    const previewContent = document.getElementById('import-preview-content');
    const previewArea = document.getElementById('import-preview-area');
    previewContent.innerHTML = entries.map(e => `
        <div style="margin-bottom:8px; border-bottom:1px solid #ddd; padding-bottom:4px;">
            <strong>${e.groupName}</strong> (${e.participants.length}蜷・ - 莉｣陦ｨ: ${e.representative} / ${e.phone}
            <div style="color:#666; font-size:0.7rem;">${e.participants.map(p => p.name).join(', ')}</div>
        </div>
    `).join('');
    previewArea.classList.remove('hidden');

    if (!confirm(`${entries.length} 莉ｶ縺ｮ繧ｰ繝ｫ繝ｼ繝暦ｼ郁ｨ・${entries.reduce((s, e) => s + e.participants.length, 0)} 蜷搾ｼ峨ｒ蜿悶ｊ霎ｼ縺ｿ縺ｾ縺吶°・歃n窶ｻ螳御ｺ・∪縺ｧ謨ｰ蛻・°縺九ｋ蝣ｴ蜷医′縺ゅｊ縺ｾ縺吶Ａ)) return;

    const btn = document.getElementById('btn-execute-import');
    const statusArea = document.getElementById('import-status-area');
    statusArea.classList.remove('hidden');
    btn.disabled = true;

    let successCount = 0;
    let failedGroups = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        statusArea.innerHTML = `<div class="alert alert-info">
            <strong>${i + 1} / ${entries.length} 繧ｰ繝ｫ繝ｼ繝礼岼繧貞叙繧願ｾｼ縺ｿ荳ｭ...</strong><br>
            [${entry.groupName}] (${entry.participants.length}蜷・ 繧堤匳骭ｲ縺励※縺・∪縺吶・
        </div>`;
        
        try {
            const entryData = {
                ...entry,
                fishers: entry.participants.filter(p => p.type === 'fisher').length,
                observers: entry.participants.filter(p => p.type === 'observer').length,
                timestamp: new Date().toLocaleString('ja-JP'),
                lastUpdated: new Date().toLocaleString('ja-JP'),
                lastModified: new Date().toLocaleString('ja-JP'),
                _ts: Date.now(),
                transactionId: "BULK-" + Date.now() + "-" + i
            };

            // v8.9.62: Use a longer timeout for bulk operations
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout per group

            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'register', entry: entryData }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const result = await response.json();
            if (result && result.status === 'success') {
                successCount++;
            } else {
                console.warn("Server error for group:", entry.groupName, result);
                failedGroups.push(`${entry.groupName} (繧ｵ繝ｼ繝舌・繧ｨ繝ｩ繝ｼ: ${result?.message || '荳肴・'})`);
            }

            // v8.9.62: Add a small delay between requests to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 800));

        } catch (err) {
            console.error("Fetch error for group:", entry.groupName, err);
            failedGroups.push(`${entry.groupName} (騾壻ｿ｡繧ｨ繝ｩ繝ｼ: ${err.message})`);
        }
    }

    // 譛邨らｵ先棡縺ｮ陦ｨ遉ｺ
    btn.disabled = false;
    let finalHtml = `<h3>蜿悶ｊ霎ｼ縺ｿ螳御ｺ・/h3>
        <p style="font-size:1.1rem; font-weight:bold;">謌仙粥: ${successCount} / 蜈ｨ ${entries.length} 繧ｰ繝ｫ繝ｼ繝・/p>`;
    
    if (failedGroups.length > 0) {
        finalHtml += `<div class="alert alert-danger" style="background:#fee2e2; border:1px solid #ef4444; color:#991b1b; margin-top:10px; padding:10px; border-radius:6px;">
            <strong>莉･荳九・繧ｰ繝ｫ繝ｼ繝励・逋ｻ骭ｲ縺ｫ螟ｱ謨励＠縺ｾ縺励◆・・/strong>
            <ul style="margin:5px 0 0 20px; font-size:0.8rem;">
                ${failedGroups.map(f => `<li>${f}</li>`).join('')}
            </ul>
            <p style="font-size:0.75rem; margin-top:5px;">窶ｻ螟ｱ謨励＠縺溷・縺縺代ｒ蜀榊ｺｦ繧ｳ繝斐・縺励※繧・ｊ逶ｴ縺励※縺上□縺輔＞縲・/p>
        </div>`;
    }

    finalHtml += `<div class="alert alert-success" style="background:#d1fae5; border:1px solid #10b981; color:#065f46; margin-top:10px; padding:10px; border-radius:6px;">
        蜷咲ｰｿ繧呈峩譁ｰ縺吶ｋ縺溘ａ縲・遘貞ｾ後↓逕ｻ髱｢繧貞・隱ｭ縺ｿ霎ｼ縺ｿ縺励∪縺・..
    </div>`;

    statusArea.innerHTML = finalHtml;
    showToast(`荳諡ｬ蜿悶ｊ霎ｼ縺ｿ螳御ｺ・ ${successCount}莉ｶ謌仙粥`, successCount === entries.length ? "success" : "warning");
    
    setTimeout(() => {
        if (successCount > 0) location.reload();
    }, 4000);
};


// v8.9.70: Added popstate listener to support browser back button navigation
window.onpopstate = function(event) {
    if (event.state && event.state.viewId) {
        // v8.9.70: Use skipPush=true to avoid creating a history loop
        switchView(event.state.viewId, true);
    } else {
        // Fallback if no state (e.g., first page)
        switchView('registration-view', true);
    }
};

// End of script
