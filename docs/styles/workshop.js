const root = document.documentElement;
const byId = (id) => document.getElementById(id);
byId("theme").addEventListener("change", (e) => {
	root.dataset.theme = e.target.value;
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
