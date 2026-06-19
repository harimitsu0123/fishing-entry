const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf-8');
const replacement = `window.clearPreorders = async function() {
    if (!confirm("本当に全ての先行予約データを削除しますか？\\n（クラウド上からも完全に削除されます）")) return;
    try {
        state.preorders = [];
        await saveData();
        if (typeof window.renderPreorders === 'function') window.renderPreorders();
        alert("先行予約データを全て削除しました。");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
};

window.exportPreordersToCSV = function() {`;
content = content.replace(/window\.exportPreordersToCSV = function\(\) \{/, replacement);
fs.writeFileSync('script.js', content, 'utf-8');
console.log("Patched script.js");
