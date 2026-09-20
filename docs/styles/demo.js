const byId = (id) => document.getElementById(id);
const tokenNames = ['--bg','--panel','--text','--muted','--line','--accent','--cta','--accent-soft'];
function renderTokens() {
  byId('swatches').replaceChildren(...tokenNames.map((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const row = document.createElement('div'); row.className = 'swatch';
    const color = document.createElement('span'); color.className = 'swatch-color'; color.style.background = value;
    const label = document.createElement('span'); label.textContent = name;
    const code = document.createElement('code'); code.textContent = value;
    row.append(color, label, code); return row;
  }));
}
byId('theme').onchange = (event) => {document.documentElement.dataset.theme = event.target.value; renderTokens();};
byId('width').onchange = (event) => document.documentElement.style.setProperty('--specimen-width', `${event.target.value}px`);
byId('targets').onchange = (event) => document.body.classList.toggle('show-targets', event.target.checked);
for (const button of document.querySelectorAll('.demo-action')) button.onclick = () => {byId('action-status').textContent = `「${button.textContent}」の操作見本です。`;};
byId('memo-toggle').onclick = () => {
  const open = byId('memo-toggle').getAttribute('aria-pressed') !== 'true';
  byId('memo-toggle').setAttribute('aria-pressed', String(open));
  byId('memo-toggle').textContent = open ? '✓ メモ' : '▤ メモ';
  byId('recording-memos').hidden = !open;
};
function editMemo(open) {byId('memo-text').hidden = open; byId('memo-editor').hidden = !open; if(open) byId('memo-input').focus();}
byId('memo-text').onclick = () => editMemo(true);
byId('memo-close').onclick = () => editMemo(false);
byId('memo-form').onsubmit = (event) => {event.preventDefault(); byId('memo-text').textContent = byId('memo-input').value.trim() || 'メモ'; editMemo(false); byId('memo-status').textContent = 'デモ内に反映しました。';};
byId('finish').onclick = () => {byId('memo-status').textContent = '終了ボタンの配置見本です。トレーニングは終了しません。';};
byId('reaction').onclick = () => {const selected = byId('reaction').getAttribute('aria-pressed') !== 'true'; byId('reaction').setAttribute('aria-pressed', String(selected)); byId('reaction').setAttribute('aria-label', selected ? 'すごいを取り消す' : 'すごいを送る'); byId('count').textContent = selected ? '3' : '2';};
byId('people').onclick = () => {byId('senders').hidden = !byId('senders').hidden;};
renderTokens();
