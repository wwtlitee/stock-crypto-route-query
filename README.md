# TradeRoute 股票购买路径快照

一个静态网页工具，用于查询证券主数据、正股券商路径、代币化/RWA/合约敞口和资讯筛选结果。

## 功能

- 输入股票代码、交易所后缀、公司名或关联代码，返回证券主数据。
- 支持美股、港股、Euronext、Xetra、SIX、BME、LSE AIM、Nasdaq Nordic 和补充种子标的，例如 `SIVE.ST` / `SIVEF`。
- 平台结果由证券主数据、券商市场覆盖和加密/RWA 平台能力实时生成，不预计算股票乘平台的大表。
- 标准美股、港股等正股优先按券商支持市场展示路径；单标的官网页作为更强证据补充。
- Scalable Capital、Trade Republic 等欧洲平台按交易场所路由候选展示，不混入普通券商市场覆盖。
- 加密/RWA/股票合约入口单独展示为代币化或合约敞口，不等同券商正股持仓。
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
- Euronext product directory `stocks-all-places`
- Deutsche Börse/Xetra `all tradable instruments`
- SIX `equity_issuers`
- BME `ListedCompanies` 主板与 BME Growth
- London Stock Exchange AIM instruments CSV
- Nasdaq Nordic screener `MAIN_MARKET` / `FIRST_NORTH`
- Binance Web3 RWA public API
- OKX / Bybit / Kraken / Bitget 等平台产品能力配置
- 少量补充种子，用于覆盖 `SIVE.ST` / `SIVEF` 这类非主流关联代码

BME 官方列表不提供稳定短 ticker，当前使用 ISIN 作为可复核主标识并保留公司名搜索；LSE Main Market 仍保留为补源告警，不使用未确认全量端点硬造主数据。

重新生成：

```bash
python scripts/generate_security_snapshot.py
```

仓库已配置 GitHub Actions，每天自动重生快照并在数据变化时提交。后续可继续补充需要登录授权的单标的核验 adapter，但 adapter 未接入不得被解释为“不能交易”。
