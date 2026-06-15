const catalog = require('./catalog.js');

const contributionTypes = new Set(["Read Content", "Watch a Video"]);
const stopLines = new Set([
  "Read Content",
  "Watch a Video",
  "Daily Active",
  "Terms of Service",
  "Privacy",
  "Code of Conduct",
  "Your Privacy Choices",
  "Finish Onboarding",
  "Event Registration",
  "Event Participation",
]);

module.exports = async (req, res) => {
  // Set CORS headers to prevent direct access/calls from unauthorized origins if needed,
  // but by default Vercel functions handle standard browser requests on the same domain.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { input } = req.body || {};
  if (input === undefined || input === null) {
    return res.status(200).json({ catalogCount: catalog.length });
  }
  if (typeof input !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input. Expecting a JSON body with an "input" string.' });
  }

  try {
    const completedTitles = extractCompletedTitles(input);
    const completedPool = completedTitles.map(normalizeTitle);

    // Two-Pass Matching
    const matchedIndices = new Set();
    const completedKeys = [];

    // Pass 1: Try exact matches first
    for (let i = 0; i < catalog.length; i += 1) {
      const catalogKey = normalizeTitle(catalog[i].title);
      const exactIndex = completedPool.indexOf(catalogKey);
      if (exactIndex >= 0) {
        completedPool.splice(exactIndex, 1);
        matchedIndices.add(i);
        completedKeys.push(catalogKey);
      }
    }

    // Pass 2: Try fuzzy / substring matches for unmatched items
    const missed = [];
    for (let i = 0; i < catalog.length; i += 1) {
      if (matchedIndices.has(i)) continue;

      const catalogKey = normalizeTitle(catalog[i].title);
      let fuzzyMatched = false;
      for (let idx = 0; idx < completedPool.length; idx += 1) {
        const completedKey = completedPool[idx];
        if (!completedKey || !catalogKey) continue;
        if (catalogKey.includes(completedKey) || completedKey.includes(catalogKey) || similarity(catalogKey, completedKey) >= 0.9) {
          completedPool.splice(idx, 1);
          matchedIndices.add(i);
          completedKeys.push(catalogKey);
          fuzzyMatched = true;
          break;
        }
      }

      if (!fuzzyMatched) {
        missed.push(catalog[i]);
      }
    }

    return res.status(200).json({
      catalogCount: catalog.length,
      completedCount: completedKeys.length,
      missedCount: missed.length,
      missed,
      completedTitlesCount: completedTitles.length
    });
  } catch (error) {
    console.error('Error in analyze API:', error);
    return res.status(500).json({ error: 'Internal server error during analysis.' });
  }
};

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

  return titles;
}

function extractTitleFromDatedLine(line) {
  const dateDivider = line.indexOf("\u00b7");
  if (dateDivider >= 0) return line.slice(dateDivider + 1).trim();

  const dateMatch = line.match(/^[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\s*(?:[?*|-])?\s*(.*)$/);
  return dateMatch ? dateMatch[1].trim() : null;
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
