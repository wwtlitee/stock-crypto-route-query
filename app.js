const state = {
  selectedAssetId: "baba",
  market: "all",
  type: "all",
  expanded: new Set(),
  showUnsupported: false,
};

const statusMeta = {
  market_scope: { label: "市场覆盖", className: "market-scope" },
  requires_login: { label: "需登录核验", className: "requires-login" },
  unsupported_market: { label: "未覆盖市场", className: "unsupported-market" },
  not_checked: { label: "未接入验证", className: "not-checked" },
  tokenized: { label: "代币化替代", className: "tokenized" },
  perp: { label: "股票永续", className: "perp" },
  discovery: { label: "发现入口", className: "discovery" },
};

const typeLabel = {
  broker: "券商",
  cex: "交易所",
  dex: "链上/永续",
  wallet: "钱包/聚合",
  app: "RWA App",
};

const marketData = window.MARKET_DATA || {};
const assets = marketData.stocks || marketData.assets || [];
const brokers = marketData.platforms?.brokers || [];
const cryptoPlatforms = marketData.platforms?.crypto || [];
const rwaCoverage = marketData.rwaCoverage || {};
const dataMeta = marketData.meta || {};

const assetSearch = document.querySelector("#assetSearch");
const searchButton = document.querySelector("#searchButton");
const suggestions = document.querySelector("#suggestions");
const assetTitle = document.querySelector("#assetTitle");
const assetSummary = document.querySelector("#assetSummary");
const freshnessStamp = document.querySelector("#freshnessStamp");
const verdictBar = document.querySelector("#verdictBar");
const resultsGrid = document.querySelector("#resultsGrid");
const emptyState = document.querySelector("#emptyState");
const usCoverage = document.querySelector("#usCoverage");
const sourceSnapshot = document.querySelector("#sourceSnapshot");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchScore(asset, text) {
  let score = 0;
  const primaryCode = normalize(asset.profile?.code || asset.symbols?.[0]);
  if (primaryCode === text) score = Math.max(score, 170);

  for (const [index, listing] of (asset.listings || []).entries()) {
    const primaryListingWeight = index === 0;
    const listingSymbol = normalize(listing.symbol);
    const listingRaw = normalize(listing.symbolRaw);
    const exchangeToken = normalize(`${listing.exchange}:${listing.symbolRaw}`);
    if (listingSymbol === text) score = Math.max(score, primaryListingWeight ? 160 : 132);
    if (listingRaw === text) score = Math.max(score, primaryListingWeight ? 150 : 130);
    if (exchangeToken === text) score = Math.max(score, primaryListingWeight ? 145 : 126);
    if (text.length >= 2 && listingSymbol.startsWith(text)) score = Math.max(score, primaryListingWeight ? 105 : 76);
    if (text.length >= 2 && listingRaw.startsWith(text)) score = Math.max(score, primaryListingWeight ? 100 : 74);
  }

  for (const symbol of asset.symbols || []) {
    const item = normalize(symbol);
    if (item === text) score = Math.max(score, 140);
    else if (text.length >= 2 && item.startsWith(text)) score = Math.max(score, 95);
  }

  const name = normalize(asset.name);
  if (name === text) score = Math.max(score, 125);
  else if (text.length >= 2 && name.startsWith(text)) score = Math.max(score, 90);
  else if (text.length >= 2 && name.includes(text)) score = Math.max(score, 64);

  for (const alias of asset.aliases || []) {
    const item = normalize(alias);
    if (item === text) score = Math.max(score, 112);
    else if (text.length >= 2 && item.startsWith(text)) score = Math.max(score, 84);
    else if (text.length >= 2 && item.includes(text)) score = Math.max(score, 58);
  }
  return score;
}

