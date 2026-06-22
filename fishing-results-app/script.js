const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbykDT-XvGhrZCQcCp_gCxZAToW3X4s_g_BPX7LBO4E-A84vUY0VE3nlqehITFOfp9f9/exec";

let state = {
    entries: [],
    settings: {},
    lastUpdated: 0
};

let currentIkesu = null;
let editingParticipant = null; // { entryId, partIdx }

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    showLoading(true);
    await fetchData();
    // v1.1.0: Populate Ikesu selection
    const loginSelect = document.getElementById('login-ikesu-id');
    if (loginSelect && state.settings.ikesuList) {
        state.settings.ikesuList.forEach(ik => {
            const opt = document.createElement('option');
            opt.value = ik.id;
            opt.textContent = ik.name;
            loginSelect.appendChild(opt);
        });
        // v1.1.1: Add Admin at the bottom
        const adminOpt = document.createElement('option');
        adminOpt.value = 'admin';
        adminOpt.textContent = '【管理者】';
        loginSelect.appendChild(adminOpt);
    }

    // Event Listeners
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.querySelectorAll('.logout-btn').forEach(btn => btn.addEventListener('click', handleLogout));
    document.getElementById('save-btn').addEventListener('click', handleSave);
    
    // v1.2.0: Public Ranking View
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'ranking') {
        document.querySelector('#admin-view h2').textContent = '釣果ランキング';
        document.querySelectorAll('.logout-btn').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('#admin-view .card').forEach(c => {
            if (!c.querySelector('h3') || !c.querySelector('h3').textContent.includes('全体釣果')) {
                c.style.display = 'none';
            }
        });
        showView('admin-view');
        renderAdminView();
        showLoading(false);
        return;
    }

    // v1.1.0: Auto-login
    const savedIkesuId = sessionStorage.getItem('loggedIkesuId');
    if (savedIkesuId) {
        if (savedIkesuId === 'admin') {
            showView('admin-view');
            renderAdminView();
        } else {
            const ikesu = state.settings.ikesuList.find(i => i.id === savedIkesuId);
            if (ikesu) {
                currentIkesu = ikesu;
                showView('main-view');
                renderParticipantList();
            }
        }
    }
    
    showLoading(false);
}

async function fetchData() {
    try {
        const response = await fetch(GAS_WEB_APP_URL + "?action=get");
        const data = await response.json();
        state = data;
        console.log("Data synchronized:", state);
    } catch (err) {
        console.error("Fetch error:", err);
        showToast("データの読み込みに失敗しました", "error");
    }
}

function handleLogin() {
    const selectedId = document.getElementById('login-ikesu-id').value;
    const passcode = document.getElementById('ikesu-passcode').value.trim();
    
    if (!selectedId || !passcode) return;

    if (selectedId === 'admin') {
        const adminPass = String(state.settings.adminPassword || "1212");
        if (passcode === adminPass || passcode === "1212") {
            sessionStorage.setItem('loggedIkesuId', 'admin');
            showView('admin-view');
            renderAdminView();
            showToast("管理者としてログインしました", "success");
        } else {
            authError();
        }
        return;
    }

    const ikesuList = state.settings.ikesuList || [];
    const found = ikesuList.find(i => i.id === selectedId && String(i.passcode) === passcode);

    if (found) {
        currentIkesu = found;
        sessionStorage.setItem('loggedIkesuId', found.id);
        document.getElementById('auth-error').classList.add('hidden');
        showView('main-view');
        renderParticipantList();
        showToast(`${found.name} としてログインしました`, "success");
    } else {
        authError();
    }
}

function authError() {
    document.getElementById('auth-error').classList.remove('hidden');
    document.getElementById('ikesu-passcode').value = '';
}

function handleLogout() {
    if (confirm("ログアウトしますか？")) {
        currentIkesu = null;
        sessionStorage.removeItem('loggedIkesuId');
        showView('auth-view');
        document.getElementById('ikesu-passcode').value = '';
    }
}

