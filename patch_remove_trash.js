const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf-8');
const replacement = '';
content = content.replace(/\n                            <button class="btn-outline btn-small" onclick="window.hardDeleteEntry\('\\$\\{e.id\\}'\)" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap; border-color: #f87171; color: #f87171;" title="完全に削除">🗑<\/button>/, replacement);
fs.writeFileSync('script.js', content, 'utf-8');
console.log("Removed row button");
