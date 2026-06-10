content = open('script.js', 'r', encoding='utf-8').read()

target1 = """    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) soldoutToggle.checked = !!state.settings.soldoutMode;"""

replacement1 = """    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) soldoutToggle.checked = !!state.settings.soldoutMode;
    const closedToggle = document.getElementById('closed-mode-toggle');
    if (closedToggle) closedToggle.checked = !!state.settings.closedMode;"""

target2 = """    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) state.settings.soldoutMode = soldoutToggle.checked;"""

replacement2 = """    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) state.settings.soldoutMode = soldoutToggle.checked;
    const closedToggle = document.getElementById('closed-mode-toggle');
    if (closedToggle) state.settings.closedMode = closedToggle.checked;"""

target3 = """    } else {
        document.body.classList.remove('soldout-active');
        console.log(`BORIJIN: Sold Out Mode is ${state.settings.soldoutMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }
}"""

replacement3 = """    } else {
        document.body.classList.remove('soldout-active');
        console.log(`BORIJIN: Sold Out Mode is ${state.settings.soldoutMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }

    if (state.settings.closedMode && !isAdminAuth) {
        document.body.classList.add('closed-active');
        console.log("BORIJIN: Closed Mode is ENABLED (Overlay active for non-admins)");
    } else {
        document.body.classList.remove('closed-active');
        console.log(`BORIJIN: Closed Mode is ${state.settings.closedMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }
}"""

content = content.replace(target1, replacement1)
content = content.replace(target2, replacement2)
content = content.replace(target3, replacement3)

open('script.js', 'w', encoding='utf-8').write(content)
