const state = {
  selectedAssetId: "baba",
  market: "all",
  type: "all",
  expanded: new Set(),
  showMissing: false,
};

const statusMeta = {
  tradable: { label: "可交易", className: "tradable" },
  conditional: { label: "需权限", className: "conditional" },
  tokenized: { label: "代币化替代", className: "tokenized" },
  perp: { label: "股票永续", className: "perp" },
  wallet: { label: "钱包入口", className: "wallet" },
  unverified: { label: "待核验", className: "unverified" },
  discovery: { label: "发现入口", className: "discovery" },
  not_found: { label: "未在清单发现", className: "not-found" },
  view: { label: "仅行情", className: "view" },
  unavailable: { label: "不支持", className: "unavailable" },
  unknown: { label: "待核验", className: "unknown" },
};

const typeLabel = {
  cex: "交易所",
  dex: "链上/永续",
  wallet: "钱包/聚合",
  app: "RWA App",
};

const assets = [];


if (window.MARKET_DATA?.assets?.length) {
  assets.length = 0;
  assets.push(...window.MARKET_DATA.assets);
} else {
  assets.length = 0;
}

const dataMeta = window.MARKET_DATA?.meta || {
  generatedAt: "2026-06-04",
  rwaRecordCount: 0,
  rwaTickerCount: assets.length,
  ondoTickerCount: 0,
  xstockTickerCount: 0,
};

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
  return value.trim().toLowerCase();
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
  const haystack = [asset.name, ...asset.symbols, ...asset.aliases].map((item) => normalize(String(item)));
  let score = 0;
  for (const item of haystack) {
    if (!item) continue;
    if (item === text) score = Math.max(score, 100);
    else if (text.length >= 2 && item.length >= 2 && item.startsWith(text)) score = Math.max(score, 80);
    else if (text.length >= 2 && item.length >= 2 && item.includes(text)) score = Math.max(score, 60);
    else if (item.length >= 3 && text.length >= 3 && text.includes(item)) score = Math.max(score, 40);
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
    .slice(0, 5);
}

function selectAsset(assetId) {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) return;
  state.selectedAssetId = assetId;
  state.expanded.clear();
  state.showMissing = false;
  assetSearch.value = asset.symbols[0];
  suggestions.innerHTML = "";
  assetSearch.setAttribute("aria-expanded", "false");
  render();
  document.querySelector("#market-results").scrollIntoView({ block: "start" });
}

function filteredRows(asset) {
  return asset.rows.filter((row) => {
    const marketOk = state.market === "all" || row.market === state.market;
    const typeOk = state.type === "all" || row.type === state.type;
    return marketOk && typeOk;
  });
}

function renderVerdict(rows) {
  const counters = [
    ["tokenized", "代币化"],
    ["perp", "永续"],
    ["wallet", "钱包"],
    ["unverified", "待核验"],
    ["not_found", "未发现"],
  ];
  verdictBar.innerHTML = counters
    .map(([status, label]) => {
      const count = rows.filter((row) => row.status === status).length;
      return `<div class="verdict-item"><strong>${count}</strong><span>${label}</span></div>`;
    })
    .join("");
}

function sortRows(rows) {
  const statusRank = {
    tokenized: 1,
    perp: 2,
    wallet: 3,
    discovery: 4,
    unverified: 5,
    not_found: 9,
  };
  return [...rows].sort((a, b) => {
    const aRank = statusRank[a.status] || 6;
    const bRank = statusRank[b.status] || 6;
    return aRank - bRank || a.platform.localeCompare(b.platform);
  });
}

