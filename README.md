# TradeRoute 股票购买路径快照

一个静态网页工具，用于查询证券主数据、上市代码、官网可交易证据、RWA 清单命中和资讯筛选结果。

## 功能

- 输入股票代码、交易所后缀、公司名或关联代码，返回证券主数据。
- 支持美股、港股和补充种子标的，例如 `SIVE.ST` / `SIVEF`。
- 平台结果由券商适配器和加密/RWA 适配器实时生成，不预计算股票乘平台的大表。
- 券商结果只展示官网标的页、官方清单或账户授权接口命中的证据；未接入单标的 adapter 的平台不展示为可交易路径。
- `SIVE.ST` / `SIVEF` 已接入 Saxo、eToro、Webull 的官方标的页证据，并补充 Yahoo 行情与资讯过滤诊断。
- 平台结果使用真实 logo，并提供平台/产品入口链接。

## 本地打开

直接用浏览器打开 `index.html` 即可。

## 数据

当前数据来自本地快照 `assets/market-data.js`，由 `scripts/generate_security_snapshot.py` 生成。

当前快照源：

- NasdaqTrader `nasdaqlisted.txt`
- NasdaqTrader `otherlisted.txt`
- HKEX `getequityfilter?all=1`
- Binance Web3 RWA public API
- 少量补充种子，用于覆盖 `SIVE.ST` / `SIVEF` 这类非主流关联代码

重新生成：

```bash
python scripts/generate_security_snapshot.py
```

仓库已配置 GitHub Actions，每天自动重生快照并在数据变化时提交。后续可继续补充需要登录授权的单标的核验 adapter。
