document.getElementById("width").addEventListener("change", e => document.documentElement.style.setProperty("--example-width", `${e.target.value}px`));
document.getElementById("long").addEventListener("change", e => document.querySelectorAll(".exercise-information").forEach(el=>{el.textContent=e.target.checked?"インクラインダンベルベンチプレス":"ベンチプレス";}));
document.querySelectorAll(".specimen").forEach(specimen=>{
 const toggle=specimen.querySelector(".memo-toggle");const memo=specimen.querySelector(".recording-memos");const summary=specimen.querySelector("button.memo-summary");
 const flip=()=>{memo.hidden=!memo.hidden;toggle.setAttribute("aria-expanded",String(!memo.hidden));toggle.setAttribute("aria-pressed",String(!memo.hidden));toggle.querySelector(".chevron").textContent=memo.hidden?"▾":"▴";if(summary){summary.hidden=!memo.hidden;summary.setAttribute("aria-expanded",String(!memo.hidden));if(summary.hidden)toggle.focus();}};
 toggle.addEventListener("click",flip);if(summary)summary.addEventListener("click",flip);
});
document.querySelectorAll(".memo-text,.exercise-information").forEach(button=>button.addEventListener("click",()=>{document.getElementById("status").textContent="表示の比較用です。編集・種目情報は現行の操作を維持する想定です。";}));
document.querySelectorAll(".finish-training").forEach(button=>button.addEventListener("click",()=>{document.getElementById("status").textContent="終了は合意済みの見出しと2つのボタンを使う想定です。この見本では終了しません。";}));