function renderRows(rows, asset) {
  const sortedRows = sortRows(rows);
  const shouldFoldMissing = state.market === "all" && state.type === "all" && !state.showMissing;
  const missingRows = sortedRows.filter((row) => row.status === "not_found");
  const displayRows = shouldFoldMissing
    ? sortedRows.filter((row) => row.status !== "not_found")
    : sortedRows;

  if (!displayRows.length) {
    resultsGrid.innerHTML = "";
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  const rowsHtml = displayRows
    .map((row, index) => {
      const meta = statusMeta[row.status];
      const open = state.expanded.has(row.id);
      const route = row.route.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
      return `
        <article class="result-row ${meta.className}" style="animation-delay: ${Math.min(index * 35, 140)}ms">
          <div class="result-cell platform-cell">
            <div class="platform">
              <span class="platform-logo" aria-hidden="true">
                ${
                  row.logo
                    ? `<img src="${escapeHtml(row.logo)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />`
                    : ""
                }
                <span ${row.logo ? "hidden" : ""}>${escapeHtml(row.short)}</span>
              </span>
              <span>
                <strong>${escapeHtml(row.platform)}</strong>
                <small>${escapeHtml(typeLabel[row.type] || "加密/RWA")}</small>
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
            <strong>${escapeHtml(row.entryPrecision || "需核验")}</strong>
            <small>${escapeHtml(row.evidence || row.source)}</small>
          </div>
          <div class="result-cell action-cell">
            ${
              row.tradeUrl
                ? `<a class="trade-link" href="${escapeHtml(row.tradeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.tradeLabel || "打开平台")}</a>`
                : `<span class="trade-disabled">需核验</span>`
            }
            <button class="details-toggle" type="button" data-detail="${escapeHtml(row.id)}">
              ${open ? "收起" : "详情"}
            </button>
          </div>
            <div class="details ${open ? "is-open" : ""}">
              <div class="details-inner">
                <div class="details-content">
                  <p>${escapeHtml(row.detail)}</p>
                  <small>来源：${escapeHtml(row.source)} · ${escapeHtml(asset.updated)}</small>
                </div>
              </div>
            </div>
        </article>
      `;
    })
    .join("");
  const foldedHtml =
    shouldFoldMissing && missingRows.length
      ? `<button class="collapsed-unavailable" type="button" data-show-missing="true">未覆盖平台 ${missingRows.length} 家 · 展开查看</button>`
      : "";
  resultsGrid.innerHTML = rowsHtml + foldedHtml;
}

function renderAssetProfile(asset) {
  const profile = asset.profile || {};
  const tokenSymbols = profile.tokenSymbols?.length
    ? profile.tokenSymbols.join(" / ")
    : asset.symbols.filter((item) => item !== profile.code).join(" / ") || "暂无衍生符号";
  const chains = profile.chainCoverage?.length ? profile.chainCoverage.join("、") : "待核验";
  assetTitle.textContent = `${profile.company || asset.name} ${profile.code || asset.symbols[0]}`;
  assetSummary.innerHTML = `
    <span><strong>代码</strong>${escapeHtml(profile.code || asset.symbols[0])}</span>
    <span><strong>类型</strong>${escapeHtml(profile.assetType || "美股/RWA 标的")}</span>
    <span><strong>相关代币</strong>${escapeHtml(tokenSymbols)}</span>
    <span><strong>链覆盖</strong>${escapeHtml(chains)}</span>
    <span class="asset-intro"><strong>简介</strong>${escapeHtml(profile.description || asset.summary)}</span>
  `;
}

function render() {
  const asset = assets.find((item) => item.id === state.selectedAssetId);
  if (!asset) return;
  const rows = filteredRows(asset);
  renderAssetProfile(asset);
  freshnessStamp.textContent = `更新于 ${asset.updated}`;
  renderVerdict(rows);
  renderRows(rows, asset);
}

function renderDataMeta() {
  if (usCoverage) {
    usCoverage.textContent = `${dataMeta.rwaTickerCount || 0} 个 RWA 美股/ETF ticker，覆盖多类加密入口`;
  }
  if (sourceSnapshot) {
    sourceSnapshot.textContent = `页面当前使用 ${dataMeta.generatedAt} 本地快照：${dataMeta.rwaRecordCount || 0} 条 RWA 链上记录，${dataMeta.ondoTickerCount || 0} 个 Ondo ticker，${dataMeta.xstockTickerCount || 0} 个 xStocks ticker，并叠加 Binance、OKX、Bitget、Bybit、Kraken、Gate、ShapeShift、BitStocks Telegram、trade.xyz、Hyperliquid、Aster、MSX、StableStock、Lume、ChainStock 等加密入口规则。真实上线前需要接入后台定时同步、更新时间和错误反馈入口。`;
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
      return `
        <button class="suggestion" type="button" role="option" data-asset="${asset.id}">
          <span>
            <strong>${asset.name}</strong>
            <small>${asset.symbols.join(" / ")}</small>
          </span>
          <small>${asset.rows.length} 条路径</small>
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
  assetSummary.textContent = "当前样例库暂未收录该标的。真实上线后应提供纠错入口和订阅提醒。";
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
  state.showMissing = false;
  document.querySelectorAll("#marketFilters button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  render();
});

document.querySelector("#typeFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  state.type = button.dataset.type;
  state.showMissing = false;
  document.querySelectorAll("#typeFilters button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  render();
});

resultsGrid.addEventListener("click", (event) => {
  const missingButton = event.target.closest("[data-show-missing]");
  if (missingButton) {
    state.showMissing = true;
    render();
    return;
  }
  const button = event.target.closest("[data-detail]");
  if (!button) return;
  const id = button.dataset.detail;
  if (state.expanded.has(id)) {
    state.expanded.delete(id);
  } else {
    state.expanded.add(id);
  }
  render();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".search-workbench")) return;
  suggestions.innerHTML = "";
  assetSearch.setAttribute("aria-expanded", "false");
});

renderDataMeta();
render();
