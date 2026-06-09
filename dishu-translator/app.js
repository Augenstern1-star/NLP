(function () {
  "use strict";

  const HISTORY_KEY = "dishu_translator_history_v1";
  const ALIAS_KEY = "dishu_translator_aliases_v1";
  const MAX_HISTORY = 20;

  const conceptIndex = window.DISHU_CONCEPT_INDEX || { concepts: [] };
  const examplesData = window.DISHU_TRANSLATOR_EXAMPLES || { examples: [] };
  const concepts = Array.isArray(conceptIndex.concepts) ? conceptIndex.concepts : [];
  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
  const fallbackAliases = [
    { term: "凌晨", concepts: ["次日", "晚上", "五点"] },
    { term: "明天", concepts: ["次日", "将来", "时间"] },
    { term: "上班", concepts: ["工作", "公司"] },
    { term: "关掉", concepts: ["关掉电视", "关灯", "关闭电视"] },
    { term: "关手机", concepts: ["通过手机", "拿起手机"] },
    { term: "睡觉了", concepts: ["睡觉", "闭眼睡觉"] },
    { term: "两点", concepts: ["两点了", "时间"] },
    { term: "两点钟", concepts: ["两点了", "时间"] },
    { term: "路口", concepts: ["红灯", "走路"] },
    { term: "上课", concepts: ["工作", "学习"] },
  ];
  const ignoredPhrases = [
    "还要",
    "已经",
    "只是",
    "还有",
    "有点",
    "一点",
    "一下",
    "马上",
    "就要",
    "要",
    "了",
    "的",
    "地",
    "得",
    "着",
  ];

  let userAliases = loadJson(ALIAS_KEY, []);
  let historyItems = loadJson(HISTORY_KEY, []);
  let dictionary = buildDictionary(concepts);
  let lastResults = [];
  let selectedKey = "";
  let currentAiSuggestions = [];

  const dom = {
    sourceInput: document.getElementById("sourceInput"),
    translateBtn: document.getElementById("translateBtn"),
    clearBtn: document.getElementById("clearBtn"),
    aiEndpointInput: document.getElementById("aiEndpointInput"),
    aiModelInput: document.getElementById("aiModelInput"),
    aiApiKeyInput: document.getElementById("aiApiKeyInput"),
    runAiApiBtn: document.getElementById("runAiApiBtn"),
    aiStatus: document.getElementById("aiStatus"),
    buildAiPromptBtn: document.getElementById("buildAiPromptBtn"),
    copyAiPromptBtn: document.getElementById("copyAiPromptBtn"),
    aiPromptOutput: document.getElementById("aiPromptOutput"),
    aiResponseInput: document.getElementById("aiResponseInput"),
    applyAiResponseBtn: document.getElementById("applyAiResponseBtn"),
    aiSuggestions: document.getElementById("aiSuggestions"),
    exampleButtons: document.getElementById("exampleButtons"),
    glyphOutput: document.getElementById("glyphOutput"),
    detailList: document.getElementById("detailList"),
    selectedDetail: document.getElementById("selectedDetail"),
    resultTitle: document.getElementById("resultTitle"),
    confidenceLabel: document.getElementById("confidenceLabel"),
    confidenceBar: document.getElementById("confidenceBar"),
    matchStats: document.getElementById("matchStats"),
    conceptCount: document.getElementById("conceptCount"),
    exampleCount: document.getElementById("exampleCount"),
    serviceStatus: document.getElementById("serviceStatus"),
    lookupInput: document.getElementById("lookupInput"),
    lookupResults: document.getElementById("lookupResults"),
    historyList: document.getElementById("historyList"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  };

  init();

  function init() {
    dom.conceptCount.textContent = `${concepts.length} concepts`;
    dom.exampleCount.textContent = `${examplesData.examples.length} examples`;
    renderExamples();
    renderHistory();
    renderLookupResults("");
    renderAiSuggestions();
    bindEvents();
    checkServiceHealth();
    translateCurrentInput({ saveHistory: false });
  }

  function bindEvents() {
    dom.translateBtn.addEventListener("click", () => translateCurrentInput({ saveHistory: true }));
    dom.clearBtn.addEventListener("click", clearInput);
    dom.runAiApiBtn.addEventListener("click", runAiApiFill);
    dom.buildAiPromptBtn.addEventListener("click", buildAiPrompt);
    dom.copyAiPromptBtn.addEventListener("click", copyAiPrompt);
    dom.applyAiResponseBtn.addEventListener("click", readAiSuggestionsFromText);
    dom.clearHistoryBtn.addEventListener("click", clearHistory);
    dom.lookupInput.addEventListener("input", () => renderLookupResults(dom.lookupInput.value));
    dom.sourceInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        translateCurrentInput({ saveHistory: true });
      }
    });
  }

  function clearInput() {
    dom.sourceInput.value = "";
    dom.aiPromptOutput.value = "";
    dom.aiResponseInput.value = "";
    dom.aiStatus.textContent = "";
    currentAiSuggestions = [];
    selectedKey = "";
    renderTranslation([], { saveHistory: false });
    renderAiSuggestions();
  }

  function renderExamples() {
    dom.exampleButtons.innerHTML = "";
    examplesData.examples.forEach((example, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${index + 1}. ${example.sentence}`;
      button.addEventListener("click", () => {
        dom.sourceInput.value = example.sentence;
        renderTranslation(translateExample(example), { source: example.sentence, saveHistory: true });
      });
      dom.exampleButtons.appendChild(button);
    });
  }

  function translateCurrentInput(options = {}) {
    const input = dom.sourceInput.value.trim();
    if (!input) {
      renderTranslation([], { saveHistory: false });
      return;
    }
    renderTranslation(translateFreeInput(input), {
      source: input,
      saveHistory: options.saveHistory !== false,
    });
  }

  function translateExample(example) {
    return (example.sequence || [])
      .map((item) => {
        const concept = conceptsById.get(item.concept_id);
        if (!concept) {
          return makeGap(item.term || "unknown");
        }
        return makeMatch(item.term || concept.label, concept, "example");
      })
      .filter(Boolean);
  }

  function translateFreeInput(input) {
    const results = [];
    let index = 0;
    while (index < input.length) {
      const char = input[index];
      if (isIgnoredChar(char)) {
        index += 1;
        continue;
      }

      const entry = findEntryAt(input, index);
      if (entry) {
        results.push(makeMatch(input.slice(index, index + entry.term.length), entry.concept, entry.mode || "match"));
        index += entry.term.length;
        continue;
      }

      const ignoredPhrase = findIgnoredPhraseAt(input, index);
      if (ignoredPhrase) {
        index += ignoredPhrase.length;
        continue;
      }

      const next = readUnknownChunk(input, index);
      pushGap(results, next.text);
      index = next.nextIndex;
    }
    return results;
  }

  function buildDictionary(sourceConcepts) {
    const entries = [];
    const seen = new Set();

    userAliases.forEach((alias) => {
      const concept = conceptsById.get(alias.concept_id);
      const clean = normalizeTerm(alias.term);
      if (!concept || !clean) return;
      addEntry(entries, seen, clean, concept, "user", 30);
    });

    sourceConcepts.forEach((concept) => {
      const terms = [concept.label].concat(concept.synonyms || []);
      terms.forEach((term) => {
        const clean = normalizeTerm(term);
        if (!clean || clean.length < 2) return;
        addEntry(entries, seen, clean, concept, "match", 20);
      });
    });

    fallbackAliases.forEach((alias) => {
      const concept = findConceptByTerms(sourceConcepts, alias.concepts);
      const clean = normalizeTerm(alias.term);
      if (!concept || !clean) return;
      addEntry(entries, seen, clean, concept, "fallback", 10);
    });

    entries.sort((a, b) => (b.term.length - a.term.length) || (b.priority - a.priority));
    return entries;
  }

  function addEntry(entries, seen, term, concept, mode, priority) {
    const key = `${term}::${concept.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ term, concept, mode, priority });
  }

  function findConceptByTerms(sourceConcepts, terms) {
    for (const term of terms) {
      const clean = normalizeTerm(term);
      const exact = sourceConcepts.find((concept) => normalizeTerm(concept.label) === clean);
      if (exact) return exact;
    }
    for (const term of terms) {
      const clean = normalizeTerm(term);
      const synonymExact = sourceConcepts.find((concept) => {
        const labels = (concept.synonyms || []).map(normalizeTerm);
        return labels.includes(clean);
      });
      if (synonymExact) return synonymExact;
    }
    for (const term of terms) {
      const clean = normalizeTerm(term);
      const fuzzy = sourceConcepts.find((concept) => {
        const labels = [concept.label].concat(concept.synonyms || []).map(normalizeTerm);
        return labels.some((label) => clean.length >= 2 && (label.includes(clean) || clean.includes(label)));
      });
      if (fuzzy) return fuzzy;
    }
    return null;
  }

  function normalizeTerm(term) {
    return String(term || "")
      .replace(/[+\s]/g, "")
      .replace(/[，。！？、；：,.!?;:]/g, "")
      .trim();
  }

  function findEntryAt(input, start) {
    const source = input.slice(start);
    return dictionary.find((entry) => source.startsWith(entry.term));
  }

  function findIgnoredPhraseAt(input, start) {
    const source = input.slice(start);
    return ignoredPhrases.find((phrase) => source.startsWith(phrase));
  }

  function readUnknownChunk(input, start) {
    let end = start + 1;
    while (
      end < input.length &&
      !isIgnoredChar(input[end]) &&
      !findEntryAt(input, end) &&
      !findIgnoredPhraseAt(input, end)
    ) {
      end += 1;
    }
    return { text: input.slice(start, end), nextIndex: end };
  }

  function isIgnoredChar(char) {
    return /[\s，。！？、；：,.!?;:"“”'‘’（）()[\]{}<>《》-]/.test(char);
  }

  function makeMatch(term, concept, mode) {
    return {
      type: "match",
      mode,
      term,
      concept,
      candidate: concept.primary || (concept.candidates || [])[0] || {},
    };
  }

  function makeGap(text) {
    return { type: "gap", text };
  }

  function pushGap(results, text) {
    const clean = text.trim();
    if (!clean) return;
    results.push(makeGap(clean));
  }

  function renderTranslation(results, options = {}) {
    lastResults = results;
    const matched = results.filter((item) => item.type === "match");
    const gaps = results.filter((item) => item.type === "gap");
    const avgConfidence = matched.length
      ? matched.reduce((sum, item) => sum + Number(item.concept.confidence || 0), 0) / matched.length
      : 0;

    dom.resultTitle.textContent = matched.length ? "已生成图形序列" : "等待翻译";
    dom.confidenceLabel.textContent = `${Math.round(avgConfidence * 100)}%`;
    dom.confidenceBar.style.width = `${Math.round(avgConfidence * 100)}%`;
    dom.matchStats.textContent = `${matched.length} matched / ${gaps.length} unknown`;

    if (!matched.some((item) => itemKey(item) === selectedKey)) {
      selectedKey = matched.length ? itemKey(matched[0]) : "";
    }

    if (options.saveHistory && options.source) {
      saveHistoryEntry(options.source, results, avgConfidence);
    }

    renderGlyphs(results);
    renderDetails(results);
    renderSelectedDetail();
    renderHistory();
  }

  function renderGlyphs(results) {
    dom.glyphOutput.innerHTML = "";
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "输入后生成";
      dom.glyphOutput.appendChild(empty);
      return;
    }

    results.forEach((item) => {
      if (item.type === "gap") {
        dom.glyphOutput.appendChild(renderGapToken(item));
      } else {
        dom.glyphOutput.appendChild(renderGlyphToken(item));
      }
    });
  }

  function renderGlyphToken(item) {
    const token = document.createElement("article");
    token.className = "glyph-token";
    token.tabIndex = 0;
    token.setAttribute("role", "button");
    token.setAttribute("aria-label", `查看 ${item.concept.label} 的解释`);
    token.classList.toggle("selected", itemKey(item) === selectedKey);
    token.addEventListener("click", () => selectResult(itemKey(item)));
    token.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectResult(itemKey(item));
      }
    });

    const strip = document.createElement("div");
    strip.className = "glyph-strip";
    appendImages(strip, getImagePaths(item.concept), item.concept.label, 8);
    token.appendChild(strip);

    const label = document.createElement("div");
    label.className = "glyph-label";
    label.textContent = item.concept.label;
    token.appendChild(label);

    const source = document.createElement("div");
    source.className = "glyph-source";
    source.textContent = formatMatchMode(item);
    token.appendChild(source);

    const confidence = document.createElement("div");
    confidence.className = "glyph-confidence";
    confidence.innerHTML = `置信度 <strong>${Math.round(Number(item.concept.confidence || 0) * 100)}%</strong>`;
    token.appendChild(confidence);

    return token;
  }

  function renderGapToken(item) {
    const token = document.createElement("article");
    token.className = "gap-token";
    const label = document.createElement("div");
    label.className = "glyph-label";
    label.textContent = item.text;
    token.appendChild(label);

    const note = document.createElement("div");
    note.className = "gap-note";
    note.textContent = "不可译空位：可从相近候选中采纳，也可使用 AI 补译。";
    token.appendChild(note);

    const candidates = scoreGapCandidates(item.text, 3);
    if (candidates.length) {
      token.appendChild(renderCandidateList(item.text, candidates));
    }
    return token;
  }

  function renderCandidateList(gapText, candidates) {
    const list = document.createElement("div");
    list.className = "candidate-list";
    candidates.forEach(({ concept }) => {
      const row = document.createElement("div");
      row.className = "candidate-item";
      row.innerHTML = `<div class="candidate-title">${escapeHtml(concept.label)} <span>${escapeHtml(concept.id)}</span></div>`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "采纳此候选";
      button.addEventListener("click", () => adoptCandidateForGap(gapText, concept.id, "user"));
      row.appendChild(button);
      list.appendChild(row);
    });
    return list;
  }

  function renderDetails(results) {
    dom.detailList.innerHTML = "";
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "暂无解释";
      dom.detailList.appendChild(empty);
      return;
    }

    results.forEach((item) => {
      dom.detailList.appendChild(item.type === "gap" ? renderGapDetail(item) : renderMatchDetail(item));
    });
  }

  function renderMatchDetail(item) {
    const concept = item.concept;
    const candidate = item.candidate || {};
    const node = document.createElement("article");
    node.className = "detail-item";
    node.tabIndex = 0;
    node.innerHTML = `
      <div class="detail-title">${escapeHtml(concept.label)}<span>${escapeHtml(item.term)}</span></div>
      <p class="detail-line"><strong>概念：</strong>${escapeHtml(concept.id)}</p>
      <p class="detail-line"><strong>字面：</strong>${escapeHtml(candidate.literal_gloss || "无明确字面标注")}</p>
      <p class="detail-line"><strong>语境：</strong>${escapeHtml(candidate.pragmatic_meaning || candidate.free_translation || concept.explanation || "无明确语境标注")}</p>
      <p class="detail-line"><strong>误读：</strong>${escapeHtml((concept.possible_misreadings || [])[0] || "暂无误读记录")}</p>
      <p class="detail-line"><strong>来源：</strong>${escapeHtml(candidate.target_id || concept.id)}</p>
    `;
    node.addEventListener("click", () => selectResult(itemKey(item)));
    const tags = document.createElement("div");
    tags.className = "tags";
    (concept.semantic_tags || []).slice(0, 5).forEach((tag) => {
      const span = document.createElement("span");
      span.textContent = tag;
      tags.appendChild(span);
    });
    node.appendChild(tags);
    return node;
  }

  function renderGapDetail(item) {
    const node = document.createElement("article");
    node.className = "detail-item gap";
    node.innerHTML = `
      <div class="detail-title">${escapeHtml(item.text)}<span>unknown</span></div>
      <p class="detail-line"><strong>字面：</strong>未找到稳定对应。</p>
      <p class="detail-line"><strong>语境：</strong>可在后续标注中补充该词的图形候选。</p>
      <p class="detail-line"><strong>误读：</strong>强行匹配会把无关图形当作相似概念。</p>
    `;
    const candidates = scoreGapCandidates(item.text, 5);
    if (candidates.length) {
      node.appendChild(renderCandidateList(item.text, candidates));
    }
    return node;
  }

  function renderSelectedDetail() {
    const selected = lastResults.find((item) => item.type === "match" && itemKey(item) === selectedKey);
    if (!selected) {
      dom.selectedDetail.className = "selected-detail empty-copy";
      dom.selectedDetail.textContent = "点击任意图形结果查看详细信息。";
      return;
    }
    renderConceptDetail(selected.concept, selected.term, selected.mode);
  }

  function renderConceptDetail(concept, term, mode) {
    const candidate = concept.primary || (concept.candidates || [])[0] || {};
    dom.selectedDetail.className = "selected-detail";
    dom.selectedDetail.innerHTML = `
      <h3>${escapeHtml(concept.label)}</h3>
      <p><strong>概念 ID：</strong>${escapeHtml(concept.id)}</p>
      <p><strong>匹配词：</strong>${escapeHtml(term || concept.label)}${mode ? `（${escapeHtml(readableMode(mode))}）` : ""}</p>
      <p><strong>同义词：</strong>${escapeHtml((concept.synonyms || []).slice(0, 8).join("、") || "暂无")}</p>
      <p><strong>置信度：</strong>${Math.round(Number(concept.confidence || 0) * 100)}%</p>
      <p><strong>来源：</strong>${escapeHtml(candidate.source_file || candidate.target_id || "本地概念索引")}</p>
    `;
    const strip = document.createElement("div");
    strip.className = "mini-strip";
    appendImages(strip, getImagePaths(concept), concept.label, 8);
    dom.selectedDetail.appendChild(strip);
  }

  function selectResult(key) {
    selectedKey = key;
    renderGlyphs(lastResults);
    renderSelectedDetail();
  }

  function itemKey(item) {
    return `${item.type}:${item.concept?.id || ""}:${normalizeTerm(item.term || item.text || "")}`;
  }

  function formatMatchMode(item) {
    if (item.mode === "ai") return `输入片段：${item.term}（AI 建议）`;
    if (item.mode === "fallback") return `输入片段：${item.term}（内置补充规则）`;
    if (item.mode === "user") return `输入片段：${item.term}（本地采纳规则）`;
    if (item.mode === "example") return `示例片段：${item.term}`;
    return `输入片段：${item.term}`;
  }

  function readableMode(mode) {
    return {
      ai: "AI 建议",
      fallback: "内置补充规则",
      user: "本地采纳规则",
      example: "示例",
      match: "词典匹配",
    }[mode] || mode;
  }

  function getImagePaths(concept) {
    const primary = concept.primary || {};
    const primaryPaths = Array.isArray(primary.image_paths) ? primary.image_paths : [];
    if (primaryPaths.length) return primaryPaths;
    const candidate = (concept.candidates || []).find((item) => Array.isArray(item.image_paths) && item.image_paths.length);
    return candidate ? candidate.image_paths : [];
  }

  function appendImages(parent, paths, alt, max) {
    const selectedPaths = (paths || []).slice(0, max);
    if (!selectedPaths.length) {
      const empty = document.createElement("div");
      empty.className = "gap-note";
      empty.textContent = "暂无图形";
      parent.appendChild(empty);
      return;
    }
    selectedPaths.forEach((path) => {
      const img = document.createElement("img");
      img.src = path;
      img.alt = alt;
      parent.appendChild(img);
    });
  }

  function adoptCandidateForGap(gapText, conceptId, mode) {
    const concept = conceptsById.get(conceptId);
    if (!concept) return;
    saveUserAlias(gapText, conceptId);
    const nextResults = replaceGapInResults(lastResults, gapText, makeMatch(gapText, concept, mode || "user"));
    renderTranslation(nextResults, { source: dom.sourceInput.value.trim(), saveHistory: true });
  }

  function replaceGapInResults(results, gapText, replacement) {
    const gapKey = normalizeTerm(gapText);
    const termKey = normalizeTerm(replacement.term || "");
    return results.map((item) => {
      const itemKey = normalizeTerm(item.text);
      const matchesGap = item.type === "gap" && (
        itemKey === gapKey ||
        (termKey && (itemKey.includes(termKey) || termKey.includes(itemKey))) ||
        (gapKey && (itemKey.includes(gapKey) || gapKey.includes(itemKey)))
      );
      if (matchesGap) {
        return makeMatch(replacement.term || gapText, replacement.concept, replacement.mode || "user");
      }
      return item;
    });
  }

  function saveUserAlias(term, conceptId) {
    const clean = normalizeTerm(term);
    if (!clean || !conceptsById.has(conceptId)) return;
    const exists = userAliases.some((alias) => normalizeTerm(alias.term) === clean && alias.concept_id === conceptId);
    if (!exists) {
      userAliases.unshift({
        term: clean,
        concept_id: conceptId,
        created_at: new Date().toISOString(),
      });
      userAliases = userAliases.slice(0, 80);
      localStorage.setItem(ALIAS_KEY, JSON.stringify(userAliases));
      dictionary = buildDictionary(concepts);
    }
  }

  function saveHistoryEntry(sentence, results, avgConfidence) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) return;
    const matched = results.filter((item) => item.type === "match");
    const gaps = results.filter((item) => item.type === "gap");
    const summary = matched.map((item) => item.concept.label).slice(0, 8).join(" / ") || "暂无匹配";
    historyItems = historyItems.filter((item) => item.sentence !== cleanSentence);
    historyItems.unshift({
      sentence: cleanSentence,
      summary,
      matched: matched.length,
      gaps: gaps.length,
      confidence: Math.round(avgConfidence * 100),
      created_at: new Date().toISOString(),
    });
    historyItems = historyItems.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
  }

  function renderHistory() {
    dom.historyList.innerHTML = "";
    if (!historyItems.length) {
      const empty = document.createElement("div");
      empty.className = "empty-copy";
      empty.textContent = "翻译后会自动保存最近 20 条记录。";
      dom.historyList.appendChild(empty);
      return;
    }
    historyItems.forEach((item) => {
      const row = document.createElement("article");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-title">${escapeHtml(item.sentence)}</div>
        <div class="history-meta">${escapeHtml(item.summary)} · ${item.matched} matched / ${item.gaps} unknown · ${item.confidence}%</div>
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "恢复输入";
      button.addEventListener("click", () => {
        dom.sourceInput.value = item.sentence;
        translateCurrentInput({ saveHistory: false });
      });
      row.appendChild(button);
      dom.historyList.appendChild(row);
    });
  }

  function clearHistory() {
    historyItems = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }

  function renderLookupResults(query) {
    const clean = normalizeTerm(query);
    dom.lookupResults.innerHTML = "";
    if (!clean) {
      const empty = document.createElement("div");
      empty.className = "empty-copy";
      empty.textContent = "可输入“礼物”“睡觉”或 c_0001 这类概念 ID。";
      dom.lookupResults.appendChild(empty);
      return;
    }
    const matches = concepts
      .map((concept) => ({ concept, score: scoreConceptForQuery(concept, clean) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-copy";
      empty.textContent = "没有找到相近概念。";
      dom.lookupResults.appendChild(empty);
      return;
    }

    matches.forEach(({ concept }) => {
      const row = document.createElement("article");
      row.className = "lookup-item";
      row.innerHTML = `<div class="lookup-title">${escapeHtml(concept.label)} <span>${escapeHtml(concept.id)}</span></div>`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "查看详情";
      button.addEventListener("click", () => renderConceptDetail(concept, clean, "lookup"));
      row.appendChild(button);
      dom.lookupResults.appendChild(row);
    });
  }

  function scoreConceptForQuery(concept, query) {
    let score = 0;
    if (concept.id.toLowerCase() === query.toLowerCase()) score += 120;
    if (concept.id.toLowerCase().includes(query.toLowerCase())) score += 60;
    const terms = [concept.label].concat(concept.synonyms || []).map(normalizeTerm);
    terms.forEach((term) => {
      if (term === query) score += 100;
      if (term.includes(query) || query.includes(term)) score += Math.min(term.length, query.length) * 6;
      Array.from(query).forEach((char) => {
        if (term.includes(char)) score += 1;
      });
    });
    return score;
  }

  function buildAiPrompt() {
    const payload = createAiPayload();
    if (!payload.gaps.length) {
      dom.aiPromptOutput.value = "当前没有不可译空位，不需要 AI 补译。";
      return;
    }

    dom.aiPromptOutput.value = [
      "请根据下面 JSON 完成任务，只返回合法 JSON，不要返回 Markdown：",
      JSON.stringify(payload, null, 2),
    ].join("\n\n");
  }

  function createAiPayload() {
    if (!lastResults.length) {
      translateCurrentInput({ saveHistory: false });
    }
    const gaps = lastResults.filter((item) => item.type === "gap");
    return {
      task: "为《地书翻译机》的不可译片段选择最接近的已有地书概念。",
      source_sentence: dom.sourceInput.value.trim(),
      rules: [
        "只能从每个 gap 的 candidates 中选择 concept_id。",
        "如果没有合适概念，concept_id 填 null，并用 note 简短说明。",
        "不要新增解释文字以外的字段。",
      ],
      response_format: {
        replacements: [
          {
            gap: "原不可译片段",
            concept_id: "候选 concept_id 或 null",
            term: "用于显示的短词",
            note: "为什么这样近似",
          },
        ],
      },
      gaps: gaps.map((gap) => ({
        gap: gap.text,
        candidates: scoreGapCandidates(gap.text, 12).map(({ concept }) => ({
          concept_id: concept.id,
          label: concept.label,
          synonyms: (concept.synonyms || []).slice(0, 6),
          tags: (concept.semantic_tags || []).slice(0, 4),
        })),
      })),
    };
  }

  function scoreGapCandidates(gapText, limit) {
    const gap = normalizeTerm(gapText);
    const gapChars = new Set(Array.from(gap));
    const scored = concepts.map((concept) => {
      const terms = [concept.label].concat(concept.synonyms || []).map(normalizeTerm).filter(Boolean);
      let score = 0;
      terms.forEach((term) => {
        if (term === gap) score += 100;
        if (term.includes(gap) || gap.includes(term)) score += Math.min(term.length, gap.length) * 5;
        Array.from(term).forEach((char) => {
          if (gapChars.has(char)) score += 1;
        });
      });
      return { concept, score };
    });
    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 12);
  }

  function copyAiPrompt() {
    const text = dom.aiPromptOutput.value.trim();
    if (!text) {
      buildAiPrompt();
    }
    const value = dom.aiPromptOutput.value;
    if (navigator.clipboard && value) {
      navigator.clipboard.writeText(value).catch(() => selectPromptText());
    } else {
      selectPromptText();
    }
  }

  function selectPromptText() {
    dom.aiPromptOutput.focus();
    dom.aiPromptOutput.select();
  }

  function readAiSuggestionsFromText() {
    const raw = dom.aiResponseInput.value.trim();
    if (!raw) return;
    const parsed = parseAiJson(raw);
    if (!parsed || !Array.isArray(parsed.replacements)) {
      dom.aiStatus.textContent = "解析失败：请粘贴包含 replacements 数组的 JSON。";
      return;
    }
    showAiSuggestions(parsed.replacements, "manual");
  }

  function showAiSuggestions(replacements, source) {
    currentAiSuggestions = replacements.map((replacement) => {
      const concept = replacement.concept_id ? conceptsById.get(replacement.concept_id) : null;
      return {
        gap: String(replacement.gap || ""),
        concept_id: replacement.concept_id || null,
        term: replacement.term || replacement.gap || "",
        note: replacement.note || "",
        concept,
        source,
        status: concept ? "pending" : "invalid",
      };
    });
    dom.aiStatus.textContent = currentAiSuggestions.length
      ? "AI 建议已生成，请检查后采纳。"
      : "没有读取到可用建议。";
    renderAiSuggestions();
  }

  function renderAiSuggestions() {
    dom.aiSuggestions.innerHTML = "";
    dom.aiSuggestions.className = "ai-suggestions empty-copy";
    if (!currentAiSuggestions.length) {
      dom.aiSuggestions.textContent = "AI 或手动 JSON 的补译建议会显示在这里，采纳前不会自动替换结果。";
      return;
    }

    dom.aiSuggestions.className = "ai-suggestions has-items";
    const top = document.createElement("div");
    top.className = "suggestion-topline";
    top.innerHTML = `<strong>${currentAiSuggestions.length} 条补译建议</strong>`;
    const applyAll = document.createElement("button");
    applyAll.type = "button";
    applyAll.textContent = "采纳全部有效建议";
    applyAll.addEventListener("click", applyAllAiSuggestions);
    top.appendChild(applyAll);
    dom.aiSuggestions.appendChild(top);

    const list = document.createElement("div");
    list.className = "ai-suggestion-list";
    currentAiSuggestions.forEach((suggestion, index) => {
      const row = document.createElement("article");
      row.className = "ai-suggestion-item";
      const label = suggestion.concept ? suggestion.concept.label : "无有效候选";
      row.innerHTML = `
        <div class="candidate-title">${escapeHtml(suggestion.gap || "未命名空位")} → ${escapeHtml(label)}</div>
        <div class="suggestion-note">${escapeHtml(suggestion.note || suggestion.status)}</div>
      `;
      const actions = document.createElement("div");
      actions.className = "suggestion-actions";

      const accept = document.createElement("button");
      accept.type = "button";
      accept.textContent = suggestion.status === "accepted" ? "已采纳" : "采纳";
      accept.disabled = !suggestion.concept || suggestion.status === "accepted" || suggestion.status === "ignored";
      accept.addEventListener("click", () => applyAiSuggestion(index));
      actions.appendChild(accept);

      const ignore = document.createElement("button");
      ignore.type = "button";
      ignore.textContent = suggestion.status === "ignored" ? "已忽略" : "忽略";
      ignore.disabled = suggestion.status === "accepted" || suggestion.status === "ignored";
      ignore.addEventListener("click", () => ignoreAiSuggestion(index));
      actions.appendChild(ignore);

      row.appendChild(actions);
      list.appendChild(row);
    });
    dom.aiSuggestions.appendChild(list);
  }

  function applyAiSuggestion(index) {
    const suggestion = currentAiSuggestions[index];
    if (!suggestion || !suggestion.concept) return;
    saveUserAlias(suggestion.gap, suggestion.concept.id);
    const match = makeMatch(suggestion.term || suggestion.gap, suggestion.concept, "ai");
    const nextResults = replaceGapInResults(lastResults, suggestion.gap, match);
    suggestion.status = "accepted";
    renderTranslation(nextResults, { source: dom.sourceInput.value.trim(), saveHistory: true });
    renderAiSuggestions();
  }

  function applyAllAiSuggestions() {
    let nextResults = lastResults.slice();
    currentAiSuggestions.forEach((suggestion) => {
      if (!suggestion.concept || suggestion.status !== "pending") return;
      saveUserAlias(suggestion.gap, suggestion.concept.id);
      nextResults = replaceGapInResults(nextResults, suggestion.gap, makeMatch(suggestion.term || suggestion.gap, suggestion.concept, "ai"));
      suggestion.status = "accepted";
    });
    renderTranslation(nextResults, { source: dom.sourceInput.value.trim(), saveHistory: true });
    renderAiSuggestions();
  }

  function ignoreAiSuggestion(index) {
    if (!currentAiSuggestions[index]) return;
    currentAiSuggestions[index].status = "ignored";
    renderAiSuggestions();
  }

  async function runAiApiFill() {
    const payload = createAiPayload();
    if (!payload.gaps.length) {
      dom.aiStatus.textContent = "当前没有不可译空位，不需要后台补译。";
      return;
    }
    if (window.location.protocol === "file:") {
      dom.aiStatus.textContent = "后台补译需要通过本地 server.js 打开页面，不能直接双击 HTML。";
      return;
    }
    const apiKey = dom.aiApiKeyInput.value.trim();
    if (!apiKey) {
      dom.aiStatus.textContent = "请先输入 API Key。";
      return;
    }

    dom.aiStatus.textContent = "正在调用后台模型...";
    dom.runAiApiBtn.disabled = true;
    try {
      const response = await fetch("/api/ai-gap-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: dom.aiEndpointInput.value.trim(),
          model: dom.aiModelInput.value.trim(),
          apiKey,
          payload,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "后台补译失败");
      }
      dom.aiResponseInput.value = JSON.stringify(data.parsed || { raw: data.raw }, null, 2);
      if (data.parsed && Array.isArray(data.parsed.replacements)) {
        showAiSuggestions(data.parsed.replacements, "api");
      } else {
        dom.aiStatus.textContent = "模型返回内容未能解析为 replacements JSON，已放入返回框。";
      }
    } catch (error) {
      dom.aiStatus.textContent = `后台补译失败：${error.message}`;
    } finally {
      dom.runAiApiBtn.disabled = false;
    }
  }

  function parseAiJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        return null;
      }
    }
  }

  async function checkServiceHealth() {
    if (window.location.protocol === "file:") {
      setServiceStatus(false, "离线模式");
      return;
    }
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const data = await response.json();
      setServiceStatus(Boolean(response.ok && data.ok), response.ok && data.ok ? "AI 服务可用" : "离线模式");
    } catch (error) {
      setServiceStatus(false, "离线模式");
    }
  }

  function setServiceStatus(isOnline, text) {
    dom.serviceStatus.textContent = text;
    dom.serviceStatus.classList.toggle("online", isOnline);
    dom.serviceStatus.classList.toggle("offline", !isOnline);
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