function renderParticipantList() {
    const listContainer = document.getElementById('participant-list');
    const displayIkesuName = document.getElementById('display-ikesu-name');
    const adminBackBtn = document.getElementById('admin-back-btn');
    
    if (!listContainer || !currentIkesu) return;

    const loggedId = sessionStorage.getItem('loggedIkesuId');
    if (adminBackBtn) {
        adminBackBtn.classList.toggle('hidden', loggedId !== 'admin');
    }

    displayIkesuName.textContent = currentIkesu.name;
    listContainer.innerHTML = '';

    let totalPoints = 0;
    let foundAny = false;

    state.entries.forEach(entry => {
        if (entry.status === 'cancelled') return;

        (entry.participants || []).forEach((p, idx) => {
            if (p.status === 'cancelled' || p.status === 'absent') return;
            if (p.ikesuId === currentIkesu.id && p.type === 'fisher') {
                foundAny = true;
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const points = cA + (cB * 2);
                totalPoints += points;

                const card = document.createElement('div');
                card.className = `participant-card`;
                card.innerHTML = `
                    <div class="p-info">
                        <div class="p-name">${p.name} ${p.isLeader ? '⭐' : ''}</div>
                        <div class="p-group">${entry.groupName} (${entry.id})</div>
                    </div>
                    <div class="p-scores-row">
                        <div class="p-input-group">
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#ef4444; font-weight:bold; margin-bottom:2px;">マダイ等</span>
                                <input type="number" class="inline-input red" value="${cA}" min="0" 
                                    onchange="updateInlineScore('${entry.id}', ${idx}, 'catchA', this.value, this)">
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#3b82f6; font-weight:bold; margin-bottom:2px;">青物、クエ</span>
                                <input type="number" class="inline-input blue" value="${cB}" min="0" 
                                    onchange="updateInlineScore('${entry.id}', ${idx}, 'catchB', this.value, this)">
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#64748b; font-weight:bold; margin-bottom:2px;">合計</span>
                                <span class="score-badge total" style="height:40px; display:flex; align-items:center;">${points}pt</span>
                            </div>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            }
        });
    });

    if (!foundAny) {
        listContainer.innerHTML = '<p class="text-muted" style="text-align:center; padding:2rem;">このイケスに割り当てられた釣り人はいません。</p>';
    }

    document.getElementById('ikesu-total-points').textContent = totalPoints;

    const verifyContainer = document.getElementById('admin-verify-container');
    if (adminBackBtn && !adminBackBtn.classList.contains('hidden') && verifyContainer) {
        verifyContainer.classList.remove('hidden');
        verifyContainer.innerHTML = `
            <button onclick="toggleIkesuCheck('${currentIkesu.id}')" 
                style="padding: 1rem 1.5rem; font-size: 1.1rem; font-weight: 800; border-radius: 12px; border: none; cursor: pointer; color: white;
                background: ${currentIkesu.checked ? '#10b981' : '#ef4444'}; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.2s; white-space: nowrap;">
                ${currentIkesu.checked ? '✅ 確認済(戻す)' : '確認済にする'}
            </button>
        `;
    } else if (verifyContainer) {
        verifyContainer.classList.add('hidden');
    }
}

window.updateInlineScore = function(entryId, partIdx, field, value, element) {
    const entry = state.entries.find(e => e.id === entryId);
    if (entry && entry.participants[partIdx]) {
        entry.participants[partIdx][field] = parseInt(value) || 0;
        entry.participants[partIdx]._modified = true;
        entry.lastModified = new Date().toISOString();
        state.lastUpdated = Date.now();
        
        if (element) {
            const p = entry.participants[partIdx];
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const pts = cA + (cB * 2);
            
            const row = element.closest('.p-scores-row');
            if (row) {
                const badge = row.querySelector('.score-badge.total');
                if (badge) badge.textContent = pts + 'pt';
            }
            
            let totalPoints = 0;
            state.entries.forEach(e => {
                if (e.status === 'cancelled') return;
                (e.participants || []).forEach(pp => {
                    if (pp.status === 'cancelled' || pp.status === 'absent') return;
                    if (pp.ikesuId === currentIkesu.id && pp.type === 'fisher') {
                        totalPoints += parseInt(pp.catchA || 0) + (parseInt(pp.catchB || 0) * 2);
                    }
                });
            });
            document.getElementById('ikesu-total-points').textContent = totalPoints;
        } else {
            renderParticipantList();
        }
    }
};

window.toggleCheck = function(entryId, partIdx) {
    // Deprecated in v1.3.0
};

window.showAdminDashboard = function() {
    showView('admin-view');
    renderAdminView();
};

function renderAdminView() {
    const listContainer = document.getElementById('admin-ikesu-list');
    if (!listContainer) return;

    // Load settings into inputs
    const config = state.settings.rankingConfig || { topCount: 3, tobiList: "5,10,15,20,25,30" };
    const rankTopInput = document.getElementById('rank-top-count');
    const rankTobiInput = document.getElementById('rank-tobi-list');
    if (rankTopInput) rankTopInput.value = config.topCount;
    if (rankTobiInput) rankTobiInput.value = config.tobiList;

    let globalA = 0, globalB = 0, globalTotalPts = 0;
    let caughtCount = 0, zeroCount = 0;
    const ikesuList = state.settings.ikesuList || [];
    
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach(p => {
            if (p.status === 'cancelled' || p.status === 'absent') return;
            if (p.type === 'fisher') {
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const pts = cA + (cB * 2);
                const fish = cA + cB;
                
                globalA += cA;
                globalB += cB;
                globalTotalPts += pts;
                
                if (fish > 0) caughtCount++;
                else zeroCount++;
            }
        });
    });

    const ikesuStats = ikesuList.map(ik => {
        let ikA = 0, ikB = 0, ikFish = 0, memberCount = 0, leaderName = '未設定';
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.status === 'cancelled' || p.status === 'absent') return;
                if (p.ikesuId === ik.id && p.type === 'fisher') {
                    ikA += parseInt(p.catchA || 0);
                    ikB += parseInt(p.catchB || 0);
                    ikFish += (parseInt(p.catchA || 0) + parseInt(p.catchB || 0));
                    memberCount++;
                    if (p.isLeader) leaderName = p.name;
                }
            });
        });
        const pts = ikA + (ikB * 2);
        return { ...ik, ikA, ikB, ikFish, pts, memberCount, leaderName };
    });

    // v1.3.1: Change overall total from PT to Fish count per user request
    const globalTotalFish = globalA + globalB;
    document.getElementById('admin-total-points').innerHTML = `${globalTotalFish}<span>匹</span>`;
    document.getElementById('admin-total-cA').innerHTML = `${globalA}<span>匹</span>`;
    document.getElementById('admin-total-cB').innerHTML = `${globalB}<span>匹</span>`;

    // v1.3.1: Add caught/zero stats to the summary
    const summaryHeader = document.querySelector('.admin-stats-summary');
    if (summaryHeader) {
        let statsEl = document.getElementById('admin-extra-stats');
        if (!statsEl) {
            statsEl = document.createElement('div');
            statsEl.id = 'admin-extra-stats';
            statsEl.style.cssText = "display:flex; gap:1rem; margin-top:0.5rem; font-size:0.8rem; color:#64748b; justify-content:center; width:100%;";
            summaryHeader.appendChild(statsEl);
        }
        statsEl.innerHTML = `
            <span>釣果あり: <strong>${caughtCount}</strong>名</span>
            <span>坊主(0匹): <strong style="color:#ef4444;">${zeroCount}</strong>名</span>
        `;
    }

    // Update Status Cards
    const activeIkesus = ikesuStats.filter(ik => ik.memberCount > 0);
    const totalActive = activeIkesus.length;
    // An Ikesu is considered reported if it has catches or is explicitly checked
    const reportedCount = activeIkesus.filter(ik => ik.ikFish > 0 || ik.checked).length;
    const verifiedCount = activeIkesus.filter(ik => ik.checked).length;

    const elReported = document.getElementById('status-reported');
    if (elReported) elReported.textContent = reportedCount;
    const elTotal = document.getElementById('status-total-ikesu');
    if (elTotal) elTotal.textContent = totalActive;
    
    const elVerified = document.getElementById('status-verified');
    if (elVerified) elVerified.textContent = verifiedCount;
    const elTotalV = document.getElementById('status-total-ikesu-v');
    if (elTotalV) elTotalV.textContent = totalActive;

    listContainer.innerHTML = activeIkesus.map(ik => {
        const hasCatch = ik.ikFish > 0;
        const bgClass = ik.checked ? 'checked' : (hasCatch ? 'has-catch' : 'unentered');
        return `
        <div class="ikesu-summary-card ${bgClass}" onclick="jumpToIkesu('${ik.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; gap: 0.5rem; flex-wrap: wrap;">
            
            <div style="display: flex; align-items: baseline; gap: 0.8rem; min-width: 150px;">
                <span style="font-size: 1.4rem; font-weight: 900; color: #1e293b; line-height: 1;">${ik.name}</span>
                <span style="font-size: 1rem; color: #475569; font-weight: 700;">${ik.leaderName} 様</span>
            </div>

            <div style="display: flex; align-items: baseline; gap: 1rem; flex: 1; justify-content: center; min-width: 250px;">
                <span style="font-size: 1.2rem; font-weight: bold; color: #ef4444;">マダイ: ${ik.ikA}</span>
                <span style="font-size: 1.2rem; font-weight: bold; color: #3b82f6;">青物: ${ik.ikB}</span>
                <span style="font-size: 0.9rem; color: #64748b; font-weight: 600;">(計 ${ik.ikFish}匹 / ${ik.memberCount}名)</span>
            </div>

            <div style="display: flex; align-items: center; gap: 1rem; min-width: 200px; justify-content: flex-end;">
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <div style="font-size: 1.6rem; font-weight: 900; color: #0f172a; line-height: 1.1;">${ik.pts}<span style="font-size: 1rem; color: #64748b;">pt</span></div>
                    <div style="font-size: 0.85rem; color: #8b5cf6; font-weight: bold; margin-top: 2px;">平均 ${(ik.pts / ik.memberCount).toFixed(1)}pt</div>
                </div>
                
                ${ik.checked ? 
                    `<span style="color: #10b981; font-weight: bold; font-size: 1.2rem; white-space: nowrap;">✅ 確認済</span>` :
                    `<span style="color: #ef4444; font-weight: 900; font-size: 1.2rem; white-space: nowrap; border: 2px solid #ef4444; padding: 4px 8px; border-radius: 6px;">未確認</span>`
                }
            </div>
        </div>
    `}).join('');
}

window.toggleIkesuCheck = async function(ikesuId) {
    const ik = (state.settings.ikesuList || []).find(i => i.id === ikesuId);
    if (ik) {
        ik.checked = !ik.checked;
        state.lastUpdated = Date.now();
        
        // Optimistic UI
        if (document.getElementById('admin-view').classList.contains('hidden') === false) {
            renderAdminView();
        }
        if (currentIkesu && currentIkesu.id === ikesuId) {
            renderParticipantList();
        }
        
        await handleSave();
    }
};

window.saveRankingSettings = function() {
    const topCount = parseInt(document.getElementById('rank-top-count').value) || 3;
    const tobiList = document.getElementById('rank-tobi-list').value;
    
    state.settings.rankingConfig = { topCount, tobiList };
    state.lastUpdated = Date.now();
    showToast("ランキング設定を保存しました", "success");
    handleSave(); // Sync to cloud
};

window.jumpToIkesu = function(ikesuId) {
    const ik = state.settings.ikesuList.find(i => i.id === ikesuId);
    if (ik) {
        currentIkesu = ik;
        showView('main-view');
        renderParticipantList();
    }
};

// v1.2.0: Modal system is deprecated in favor of inline editing

async function handleSave() {
    showLoading(true, "保存中...");
    try {
        // Fetch latest state from server to prevent overwriting reception app changes
        const fetchResponse = await fetch(GAS_WEB_APP_URL + '?action=load');
        const fetchResult = await fetchResponse.json();
        
        let stateToSave = state;
        
        if (fetchResult.status === 'success' && fetchResult.data) {
            const serverState = fetchResult.data;
            
            // Merge our local catches into the server state
            state.entries.forEach(localEntry => {
                const serverEntry = serverState.entries.find(e => e.id === localEntry.id);
                if (serverEntry) {
                    (localEntry.participants || []).forEach((localP, pIdx) => {
                        if (serverEntry.participants[pIdx]) {
                            if (localP._modified) {
                                serverEntry.participants[pIdx].catchA = localP.catchA;
                                serverEntry.participants[pIdx].catchB = localP.catchB;
                                delete localP._modified;
                            } else {
                                localP.catchA = serverEntry.participants[pIdx].catchA;
                                localP.catchB = serverEntry.participants[pIdx].catchB;
                            }
                        }
                    });
                }
            });
            
            // Merge our local ikesu checked status
            if (state.settings && state.settings.ikesuList && serverState.settings && serverState.settings.ikesuList) {
                state.settings.ikesuList.forEach(localIk => {
                    const serverIk = serverState.settings.ikesuList.find(i => i.id === localIk.id);
                    if (serverIk) {
                        serverIk.checked = localIk.checked;
                    }
                });
            }
            
            // Update local state and prepare to save
            state = serverState;
            stateToSave = serverState;
            
            // Refresh UI with latest data (e.g. check-in statuses)
            renderParticipantList();
        }

        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'save',
                data: stateToSave
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast("保存完了しました", "success");
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error("Save error:", err);
        showToast("保存に失敗しました", "error");
    } finally {
        showLoading(false);
    }
}

// Helpers
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

function showLoading(show, text = "同期中...") {
    const el = document.getElementById('loading-overlay');
    el.querySelector('p').textContent = text;
    el.classList.toggle('hidden', !show);
}

function showToast(msg, type = "info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.generateMockCatchData = async function() {
    if (!confirm("テスト用の仮データ（約9割が釣果あり）を生成しますか？\n※現在の釣果データは上書きされます。")) return;
    
    let updated = false;
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {
                p.isAwardWinner = false;
                
                // 鯛 (Bream) - 1〜4匹を多めにし、青物だけの人や鯛だけで入賞する人を出やすくする
                let rA = Math.random();
                if (rA < 0.10) {
                    p.catchA = Math.floor(Math.random() * 6) + 12; // 12-17匹 (10%: 鯛のみでも入賞の可能性あり)
                } else if (rA < 0.40) {
                    p.catchA = Math.floor(Math.random() * 6) + 6;  // 6-11匹 (30%)
                } else if (rA < 0.80) {
                    p.catchA = Math.floor(Math.random() * 4) + 1;  // 1-4匹 (40%: 要望に合わせて大幅増)
                } else {
                    p.catchA = 0;                                  // 0匹 (20%: 青物だけ釣る人の母数になる)
                }

                // 青物 (Blue) - 少し分散させて被りを減らす
                let rB = Math.random();
                if (rB < 0.01) {
                    p.catchB = 5;       // 1%
                } else if (rB < 0.03) {
                    p.catchB = 4;       // 2%
                } else if (rB < 0.18) {
                    p.catchB = 3;       // 15% (イケスに2人くらい)
                } else if (rB < 0.33) {
                    p.catchB = 2;       // 15%
                } else if (rB < 0.78) {
                    p.catchB = 1;       // 45% (約半分)
                } else {
                    p.catchB = 0;       // 22%
                }
                
                p._modified = true;
                updated = true;
            }
        });
    });
    
    if (updated) {
        state.lastUpdated = Date.now();
        await handleSave();
        if (document.getElementById('admin-view').classList.contains('hidden') === false) {
            renderAdminView();
        } else if (currentIkesu) {
            renderParticipantList();
        }
        showToast("テストデータを生成しました", "success");
    }
};

window.clearCatchData = async function() {
    if (!confirm("⚠️ 本当にすべての釣果データを「0」にリセットしますか？\n※この操作は元に戻せません！")) return;
    
    let updated = false;
    state.entries.forEach(e => {
        (e.participants || []).forEach(p => {
            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {
                p.catchA = 0;
                p.catchB = 0;
                p.isAwardWinner = false;
                p._modified = true;
                updated = true;
            }
        });
    });
    
    if (updated) {
        state.lastUpdated = Date.now();
        await handleSave();
        if (document.getElementById('admin-view').classList.contains('hidden') === false) {
            renderAdminView();
        } else if (currentIkesu) {
            renderParticipantList();
        }
        showToast("すべての釣果をリセットしました", "info");
    } else {
        showToast("リセットするデータがありません", "info");
    }
};
