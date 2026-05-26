const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf8');

const insert = `        \${document.getElementById('edit-entry-id')?.value ? \`
        <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
            <label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">
                <input type="checkbox" class="p-cancel" style="width:18px; height:18px;" \${data && data.status === 'cancelled' ? 'checked' : ''}>
                この参加者をキャンセルする
            </label>
        </div>\` : ''}\n`;

const target = `        <div class="row-actions">\r\n            <button type="button" class="btn-icon remove-p"`;

if (content.includes(target)) {
    content = content.replace(target, insert + target);
    fs.writeFileSync('script.js', content, 'utf8');
    console.log("SUCCESS");
} else {
    // try LF just in case
    const targetLF = `        <div class="row-actions">\n            <button type="button" class="btn-icon remove-p"`;
    if (content.includes(targetLF)) {
        content = content.replace(targetLF, insert + targetLF);
        fs.writeFileSync('script.js', content, 'utf8');
        console.log("SUCCESS (LF)");
    } else {
        console.log("TARGET NOT FOUND");
    }
}
