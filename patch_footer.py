import sys

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = """                    </tbody>
                </table>
                <div style="text-align: right; font-size: 0.8rem; color: #666; margin-top: 8px;">生成日: ${new Date().toLocaleString()} | BORIJIN FESTIVAL 管理システム</div>
            </div>"""

new_str = """                    </tbody>
                </table>
                <div style="margin-top: 15px; text-align: center;">
                    <div style="font-size: 16pt; font-weight: 900; color: #d32f2f;">用紙は、集計後記入し、QRコードから釣果を送信し、速やかに本部にお持ちください。</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px;">
                    <div style="font-size: 0.8rem; color: #666;">生成日: ${new Date().toLocaleString()} | BORIJIN FESTIVAL 管理システム</div>
                    <div style="font-size: 16pt; font-weight: 900; color: #000;">- ${idx + 1} -</div>
                </div>
            </div>"""

if old_str in content:
    content = content.replace(old_str, new_str)
    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS')
else:
    print('NOT FOUND')
