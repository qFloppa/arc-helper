const state = {
  catalog: [],
  completedKeys: new Set(),
  missed: [],
  filter: "all",
  query: "",
};

const els = {
  input: document.querySelector("#contributionInput"),
  analyze: document.querySelector("#analyzeButton"),
  clear: document.querySelector("#clearButton"),
  status: document.querySelector("#statusText"),
  catalogCount: document.querySelector("#catalogCount"),
  completedCount: document.querySelector("#completedCount"),
  missedCount: document.querySelector("#missedCount"),
  grid: document.querySelector("#contentGrid"),
  empty: document.querySelector("#emptyState"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultsMeta: document.querySelector("#resultsMeta"),
  search: document.querySelector("#searchInput"),
  tabs: [...document.querySelectorAll(".tab")],
};

const contributionTypes = new Set(["Read Content", "Watch a Video"]);
const stopLines = new Set([
  "Read Content",
  "Watch a Video",
  "Daily Active",
  "Terms of Service",
  "Privacy",
  "Code of Conduct",
  "Your Privacy Choices",
]);

const duplicateExceptions = new Set([
  "emerging ai trends with usdc",
  "using circle developer controlled wallets to send manage usdc",
  "using circle wallets to send manage usdc",
]);

init();

async function init() {
  try {
    const response = await fetch("arc-content.json");
    state.catalog = await response.json();
    els.catalogCount.textContent = state.catalog.length;
    els.status.textContent = "Ready to compare against the Arc content catalog.";
  } catch (error) {
    els.status.textContent = "Could not load arc-content.json. Open this through a local server if the browser blocks file access.";
    console.error(error);
  }

  els.analyze.addEventListener("click", analyze);
  els.clear.addEventListener("click", clearAll);
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.filter = tab.dataset.filter;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });
}

function analyze() {
  const completedTitles = extractCompletedTitles(els.input.value);
  const completedKeys = new Set(completedTitles.map(normalizeTitle));

  state.completedKeys = new Set();
  state.missed = state.catalog.filter((item) => {
    const catalogKey = normalizeTitle(item.title);
    const matched = hasMatch(catalogKey, completedKeys);
    if (matched) state.completedKeys.add(catalogKey);
    
    // Exception to always show these duplicate items and their duplicates in the results
    if (duplicateExceptions.has(catalogKey)) {
      return true;
    }
    
    return !matched;
  });

  els.completedCount.textContent = state.completedKeys.size;
  els.missedCount.textContent = state.missed.length;
  els.status.textContent = completedTitles.length
    ? `Found ${completedTitles.length} contribution title${completedTitles.length === 1 ? "" : "s"} in the pasted text.`
    : "No Read Content or Watch a Video contribution titles were found.";

  render();
}

function extractCompletedTitles(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titles = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!contributionTypes.has(lines[index])) continue;

    const titleParts = [];
    for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
      const line = lines[lookahead];
      if (lookahead !== index + 1 && stopLines.has(line)) break;
      if (line === "+" || /^\+?\d+$/.test(line) || /^x\d+$/i.test(line)) continue;

      const datedTitle = extractTitleFromDatedLine(line);
      if (datedTitle !== null) {
        if (datedTitle) titleParts.push(datedTitle);
        continue;
      }

      if (titleParts.length) titleParts.push(line);
    }

    const title = titleParts.join(" ").replace(/\s+/g, " ").trim();
    if (title) titles.push(title);
  }

  return [...new Set(titles)];
}

