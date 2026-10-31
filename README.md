# surface-intersect-lab

A sound broadphase for **surface–surface intersection**: an AABB and a tighter OBB prefilter
that drop **99.97% of the naive 10.24M tri‑tri tests** before exact clipping, while producing a
**bit‑identical** intersection curve to brute force. On this scene the AABB slice runs at
**78.5 ms median vs 668 ms brute‑force (8.5×)** with the same 296 intersection segments.

Upstream: none (original).

## 本轮创新

首次把「误差/预过滤预算」做成**可交互扫瞄 + 双端位级一致**的联合验证：浏览器里的
broadphase 下拉框（AABB / OBB / 无）每次切换都用同一个 `src/core.mjs` 在**现场复算**
相交曲线，并把「与 brute‑force 位级一致」实时显示在面板上——与
`node bench/verify.mjs` 复算的是同一段代码、同一个数字。以前这类布尔/求交工具要么只给
demo、要么只给离线算好的数字，没有人把「所见即所验」和位级一致性做成硬闸门。
（B 档：broadphase 只改变**候选数**，不改相交段，所以能保证输出位级一致。）

### 和已有台账的关系
- `mesh-slice` 是给**单个网格**做平面剖切；本工具是**两片解析曲面**的相交曲线，并量化
  broadphase 候选削减。
- `mesh-selfint`/`mesh-distance` 是自相交/距离，不是相交曲线管线。

## 怎么跑

```bash
# 全部证据，一条命令：
node bench/verify.mjs && node bench/bench.mjs && cat bench/result.json
```

看页面：

```bash
python3 -m http.server 4173
# 浏览器开 http://localhost:4173
```

## 证据（bench/result.json 摘要）

| 指标 | 值 |
| --- | --- |
| 场景 | 翘曲涟漪地形 × 倾斜平面，3200 + 3200 三角 |
| 总 tri‑tri 对数 | 10,240,000 |
| brute‑force 中位耗时 | 668 ms |
| AABB 预过滤中位耗时 | 78.5 ms（8.5×） |
| OBB 预过滤中位耗时 | 1745 ms（SAT 更贵，候选更少但更慢——诚实记录） |
| AABB 候选削减 | 99.97%（→ 3,064） |
| OBB 候选削减 | 99.97%（→ 2,752） |
| 相交段 | 296 |
| 输出位级一致（vs brute force） | true |

相对标准差均 < 2%，样本 n=9（G5）。

完整冷启动 / min / median / p95 / stddev：`bench/result.json`。

## 已知限制

- **共面**（coplanar）三角形返回 `null`（病态、舍入敏感），不产出段；本场景无共面相交。
- OBB 的 SAT 预过滤在本场景下比 AABB **慢**（15 轴分离测试贵于 3 轴 AABB 重叠），
  尽管它候选更少。真实收益取决于三角形朝向分布；AABB 是稳健默认。
- 相交段为精确裁剪，**未做段合并/排序**成连续 polyline；大分辨率下会看到逐段线段。
- `halfThick`（OBB 厚度）默认 2e-3，用于保住浮点下刚好接触的对。

## 结构

```
index.html          入口（importmap → three 0.160.0）
main.js             渲染 + 交互（只消费 core 输出）
src/core.mjs        纯计算：AABB/OBB 预过滤 + exact tri‑tri 裁剪
tools/gen-sample.mjs  确定性生成 data/sample-scene.json（两次运行字节一致）
bench/verify.mjs    G4 行为断言（exit 0）
bench/bench.mjs     G5 冷启动 + 9 次取中位数 → bench/result.json
data/sample-scene.json  生成的确定性样例
```

## 验证闸门

- G1 承诺可量化：见上表，基线 = brute‑force 全对遍历（`intersectSurfacesNaive`）。
- G2 语法：`node --check` ×4 全过。
- G3 core 纯净：`src/core.mjs` 无 three / window / document / navigator；`import()` 无副作用。
- G4 断言真跑：`node bench/verify.mjs` exit 0，打印各实际断言值。
- G5 性能：`node bench/bench.mjs` n=9，报冷启动 + min/median/p95/stddev。
- G6 页面：`python3 -m http.server 4173` + `curl -sI` 返回 200，importmap ≥1。
- G7 数据脚本化：`rm -rf data && node tools/gen-sample.mjs` 可重建，字节一致。
- G8 零浏览器自动化仓库，无截图。