import { describe, expect, test } from "bun:test";
import { moveGroup, orderedGroups, parseGroupOrder } from "../../src/features/v2/group-order";

const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];
describe("本人のグループ表示順", () => {
  test("所属だけを保存順に並べ、新しい所属を末尾へ足す", () => {
    expect(orderedGroups(groups, ["b", "missing", "b", "a"])).toEqual([
      groups[1],
      groups[0],
      groups[2],
    ]);
    expect(groups.map((group) => group.id)).toEqual(["a", "b", "c"]);
  });
  test("空・不正・旧形式の端末データは安全に読み捨てる", () => {
    for (const input of [null, "{", "null", "{}", '[1,"a"]']) {
      expect(parseGroupOrder(input)).toEqual([]);
    }
    expect(parseGroupOrder('["b","a","b"]')).toEqual(["b", "a"]);
  });
  test("前後移動と範囲外・消えた対象を扱う", () => {
    expect(moveGroup(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveGroup(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveGroup(["a", "b"], "missing", 0)).toEqual(["a", "b"]);
    expect(moveGroup(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });
});
