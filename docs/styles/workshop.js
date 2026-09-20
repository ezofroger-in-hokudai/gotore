const root = document.documentElement;
const byId = (id) => document.getElementById(id);
byId("theme").addEventListener("change", (e) => {
	root.dataset.theme = e.target.value;
});
byId("memo-tone").addEventListener("change", (e) => {
	root.dataset.tone = e.target.value;
});
byId("width").addEventListener("change", (e) => {
	root.style.setProperty("--preview-width", `${e.target.value}px`);
});
document.querySelectorAll(".sample").forEach((button) => {
	button.addEventListener("click", () => {
		byId("button-status").textContent =
			`「${button.textContent}」を押しました（見本）。`;
	});
});
byId("toggle").addEventListener("click", () => {
	const hidden = !byId("memos").hidden;
	byId("memos").hidden = hidden;
	byId("toggle").setAttribute("aria-expanded", String(!hidden));
	byId("toggle").textContent = hidden ? "メモを表示" : "メモを隠す";
});
const drafts = {};
let active = "exercise";
let saving = false;
const editor = byId("editor");
document.querySelectorAll("[data-edit]").forEach((button) => {
	button.addEventListener("click", () => {
		active = button.dataset.edit;
		byId("editor-title").textContent =
			active === "exercise" ? "種目メモを編集" : "今回のメモを編集";
		byId("memo-input").value =
			drafts[active] ??
			byId(`${active}-text`).dataset.value ??
			byId(`${active}-text`).textContent;
		byId("error").textContent = "";
		editor.showModal();
		byId("memo-input").focus();
	});
});
byId("memo-input").addEventListener("input", (e) => {
	drafts[active] = e.target.value;
});
function closeEditor() {
	if (!saving) editor.close();
}
byId("close").addEventListener("click", closeEditor);
byId("later").addEventListener("click", closeEditor);
editor.addEventListener("cancel", (event) => {
	if (saving) event.preventDefault();
});
byId("memo-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	if (saving) return;
	saving = true;
	const value = byId("memo-input").value;
	const fail = byId("fail").checked;
	byId("error").textContent = "";
	for (const id of ["save", "close", "later", "memo-input", "fail"])
		byId(id).disabled = true;
	byId("save").textContent = "保存中…";
	byId("save").setAttribute("aria-busy", "true");
	// 通信は行わず、保存中と失敗後の表示を比較する。
	await new Promise((resolve) => setTimeout(resolve, 500));
	saving = false;
	for (const id of ["save", "close", "later", "memo-input", "fail"])
		byId(id).disabled = false;
	byId("save").textContent = "保存";
	byId("save").removeAttribute("aria-busy");
	byId("fail").checked = false;
	if (fail) {
		byId("error").textContent =
			"保存できませんでした。入力は残っています。もう一度保存してください。";
		byId("save").focus();
		return;
	}
	byId(`${active}-text`).textContent = value || "メモはありません";
	byId(`${active}-text`).dataset.value = value;
	delete drafts[active];
	editor.close();
	byId("memo-status").textContent =
		"見本に反映しました。サーバーには保存していません。";
});
