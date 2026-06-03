const state = {
  selectedAssetId: "baba",
  market: "all",
  type: "all",
  expanded: new Set(),
  showUnsupported: false,
};

const statusMeta = {
  verified_tradable: { label: "官网可交易", className: "verified-tradable" },
  official_snapshot: { label: "RWA清单", className: "official-snapshot" },
  verification_pending: { label: "待接入", className: "verification-pending" },
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
const researchPanel = document.querySelector("#researchPanel");
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

function buildBrokerRows(asset) {
  const routes = asset.profile?.verifiedBrokerRoutes || [];
  return routes.map((route) => {
    const broker = brokers.find((item) => item.id === route.platformId) || {
      id: route.platformId,
      name: route.platformId,
      short: route.platformId.slice(0, 2).toUpperCase(),
      logo: "",
    };
    return {
      id: `${asset.id}-${broker.id}`,
      platform: broker.name,
      short: broker.short,
      logo: broker.logo,
      type: "broker",
      market: "broker",
      marketLabel: "官网直接证据",
      status: "verified_tradable",
      route: [route.listingSymbol, "官网页面", route.verifiedAt],
      summary: `${broker.name} 官网页面写明 ${route.listingSymbol} 可交易。`,
      detail: route.evidence,
      source: route.sourceUrl,
      evidence: "官网页面",
      entryPrecision: "官网证据",
      tradeUrl: route.sourceUrl,
      tradeLabel: "打开证据",
    };
  });
}

function buildPendingRows(asset, includePending) {
  if (!includePending) return [];
  const verifiedBrokerIds = new Set((asset.profile?.verifiedBrokerRoutes || []).map((route) => route.platformId));
  return brokers
    .filter((broker) => !verifiedBrokerIds.has(broker.id))
    .map((broker) => ({
      id: `${asset.id}-${broker.id}-pending`,
      platform: broker.name,
      short: broker.short,
      logo: broker.logo,
      type: "broker",
      market: "verification_pending",
      marketLabel: "未接入单标的 adapter",
      status: "verification_pending",
      route: [primaryListing(asset).symbol, "需官方接口或账户内搜索"],
      summary: `${broker.name} 尚未接入可复核的单标的 adapter。`,
      detail: "该平台不会展示为可交易路径，直到拿到官方单标的页面、官方清单或账户授权接口的明确命中结果。",
      source: broker.source,
      evidence: "未验证",
      entryPrecision: "不展示为可交易",
      tradeUrl: broker.url,
      tradeLabel: "打开平台",
    }));
}

function tickerForCrypto(asset) {
  const listings = asset.listings || [];
  const usListing = listings.find((listing) => listing.market === "US");
  return (usListing || listings[0] || primaryListing(asset)).symbol?.replace(/\..+$/, "");
}

function buildCryptoRows(asset, includePending = false) {
  const ticker = tickerForCrypto(asset);
  const coverage = rwaCoverage[ticker];
  const verifiedRows = [];
  if (coverage) {
    const platform = cryptoPlatforms.find((item) => item.id === "binance-rwa") || cryptoPlatforms[0];
    verifiedRows.push({
      id: `${asset.id}-${platform.id}`,
      platform: platform.name,
      short: platform.short,
      logo: platform.logo,
      type: platform.type,
      market: "crypto",
      marketLabel: "RWA 清单",
      status: "official_snapshot",
      route: [coverage.symbols?.[0] || `${ticker}on`, `${coverage.records || 0} 条 RWA 记录`],
      summary: `${platform.name} 的公开 RWA 快照命中 ${ticker}。`,
      detail: "RWA 清单命中只代表代币化入口存在，不等于传统股票持仓。地区、钱包、KYC、流动性和产品风险仍以平台页面为准。",
      source: "Binance Web3 RWA public API",
      evidence: "官方快照",
      entryPrecision: "RWA ticker 命中",
      tradeUrl: platform.url,
      tradeLabel: "打开平台",
    });
  }
  if (!includePending) return verifiedRows;
  const pendingRows = cryptoPlatforms
    .filter((platform) => !coverage || platform.id !== "binance-rwa")
    .map((platform) => ({
      id: `${asset.id}-${platform.id}-pending`,
      platform: platform.name,
      short: platform.short,
      logo: platform.logo,
      type: platform.type,
      market: "verification_pending",
      marketLabel: "未接入单标的 adapter",
      status: "verification_pending",
      route: [ticker, "需官方清单 adapter"],
      summary: `${platform.name} 尚未接入可复核的单标的 adapter。`,
      detail: "该入口不会展示为已命中路径，直到拿到官方清单、官方标的页或平台接口的明确结果。",
      source: "adapter pending",
      evidence: "未验证",
      entryPrecision: "不展示为可交易",
      tradeUrl: platform.url,
      tradeLabel: "打开平台",
    }));
  return [...verifiedRows, ...pendingRows];
}

function buildRows(asset, includePending = false) {
  return [...buildBrokerRows(asset), ...buildCryptoRows(asset, includePending), ...buildPendingRows(asset, includePending)];
}

function filteredRows(asset) {
  const includePending = state.market === "needs_check";
  return buildRows(asset, includePending).filter((row) => {
    const marketOk =
      state.market === "all" ||
      row.market === state.market ||
      (state.market === "broker" && row.type === "broker" && row.status === "verified_tradable") ||
      (state.market === "crypto" && row.type !== "broker" && row.status !== "verification_pending") ||
      (state.market === "needs_check" && ["verification_pending", "not_checked"].includes(row.status));
    const typeOk = state.type === "all" || row.type === state.type;
    return marketOk && typeOk;
  });
}

function renderVerdict(rows) {
  const counters = [
    ["verified_tradable", "官网可交易"],
    ["official_snapshot", "RWA清单"],
    ["verification_pending", "待接入"],
    ["tokenized", "RWA"],
    ["not_checked", "未接入"],
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
    verified_tradable: 1,
    official_snapshot: 2,
    tokenized: 4,
    perp: 5,
    discovery: 6,
    not_checked: 7,
    verification_pending: 9,
  };
  return [...rows].sort((a, b) => (rank[a.status] || 8) - (rank[b.status] || 8) || a.platform.localeCompare(b.platform));
}

function renderRows(rows, asset) {
  const sortedRows = sortRows(rows);
  const displayRows = sortedRows;

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
  resultsGrid.innerHTML = rowsHtml;
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

function formatNumber(value, fractionDigits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "暂无";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: fractionDigits }).format(value);
}