function findAsset(query) {
  const text = normalize(query);
  if (!text) return null;
  return assets
    .map((asset, index) => ({ asset, index, score: matchScore(asset, text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.asset || null;
}

function getMatches(query) {
  const text = normalize(query);
  if (!text) return [];
  return assets
    .map((asset, index) => ({ asset, index, score: matchScore(asset, text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.asset)
    .slice(0, 7);
}

function primaryListing(asset) {
  return asset.listings?.[0] || {
    symbol: asset.profile?.code || asset.symbols?.[0] || "",
    symbolRaw: asset.profile?.code || asset.symbols?.[0] || "",
    market: asset.profile?.primaryMarket || "",
    exchangeName: asset.profile?.primaryExchange || "",
    currency: asset.profile?.currency || "",
    instrumentType: asset.profile?.assetType || "",
  };
}

function pickListingForBroker(asset, broker) {
  const listings = asset.listings || [primaryListing(asset)];
  const supported = listings.find((listing) => broker.supportedMarkets?.includes(listing.market));
  if (supported) return { listing: supported, status: "market_scope" };
  const login = listings.find((listing) => broker.requiresLoginMarkets?.includes(listing.market));
  if (login) return { listing: login, status: "requires_login" };
  return { listing: listings[0], status: "unsupported_market" };
}

function brokerStatusCopy(status, broker, listing) {
  if (status === "market_scope") {
    return {
      summary: `${broker.name} 公开市场范围覆盖 ${listing.exchangeName}；本快照尚未做账户级单标的下单确认。`,
      detail: `这是基于平台公开市场范围与本地证券主数据的适配结果。请在 ${broker.name} 内搜索 ${listing.symbol}，账户地区、KYC、产品权限和标的状态仍可能影响最终交易。`,
      evidence: "市场范围覆盖",
      precision: "需平台内搜索",
    };
  }
  if (status === "requires_login") {
    return {
      summary: `${broker.name} 对 ${listing.exchangeName} 需要登录、地区或权限核验，公开快照不能确认单标的。`,
      detail: `本快照不把该路径标记为可交易，只提示需要在平台内登录搜索 ${listing.symbol} 并核验权限。`,
      evidence: "需登录核验",
      precision: "需登录核验",
    };
  }
  return {
    summary: `${broker.name} 当前公开市场范围未覆盖 ${listing.exchangeName}。`,
    detail: `未覆盖市场不代表该公司不存在，只表示该平台的公开市场范围与 ${listing.symbol} 的主/关联上市市场不匹配。`,
    evidence: "市场未覆盖",
    precision: "未覆盖市场",
  };
}

function buildBrokerRows(asset) {
  return brokers.map((broker) => {
    const picked = pickListingForBroker(asset, broker);
    const copy = brokerStatusCopy(picked.status, broker, picked.listing);
    return {
      id: `${asset.id}-${broker.id}`,
      platform: broker.name,
      short: broker.short,
      logo: broker.logo,
      type: "broker",
      market: "broker",
      marketLabel: "券商路径",
      status: picked.status,
      route: [picked.listing.symbol, picked.listing.exchangeName, picked.listing.currency || "币种待核验"],
      summary: copy.summary,
      detail: copy.detail,
      source: broker.source,
      evidence: copy.evidence,
      entryPrecision: copy.precision,
      tradeUrl: broker.url,
      tradeLabel: "打开券商",
    };
  });
}

function tickerForCrypto(asset) {
  const listings = asset.listings || [];
  const usListing = listings.find((listing) => listing.market === "US");
  return (usListing || listings[0] || primaryListing(asset)).symbol?.replace(/\..+$/, "");
}

function buildCryptoRows(asset) {
  const ticker = tickerForCrypto(asset);
  const coverage = rwaCoverage[ticker];
  if (!coverage) return [];
  return cryptoPlatforms.map((platform) => {
    let status = "discovery";
    let market = "discovery";
    let label = "加密/RWA入口";
    let route = [ticker, "需平台内搜索"];
    if (platform.id === "binance-rwa" || platform.id === "okx-ondo") {
      status = "tokenized";
      market = "tokenized";
      label = "代币化股票";
      route = [coverage.symbols?.[0] || `${ticker}on`, `${coverage.records || 0} 条 RWA 记录`];
    } else if (["bybit-xstocks", "kraken-xstocks", "gate-xstocks"].includes(platform.id)) {
      status = coverage.hasXStock ? "tokenized" : "not_checked";
      market = "tokenized";
      label = "xStocks";
      route = coverage.hasXStock ? [`${ticker}x`, "xStocks"] : [ticker, "未在 xStocks 快照确认"];
    } else if (["trade-xyz", "hyperliquid", "aster", "bitget-stock"].includes(platform.id)) {
      status = "not_checked";
      market = "perp";
      label = "股票永续";
      route = [ticker, "需平台内核验"];
    }
    return {
      id: `${asset.id}-${platform.id}`,
      platform: platform.name,
      short: platform.short,
      logo: platform.logo,
      type: platform.type,
      market,
      marketLabel: label,
      status,
      route,
      summary: `${platform.name} 作为加密/RWA入口保留；状态来自 RWA 快照或平台入口规则。`,
      detail: "加密/RWA入口不等于传统股票持仓；地区、钱包、KYC、流动性和衍生品风险需要在平台内确认。",
      source: "Binance Web3 RWA snapshot + platform adapter",
      evidence: coverage.records ? "RWA 快照" : "平台入口规则",
      entryPrecision: "平台入口",
      tradeUrl: platform.url,
      tradeLabel: "打开平台",
    };
  });
}

function buildRows(asset) {
  return [...buildBrokerRows(asset), ...buildCryptoRows(asset)];
}

function filteredRows(asset) {
  return buildRows(asset).filter((row) => {
    const marketOk =
      state.market === "all" ||
      row.market === state.market ||
      (state.market === "crypto" && row.market !== "broker") ||
      (state.market === "needs_check" && ["requires_login", "not_checked"].includes(row.status)) ||
      (state.market === "unsupported" && row.status === "unsupported_market");
    const typeOk = state.type === "all" || row.type === state.type;
    return marketOk && typeOk;
  });
}

function renderVerdict(rows) {
  const counters = [
    ["market_scope", "市场覆盖"],
    ["requires_login", "需核验"],
    ["unsupported_market", "未覆盖"],
    ["tokenized", "RWA"],
    ["not_checked", "未验证"],
  ];
  verdictBar.innerHTML = counters
    .map(([status, label]) => {
      const count = rows.filter((row) => row.status === status).length;
      return `<div class="verdict-item"><strong>${count}</strong><span>${label}</span></div>`;
    })
    .join("");
}

function sortRows(rows) {
  const rank = {
    market_scope: 1,
    requires_login: 3,
    tokenized: 4,
    perp: 5,
    discovery: 6,
    not_checked: 7,
    unsupported_market: 9,
  };
  return [...rows].sort((a, b) => (rank[a.status] || 8) - (rank[b.status] || 8) || a.platform.localeCompare(b.platform));
}

function renderRows(rows, asset) {
  const sortedRows = sortRows(rows);
  const shouldFoldUnsupported = state.market === "all" && state.type === "all" && !state.showUnsupported;
  const unsupportedRows = sortedRows.filter((row) => row.status === "unsupported_market");
  const displayRows = shouldFoldUnsupported
    ? sortedRows.filter((row) => row.status !== "unsupported_market")
    : sortedRows;

  if (!displayRows.length) {
    resultsGrid.innerHTML = "";
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  const rowsHtml = displayRows
    .map((row, index) => {
      const meta = statusMeta[row.status] || statusMeta.not_checked;
      const open = state.expanded.has(row.id);
      const route = row.route.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
      return `
        <article class="result-row ${meta.className}" style="animation-delay: ${Math.min(index * 28, 112)}ms">
          <div class="result-cell platform-cell">
            <div class="platform">
              <span class="platform-logo" aria-hidden="true">
                ${row.logo ? `<img src="${escapeHtml(row.logo)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />` : ""}
                <span ${row.logo ? "hidden" : ""}>${escapeHtml(row.short)}</span>
              </span>
              <span>
                <strong>${escapeHtml(row.platform)}</strong>
                <small>${escapeHtml(typeLabel[row.type] || "平台")}</small>
              </span>
            </div>
          </div>
          <div class="result-cell status-cell">
            <span class="status-pill ${meta.className}">${escapeHtml(meta.label)}</span>
            <small>${escapeHtml(row.marketLabel)}</small>
          </div>
          <div class="result-cell route-cell">
            <div class="route-line">${route}</div>
            <p class="summary-line">${escapeHtml(row.summary)}</p>
          </div>
          <div class="result-cell evidence-cell">
            <strong>${escapeHtml(row.entryPrecision)}</strong>
            <small>${escapeHtml(row.evidence)}</small>
          </div>
          <div class="result-cell action-cell">
            <a class="trade-link" href="${escapeHtml(row.tradeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.tradeLabel)}</a>
            <button class="details-toggle" type="button" data-detail="${escapeHtml(row.id)}">${open ? "收起" : "详情"}</button>
          </div>
          <div class="details ${open ? "is-open" : ""}">
            <div class="details-inner">
              <div class="details-content">
                <p>${escapeHtml(row.detail)}</p>
                <small>来源：${escapeHtml(row.source)} · 快照 ${escapeHtml(asset.updated || dataMeta.generatedAt)}</small>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
  const foldedHtml =
    shouldFoldUnsupported && unsupportedRows.length
      ? `<button class="collapsed-unavailable" type="button" data-show-unsupported="true">未覆盖市场平台 ${unsupportedRows.length} 家 · 展开查看</button>`
      : "";
  resultsGrid.innerHTML = rowsHtml + foldedHtml;
}

function renderAssetProfile(asset) {
  const listing = primaryListing(asset);
  const symbols = (asset.listings || []).map((item) => item.symbol).join(" / ");
  const related = asset.profile?.relatedListings?.length ? asset.profile.relatedListings.join(" / ") : "暂无";
  assetTitle.textContent = `${asset.profile?.company || asset.name} ${asset.profile?.code || listing.symbol}`;
  assetSummary.innerHTML = `
    <span><strong>主代码</strong>${escapeHtml(listing.symbol)}</span>
    <span><strong>市场</strong>${escapeHtml(listing.exchangeName)}</span>
    <span><strong>类型</strong>${escapeHtml(listing.instrumentType || asset.profile?.assetType || "证券")}</span>
    <span><strong>币种</strong>${escapeHtml(listing.currency || "待核验")}</span>
    <span><strong>其他代码</strong>${escapeHtml(related)}</span>
    <span class="asset-intro"><strong>简介</strong>${escapeHtml(asset.profile?.description || asset.summary)}</span>
    <span class="asset-intro"><strong>快照代码</strong>${escapeHtml(symbols)}</span>
  `;
}

function selectAsset(assetId) {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) return;
  state.selectedAssetId = assetId;
  state.expanded.clear();
  state.showUnsupported = false;
  assetSearch.value = primaryListing(asset).symbol;
  suggestions.innerHTML = "";
  assetSearch.setAttribute("aria-expanded", "false");
  render();
  document.querySelector("#market-results").scrollIntoView({ block: "start" });
}

function render() {
  const asset = assets.find((item) => item.id === state.selectedAssetId) || assets[0];
  if (!asset) return;
  const rows = filteredRows(asset);
  renderAssetProfile(asset);
  freshnessStamp.textContent = `快照 ${dataMeta.generatedAt || asset.updated || ""}`;
  renderVerdict(rows);
  renderRows(rows, asset);
}

function renderDataMeta() {
  if (usCoverage) {
    usCoverage.textContent = `${dataMeta.stockCount || assets.length} 个证券主条目，${dataMeta.listingCount || 0} 个上市代码`;
  }
  if (sourceSnapshot) {
    const sources = Object.entries(dataMeta.sources || {})
      .map(([name, count]) => `${name}: ${count}`)
      .join("；");
    const warnings = (dataMeta.warnings || []).length ? `数据告警：${dataMeta.warnings.join("；")}。` : "";
    sourceSnapshot.textContent = `当前使用 ${dataMeta.generatedAt || ""} 本地快照：${dataMeta.stockCount || assets.length} 个证券主条目，${dataMeta.listingCount || 0} 个上市代码，RWA ticker ${dataMeta.rwaTickerCount || 0} 个。来源：${sources || "本地快照"}。${warnings}平台结果由券商/加密平台适配器基于快照生成。`;
  }
}

function renderSuggestions() {
  const matches = getMatches(assetSearch.value);
  if (!matches.length) {
    suggestions.innerHTML = "";
    assetSearch.setAttribute("aria-expanded", "false");
    return;
  }
  suggestions.innerHTML = matches
    .map((asset) => {
      const listing = primaryListing(asset);
      return `
        <button class="suggestion" type="button" role="option" data-asset="${escapeHtml(asset.id)}">
          <span>
            <strong>${escapeHtml(asset.name)}</strong>
            <small>${escapeHtml(listing.symbol)} · ${escapeHtml(listing.exchangeName)}</small>
          </span>
          <small>${escapeHtml(listing.instrumentType || "证券")}</small>
        </button>
      `;
    })
    .join("");
  assetSearch.setAttribute("aria-expanded", "true");
}

function runSearch() {
  const asset = findAsset(assetSearch.value);
  if (asset) {
    selectAsset(asset.id);
    return;
  }
  resultsGrid.innerHTML = "";
  verdictBar.innerHTML = "";
  assetTitle.textContent = "未找到结果";
  assetSummary.textContent = "当前快照暂未收录该代码。可以换用主上市代码、交易所后缀、公司英文名或 OTC 代码再试。";
  freshnessStamp.textContent = "未匹配";
  emptyState.hidden = false;
  suggestions.innerHTML = "";
  assetSearch.setAttribute("aria-expanded", "false");
}

assetSearch.addEventListener("input", renderSuggestions);
assetSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
  if (event.key === "Escape") {
    suggestions.innerHTML = "";
    assetSearch.setAttribute("aria-expanded", "false");
  }
});

searchButton.addEventListener("click", runSearch);

suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-asset]");
  if (!button) return;
  selectAsset(button.dataset.asset);
});

document.querySelector(".quick-picks").addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (!button) return;
  assetSearch.value = button.dataset.query;
  runSearch();
});

document.querySelector("#marketFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-market]");
  if (!button) return;
  state.market = button.dataset.market;
  state.showUnsupported = false;
  document.querySelectorAll("#marketFilters button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  render();
});

document.querySelector("#typeFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  state.type = button.dataset.type;
  state.showUnsupported = false;
  document.querySelectorAll("#typeFilters button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  render();
});

resultsGrid.addEventListener("click", (event) => {
  const unsupportedButton = event.target.closest("[data-show-unsupported]");
  if (unsupportedButton) {
    state.showUnsupported = true;
    render();
    return;
  }
  const button = event.target.closest("[data-detail]");
  if (!button) return;
  const id = button.dataset.detail;
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  render();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".search-workbench")) return;
  suggestions.innerHTML = "";
  assetSearch.setAttribute("aria-expanded", "false");
});

renderDataMeta();
render();
