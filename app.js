const state = {
  completedKeys: [],
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

init();

async function init() {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (response.ok) {
      els.catalogCount.textContent = data.catalogCount;
      els.status.textContent = "Ready to compare against the Arc content catalog.";
    } else {
      throw new Error(data.error || "Failed to load catalog count.");
    }
  } catch (error) {
    els.status.textContent = "Could not load catalog. Make sure the API server is running.";
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

async function analyze() {
  const val = els.input.value.trim();
  if (!val) {
    els.status.textContent = "No Read Content or Watch a Video contribution titles were found.";
    return;
  }

  els.status.textContent = "Analyzing contributions...";
  els.analyze.disabled = true;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: val }),
    });
    const data = await response.json();
    if (response.ok) {
      state.completedKeys = Array.from({ length: data.completedCount });
      state.missed = data.missed;
      els.completedCount.textContent = data.completedCount;
      els.missedCount.textContent = data.missedCount;
      els.status.textContent = data.completedTitlesCount
        ? `Found ${data.completedTitlesCount} contribution title${data.completedTitlesCount === 1 ? "" : "s"} in the pasted text.`
        : "No Read Content or Watch a Video contribution titles were found.";
      render();
    } else {
      throw new Error(data.error || "Failed to analyze.");
    }
  } catch (error) {
    els.status.textContent = "Failed to analyze. Please try again.";
    console.error(error);
  } finally {
    els.analyze.disabled = false;
  }
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
      "The app compares Read Content and Watch a Video entries against the Arc content catalog."
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

  const targetLink = item.link || createArcSearchUrl(item.title);
  const duration = item.duration ? `<span>${escapeHtml(item.duration)}</span>` : "<span>Article</span>";
  card.innerHTML = `
    <a class="cover-wrap" href="${escapeAttribute(targetLink)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeAttribute(item.title)}">
      <img src="${escapeAttribute(item.cover)}" alt="">
      <span class="badge">${item.type === "video" ? "Video" : "Read"}</span>
    </a>
    <div class="card-body">
      <div class="title-row">
        <a class="title-link" href="${escapeAttribute(targetLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
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
  state.completedKeys = [];
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