function formatSigned(value, suffix = "") {
  if (typeof value !== "number" || Number.isNaN(value)) return "暂无";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}${suffix}`;
}

function renderResearchPanel(asset) {
  if (!researchPanel) return;
  const research = asset.profile?.research || {};
  const quote = research.quote;
  const diagnostics = research.newsDiagnostics;
  const verifiedRoutes = asset.profile?.verifiedBrokerRoutes || [];
  const routeSummary = verifiedRoutes.length
    ? verifiedRoutes
        .map((route) => {
          const broker = brokers.find((item) => item.id === route.platformId);
          return `<a href="${escapeHtml(route.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(broker?.name || route.platformId)} · ${escapeHtml(route.listingSymbol)}</a>`;
        })
        .join("")
    : "<span>暂无官方单标的可交易证据</span>";
  const quoteHtml = quote
    ? `
      <strong>${escapeHtml(formatNumber(quote.price))} ${escapeHtml(quote.currency || "")}</strong>
      <small>${escapeHtml(quote.exchange || "")} · ${escapeHtml(quote.marketTime || "时间待更新")}</small>
      <span>${escapeHtml(formatSigned(quote.change))} / ${escapeHtml(formatSigned(quote.changePercent, "%"))}</span>
      <em>来源：${escapeHtml(quote.source)}</em>
    `
    : "<strong>暂无行情补充</strong><small>当前快照未接入可展示报价</small>";
  const newsHtml = diagnostics
    ? `
      <strong>${escapeHtml(String(diagnostics.accepted || 0))} 条强相关资讯</strong>
      <small>已过滤 ${escapeHtml(String(diagnostics.rejected || 0))} 条弱相关候选</small>
      <span>${escapeHtml(diagnostics.note || "仅展示命中公司名、代码或关联 ticker 的资讯。")}</span>
    `
    : "<strong>暂无资讯筛选</strong><small>该标的未接入资讯筛选</small>";

  researchPanel.innerHTML = `
    <article>
      <span class="panel-label">行情补充</span>
      ${quoteHtml}
    </article>
    <article>
      <span class="panel-label">券商证据</span>
      <strong>${verifiedRoutes.length} 个官网证据</strong>
      <div class="evidence-links">${routeSummary}</div>
    </article>
    <article>
      <span class="panel-label">资讯筛选</span>
      ${newsHtml}
    </article>
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
  renderResearchPanel(asset);
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
    sourceSnapshot.textContent = `当前使用 ${dataMeta.generatedAt || ""} 本地快照：${dataMeta.stockCount || assets.length} 个证券主条目，${dataMeta.listingCount || 0} 个上市代码，RWA ticker ${dataMeta.rwaTickerCount || 0} 个。来源：${sources || "本地快照"}。${warnings}GitHub Actions 每日刷新快照；平台结果由券商/加密平台 adapter 基于可复核来源生成。`;
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
  if (researchPanel) researchPanel.innerHTML = "";
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
