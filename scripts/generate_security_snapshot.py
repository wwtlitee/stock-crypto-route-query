import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from tempfile import gettempdir

from openpyxl import load_workbook


SCRIPT_PATH = Path(__file__).resolve()
ROOT = SCRIPT_PATH.parents[1] if SCRIPT_PATH.parent.name == "scripts" else SCRIPT_PATH.parents[2]
OUTPUT = ROOT / "assets" / "market-data.js"

NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
HKEX_LIST_URL = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"
HKEX_EQUITIES_PAGE_URL = "https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities?sc_lang=en"
HKEX_EQUITY_FILTER_URL = "https://www1.hkex.com.hk/hkexwidget/data/getequityfilter"
BINANCE_RWA_URL = (
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/"
    "token/rwa/stock/detail/list/ai"
)
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search?q={symbol}&quotesCount=4&newsCount=5&lang=en-US&region=US"


BROKER_PLATFORMS = [
    {
        "id": "ibkr",
        "name": "Interactive Brokers",
        "short": "IB",
        "logo": "./assets/logos/ibkr.png",
        "url": "https://www.interactivebrokers.com/en/trading/products-stocks.php",
        "supportedMarkets": ["US", "HK", "STOCKHOLM", "OTC"],
        "requiresLoginMarkets": [],
        "source": "IBKR public products and contract search materials",
    },
    {
        "id": "saxobank",
        "name": "Saxo Bank",
        "short": "SX",
        "logo": "./assets/logos/saxobank.png",
        "url": "https://www.home.saxo/products/stocks",
        "supportedMarkets": ["US", "HK", "STOCKHOLM"],
        "requiresLoginMarkets": ["OTC"],
        "source": "Saxo OpenAPI reference data and product materials",
    },
    {
        "id": "futu",
        "name": "富途牛牛",
        "short": "FT",
        "logo": "./assets/logos/futu.png",
        "url": "https://www.futuhk.com/",
        "supportedMarkets": ["US", "HK"],
        "requiresLoginMarkets": [],
        "source": "Futu public market scope",
    },
    {
        "id": "moomoo",
        "name": "moomoo",
        "short": "MM",
        "logo": "./assets/logos/moomoo.png",
        "url": "https://www.moomoo.com/",
        "supportedMarkets": ["US", "HK"],
        "requiresLoginMarkets": [],
        "source": "moomoo public market scope",
    },
    {
        "id": "tiger",
        "name": "老虎证券",
        "short": "TG",
        "logo": "./assets/logos/tiger.png",
        "url": "https://www.itigerup.com/",
        "supportedMarkets": ["US", "HK"],
        "requiresLoginMarkets": [],
        "source": "Tiger Brokers public market scope",
    },
    {
        "id": "longbridge",
        "name": "Longbridge",
        "short": "LB",
        "logo": "./assets/logos/longbridge.png",
        "url": "https://longbridge.com/",
        "supportedMarkets": ["US", "HK"],
        "requiresLoginMarkets": [],
        "source": "Longbridge public market scope",
    },
    {
        "id": "webull",
        "name": "Webull",
        "short": "WB",
        "logo": "./assets/logos/webull.png",
        "url": "https://www.webull.com/",
        "supportedMarkets": ["US"],
        "requiresLoginMarkets": ["OTC"],
        "source": "Webull public market scope",
    },
    {
        "id": "schwab",
        "name": "Charles Schwab",
        "short": "CS",
        "logo": "./assets/logos/schwab.png",
        "url": "https://www.schwab.com/",
        "supportedMarkets": ["US", "OTC"],
        "requiresLoginMarkets": [],
        "source": "Schwab public market scope",
    },
    {
        "id": "robinhood",
        "name": "Robinhood",
        "short": "RH",
        "logo": "./assets/logos/robinhood.png",
        "url": "https://robinhood.com/us/en/",
        "supportedMarkets": ["US"],
        "requiresLoginMarkets": [],
        "source": "Robinhood public market scope",
    },
    {
        "id": "firstrade",
        "name": "Firstrade",
        "short": "FD",
        "logo": "./assets/logos/firstrade.png",
        "url": "https://www.firstrade.com/",
        "supportedMarkets": ["US", "OTC"],
        "requiresLoginMarkets": [],
        "source": "Firstrade public market scope",
    },
    {
        "id": "trading212",
        "name": "Trading 212",
        "short": "T2",
        "logo": "./assets/logos/trading212.png",
        "url": "https://www.trading212.com/",
        "supportedMarkets": ["US"],
        "requiresLoginMarkets": ["STOCKHOLM", "OTC"],
        "source": "Trading 212 public product scope",
    },
    {
        "id": "etoro",
        "name": "eToro",
        "short": "ET",
        "logo": "./assets/logos/etoro.png",
        "url": "https://www.etoro.com/",
        "supportedMarkets": ["US"],
        "requiresLoginMarkets": ["STOCKHOLM", "OTC"],
        "source": "eToro public product scope",
    },
]


