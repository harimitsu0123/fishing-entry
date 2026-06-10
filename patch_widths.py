import codecs

with codecs.open('script.js', 'r', 'utf-8') as f:
    text = f.read()

# 1. Shrink Group Name in Ikesu Table
text = text.replace('width: 180px; text-align: center;">グループ名</th>', 'width: 130px; text-align: center;">グループ名</th>')

# 2. Shrink T-shirt in Ikesu Table
text = text.replace('width: 150px; text-align: center;">Tシャツ</th>', 'width: 120px; text-align: center;">Tシャツ</th>')

# 3. Shrink Group Name in Staff Table
text = text.replace('width: 160px; text-align: center;">グループ名</th>', 'width: 130px; text-align: center;">グループ名</th>')

# 4. Increase font size for Names
text = text.replace('font-weight: 900; font-size: 1.5rem;', 'font-weight: 900; font-size: 1.8rem;')

# 5. Increase font size for Nicknames
text = text.replace('font-size:0.9rem; font-weight:normal;', 'font-size:1.1rem; font-weight:normal;')

with codecs.open('script.js', 'w', 'utf-8') as f:
    f.write(text)
