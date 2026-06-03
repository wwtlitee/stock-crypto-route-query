# TradeRoute 股票购买路径快照

一个静态网页工具，用于查询证券主数据、上市代码、券商市场范围、加密/RWA 股票入口与平台核验状态。

## 功能

- 输入股票代码、交易所后缀、公司名或关联代码，返回证券主数据。
- 支持美股、港股和补充种子标的，例如 `SIVE.ST` / `SIVEF`。
- 平台结果由券商适配器和加密/RWA 适配器实时生成，不预计算股票乘平台的大表。
- 券商结果只表达“市场覆盖、需登录核验、未覆盖市场、未接入验证”，不把公开范围包装成单标的交易确认。
- 平台结果使用真实 logo，并提供平台/产品入口链接。

## 本地打开

直接用浏览器打开 `index.html` 即可。

## 数据

当前数据来自本地快照 `assets/market-data.js`，由 `pdoc/script/SCRIPT_generate_security_snapshot.py` 生成。

当前快照源：

- NasdaqTrader `nasdaqlisted.txt`
- NasdaqTrader `otherlisted.txt`
- HKEX `getequityfilter?all=1`
- Binance Web3 RWA public API
- 少量补充种子，用于覆盖 `SIVE.ST` / `SIVEF` 这类非主流关联代码

重新生成：

```bash
python pdoc/script/SCRIPT_generate_security_snapshot.py
```

正式产品化时建议把脚本放入定时任务，并补充更细的平台开户后单标的核验 adapter。
