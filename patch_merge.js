const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf-8');

// 1. Inject merge logic for preorders and surveys into mergeData
const mergeDataSettingsReplacement = `    if (localSetTime > cloudSetTime) {
        merged.settings = { ...cloud.settings, ...local.settings };
        merged.settingsLastModified = local.settingsLastModified;
    } else {
        if (cloud.settings && Object.keys(cloud.settings).length > 0) {
            merged.settings = { ...local.settings, ...cloud.settings };
        } else {
            merged.settings = { ...local.settings };
        }
        merged.settingsLastModified = cloud.settingsLastModified || local.settingsLastModified;
    }
    
    // --- 2.5. 独立フォームのデータマージ ---
    const localPreTime = new Date(local.preordersLastModified || 0).getTime();
    const cloudPreTime = new Date(cloud.preordersLastModified || 0).getTime();
    if (localPreTime > cloudPreTime) {
        merged.preorders = local.preorders || [];
        merged.preordersLastModified = local.preordersLastModified;
    } else {
        merged.preorders = cloud.preorders || [];
        merged.preordersLastModified = cloud.preordersLastModified || local.preordersLastModified;
    }

    const localSurvTime = new Date(local.surveysLastModified || 0).getTime();
    const cloudSurvTime = new Date(cloud.surveysLastModified || 0).getTime();
    if (localSurvTime > cloudSurvTime) {
        merged.surveys = local.surveys || [];
        merged.surveysLastModified = local.surveysLastModified;
    } else {
        merged.surveys = cloud.surveys || [];
        merged.surveysLastModified = cloud.surveysLastModified || local.surveysLastModified;
    }`;

content = content.replace(/    if \(localSetTime > cloudSetTime\) \{[\s\S]*?merged\.settingsLastModified = cloud\.settingsLastModified \|\| local\.settingsLastModified;\n    \}/, mergeDataSettingsReplacement);

// 2. Update clearPreorders to update LastModified
const clearPreordersReplacement = `window.clearPreorders = async function() {
    if (!confirm("本当に全ての先行予約データを削除しますか？\\n（クラウド上からも完全に削除されます）")) return;
    try {
        state.preorders = [];
        state.preordersLastModified = Date.now();
        await saveData();
        if (typeof window.renderPreorders === 'function') window.renderPreorders();
        alert("先行予約データを全て削除しました。");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
};

window.clearSurveys = async function() {
    if (!confirm("本当に全てのアンケートデータを削除しますか？\\n（クラウド上からも完全に削除されます）")) return;
    try {
        state.surveys = [];
        state.surveysLastModified = Date.now();
        await saveData();
        if (typeof window.renderSurveys === 'function') window.renderSurveys();
        alert("アンケートデータを全て削除しました。");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
};`;

content = content.replace(/window\.clearPreorders = async function\(\) \{[\s\S]*?alert\("削除に失敗しました: " \+ e\.message\);\n    \}\n\};/, clearPreordersReplacement);

fs.writeFileSync('script.js', content, 'utf-8');
console.log("Patched mergeData and clear functions");
