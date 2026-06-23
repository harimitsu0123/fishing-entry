const fs = require('fs');

let content = fs.readFileSync('script.js', 'utf-8');

const target1 = `<div style="text-align: right; font-size: 0.8rem; color: #666; margin-top: 8px;">生成日: \${new Date().toLocaleString()} | BORIJIN FESTIVAL 管理システム</div>`;

const new1 = `<div style="margin-top: 15px; text-align: center;">
                    <div style="font-size: 16pt; font-weight: 900; color: #d32f2f;">用紙は、集計後記入し、QRコードから釣果を送信し、速やかに本部にお持ちください。</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px;">
                    <div style="font-size: 0.8rem; color: #666;">生成日: \${new Date().toLocaleString()} | BORIJIN FESTIVAL 管理システム</div>
                    <div style="font-size: 16pt; font-weight: 900; color: #000;">- \${idx + 1} -</div>
                </div>`;

let success = false;
if (content.includes(target1)) {
    content = content.replace(target1, new1);
    success = true;
}

if (success) {
    fs.writeFileSync('script.js', content, 'utf-8');
    console.log('PATCH SUCCESSFUL');
} else {
    console.log('PATCH FAILED');
}
