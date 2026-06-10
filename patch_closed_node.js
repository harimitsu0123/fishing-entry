const fs = require('fs');

let content = fs.readFileSync('script.js', 'utf-8');

const t1 = `    const soldoutToggle = document.getElementById('soldout-mode-toggle');\r
    if (soldoutToggle) soldoutToggle.checked = !!state.settings.soldoutMode;`;

const r1 = `    const soldoutToggle = document.getElementById('soldout-mode-toggle');\n    if (soldoutToggle) soldoutToggle.checked = !!state.settings.soldoutMode;\n    const closedToggle = document.getElementById('closed-mode-toggle');\n    if (closedToggle) closedToggle.checked = !!state.settings.closedMode;`;

const t2 = `    const soldoutToggle = document.getElementById('soldout-mode-toggle');\r
    if (soldoutToggle) state.settings.soldoutMode = soldoutToggle.checked;`;

const r2 = `    const soldoutToggle = document.getElementById('soldout-mode-toggle');\n    if (soldoutToggle) state.settings.soldoutMode = soldoutToggle.checked;\n    const closedToggle = document.getElementById('closed-mode-toggle');\n    if (closedToggle) state.settings.closedMode = closedToggle.checked;`;

const t3 = `    } else {\r
        document.body.classList.remove('soldout-active');\r
        console.log(\`BORIJIN: Sold Out Mode is \${state.settings.soldoutMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}\`);\r
    }\r
}`;

const r3 = `    } else {\n        document.body.classList.remove('soldout-active');\n        console.log(\`BORIJIN: Sold Out Mode is \${state.settings.soldoutMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}\`);\n    }\n\n    if (state.settings.closedMode && !isAdminAuth) {\n        document.body.classList.add('closed-active');\n        console.log("BORIJIN: Closed Mode is ENABLED (Overlay active for non-admins)");\n    } else {\n        document.body.classList.remove('closed-active');\n        console.log(\`BORIJIN: Closed Mode is \${state.settings.closedMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}\`);\n    }\n}`;

content = content.split('\r\n').join('\n'); // normalize to LF for easy replace
content = content.replace(t1.replace(/\r/g,''), r1);
content = content.replace(t2.replace(/\r/g,''), r2);
content = content.replace(t3.replace(/\r/g,''), r3);

fs.writeFileSync('script.js', content, 'utf-8');
