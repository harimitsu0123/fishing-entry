import sys

content = open('script.js', 'r', encoding='utf-8').read()

insert = """        ${document.getElementById('edit-entry-id')?.value ? `
        <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
            <label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">
                <input type="checkbox" class="p-cancel" style="width:18px; height:18px;" ${data && data.status === 'cancelled' ? 'checked' : ''}>
                この参加者をキャンセルする
            </label>
        </div>` : ''}
"""

target = """        <div class="row-actions">
            <button type="button" class="btn-icon remove-p" title="削除">&times;</button>
        </div>"""

if target in content:
    content = content.replace(target, insert + target)
    open('script.js', 'w', encoding='utf-8').write(content)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