CRYPTO_PLATFORMS = [
    {"id": "binance-rwa", "name": "Binance Web3 / Ondo", "short": "BN", "logo": "./assets/logos/binance.png", "type": "cex", "url": "https://www.binance.com/en/web3wallet"},
    {"id": "okx-ondo", "name": "OKX xAssets / Ondo", "short": "OK", "logo": "./assets/logos/okx.png", "type": "cex", "url": "https://www.okx.com/en-gb/markets/dex"},
    {"id": "bitget-stock", "name": "Bitget Stock Perps", "short": "BG", "logo": "./assets/logos/bitget.png", "type": "cex", "url": "https://www.bitget.com/en/markets/futures"},
    {"id": "bybit-xstocks", "name": "Bybit xStocks", "short": "BY", "logo": "./assets/logos/bybit.png", "type": "cex", "url": "https://www.bybit.com/en/help-center/article/FAQ-xStocks-on-Bybit"},
    {"id": "kraken-xstocks", "name": "Kraken xStocks", "short": "KR", "logo": "./assets/logos/kraken.png", "type": "cex", "url": "https://www.kraken.com/xstocks"},
    {"id": "gate-xstocks", "name": "Gate xStocks", "short": "GT", "logo": "./assets/logos/gate.png", "type": "cex", "url": "https://www.gate.com/"},
    {"id": "trade-xyz", "name": "trade.xyz", "short": "TX", "logo": "./assets/logos/trade_xyz.png", "type": "dex", "url": "https://trade.xyz/"},
    {"id": "hyperliquid", "name": "Hyperliquid HIP-3", "short": "HL", "logo": "./assets/logos/hyperliquid.png", "type": "dex", "url": "https://app.hyperliquid.xyz/trade"},
    {"id": "aster", "name": "Aster", "short": "AS", "logo": "./assets/logos/aster.png", "type": "dex", "url": "https://www.asterdex.com/"},
]


