import sys

path = 'script.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("entry.lastModified = new Date().toLocaleString('ja-JP');", "entry.lastModified = new Date().toISOString();")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Replaced all remaining toLocaleString with toISOString')