function extractTitleFromDatedLine(line) {
  const dateDivider = line.indexOf("\u00b7");
  if (dateDivider >= 0) return line.slice(dateDivider + 1).trim();

  const dateMatch = line.match(/^[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\s*(?:[?*|-])?\s*(.*)$/);
  return dateMatch ? dateMatch[1].trim() : null;
}

function hasMatch(catalogKey, completedKeys) {
  if (completedKeys.has(catalogKey)) return true;

  for (const completedKey of completedKeys) {
    if (!completedKey || !catalogKey) continue;
    if (catalogKey.includes(completedKey) || completedKey.includes(catalogKey)) return true;
    if (similarity(catalogKey, completedKey) >= 0.9) return true;
  }

  return false;
}

function normalizeTitle(value) {
  return fixCommonMojibake(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(or|and|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fixCommonMojibake(value) {
  return value
    .replaceAll("\u00e2\u20ac\u2122", "'")
    .replaceAll("\u00e2\u20ac\u0153", '"')
    .replaceAll("\u00e2\u20ac\ufffd", '"')
    .replaceAll("\u00e2\u20ac\u201c", "-")
    .replaceAll("\u00e2\u20ac\u201d", "-");
}

function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (!longer.length) return 1;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(a, b) {
  const costs = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = costs[j];
      costs[j] = a[i - 1] === b[j - 1]
        ? costs[j - 1]
        : Math.min(costs[j - 1], previous, costs[j]) + 1;
      previous = current;
    }
    costs[0] = i;
  }
  return costs[b.length];
}

function render() {
  const visible = state.missed.filter((item) => {
    const typeMatch = state.filter === "all" || item.type === state.filter;
    const queryMatch = !state.query || item.title.toLowerCase().includes(state.query);
    return typeMatch && queryMatch;
  });

  els.grid.innerHTML = "";
  els.resultsTitle.textContent = state.missed.length
    ? "Content you still have available"
    : "Paste your contributions to begin";
  els.resultsMeta.textContent = state.missed.length
    ? `${visible.length} shown of ${state.missed.length} missed`
    : "";

  els.empty.classList.toggle("hidden", visible.length > 0);
  if (!visible.length && state.missed.length) {
    setEmptyState("No items match this filter.", "Try another type or search term.");
  } else {
    setEmptyState(
      "Your missed Arc queue will appear here.",
      "The app compares Read Content and Watch a Video entries against `arc-content.json`."
    );
  }

  visible.forEach((item) => els.grid.appendChild(createCard(item)));
}

function setEmptyState(title, body) {
  let heading = els.empty.querySelector("h3");
  let paragraph = els.empty.querySelector("p");

  if (!heading) {
    heading = document.createElement("h3");
    els.empty.prepend(heading);
  }

  if (!paragraph) {
    paragraph = document.createElement("p");
    els.empty.appendChild(paragraph);
  }

  heading.textContent = title;
  paragraph.textContent = body;
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  const searchUrl = createArcSearchUrl(item.title);
  const duration = item.duration ? `<span>${escapeHtml(item.duration)}</span>` : "<span>Article</span>";
  card.innerHTML = `
    <a class="cover-wrap" href="${escapeAttribute(searchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeAttribute(item.title)} in Arc House search">
      <img src="${escapeAttribute(item.cover)}" alt="">
      <span class="badge">${item.type === "video" ? "Video" : "Read"}</span>
    </a>
    <div class="card-body">
      <div class="title-row">
        <a class="title-link" href="${escapeAttribute(searchUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <button class="copy-button" type="button" data-title="${escapeAttribute(item.title)}" aria-label="Copy title">Copy</button>
      </div>
      <div class="meta-row">
        <span>${item.type === "video" ? "Watch" : "Read"}</span>
        ${duration}
      </div>
    </div>
  `;

  const copyButton = card.querySelector(".copy-button");
  copyButton.addEventListener("click", () => copyTitle(copyButton, item.title));

  return card;
}

function createArcSearchUrl(title) {
  const params = new URLSearchParams({ query: title });
  return `https://community.arc.io/home/search?${params.toString()}`;
}

async function copyTitle(button, title) {
  try {
    await navigator.clipboard.writeText(title);
    button.textContent = "Copied";
    button.classList.add("copied");
    window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("copied");
    }, 1400);
  } catch (error) {
    button.textContent = "Select";
    console.error(error);
  }
}

function clearAll() {
  els.input.value = "";
  state.completedKeys = new Set();
  state.missed = [];
  state.query = "";
  els.search.value = "";
  els.completedCount.textContent = "0";
  els.missedCount.textContent = "0";
  els.status.textContent = "Ready to compare against the Arc content catalog.";
  render();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
