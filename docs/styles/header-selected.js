document.getElementById("width").addEventListener("change", e => document.documentElement.style.setProperty("--example-width", `${e.target.value}px`));
document.getElementById("long").addEventListener("change", e => {document.querySelector(".exercise-information").textContent=e.target.checked?"インクラインダンベルベンチプレス":"ベンチプレス";});
const toggle=document.querySelector(".memo-toggle");
toggle.addEventListener("click",()=>{const memo=document.getElementById(toggle.getAttribute("aria-controls"));memo.hidden=!memo.hidden;toggle.setAttribute("aria-expanded",String(!memo.hidden));toggle.setAttribute("aria-pressed",String(!memo.hidden));toggle.querySelector(".chevron").textContent=memo.hidden?"▾":"▴";});
const confirmation=document.querySelector(".confirm");confirmation.tabIndex=-1;
document.querySelector(".finish-training").addEventListener("click",()=>confirmation.focus());
document.getElementById("back").addEventListener("click",()=>document.querySelector(".finish-training").focus());
document.getElementById("confirm").addEventListener("click",()=>{document.getElementById("status").textContent="終了確認の見本です。実際のトレーニングは終了しません。";});
document.querySelectorAll(".memo-text,.exercise-information").forEach(button=>button.addEventListener("click",()=>{document.getElementById("status").textContent="編集・種目情報は現行の操作を維持する想定です。";}));