PROFILE_OVERRIDES = {
    "AAPL": {"name": "Apple", "aliases": ["苹果"], "description": "Apple Inc. 是消费电子、软件与服务公司，核心产品包括 iPhone、Mac、iPad、Apple Watch 与服务订阅。"},
    "TSLA": {"name": "Tesla", "aliases": ["特斯拉"], "description": "Tesla, Inc. 是电动汽车、能源存储与自动驾驶技术公司，主要业务覆盖汽车销售、能源产品和软件服务。"},
    "NVDA": {"name": "NVIDIA", "aliases": ["英伟达", "英伟達"], "description": "NVIDIA Corporation 是 GPU、AI 加速计算和数据中心芯片公司，也是 AI 基础设施的重要供应商。"},
    "BABA": {"name": "Alibaba", "aliases": ["阿里", "阿里巴巴", "9988", "9988.HK"], "relatedListings": ["9988.HK"]},
    "9988.HK": {"name": "Alibaba Group", "aliases": ["阿里", "阿里巴巴", "BABA"], "relatedListings": ["BABA"]},
    "SIVE.ST": {
        "name": "Sivers Semiconductors AB",
        "aliases": ["SIVE", "STO:SIVE", "SIVEF", "Sivers"],
        "description": "Sivers Semiconductors AB 是瑞典半导体公司，主上市地为 Nasdaq Stockholm。",
        "relatedListings": ["SIVEF"],
        "researchSymbol": "SIVE.ST",
        "researchKeywords": ["sivers", "sive", "semiconductors"],
        "verifiedBrokerRoutes": [
            {
                "platformId": "saxobank",
                "listingSymbol": "SIVE:xome",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.home.saxo/markets/stocks/sive-xome",
                "evidence": "Saxo 官方 Sivers Semiconductors AB 标的页 FAQ 写明可在 SaxoInvestor 与 SaxoTrader 交易，并列出 ticker SIVE:xome。",
                "verifiedAt": "2026-06-04",
            },
            {
                "platformId": "etoro",
                "listingSymbol": "SIVE.ST",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.etoro.com/markets/sive.st",
                "evidence": "eToro 官方 SIVE.ST 标的页显示 Sivers Semiconductors AB 并引导用户购买该股票。",
                "verifiedAt": "2026-06-04",
            },
            {
                "platformId": "webull",
                "listingSymbol": "OTCPK:SIVEF",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.webull.com/quote/otcpk-sivef",
                "evidence": "Webull 官方 OTCPK:SIVEF 标的页出现 Trade SIVEF，并展示 Sivers Semiconductors AB 股票信息。",
                "verifiedAt": "2026-06-04",
            },
        ],
        "newsProbeNote": "free-api-discovery 对 SIVE 的泛财经新闻命中噪音高，本版本仅展示强相关资讯诊断，不把泛商业新闻推到前台。",
    },
    "SIVEF": {
        "name": "Sivers Semiconductors AB",
        "aliases": ["SIVE", "SIVE.ST", "STO:SIVE", "Sivers"],
        "description": "SIVEF 是 Sivers Semiconductors AB 的美国 OTC 关联代码，主上市代码为 SIVE.ST。",
        "relatedListings": ["SIVE.ST"],
        "researchSymbol": "SIVE.ST",
        "researchKeywords": ["sivers", "sive", "semiconductors"],
        "verifiedBrokerRoutes": [
            {
                "platformId": "webull",
                "listingSymbol": "OTCPK:SIVEF",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.webull.com/quote/otcpk-sivef",
                "evidence": "Webull 官方 OTCPK:SIVEF 标的页出现 Trade SIVEF，并展示 Sivers Semiconductors AB 股票信息。",
                "verifiedAt": "2026-06-04",
            },
            {
                "platformId": "saxobank",
                "listingSymbol": "SIVE:xome",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.home.saxo/markets/stocks/sive-xome",
                "evidence": "Saxo 官方 Sivers Semiconductors AB 标的页 FAQ 写明可在 SaxoInvestor 与 SaxoTrader 交易，并列出 ticker SIVE:xome。",
                "verifiedAt": "2026-06-04",
            },
            {
                "platformId": "etoro",
                "listingSymbol": "SIVE.ST",
                "status": "verified_tradable",
                "sourceType": "official_instrument_page",
                "sourceUrl": "https://www.etoro.com/markets/sive.st",
                "evidence": "eToro 官方 SIVE.ST 标的页显示 Sivers Semiconductors AB 并引导用户购买该股票。",
                "verifiedAt": "2026-06-04",
            },
        ],
        "newsProbeNote": "free-api-discovery 对 SIVE 的泛财经新闻命中噪音高，本版本仅展示强相关资讯诊断，不把泛商业新闻推到前台。",
    },
}


