// ページ全体を動かさず、比較欄の中で対象セットだけを見える位置へ戻す。
export function revealComparisonSet(table: HTMLElement | null, index: number) {
  const row = table?.children[index];
  if (!table || !(row instanceof HTMLElement)) return;
  const top = table.getBoundingClientRect().top + table.clientTop;
  const bottom = top + table.clientHeight;
  const bounds = row.getBoundingClientRect();
  if (bounds.top < top) table.scrollTop += bounds.top - top;
  else if (bounds.bottom > bottom) table.scrollTop += bounds.bottom - bottom;
}
