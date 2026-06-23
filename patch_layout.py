import sys

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = """                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                      <strong style="font-size:1.1rem; color:#2d3436;">${e.id} | ${e.groupName}${e.hasDropIn ? '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.6rem; margin-left:4px; font-weight:bold; vertical-align:middle;">当日追加</span>' : ''}</strong>
                      <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
                  </div>
                  <div class="item-meta" style="display:flex; justify-content:space-between; align-items:center;">
                      <div style="font-size:1rem; color:#636e72;">${e.representative}</div>
                      <div style="display:flex; align-items:center; gap:0.5rem;">
                          <span style="font-size:0.9rem; font-weight:700; color: #0984e3;">${e.isCompleted ? '受付済' : `${e.finishedCount}/${e.totalCount}`}</span>
                      </div>
                  </div>"""

new_str = """                  <div style="display:flex; align-items:center; gap: 0.6rem;">
                      <div style="font-size:1.3rem; font-weight:900; color:#2d3436; flex-shrink:0;">${e.id}</div>
                      <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                          <div style="font-size:1.05rem; font-weight:bold; color:#2d3436; line-height:1.2;">
                              ${e.groupName}${e.hasDropIn ? '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.6rem; margin-left:4px; font-weight:bold; vertical-align:middle;">当日追加</span>' : ''}
                          </div>
                          <div style="font-size:0.85rem; color:#636e72; margin-top:0.2rem;">
                              (代表者) ${e.representative}
                          </div>
                      </div>
                      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.3rem; flex-shrink:0;">
                          <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
                          <span style="font-size:0.95rem; font-weight:900; color: #0984e3;">${e.isCompleted ? '受付済' : `${e.finishedCount}/${e.totalCount}`}</span>
                      </div>
                  </div>"""

if old_str in content:
    content = content.replace(old_str, new_str)
    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("NOT FOUND")