def download_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "TradeRouteSnapshot/2.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def download_json(url, user_agent="TradeRouteSnapshot/2.1"):
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def download_binary(url, target):
    request = urllib.request.Request(url, headers={"User-Agent": "TradeRouteSnapshot/2.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        target.write_bytes(response.read())


def clean_name(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text


def classify_us_instrument(name, etf_flag):
    lower = name.lower()
    if etf_flag == "Y":
        return "ETF/基金类标的"
    if "warrant" in lower:
        return "权证"
    if "right" in lower:
        return "权利"
    if "unit" in lower:
        return "单位"
    if "preferred" in lower or "depositary shares" in lower:
        return "优先股/存托"
    if "american depositary" in lower or " adr" in lower:
        return "ADR"
    return "普通股"


def normalize_symbol(symbol):
    return str(symbol or "").strip().upper()


def row_to_stock(listing, source_name):
    symbol = listing["symbol"]
    override = PROFILE_OVERRIDES.get(symbol, {})
    name = override.get("name") or listing["name"]
    aliases = set([symbol.lower(), listing["symbolRaw"].lower(), name.lower()])
    for alias in listing.get("aliases", []):
        aliases.add(alias.lower())
    for alias in override.get("aliases", []):
        aliases.add(alias.lower())
    symbols = [symbol]
    for related in override.get("relatedListings", []):
        symbols.append(related)
    return {
        "id": re.sub(r"[^a-z0-9]+", "-", symbol.lower()).strip("-"),
        "name": name,
        "symbols": sorted(set(symbols), key=symbols.index),
        "aliases": sorted(aliases),
        "summary": override.get("description") or f"{name} 是 {listing['exchangeName']} 收录的 {listing['instrumentType']}。",
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "profile": {
            "code": symbol,
            "company": name,
            "description": override.get("description") or f"{name}，主上市市场为 {listing['exchangeName']}。",
            "assetType": listing["instrumentType"],
            "primaryMarket": listing["market"],
            "primaryExchange": listing["exchangeName"],
            "country": listing.get("country", ""),
            "currency": listing.get("currency", ""),
            "relatedListings": override.get("relatedListings", []),
            "source": source_name,
            "verifiedBrokerRoutes": override.get("verifiedBrokerRoutes", []),
        },
        "listings": [listing],
    }


def parse_nasdaq_listed(text):
    rows = []
    for line in text.splitlines()[1:]:
        if not line or line.startswith("File Creation Time"):
            continue
        parts = line.split("|")
        if len(parts) < 8 or parts[3] == "Y":
            continue
        symbol = normalize_symbol(parts[0])
        name = clean_name(parts[1])
        rows.append({
            "symbol": symbol,
            "symbolRaw": symbol,
            "name": name,
            "market": "US",
            "exchange": "NASDAQ",
            "exchangeName": "Nasdaq",
            "country": "US",
            "currency": "USD",
            "instrumentType": classify_us_instrument(name, parts[6]),
            "source": "NasdaqTrader nasdaqlisted",
        })
    return rows


def parse_other_listed(text):
    exchange_map = {"N": ("NYSE", "New York Stock Exchange"), "A": ("NYSE American", "NYSE American"), "P": ("NYSE Arca", "NYSE Arca"), "Z": ("Cboe BZX", "Cboe BZX"), "V": ("IEX", "IEX")}
    rows = []
    for line in text.splitlines()[1:]:
        if not line or line.startswith("File Creation Time"):
            continue
        parts = line.split("|")
        if len(parts) < 8 or parts[6] == "Y":
            continue
        symbol = normalize_symbol(parts[0])
        name = clean_name(parts[1])
        exchange, exchange_name = exchange_map.get(parts[2], (parts[2], parts[2]))
        rows.append({
            "symbol": symbol,
            "symbolRaw": symbol,
            "name": name,
            "market": "US",
            "exchange": exchange,
            "exchangeName": exchange_name,
            "country": "US",
            "currency": "USD",
            "instrumentType": classify_us_instrument(name, parts[4]),
            "source": "NasdaqTrader otherlisted",
        })
    return rows


def parse_hkex(path):
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb["ListOfSecurities"]
    rows = []
    for index, row in enumerate(ws.iter_rows(values_only=True), 1):
        if index <= 3:
            continue
        code, name, category, sub_category, _, isin = row[:6]
        if not code or not name or not category:
            continue
        category_text = clean_name(category)
        if category_text not in {"Equity", "Exchange Traded Products", "Real Estate Investment Trusts"}:
            continue
        symbol_raw = str(code).zfill(5)
        symbol = f"{symbol_raw}.HK"
        instrument = "港股"
        if category_text == "Exchange Traded Products":
            instrument = "ETF/基金类标的"
        elif category_text == "Real Estate Investment Trusts":
            instrument = "REIT"
        rows.append({
            "symbol": symbol,
            "symbolRaw": symbol_raw,
            "name": clean_name(name),
            "market": "HK",
            "exchange": "HKEX",
            "exchangeName": "Hong Kong Exchanges and Clearing",
            "country": "HK",
            "currency": "HKD",
            "instrumentType": instrument,
            "isin": clean_name(isin),
            "source": "HKEX List of Securities",
        })
    return rows


def parse_jsonp(raw):
    matched = re.match(r"^[^(]+\((.*)\);?$", raw, re.S)
    if not matched:
        return json.loads(raw)
    return json.loads(matched.group(1))


def fetch_hkex_token():
    html = download_text(HKEX_EQUITIES_PAGE_URL)
    candidates = re.findall(r"return\s+\"([A-Za-z0-9%+/=]+)\"\s*;", html)
    token = next((item for item in candidates if item != "Base64-AES-Encrypted-Token" and len(item) > 40), "")
    if not token:
        raise RuntimeError("HKEX token not found on equities page")
    return urllib.parse.unquote(token)


def parse_hkex_equity_filter(stocklist):
    subtype_map = {
        "ODSH": "港股",
        "DPRC": "存托凭证",
        "PFSH": "优先股/存托",
        "RGHT": "权利",
        "UNIT": "单位",
        "WRNT": "权证",
    }
    rows = []
    for item in stocklist:
        symbol = normalize_symbol(item.get("ric"))
        if not symbol.endswith(".HK"):
            raw_code = str(item.get("sym") or "").strip()
            if not raw_code:
                continue
            symbol = f"{raw_code.zfill(4)}.HK"
        symbol_raw = symbol.replace(".HK", "")
        short_code = str(item.get("sym") or "").strip()
        aliases = [short_code] if short_code and short_code != symbol_raw else []
        rows.append({
            "symbol": symbol,
            "symbolRaw": symbol_raw,
            "aliases": aliases,
            "name": clean_name(item.get("nm")),
            "market": "HK",
            "exchange": "HKEX",
            "exchangeName": "Hong Kong Exchanges and Clearing",
            "country": "HK",
            "currency": clean_name(item.get("ccy")) or "HKD",
            "instrumentType": subtype_map.get(item.get("asset_subtype"), "港交所证券"),
            "source": "HKEX equityfilter all=1",
        })
    return rows


def load_hkex_equity_filter():
    token = fetch_hkex_token()
    qid = int(time.time() * 1000)
    callback = f"jQuery35100000000000000000_{qid}"
    params = {
        "lang": "eng",
        "token": token,
        "sort": "0",
        "order": "1",
        "all": "1",
        "qid": str(qid),
        "callback": callback,
        "_": str(qid),
    }
    url = HKEX_EQUITY_FILTER_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": HKEX_EQUITIES_PAGE_URL,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = parse_jsonp(response.read().decode("utf-8", errors="replace"))
    data = payload.get("data") or {}
    if data.get("responsecode") != "000":
        raise RuntimeError(f"HKEX equityfilter failed: {data.get('responsemsg')}")
    return parse_hkex_equity_filter(data.get("stocklist") or [])


def nordic_and_otc_seeds():
    return [
        {
            "symbol": "SIVE.ST",
            "symbolRaw": "SIVE",
            "name": "Sivers Semiconductors AB",
            "market": "STOCKHOLM",
            "exchange": "Nasdaq Stockholm",
            "exchangeName": "Nasdaq Stockholm",
            "country": "SE",
            "currency": "SEK",
            "instrumentType": "普通股",
            "source": "Nordic seed snapshot",
        },
        {
            "symbol": "SIVEF",
            "symbolRaw": "SIVEF",
            "name": "Sivers Semiconductors AB",
            "market": "OTC",
            "exchange": "OTC Markets",
            "exchangeName": "OTC Markets",
            "country": "US",
            "currency": "USD",
            "instrumentType": "OTC",
            "source": "OTC seed snapshot",
        },
    ]


def load_rwa_coverage():
    try:
        payload = json.loads(download_text(BINANCE_RWA_URL))
    except Exception as exc:
        print(f"RWA source failed: {exc}", file=sys.stderr)
        return {}
    coverage = defaultdict(lambda: {"symbols": set(), "chains": set(), "hasOndo": False, "hasXStock": False, "records": 0})
    for item in payload.get("data", []):
        ticker = normalize_symbol(item.get("ticker"))
        if not ticker:
            continue
        row = coverage[ticker]
        row["symbols"].add(item.get("symbol"))
        row["chains"].add(str(item.get("chainId")))
        row["hasOndo"] = row["hasOndo"] or int(item.get("type") or 0) == 1
        row["hasXStock"] = row["hasXStock"] or int(item.get("type") or 0) == 2
        row["records"] += 1
    return {
        ticker: {
            "symbols": sorted(v["symbols"]),
            "chains": sorted(v["chains"]),
            "hasOndo": v["hasOndo"],
            "hasXStock": v["hasXStock"],
            "records": v["records"],
        }
        for ticker, v in coverage.items()
    }


def load_yahoo_research(symbol, keywords):
    research = {
        "symbol": symbol,
        "quote": None,
        "news": [],
        "newsDiagnostics": {
            "source": "Yahoo Finance search + free-api-discovery probe",
            "accepted": 0,
            "rejected": 0,
            "note": "",
        },
    }
    try:
        payload = download_json(YAHOO_CHART_URL.format(symbol=urllib.parse.quote(symbol)))
        result = (payload.get("chart", {}).get("result") or [None])[0]
        meta = (result or {}).get("meta") or {}
        if meta:
            previous = meta.get("chartPreviousClose")
            price = meta.get("regularMarketPrice")
            change = None
            change_percent = None
            if isinstance(price, (int, float)) and isinstance(previous, (int, float)) and previous:
                change = price - previous
                change_percent = change / previous * 100
            market_time = meta.get("regularMarketTime")
            research["quote"] = {
                "source": "Yahoo Finance chart API",
                "symbol": meta.get("symbol") or symbol,
                "name": meta.get("longName") or meta.get("shortName") or symbol,
                "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
                "currency": meta.get("currency"),
                "price": price,
                "previousClose": previous,
                "change": change,
                "changePercent": change_percent,
                "volume": meta.get("regularMarketVolume"),
                "marketTime": datetime.fromtimestamp(market_time, UTC).strftime("%Y-%m-%d %H:%M UTC") if market_time else "",
            }
    except Exception as exc:
        research["quoteError"] = str(exc)

    try:
        payload = download_json(YAHOO_SEARCH_URL.format(symbol=urllib.parse.quote(symbol)), user_agent="Mozilla/5.0")
        news = payload.get("news") or []
        lowered_keywords = [item.lower() for item in keywords]
        for item in news:
            title = clean_name(item.get("title"))
            related = [str(ticker).lower() for ticker in item.get("relatedTickers") or []]
            haystack = f"{title} {' '.join(related)}".lower()
            if any(keyword in haystack for keyword in lowered_keywords):
                research["news"].append({
                    "title": title,
                    "publisher": clean_name(item.get("publisher")),
                    "url": item.get("link"),
                    "publishedAt": datetime.fromtimestamp(item.get("providerPublishTime"), UTC).strftime("%Y-%m-%d %H:%M UTC") if item.get("providerPublishTime") else "",
                    "source": "Yahoo Finance search",
                })
            else:
                research["newsDiagnostics"]["rejected"] += 1
        research["newsDiagnostics"]["accepted"] = len(research["news"])
    except Exception as exc:
        research["newsDiagnostics"]["error"] = str(exc)
    return research


def main():
    temp = Path(gettempdir())
    nasdaq = parse_nasdaq_listed(download_text(NASDAQ_LISTED_URL))
    other = parse_other_listed(download_text(OTHER_LISTED_URL))
    warnings = []
    try:
        hkex = load_hkex_equity_filter()
    except Exception as exc:
        warnings.append(f"HKEX equityfilter failed, fallback to ListOfSecurities.xlsx: {exc}")
        hkex_xlsx = temp / "traderoute_hkex_ListOfSecurities.xlsx"
        download_binary(HKEX_LIST_URL, hkex_xlsx)
        hkex = parse_hkex(hkex_xlsx)
    if len(hkex) < 1000:
        warnings.append(f"HKEX snapshot count is low: {len(hkex)}")
    seeds = nordic_and_otc_seeds()
    rwa_coverage = load_rwa_coverage()

    stocks_by_symbol = {}
    source_counter = defaultdict(int)
    for listing in [*nasdaq, *other, *hkex, *seeds]:
        symbol = listing["symbol"]
        stock = row_to_stock(listing, listing["source"])
        if symbol in rwa_coverage:
            stock["profile"]["rwaSymbols"] = rwa_coverage[symbol]["symbols"]
        stocks_by_symbol[symbol] = stock
        source_counter[listing["source"]] += 1

    for ticker, coverage in rwa_coverage.items():
        if ticker not in stocks_by_symbol:
            listing = {
                "symbol": ticker,
                "symbolRaw": ticker,
                "name": PROFILE_OVERRIDES.get(ticker, {}).get("name") or f"{ticker} tokenized stock",
                "market": "US",
                "exchange": "RWA Snapshot",
                "exchangeName": "RWA Snapshot",
                "country": "US",
                "currency": "USD",
                "instrumentType": "RWA 快照标的",
                "source": "Binance Web3 RWA public API",
            }
            stock = row_to_stock(listing, listing["source"])
            stock["profile"]["rwaSymbols"] = coverage["symbols"]
            stocks_by_symbol[ticker] = stock

    for stock in list(stocks_by_symbol.values()):
        for related_symbol in stock["profile"].get("relatedListings", []):
            related = stocks_by_symbol.get(related_symbol)
            if not related:
                continue
            for listing in related["listings"]:
                if listing["symbol"] not in {item["symbol"] for item in stock["listings"]}:
                    stock["listings"].append(listing)
            if related_symbol not in stock["symbols"]:
                stock["symbols"].append(related_symbol)
            existing_routes = {route["platformId"] + "|" + route["listingSymbol"] for route in stock["profile"].get("verifiedBrokerRoutes", [])}
            for route in related["profile"].get("verifiedBrokerRoutes", []):
                route_key = route["platformId"] + "|" + route["listingSymbol"]
                if route_key not in existing_routes:
                    stock["profile"].setdefault("verifiedBrokerRoutes", []).append(route)
                    existing_routes.add(route_key)

    research_cache = {}
    for stock in stocks_by_symbol.values():
        override = PROFILE_OVERRIDES.get(stock["profile"]["code"], {})
        research_symbol = override.get("researchSymbol")
        if not research_symbol:
            continue
        if research_symbol not in research_cache:
            research_cache[research_symbol] = load_yahoo_research(research_symbol, override.get("researchKeywords", []))
        stock["profile"]["research"] = research_cache[research_symbol]
        if override.get("newsProbeNote"):
            stock["profile"]["research"]["newsDiagnostics"]["note"] = override["newsProbeNote"]

    stocks = sorted(stocks_by_symbol.values(), key=lambda item: (item["profile"]["primaryMarket"], item["profile"]["code"]))
    output = {
        "meta": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d"),
            "schemaVersion": "2.1.0",
            "stockCount": len(stocks),
            "listingCount": sum(len(item["listings"]) for item in stocks),
            "rwaTickerCount": len(rwa_coverage),
            "sources": dict(sorted(source_counter.items())),
            "warnings": warnings,
            "strategy": "snapshot_database_with_platform_adapters",
        },
        "stocks": stocks,
        "platforms": {
            "brokers": BROKER_PLATFORMS,
            "crypto": CRYPTO_PLATFORMS,
        },
        "rwaCoverage": rwa_coverage,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text("window.MARKET_DATA = " + payload + ";\n", encoding="utf-8")
    print(f"Generated {len(stocks)} stocks, {output['meta']['listingCount']} listings.")


if __name__ == "__main__":
    main()
