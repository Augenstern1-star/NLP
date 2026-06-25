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

  const semanticCategories = [
    { id: "all", label: "全部", hints: [] },
    { id: "action", label: "动作", hints: ["动作", "行为", "移动", "走", "看", "听", "打开", "关闭", "坐", "睡", "工作", "学习", "吃", "喝", "拿", "到达"] },
    { id: "time", label: "时间", hints: ["时间", "现在", "过去", "将来", "晚上", "明天", "小时", "分钟", "点", "早", "晚"] },
    { id: "place", label: "地点", hints: ["地点", "空间", "位置", "家", "公司", "书店", "路口", "厕所", "电梯", "楼"] },
    { id: "person", label: "人物/身体", hints: ["人物", "身体", "我", "他", "她", "人", "手", "眼", "头", "脚"] },
    { id: "object", label: "物品", hints: ["物体", "物品", "工具", "手机", "电话", "电视", "车", "门", "书", "礼物", "空调"] },
    { id: "emotion", label: "情绪", hints: ["情绪", "感受", "害怕", "开心", "震惊", "喜欢", "笑", "担心"] },
    { id: "relation", label: "关系/符号", hints: ["关系", "标点", "边界", "连接", "因果", "否定", "集合", "然后", "所以"] },
    { id: "other", label: "其他", hints: [] },
  ];

  let userAliases = loadJson(ALIAS_KEY, []);
  let historyItems = loadJson(HISTORY_KEY, []);
  let dictionary = buildDictionary(concepts);
  let activeSemanticCategory = "all";
  let selectedSemanticConceptId = "";
  let lastBaseResults = [];
  let lastResults = [];
  let translationVersions = [];
  let activeVersionKey = "literal";
  let selectedKey = "";
  let currentAiSuggestions = [];
  let reverseItems = [];
  let latestImageReview = null;
  let latestAudienceSimulation = null;
  let animationTimer = null;
  let isAnimationPlaying = false;
  let animationStepIndex = -1;

  const dom = {
    hanziBackground: document.getElementById("hanziBackground"),
    featureAssistant: document.getElementById("featureAssistant"),
    assistantToggleBtn: document.getElementById("assistantToggleBtn"),
    assistantCloseBtn: document.getElementById("assistantCloseBtn"),
    assistantSearchInput: document.getElementById("assistantSearchInput"),
    assistantQuickActions: document.getElementById("assistantQuickActions"),
    assistantAnswer: document.getElementById("assistantAnswer"),
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
    aiWorkflow: document.getElementById("aiWorkflow"),
    imageEndpointInput: document.getElementById("imageEndpointInput"),
    imageModelInput: document.getElementById("imageModelInput"),
    imageApiKeyInput: document.getElementById("imageApiKeyInput"),
    buildImageReviewPromptBtn: document.getElementById("buildImageReviewPromptBtn"),
    copyImageReviewPromptBtn: document.getElementById("copyImageReviewPromptBtn"),
    runImageReviewApiBtn: document.getElementById("runImageReviewApiBtn"),
    readImageReviewBtn: document.getElementById("readImageReviewBtn"),
    imageReviewPromptOutput: document.getElementById("imageReviewPromptOutput"),
    imageReviewResponseInput: document.getElementById("imageReviewResponseInput"),
    imageReviewStatus: document.getElementById("imageReviewStatus"),
    imageReviewResults: document.getElementById("imageReviewResults"),
    audienceEndpointInput: document.getElementById("audienceEndpointInput"),
    audienceModelInput: document.getElementById("audienceModelInput"),
    audienceApiKeyInput: document.getElementById("audienceApiKeyInput"),
    buildAudiencePromptBtn: document.getElementById("buildAudiencePromptBtn"),
    copyAudiencePromptBtn: document.getElementById("copyAudiencePromptBtn"),
    runAudienceApiBtn: document.getElementById("runAudienceApiBtn"),
    readAudienceResponseBtn: document.getElementById("readAudienceResponseBtn"),
    audiencePromptOutput: document.getElementById("audiencePromptOutput"),
    audienceResponseInput: document.getElementById("audienceResponseInput"),
    audienceStatus: document.getElementById("audienceStatus"),
    audienceResults: document.getElementById("audienceResults"),
    audienceWorkflow: document.getElementById("audienceWorkflow"),
    audienceStats: document.getElementById("audienceStats"),
    versionTabs: document.getElementById("versionTabs"),
    animationToggleBtn: document.getElementById("animationToggleBtn"),
    animationStage: document.getElementById("animationStage"),
    exampleButtons: document.getElementById("exampleButtons"),
    glyphOutput: document.getElementById("glyphOutput"),
    detailList: document.getElementById("detailList"),
    selectedDetail: document.getElementById("selectedDetail"),
    refreshArtworkBtn: document.getElementById("refreshArtworkBtn"),
    artworkCanvas: document.getElementById("artworkCanvas"),
    artworkSource: document.getElementById("artworkSource"),
    artworkReading: document.getElementById("artworkReading"),
    artworkConceptChain: document.getElementById("artworkConceptChain"),
    artworkConfidence: document.getElementById("artworkConfidence"),
    driftStats: document.getElementById("driftStats"),
    driftList: document.getElementById("driftList"),
    copyWorkCardBtn: document.getElementById("copyWorkCardBtn"),
    workCard: document.getElementById("workCard"),
    resultTitle: document.getElementById("resultTitle"),
    confidenceLabel: document.getElementById("confidenceLabel"),
    confidenceBar: document.getElementById("confidenceBar"),
    matchStats: document.getElementById("matchStats"),
    conceptCount: document.getElementById("conceptCount"),
    exampleCount: document.getElementById("exampleCount"),
    serviceStatus: document.getElementById("serviceStatus"),
    lookupInput: document.getElementById("lookupInput"),
    lookupResults: document.getElementById("lookupResults"),
    semanticMap: document.getElementById("semanticMap"),
    semanticMapDetail: document.getElementById("semanticMapDetail"),
    semanticMapFilters: document.getElementById("semanticMapFilters"),
    semanticMapStats: document.getElementById("semanticMapStats"),
    useCurrentReverseBtn: document.getElementById("useCurrentReverseBtn"),
    copyReverseBtn: document.getElementById("copyReverseBtn"),
    clearReverseBtn: document.getElementById("clearReverseBtn"),
    reverseLookupInput: document.getElementById("reverseLookupInput"),
    reverseLookupResults: document.getElementById("reverseLookupResults"),
    reverseSequence: document.getElementById("reverseSequence"),
    reverseOutput: document.getElementById("reverseOutput"),
    reverseDiagnostics: document.getElementById("reverseDiagnostics"),
    reverseStats: document.getElementById("reverseStats"),
    historyList: document.getElementById("historyList"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  };

  function init() {
    initHanziBackground();
    dom.conceptCount.textContent = `${concepts.length} concepts`;
    dom.exampleCount.textContent = `${examplesData.examples.length} examples`;
    renderExamples();
    renderHistory();
    renderLookupResults("");
    renderSemanticMap();
    renderReverseLookupResults("");
    renderReverseTranslation();
    renderVersionTabs();
    renderAiSuggestions();
    renderAiWorkflow();
    renderImageReviewResults(null);
    renderAudienceSimulation(null);
    renderAudienceWorkflow();
    renderAssistantGuide("overview");
    bindEvents();
    checkServiceHealth();
    translateCurrentInput({ saveHistory: false });
  }

  function initHanziBackground() {
    const canvas = dom.hanziBackground;
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext("2d");
    const nodePalette = [
      "rgba(34, 58, 94, 0.48)",
      "rgba(36, 87, 214, 0.36)",
      "rgba(26, 123, 91, 0.36)",
      "rgba(162, 100, 0, 0.3)"
    ];
    const linePalette = [
      "rgba(34, 58, 94, 0.24)",
      "rgba(36, 87, 214, 0.18)",
      "rgba(26, 123, 91, 0.19)"
    ];
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes = [];
    let fibers = [];
    let frameId = 0;
    let lastTime = performance.now();

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function nodeCount() {
      const area = window.innerWidth * window.innerHeight;
      return Math.max(34, Math.min(74, Math.round(area / 21000)));
    }

    function fiberCount() {
      return Math.max(34, Math.min(70, Math.round(width / 25)));
    }

    function createNode(index) {
      const radius = randomBetween(1.8, index % 7 === 0 ? 4.2 : 3);
      const speed = randomBetween(0.008, 0.024);
      const angle = randomBetween(0, Math.PI * 2);
      const sideBand = Math.min(260, Math.max(120, width * 0.2));
      const prefersEdge = index % 4 !== 0;
      const x = prefersEdge
        ? (index % 2 === 0 ? randomBetween(0, sideBand) : randomBetween(width - sideBand, width))
        : randomBetween(sideBand, Math.max(sideBand, width - sideBand));
      return {
        x,
        y: randomBetween(0, Math.max(0, height)),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        pulse: randomBetween(0, Math.PI * 2),
        color: nodePalette[index % nodePalette.length]
      };
    }

    function createFiber() {
      const y = randomBetween(0, Math.max(0, height));
      return {
        x: randomBetween(-80, Math.max(0, width)),
        y,
        length: randomBetween(80, 260),
        bend: randomBetween(-0.35, 0.35),
        drift: randomBetween(-0.006, 0.006),
        opacity: randomBetween(0.03, 0.09),
        width: randomBetween(0.55, 1.35)
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nextNodeCount = nodeCount();
      if (nodes.length === 0) {
        nodes = Array.from({ length: nextNodeCount }, (_, index) => createNode(index));
      } else if (nodes.length < nextNodeCount) {
        const start = nodes.length;
        while (nodes.length < nextNodeCount) {
          nodes.push(createNode(nodes.length + start));
        }
      } else if (nodes.length > nextNodeCount) {
        nodes = nodes.slice(0, nextNodeCount);
      }

      nodes.forEach((node) => {
        node.x = Math.min(Math.max(0, node.x), width);
        node.y = Math.min(Math.max(0, node.y), height);
      });
      fibers = Array.from({ length: fiberCount() }, createFiber);
      draw();
    }

    function step(delta) {
      const scale = Math.min(delta, 40);
      nodes.forEach((node) => {
        node.x += node.vx * scale;
        node.y += node.vy * scale;
        node.pulse += 0.0018 * scale;

        if (node.x < -12) {
          node.x = width + 12;
        } else if (node.x > width + 12) {
          node.x = -12;
        }

        if (node.y < -12) {
          node.y = height + 12;
        } else if (node.y > height + 12) {
          node.y = -12;
        }
      });
      fibers.forEach((fiber) => {
        fiber.x += fiber.drift * scale;
        if (fiber.x > width + 80) fiber.x = -fiber.length;
        if (fiber.x < -fiber.length - 80) fiber.x = width + 80;
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      fibers.forEach((fiber) => {
        ctx.beginPath();
        ctx.moveTo(fiber.x, fiber.y);
        ctx.lineTo(fiber.x + fiber.length, fiber.y + fiber.bend);
        ctx.strokeStyle = `rgba(34, 58, 94, ${fiber.opacity})`;
        ctx.lineWidth = fiber.width;
        ctx.stroke();
      });

      drawSideLattice(18, 1);
      drawSideLattice(width - 18, -1);

      const maxDistance = Math.min(220, Math.max(130, width * 0.16));
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > maxDistance) continue;

          const edgeBoost = Math.min(a.x, b.x, width - a.x, width - b.x) < width * 0.18 ? 1.45 : 0.72;
          const opacity = (1 - distance / maxDistance) * 0.25 * edgeBoost;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = linePalette[(i + j) % linePalette.length].replace(/[\d.]+\)$/, `${opacity.toFixed(3)})`);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      nodes.forEach((node) => {
        const glowRadius = node.radius * (3.4 + Math.sin(node.pulse) * 0.35);
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
        glow.addColorStop(0, node.color);
        glow.addColorStop(1, "rgba(255, 253, 245, 0)");

        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
      });
    }

    function drawSideLattice(anchorX, direction) {
      if (width < 520) return;
      const steps = Math.max(5, Math.ceil(height / 150));
      const rail = [];
      for (let index = 0; index <= steps; index += 1) {
        const y = (height / steps) * index + Math.sin(index * 1.7) * 18;
        const x = anchorX + direction * (16 + (index % 3) * 18);
        rail.push({ x, y });
      }

      ctx.beginPath();
      rail.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.strokeStyle = "rgba(34, 58, 94, 0.18)";
      ctx.lineWidth = 1.15;
      ctx.stroke();

      rail.forEach((point, index) => {
        const branchX = point.x + direction * (38 + (index % 4) * 13);
        const branchY = point.y + Math.sin(index * 2.15) * 32;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(branchX, branchY);
        ctx.strokeStyle = index % 2 === 0 ? "rgba(36, 87, 214, 0.16)" : "rgba(26, 123, 91, 0.16)";
        ctx.lineWidth = 0.9;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34, 58, 94, 0.4)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(branchX, branchY, 1.9, 0, Math.PI * 2);
        ctx.fillStyle = index % 2 === 0 ? "rgba(36, 87, 214, 0.34)" : "rgba(26, 123, 91, 0.32)";
        ctx.fill();
      });
    }

    function animate(now) {
      const delta = now - lastTime;
      lastTime = now;
      if (!document.hidden) {
        step(delta);
        draw();
      }
      frameId = window.requestAnimationFrame(animate);
    }

    function start() {
      window.cancelAnimationFrame(frameId);
      resize();
      if (reducedMotion && reducedMotion.matches) {
        draw();
        return;
      }
      lastTime = performance.now();
      frameId = window.requestAnimationFrame(animate);
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) lastTime = performance.now();
    });
    if (reducedMotion) {
      reducedMotion.addEventListener("change", start);
    }
    start();
  }

  const assistantTopics = [
    {
      id: "overview",
      label: "总览",
      keywords: ["总览", "开始", "流程", "怎么用", "帮助", "助手"],
      title: "从一句话到《地书》图形序列",
      summary: "推荐顺序是：输入自然语言，点击翻译，检查图形和解释，再按需要使用 AI 补译、图像审稿或观众模拟。",
      steps: [
        "在左侧输入一句中文短句，或点精选示例。",
        "点击“翻译”，中间会生成图形序列和置信度。",
        "点击任意图形卡片，右侧会显示字面、语境、来源和误读风险。",
        "如果出现不可译空位，再使用 AI 补译或候选概念采纳。",
      ],
      tip: "首次演示时，可以先用示例句跑一遍，让观众看到完整链路。"
    },
    {
      id: "translate",
      label: "翻译",
      keywords: ["翻译", "输入", "自然语言", "示例", "清空"],
      title: "自然语言输入与翻译",
      summary: "把中文短句切分成词，再匹配《地书》概念库，输出对应图形。",
      steps: [
        "输入短句时尽量使用清晰动作、地点、物品和时间词。",
        "点击“翻译”后，中间的图形卡片就是当前序列。",
        "“置信度”越高，说明词典匹配越可靠。",
        "点“清空”会重置输入、结果、AI 建议和观众模拟。"
      ],
      tip: "如果句子太长，建议拆成一到两个动作，图形序列会更容易读。"
    },
    {
      id: "versions",
      label: "版本",
      keywords: ["版本", "字面", "语境", "AI辅助", "标签"],
      title: "字面、语境、AI 辅助版本",
      summary: "三个版本用于比较不同翻译策略对图形序列的影响。",
      steps: [
        "“字面”优先采用词典最长匹配。",
        "“语境”会尝试选择更贴近上下文的候选概念。",
        "“AI 辅助”用于承接 AI 补译采纳后的结果。",
        "切换版本不会删除原输入，可以来回比较。"
      ],
      tip: "做报告时可以截图对比三个版本，说明自然语言到图形语言会发生选择和漂移。"
    },
    {
      id: "detail",
      label: "图形解释",
      keywords: ["解释", "选中", "图形", "候选", "置信度", "来源"],
      title: "查看单个图形为什么这样翻",
      summary: "点击图形卡片后，右侧会显示概念 ID、同义词、来源文件、置信度和图形预览。",
      steps: [
        "在中间输出区点击任意图形卡片。",
        "右侧“选中图形”会显示它对应的概念。",
        "如果是不可译片段，可以在候选中选择一个近似概念。",
        "解释层区域会列出整句每个词的字面和语境信息。"
      ],
      tip: "这个区域最适合回答“为什么这个词变成这个图形”。"
    },
    {
      id: "lookup",
      label: "概念检索",
      keywords: ["检索", "反向", "查词", "概念", "搜索"],
      title: "反向查找《地书》概念",
      summary: "用中文词或概念 ID 搜索图形库，适合手动找替代图形。",
      steps: [
        "在右侧“概念检索”输入中文词、近义词或 c_ 开头的概念 ID。",
        "结果会展示图形预览和概念标签。",
        "可用它来判断某个词是否已经在图形库里。",
        "也可以辅助不可译空位的人工采纳。"
      ],
      tip: "如果搜不到完整词，试着搜更短的核心词。"
    },
    {
      id: "reverse",
      label: "回译",
      keywords: ["回译", "双向", "反向翻译", "序列", "复制"],
      title: "把图形序列回译成自然语言",
      summary: "回译区用于检查图形序列被读回中文时是否还接近原句。",
      steps: [
        "点击“使用当前图形序列”，把当前翻译结果放入回译器。",
        "也可以搜索概念后逐个加入回译序列。",
        "回译结果会显示自然读法和结构诊断。",
        "点击复制可把回译文字放进报告或说明。"
      ],
      tip: "如果回译和原句差很多，说明这组图形可能需要补图或换图。"
    },
    {
      id: "semantic",
      label: "语义地图",
      keywords: ["语义", "地图", "网络", "分类", "概念网络"],
      title: "查看概念网络与语义分类",
      summary: "语义地图把概念按动作、时间、地点、人物、物品等分类展示。",
      steps: [
        "点击分类筛选按钮，只看某一类概念。",
        "点击节点可查看同义词、标签和来源。",
        "节点大小代表这个概念的图形或语义信息更丰富。",
        "它适合解释图形库的整体结构。"
      ],
      tip: "展示系统设计时，这一块能说明你不是只做词典，而是在组织语义网络。"
    },
    {
      id: "ai-fill",
      label: "AI补译",
      keywords: ["AI补译", "补译", "不可译", "JSON", "提示", "API"],
      title: "处理不可译片段",
      summary: "AI 补译不会直接乱改结果，它会给出候选建议，等你人工采纳。",
      steps: [
        "先翻译一句话，确认有不可译空位。",
        "点击“生成提示”，系统会列出每个空位的候选概念。",
        "可以复制提示去大模型，也可以填 API Key 后点后台 AI 补译。",
        "把返回 JSON 读入后，检查建议，再点击采纳。"
      ],
      tip: "后台 AI 补译需要通过 server.js 打开页面；直接双击 HTML 时只能手动复制提示。"
    },
    {
      id: "image-review",
      label: "图像审稿",
      keywords: ["图像", "审稿", "视觉", "误读", "Qwen", "图片"],
      title: "让视觉模型检查图形是否容易误读",
      summary: "图像审稿会把当前图形图片发给视觉模型，让它判断图像和目标词是否匹配。",
      steps: [
        "先生成一组图形序列。",
        "点击“生成审稿任务”，系统会整理当前图形和目标含义。",
        "填入支持图像的模型接口和 API Key 后，可点后台视觉审稿。",
        "也可以复制任务到外部视觉模型，再把 JSON 结果粘回来读取。"
      ],
      tip: "它关注的是“图看起来像什么”，不是词典是否匹配。"
    },
    {
      id: "audience",
      label: "观众模拟",
      keywords: ["观众", "盲读", "模拟", "误读路径", "猜读"],
      title: "模拟第一次看到图形的人会怎么读",
      summary: "观众模拟会隐藏原句，只让 AI 根据图形序列猜测含义，用来评估作品可读性。",
      steps: [
        "先翻译出图形序列。",
        "点击“生成盲读提示”，提示里不会包含原句。",
        "后台观众模拟或手动粘贴 JSON 后，会显示 AI 猜读、保守读法和误读点。",
        "对比原句和猜读，可以判断哪些图形需要调整。"
      ],
      tip: "这是做展示和报告时最有说服力的评估环节。"
    },
    {
      id: "artwork",
      label: "展示/报告",
      keywords: ["展示", "报告", "PPT", "作品卡片", "复制", "漂移"],
      title: "生成展示材料和语义漂移说明",
      summary: "作品展示、漂移观察和作品卡片用于把翻译结果整理成报告素材。",
      steps: [
        "翻译后，作品展示区会自动生成图形画布和说明。",
        "语义漂移区会列出借用、近似或不可译造成的偏差。",
        "作品卡片可以复制到报告或 PPT。",
        "如果做了观众模拟，卡片会更适合说明可读性。"
      ],
      tip: "最终汇报时，可以按“原句 → 图形 → 回译/盲读 → 漂移分析”的顺序讲。"
    }
  ];

  function toggleAssistant() {
    const isOpen = dom.featureAssistant && dom.featureAssistant.classList.toggle("is-open");
    if (dom.assistantToggleBtn) {
      dom.assistantToggleBtn.setAttribute("aria-expanded", String(Boolean(isOpen)));
    }
    if (isOpen) {
      renderAssistantGuide(matchAssistantTopic(dom.assistantSearchInput ? dom.assistantSearchInput.value : ""));
    }
  }

  function closeAssistant() {
    if (!dom.featureAssistant) return;
    dom.featureAssistant.classList.remove("is-open");
    if (dom.assistantToggleBtn) {
      dom.assistantToggleBtn.setAttribute("aria-expanded", "false");
    }
  }

  function matchAssistantTopic(query) {
    const value = normalizeTerm(query || "");
    if (!value) return "overview";
    const direct = assistantTopics.find((topic) => {
      const haystack = [topic.label, topic.title].concat(topic.keywords || []).map(normalizeTerm);
      return haystack.some((item) => item && (item.includes(value) || value.includes(item)));
    });
    return direct ? direct.id : "overview";
  }

  function renderAssistantGuide(topicId) {
    if (!dom.assistantQuickActions || !dom.assistantAnswer) return;
    const activeTopic = assistantTopics.find((topic) => topic.id === topicId) || assistantTopics[0];
    dom.assistantQuickActions.innerHTML = "";
    assistantTopics.forEach((topic) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "assistant-topic";
      button.classList.toggle("active", topic.id === activeTopic.id);
      button.textContent = topic.label;
      button.addEventListener("click", () => {
        if (dom.assistantSearchInput) dom.assistantSearchInput.value = topic.label;
        renderAssistantGuide(topic.id);
      });
      dom.assistantQuickActions.appendChild(button);
    });

    const context = getAssistantContext(activeTopic.id);
    dom.assistantAnswer.innerHTML = `
      <div class="assistant-answer-head">
        <span>${escapeHtml(activeTopic.label)}</span>
        <strong>${escapeHtml(activeTopic.title)}</strong>
        <p>${escapeHtml(activeTopic.summary)}</p>
      </div>
      <div class="assistant-context ${context.state}">
        <strong>${escapeHtml(context.title)}</strong>
        <p>${escapeHtml(context.message)}</p>
      </div>
      <ol>
        ${activeTopic.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
      <div class="assistant-tip">${escapeHtml(activeTopic.tip)}</div>
    `;
  }

  function getAssistantContext(topicId) {
    const hasInput = Boolean(dom.sourceInput && dom.sourceInput.value.trim());
    const hasResults = Array.isArray(lastResults) && lastResults.length > 0;
    const gapCount = hasResults ? lastResults.filter((item) => item.type === "gap").length : 0;
    const isOnline = dom.serviceStatus && dom.serviceStatus.classList.contains("online");
    const contextByTopic = {
      overview: hasResults
        ? { state: "ready", title: "当前状态", message: `已经生成 ${lastResults.length} 个片段，可以继续查看解释、回译或做 AI 评估。` }
        : { state: "idle", title: "当前状态", message: hasInput ? "已有输入，下一步点击翻译。" : "还没有开始，可以先点一个精选示例。" },
      translate: hasInput
        ? { state: "ready", title: "当前状态", message: "输入框已有内容，点击翻译即可刷新图形序列。" }
        : { state: "idle", title: "当前状态", message: "输入框为空，先写一句短句或选择示例。" },
      "ai-fill": gapCount
        ? { state: "ready", title: "当前状态", message: `当前有 ${gapCount} 个不可译片段，适合使用 AI 补译。` }
        : { state: "idle", title: "当前状态", message: "当前没有不可译空位，暂时不需要 AI 补译。" },
      "image-review": hasResults
        ? { state: isOnline ? "ready" : "warn", title: "当前状态", message: isOnline ? "服务在线，可以填 Key 后后台审稿。" : "可以生成审稿任务；后台调用需要用 server.js 打开页面。" }
        : { state: "idle", title: "当前状态", message: "请先翻译出图形序列，再做图像审稿。" },
      audience: hasResults
        ? { state: isOnline ? "ready" : "warn", title: "当前状态", message: isOnline ? "可以生成盲读任务或直接后台模拟。" : "可以生成提示手动测试；后台模拟需要本地服务。" }
        : { state: "idle", title: "当前状态", message: "请先翻译出图形序列，再做观众模拟。" },
      reverse: hasResults
        ? { state: "ready", title: "当前状态", message: "可以点击“使用当前图形序列”开始回译。" }
        : { state: "idle", title: "当前状态", message: "请先生成图形序列，或手动搜索概念加入回译。" },
    };
    return contextByTopic[topicId] || (hasResults
      ? { state: "ready", title: "当前状态", message: "当前已有结果，可以继续分析。" }
      : { state: "idle", title: "当前状态", message: "建议先完成一次翻译。" });
  }

  init();

  function bindEvents() {
    dom.translateBtn.addEventListener("click", () => translateCurrentInput({ saveHistory: true }));
    dom.clearBtn.addEventListener("click", clearInput);
    dom.runAiApiBtn.addEventListener("click", runAiApiFill);
    dom.buildAiPromptBtn.addEventListener("click", buildAiPrompt);
    dom.copyAiPromptBtn.addEventListener("click", copyAiPrompt);
    dom.applyAiResponseBtn.addEventListener("click", readAiSuggestionsFromText);
    dom.buildImageReviewPromptBtn.addEventListener("click", buildImageReviewPrompt);
    dom.copyImageReviewPromptBtn.addEventListener("click", copyImageReviewPrompt);
    dom.runImageReviewApiBtn.addEventListener("click", runImageReviewApi);
    dom.readImageReviewBtn.addEventListener("click", readImageReviewFromText);
    dom.buildAudiencePromptBtn.addEventListener("click", buildAudiencePrompt);
    dom.copyAudiencePromptBtn.addEventListener("click", copyAudiencePrompt);
    dom.runAudienceApiBtn.addEventListener("click", runAudienceApi);
    dom.readAudienceResponseBtn.addEventListener("click", readAudienceSimulationFromText);
    if (dom.assistantToggleBtn) {
      dom.assistantToggleBtn.addEventListener("click", toggleAssistant);
    }
    if (dom.assistantCloseBtn) {
      dom.assistantCloseBtn.addEventListener("click", closeAssistant);
    }
    if (dom.assistantSearchInput) {
      dom.assistantSearchInput.addEventListener("input", () => renderAssistantGuide(matchAssistantTopic(dom.assistantSearchInput.value)));
    }
    dom.refreshArtworkBtn.addEventListener("click", renderArtworkLayer);
    dom.copyWorkCardBtn.addEventListener("click", copyWorkCardText);
    dom.clearHistoryBtn.addEventListener("click", clearHistory);
    if (dom.animationToggleBtn) {
      dom.animationToggleBtn.addEventListener("click", playGlyphAnimation);
    }
    dom.useCurrentReverseBtn.addEventListener("click", useCurrentSequenceForReverse);
    dom.copyReverseBtn.addEventListener("click", copyReverseText);
    dom.clearReverseBtn.addEventListener("click", clearReverseTranslation);
    dom.reverseLookupInput.addEventListener("input", () => renderReverseLookupResults(dom.reverseLookupInput.value));
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
    dom.imageReviewPromptOutput.value = "";
    dom.imageReviewResponseInput.value = "";
    dom.audiencePromptOutput.value = "";
    dom.audienceResponseInput.value = "";
    dom.audienceStatus.textContent = "本区使用独立文本模型接口；默认阿里 DashScope qwen-plus，模型不会看到原句。";
    dom.imageReviewStatus.textContent = "图像审稿使用独立接口；默认阿里百炼 Qwen-VL，请填入 DASHSCOPE_API_KEY。";
    currentAiSuggestions = [];
    latestImageReview = null;
    latestAudienceSimulation = null;
    reverseItems = [];
    lastBaseResults = [];
    translationVersions = [];
    activeVersionKey = "literal";
    selectedKey = "";
    renderTranslation([], { saveHistory: false });
    renderReverseTranslation();
    renderAiSuggestions();
    renderAiWorkflow();
    renderImageReviewResults(null);
    renderAudienceSimulation(null);
    renderAudienceWorkflow();
    renderArtworkLayer();
  }

  function renderExamples() {
    dom.exampleButtons.innerHTML = "";
    examplesData.examples.forEach((example, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${index + 1}. ${example.sentence}`;
      button.addEventListener("click", () => {
        dom.sourceInput.value = example.sentence;
        activeVersionKey = "literal";
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
    activeVersionKey = "literal";
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
    lastBaseResults = results;
    translationVersions = buildTranslationVersions(results);
    if (!translationVersions.some((version) => version.key === activeVersionKey)) {
      activeVersionKey = "literal";
    }
    renderVersionTabs();

    const activeVersion = getActiveVersion();
    const visibleResults = activeVersion ? activeVersion.results : results;
    lastResults = visibleResults;
    const matched = visibleResults.filter((item) => item.type === "match");
    const gaps = visibleResults.filter((item) => item.type === "gap");
    const avgConfidence = matched.length
      ? matched.reduce((sum, item) => sum + Number(item.concept.confidence || 0), 0) / matched.length
      : 0;

    dom.resultTitle.textContent = matched.length
      ? `${activeVersion ? activeVersion.label : "已生成"}图形序列`
      : "等待翻译";
    dom.confidenceLabel.textContent = `${Math.round(avgConfidence * 100)}%`;
    dom.confidenceBar.style.width = `${Math.round(avgConfidence * 100)}%`;
    dom.matchStats.textContent = `${matched.length} matched / ${gaps.length} unknown`;

    if (!matched.some((item) => itemKey(item) === selectedKey)) {
      selectedKey = matched.length ? itemKey(matched[0]) : "";
    }

    if (options.saveHistory && options.source) {
      saveHistoryEntry(options.source, visibleResults, avgConfidence);
    }

    renderGlyphs(visibleResults);
    renderDetails(visibleResults);
    renderSelectedDetail();
    renderHistory();
    renderAiWorkflow();
    latestAudienceSimulation = null;
    renderAudienceSimulation(null);
    renderAudienceWorkflow();
    renderArtworkLayer();
  }

  function buildTranslationVersions(results) {
    if (!results.length) return [];
    return [
      {
        key: "literal",
        label: "字面",
        note: "词典最长匹配",
        results,
      },
      {
        key: "context",
        label: "语境",
        note: "优先相近候选",
        results: results.map((item) => item.type === "match" ? makeContextMatch(item) : item),
      },
      {
        key: "ai",
        label: "AI 辅助",
        note: "等待读取 AI 建议",
        results: results.map((item) => item.type === "gap" ? makeAiSuggestedMatch(item) : item),
      },
    ];
  }

  function getActiveVersion() {
    return translationVersions.find((version) => version.key === activeVersionKey) || translationVersions[0] || null;
  }

  function renderVersionTabs() {
    if (!dom.versionTabs) return;
    dom.versionTabs.innerHTML = "";
    if (!translationVersions.length) {
      dom.versionTabs.classList.add("is-empty");
      return;
    }
    dom.versionTabs.classList.remove("is-empty");
    translationVersions.forEach((version) => {
      const matched = version.results.filter((item) => item.type === "match").length;
      const gaps = version.results.filter((item) => item.type === "gap").length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "version-tab";
      button.classList.toggle("active", version.key === activeVersionKey);
      button.innerHTML = `
        <span>${escapeHtml(version.label)}</span>
        <small>${escapeHtml(version.note)} · ${matched}/${gaps}</small>
      `;
      button.addEventListener("click", () => {
        activeVersionKey = version.key;
        renderTranslation(lastBaseResults, { source: dom.sourceInput.value.trim(), saveHistory: false });
      });
      dom.versionTabs.appendChild(button);
    });
  }

  function makeContextMatch(item) {
    const candidate = pickContextCandidate(item.concept, item.candidate);
    if (!candidate || candidate === item.candidate) {
      return makeMatch(item.term, item.concept, "context");
    }
    const concept = {
      ...item.concept,
      primary: candidate,
      confidence: Math.min(0.99, Number(item.concept.confidence || 0) + 0.02),
    };
    return makeMatch(item.term, concept, "context");
  }

  function pickContextCandidate(concept, currentCandidate) {
    const currentId = currentCandidate && currentCandidate.target_id;
    const candidates = Array.isArray(concept.candidates) ? concept.candidates : [];
    return candidates.find((candidate) => (
      candidate.target_id !== currentId &&
      Array.isArray(candidate.image_paths) &&
      candidate.image_paths.length &&
      (candidate.pragmatic_meaning || candidate.free_translation || candidate.event_description)
    )) || candidates.find((candidate) => candidate.target_id !== currentId && Array.isArray(candidate.image_paths) && candidate.image_paths.length);
  }

  function makeAiSuggestedMatch(item) {
    const suggestion = findAiSuggestionForGap(item.text);
    if (!suggestion) return item;
    const mode = suggestion.status === "accepted" ? "ai" : "ai-preview";
    return makeMatch(suggestion.term || item.text, suggestion.concept, mode);
  }

  function findAiSuggestionForGap(gapText) {
    const gapKey = normalizeTerm(gapText);
    return currentAiSuggestions.find((suggestion) => {
      if (!suggestion.concept || !["pending", "accepted"].includes(suggestion.status)) return false;
      const suggestionKey = normalizeTerm(suggestion.gap);
      const termKey = normalizeTerm(suggestion.term);
      return suggestionKey === gapKey ||
        termKey === gapKey ||
        (suggestionKey && (suggestionKey.includes(gapKey) || gapKey.includes(suggestionKey)));
    });
  }

  function renderGlyphs(results) {
    stopGlyphAnimation(false);
    dom.glyphOutput.innerHTML = "";
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "输入后生成";
      dom.glyphOutput.appendChild(empty);
      renderAnimationStage(null);
      updateAnimationButton();
      return;
    }

    results.forEach((item, index) => {
      const token = item.type === "gap" ? renderGapToken(item) : renderGlyphToken(item);
      decorateAnimatedToken(token, item, index);
      dom.glyphOutput.appendChild(token);
    });
    updateAnimationButton();
  }

  function decorateAnimatedToken(token, item, index) {
    token.style.setProperty("--step-index", index);
    token.classList.add("animated-token", getMotionClass(item));
  }

  function getMotionClass(item) {
    if (item.type === "gap") return "motion-gap";
    const category = classifyConcept(item.concept);
    return {
      action: "motion-action",
      time: "motion-time",
      emotion: "motion-emotion",
      place: "motion-place",
      object: "motion-object",
      person: "motion-person",
      relation: "motion-relation",
    }[category] || "motion-default";
  }

  function playGlyphAnimation() {
    if (!lastResults.length || !dom.glyphOutput.children.length) return;
    if (isAnimationPlaying) {
      stopGlyphAnimation(true, false);
      return;
    }

    stopGlyphAnimation(false, false);
    dom.glyphOutput.classList.remove("is-animating");
    void dom.glyphOutput.offsetWidth;
    dom.glyphOutput.classList.add("is-animating");
    isAnimationPlaying = true;
    animationStepIndex = -1;
    updateAnimationButton();
    advanceAnimationFrame();

    animationTimer = window.setInterval(advanceAnimationFrame, 1150);
  }

  function advanceAnimationFrame() {
    animationStepIndex += 1;
    if (animationStepIndex >= lastResults.length) {
      stopGlyphAnimation(true, false, "重播动画");
      return;
    }
    updateAnimatedTokenStates(animationStepIndex);
    renderAnimationStage(lastResults[animationStepIndex], animationStepIndex);
  }

  function updateAnimatedTokenStates(activeIndex) {
    Array.from(dom.glyphOutput.children).forEach((token, index) => {
      token.classList.toggle("is-current", index === activeIndex);
      token.classList.toggle("is-past", index < activeIndex);
    });
    const active = dom.glyphOutput.children[activeIndex];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  function stopGlyphAnimation(resetLabel = true, clearStage = true, label = "") {
    if (animationTimer) {
      window.clearInterval(animationTimer);
      animationTimer = null;
    }
    isAnimationPlaying = false;
    if (dom.glyphOutput) {
      dom.glyphOutput.classList.remove("is-animating");
      Array.from(dom.glyphOutput.children).forEach((token) => {
        token.classList.remove("is-current", "is-past");
      });
    }
    if (clearStage) renderAnimationStage(null);
    if (resetLabel) updateAnimationButton(label);
  }

  function updateAnimationButton(label) {
    if (!dom.animationToggleBtn) return;
    dom.animationToggleBtn.disabled = !lastResults.length;
    dom.animationToggleBtn.textContent = label || (isAnimationPlaying ? "停止动画" : "播放动画");
  }

  function renderAnimationStage(item, index = -1) {
    if (!dom.animationStage) return;
    dom.animationStage.innerHTML = "";
    if (!item) {
      dom.animationStage.className = "animation-stage";
      return;
    }

    const motion = getMotionClass(item);
    const progress = Math.round(((index + 1) / Math.max(lastResults.length, 1)) * 100);
    dom.animationStage.className = `animation-stage is-active ${motion}`;
    dom.animationStage.innerHTML = `
      <div class="stage-header">
        <div>
          <span class="stage-kicker">${escapeHtml(getItemCategoryLabel(item))}</span>
          <h3>${escapeHtml(getItemLabel(item))}</h3>
        </div>
        <div class="stage-count">${index + 1} / ${lastResults.length}</div>
      </div>
      <div class="stage-body">
        <div class="stage-visual"></div>
        <div class="stage-copy">
          <p>${escapeHtml(getItemCaption(item))}</p>
          <div class="stage-progress"><span style="width:${progress}%"></span></div>
        </div>
      </div>
      <div class="stage-rail"></div>
    `;

    const visual = dom.animationStage.querySelector(".stage-visual");
    if (item.type === "gap") {
      visual.innerHTML = `<div class="stage-gap">不可译</div>`;
    } else {
      appendImages(visual, getImagePaths(item.concept), item.concept.label, 6);
    }
    renderAnimationRail(dom.animationStage.querySelector(".stage-rail"), index);
  }

  function renderAnimationRail(parent, activeIndex) {
    if (!parent) return;
    lastResults.forEach((item, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "stage-rail-item";
      dot.classList.toggle("active", index === activeIndex);
      dot.classList.toggle("past", index < activeIndex);
      dot.textContent = getItemLabel(item);
      dot.addEventListener("click", () => {
        animationStepIndex = index;
        updateAnimatedTokenStates(index);
        renderAnimationStage(item, index);
      });
      parent.appendChild(dot);
    });
  }

  function getItemLabel(item) {
    return item.type === "gap" ? item.text : item.concept.label;
  }

  function getItemCaption(item) {
    if (item.type === "gap") {
      return `“${item.text}” 暂时没有稳定图形对应，保留为翻译空位。`;
    }
    const candidate = item.candidate || item.concept.primary || {};
    const confidence = Math.round(Number(item.concept.confidence || 0) * 100);
    return `输入片段“${item.term}”匹配到概念 ${item.concept.id}，置信度 ${confidence}%。${candidate.pragmatic_meaning || candidate.free_translation || item.concept.explanation || ""}`;
  }

  function getItemCategoryLabel(item) {
    if (item.type === "gap") return "不可译空位";
    return classifyConceptLabel(item.concept);
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

    const reverseButton = document.createElement("button");
    reverseButton.type = "button";
    reverseButton.className = "token-mini-btn";
    reverseButton.textContent = "加入回译";
    reverseButton.addEventListener("click", (event) => {
      event.stopPropagation();
      addReverseItem(item);
    });
    token.appendChild(reverseButton);

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
      const preview = document.createElement("div");
      preview.className = "candidate-preview";
      appendImages(preview, getImagePaths(concept), concept.label, 3);
      row.appendChild(preview);

      const title = document.createElement("div");
      title.className = "candidate-title";
      title.innerHTML = `${escapeHtml(concept.label)} <span>${escapeHtml(concept.id)}</span>`;
      row.appendChild(title);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "采纳此候选";
      button.addEventListener("click", () => adoptCandidateForGap(gapText, concept.id, "user"));
      row.appendChild(button);
      list.appendChild(row);
    });
    return list;
  }

  function useCurrentSequenceForReverse() {
    reverseItems = lastResults.map(makeReverseItem).filter(Boolean);
    renderReverseTranslation();
  }

  function addReverseItem(item) {
    const reverseItem = makeReverseItem(item);
    if (!reverseItem) return;
    reverseItems.push(reverseItem);
    renderReverseTranslation();
  }

  function addReverseConcept(concept) {
    reverseItems.push(makeReverseItem({
      type: "match",
      term: concept.label,
      concept,
    }));
    renderReverseTranslation();
  }

  function makeReverseItem(item) {
    if (!item) return null;
    if (item.type === "gap") {
      return {
        type: "gap",
        text: item.text,
        label: item.text,
        term: item.text,
      };
    }
    const concept = item.concept || {};
    return {
      type: "match",
      concept,
      concept_id: concept.id || "",
      label: concept.label || item.term || "",
      term: item.term || concept.label || "",
      confidence: Number(concept.confidence || 0),
      category: classifyConceptLabel(concept, item.term || concept.label || ""),
      image_paths: getImagePaths(concept),
      synonyms: (concept.synonyms || []).slice(0, 5),
    };
  }

  function getReversePrimaryText(item) {
    if (!item) return "";
    return item.type === "gap" ? item.text : (item.term || item.label || "");
  }

  function getReverseConceptLabel(item) {
    if (!item || item.type === "gap") return "";
    return item.label || (item.concept && item.concept.label) || "";
  }

  function getReverseAlignment(item) {
    if (!item || item.type === "gap") return { level: "gap", note: "不可译空位" };
    const term = normalizeTerm(getReversePrimaryText(item));
    const conceptLabel = normalizeTerm(getReverseConceptLabel(item));
    const synonyms = (item.synonyms || []).map(normalizeTerm).filter(Boolean);
    if (!term || !conceptLabel || term === conceptLabel || synonyms.includes(term)) {
      return { level: "exact", note: "输入片段与图形概念基本一致" };
    }
    if (synonyms.some((synonym) => synonym.includes(term) || term.includes(synonym))) {
      return { level: "partial", note: "输入片段来自较长同义片段" };
    }
    return { level: "shift", note: "输入片段借用了相近但不完全一致的图形概念" };
  }

  function renderReverseTranslation() {
    if (!dom.reverseSequence || !dom.reverseOutput || !dom.reverseStats) return;
    dom.reverseStats.textContent = `${reverseItems.length} glyphs`;
    dom.reverseSequence.innerHTML = "";

    if (!reverseItems.length) {
      dom.reverseSequence.className = "reverse-sequence empty-copy";
      dom.reverseSequence.textContent = "点击图形卡片里的“加入回译”，或直接使用当前图形序列。";
      dom.reverseOutput.className = "reverse-output empty-copy";
      dom.reverseOutput.textContent = "回译结果会显示在这里。";
      renderReverseDiagnostics(null);
      return;
    }

    dom.reverseSequence.className = "reverse-sequence";
    reverseItems.forEach((item, index) => {
      const chip = document.createElement("article");
      chip.className = `reverse-chip ${item.type === "gap" ? "gap" : ""}`;
      const primaryText = getReversePrimaryText(item);
      const conceptLabel = getReverseConceptLabel(item);
      const conceptNote = item.type === "gap"
        ? "不可译空位"
        : (normalizeTerm(primaryText) === normalizeTerm(conceptLabel) ? `${item.concept_id} · ${item.category}` : `${item.concept_id} · 图形概念：${conceptLabel}`);
      chip.innerHTML = `
        <div>
          <strong>${escapeHtml(primaryText)}</strong>
          <small>${escapeHtml(conceptNote)}</small>
          <small>${escapeHtml(getReverseAlternatives(item).slice(0, 3).join(" / ") || "暂无替代读法")}</small>
        </div>
      `;
      const controls = document.createElement("div");
      controls.className = "reverse-chip-controls";

      const left = document.createElement("button");
      left.type = "button";
      left.textContent = "←";
      left.disabled = index === 0;
      left.addEventListener("click", () => moveReverseItem(index, -1));
      controls.appendChild(left);

      const right = document.createElement("button");
      right.type = "button";
      right.textContent = "→";
      right.disabled = index === reverseItems.length - 1;
      right.addEventListener("click", () => moveReverseItem(index, 1));
      controls.appendChild(right);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "移除";
      remove.addEventListener("click", () => {
        reverseItems.splice(index, 1);
        renderReverseTranslation();
      });
      controls.appendChild(remove);

      chip.appendChild(controls);
      dom.reverseSequence.appendChild(chip);
    });

    const readings = buildReverseReadings(reverseItems);
    dom.reverseOutput.className = "reverse-output";
    dom.reverseOutput.innerHTML = `
      <div class="reverse-reading">
        <span>保守读法</span>
        <strong>${escapeHtml(readings.literal)}</strong>
      </div>
      <div class="reverse-reading reverse-reading-secondary">
        <span>图形概念链</span>
        <strong>${escapeHtml(readings.conceptChain)}</strong>
      </div>
      <div class="reverse-reading">
        <span>自然句尝试</span>
        <strong>${escapeHtml(readings.natural)}</strong>
      </div>
      <div class="reverse-reading">
        <span>可能读法</span>
        <strong>${escapeHtml(readings.alternative)}</strong>
      </div>
      <div class="reverse-risk">
        <span>误读风险</span>
        <p>${escapeHtml(readings.risk)}</p>
      </div>
      <p>${escapeHtml(readings.note)}</p>
    `;
    renderReverseDiagnostics(readings);
  }

  function buildReverseReadings(items) {
    const literalParts = items.map((item) => item.type === "gap" ? `【${item.text}】` : getReversePrimaryText(item));
    const conceptParts = items.map((item) => item.type === "gap" ? `【${item.text}】` : getReverseConceptLabel(item));
    const naturalParts = items.map((item) => item.type === "gap" ? `（${item.text}？）` : getReversePrimaryText(item));
    const diagnostics = items.map((item, index) => buildReverseDiagnosticItem(item, index));
    const alternativeParts = items.map((item) => {
      const alternatives = getReverseAlternatives(item);
      return alternatives[0] || (item.type === "gap" ? `未知:${item.text}` : getReverseConceptLabel(item));
    });
    const matched = items.filter((item) => item.type === "match");
    const gaps = items.filter((item) => item.type === "gap");
    const avgConfidence = matched.length
      ? Math.round(matched.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / matched.length * 100)
      : 0;
    const risky = items
      .filter((item) => item.type === "gap" || Number(item.confidence || 0) < 0.9 || getReverseAlternatives(item).length > 2 || getReverseAlignment(item).level === "shift")
      .map((item) => getReversePrimaryText(item));
    const shifted = matched
      .filter((item) => ["shift", "partial"].includes(getReverseAlignment(item).level))
      .map((item) => `${getReversePrimaryText(item)}→${getReverseConceptLabel(item)}`);
    return {
      literal: literalParts.join(" / "),
      conceptChain: conceptParts.join(" / "),
      natural: naturalParts.join(""),
      alternative: alternativeParts.join(" / "),
      pattern: summarizeReversePattern(diagnostics),
      diagnostics,
      risk: shifted.length
        ? `${shifted.slice(0, 6).join("、")} 的图形概念与输入片段不完全一致，属于借用或近似回读。`
        : risky.length
        ? `${risky.slice(0, 6).join("、")} 可能存在多义或低置信度，需要结合上下文阅读。`
        : "当前序列没有明显低置信度或不可译空位，但仍不是唯一译文。",
      note: gaps.length
        ? `包含 ${gaps.length} 个不可译空位；已匹配部分平均置信度约 ${avgConfidence}%。`
        : `根据当前图形序列回读；平均置信度约 ${avgConfidence}%。`,
    };
  }

  function buildReverseDiagnosticItem(item, index) {
    if (item.type === "gap") {
      return {
        index,
        label: item.text,
        role: "不可译空位",
        confidence: 0,
        risk: "高",
        riskClass: "high",
        note: "没有稳定概念对应，只能作为待解释片段保留。",
      };
    }

    const primaryText = getReversePrimaryText(item);
    const conceptLabel = getReverseConceptLabel(item);
    const alignment = getReverseAlignment(item);
    const category = classifyConcept(item.concept, primaryText);
    const alternatives = getReverseAlternatives(item);
    const confidence = Math.round(Number(item.confidence || 0) * 100);
    const role = getReverseRoleLabel(category);
    const risk = confidence < 90 || alignment.level === "shift" || alternatives.length > 2 ? "中" : "低";
    const note = alignment.level === "shift"
      ? `输入片段“${primaryText}”借用了图形概念“${conceptLabel}”，属于语义漂移，需由创作者判定。`
      : alignment.level === "partial"
      ? `输入片段“${primaryText}”来自图形概念“${conceptLabel}”的长句近似。`
      : alternatives.length
      ? `还可读作：${alternatives.slice(0, 3).join("、")}。`
      : `主要按“${primaryText}”回读。`;

    return {
      index,
      label: primaryText,
      role,
      confidence,
      risk,
      riskClass: risk === "中" ? "medium" : "low",
      note,
    };
  }

  function getReverseRoleLabel(category) {
    return {
      action: "动作/事件",
      time: "时间锚点",
      place: "地点/场景",
      person: "人物/主体",
      object: "物品/对象",
      emotion: "情绪/状态",
      relation: "关系/连接",
      other: "补充信息",
    }[category] || "补充信息";
  }

  function summarizeReversePattern(diagnostics) {
    const roles = diagnostics.map((item) => item.role);
    return roles.length ? roles.join(" → ") : "尚未形成序列";
  }

  function renderReverseDiagnostics(readings) {
    if (!dom.reverseDiagnostics) return;
    if (!readings || !readings.diagnostics || !readings.diagnostics.length) {
      dom.reverseDiagnostics.className = "reverse-diagnostics empty-copy";
      dom.reverseDiagnostics.textContent = "序列结构与歧义分析会显示在这里。";
      return;
    }

    dom.reverseDiagnostics.className = "reverse-diagnostics";
    dom.reverseDiagnostics.innerHTML = `
      <div class="reverse-diagnostics-head">
        <span>结构诊断</span>
        <strong>${escapeHtml(readings.pattern)}</strong>
      </div>
      <div class="reverse-role-list">
        ${readings.diagnostics.map((item) => `
          <div class="reverse-role-item risk-${item.riskClass}">
            <span>${item.index + 1}</span>
            <div>
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.role)} · 置信度 ${item.confidence}% · 风险 ${escapeHtml(item.risk)}</small>
              <p>${escapeHtml(item.note)}</p>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function getReverseAlternatives(item) {
    if (!item || item.type === "gap") return [];
    return (item.synonyms || [])
      .map((term) => String(term || "").trim())
      .filter((term) => term && term !== item.label && term !== item.term)
      .slice(0, 4);
  }

  function moveReverseItem(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= reverseItems.length) return;
    const [item] = reverseItems.splice(index, 1);
    reverseItems.splice(nextIndex, 0, item);
    renderReverseTranslation();
  }

  function renderReverseLookupResults(query) {
    if (!dom.reverseLookupResults) return;
    const clean = normalizeTerm(query);
    dom.reverseLookupResults.innerHTML = "";
    const matches = concepts
      .map((concept) => ({ concept, score: clean ? scoreConceptForQuery(concept, clean) : getCandidateCount(concept) + Number(concept.confidence || 0) * 10 }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, clean ? 8 : 6);

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-copy reverse-empty";
      empty.textContent = "没有找到可加入的概念。";
      dom.reverseLookupResults.appendChild(empty);
      return;
    }

    matches.forEach(({ concept }) => {
      const row = document.createElement("article");
      row.className = "reverse-lookup-item";
      const preview = document.createElement("div");
      preview.className = "reverse-lookup-preview";
      appendImages(preview, getImagePaths(concept), concept.label, 3);
      row.appendChild(preview);

      const text = document.createElement("div");
      text.className = "reverse-lookup-text";
      text.innerHTML = `
        <strong>${escapeHtml(concept.label)}</strong>
        <small>${escapeHtml(concept.id)} · ${escapeHtml(classifyConceptLabel(concept))}</small>
      `;
      row.appendChild(text);

      const add = document.createElement("button");
      add.type = "button";
      add.textContent = "加入";
      add.addEventListener("click", () => addReverseConcept(concept));
      row.appendChild(add);
      dom.reverseLookupResults.appendChild(row);
    });
  }

  function clearReverseTranslation() {
    reverseItems = [];
    renderReverseTranslation();
  }

  function copyReverseText() {
    if (!reverseItems.length) {
      setButtonFeedback(dom.copyReverseBtn, "无内容");
      return;
    }

    const readings = buildReverseReadings(reverseItems);
    const diagnostics = (readings.diagnostics || [])
      .map((item) => `${item.index + 1}. ${item.label}｜${item.role}｜风险${item.risk}｜${item.note}`)
      .join("\n");
    const text = [
      `保守读法：${readings.literal}`,
      `图形概念链：${readings.conceptChain}`,
      `自然句尝试：${readings.natural}`,
      `可能读法：${readings.alternative}`,
      `序列结构：${readings.pattern}`,
      `误读风险：${readings.risk}`,
      readings.note,
      diagnostics ? `结构诊断：\n${diagnostics}` : "",
    ].filter(Boolean).join("\n");
    copyTextToClipboard(text).then((status) => {
      const label = status === "copied" ? "已复制" : (status === "selected" ? "已选中" : "复制失败");
      setButtonFeedback(dom.copyReverseBtn, label);
    });
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
    if (item.mode === "ai-preview") return `输入片段：${item.term}（AI 候选预览）`;
    if (item.mode === "context") return `输入片段：${item.term}（语境候选）`;
    if (item.mode === "fallback") return `输入片段：${item.term}（内置补充规则）`;
    if (item.mode === "user") return `输入片段：${item.term}（本地采纳规则）`;
    if (item.mode === "example") return `示例片段：${item.term}`;
    return `输入片段：${item.term}`;
  }

  function readableMode(mode) {
    return {
      ai: "AI 建议",
      "ai-preview": "AI 候选预览",
      context: "语境候选",
      map: "语义地图",
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
      const fallbackPaths = getImagePathFallbacks(path);
      img.dataset.pathIndex = "0";
      img.dataset.fallbackPaths = JSON.stringify(fallbackPaths);
      img.src = fallbackPaths[0] || path;
      img.alt = alt;
      img.addEventListener("error", handleImageError);
      parent.appendChild(img);
    });
  }

  function getImagePathFallbacks(path) {
    const cleanPath = String(path || "").replace(/\\/g, "/");
    const marker = "/images/auto_cut_segments/";
    const markerIndex = cleanPath.indexOf(marker);
    if (markerIndex === -1) return uniquePaths([cleanPath]);

    const suffix = cleanPath.slice(markerIndex);
    return uniquePaths([
      cleanPath,
      `../地书标注系统 V1.0${suffix}`,
      `../地书标注系统_V1.0${suffix}`,
      `../鍦颁功鏍囨敞绯荤粺 V1.0${suffix}`,
      `../åœ°ä¹¦æ ‡æ³¨ç³»ç»Ÿ V1.0${suffix}`,
    ]);
  }

  function uniquePaths(paths) {
    return paths.filter((item, index) => item && paths.indexOf(item) === index);
  }

  function handleImageError(event) {
    const img = event.currentTarget;
    const paths = JSON.parse(img.dataset.fallbackPaths || "[]");
    const nextIndex = Number(img.dataset.pathIndex || 0) + 1;
    if (nextIndex < paths.length) {
      img.dataset.pathIndex = String(nextIndex);
      img.src = paths[nextIndex];
      return;
    }
    img.classList.add("missing-image");
    img.removeAttribute("src");
    img.title = "Image file not found. Check the Dishu image folder path.";
  }

  function adoptCandidateForGap(gapText, conceptId, mode) {
    const concept = conceptsById.get(conceptId);
    if (!concept) return;
    saveUserAlias(gapText, conceptId);
    const sourceResults = lastBaseResults.length ? lastBaseResults : lastResults;
    const nextResults = replaceGapInResults(sourceResults, gapText, makeMatch(gapText, concept, mode || "user"));
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

  function renderSemanticMap() {
    if (!dom.semanticMap || !dom.semanticMapFilters || !dom.semanticMapStats) return;
    const groups = buildSemanticGroups();
    const activeGroup = groups.find((group) => group.id === activeSemanticCategory) || groups[0];
    const visibleGroups = activeSemanticCategory === "all"
      ? groups.filter((group) => group.id !== "all" && group.concepts.length)
      : [activeGroup].filter(Boolean);

    renderSemanticFilters(groups);
    dom.semanticMapStats.textContent = `${activeGroup.concepts.length} concepts`;
    dom.semanticMap.innerHTML = "";

    if (!visibleGroups.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "暂无可显示概念";
      dom.semanticMap.appendChild(empty);
      return;
    }

    visibleGroups.forEach((group) => {
      const cluster = document.createElement("section");
      cluster.className = `semantic-cluster semantic-${group.id}`;
      cluster.innerHTML = `
        <div class="semantic-cluster-head">
          <strong>${escapeHtml(group.label)}</strong>
          <span>${group.concepts.length}</span>
        </div>
      `;
      const nodes = document.createElement("div");
      nodes.className = "semantic-nodes";
      group.concepts.forEach((concept) => {
        const node = document.createElement("button");
        node.type = "button";
        node.className = `semantic-node ${semanticNodeClass(concept)}`;
        node.classList.toggle("selected", concept.id === selectedSemanticConceptId);
        node.innerHTML = `
          <span>${escapeHtml(concept.label)}</span>
          <small>${escapeHtml(concept.id)}</small>
        `;
        node.addEventListener("click", () => selectSemanticConcept(concept));
        nodes.appendChild(node);
      });
      cluster.appendChild(nodes);
      dom.semanticMap.appendChild(cluster);
    });
  }

  function renderSemanticFilters(groups) {
    dom.semanticMapFilters.innerHTML = "";
    groups.forEach((group) => {
      if (group.id !== "all" && !group.concepts.length) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "semantic-filter";
      button.classList.toggle("active", group.id === activeSemanticCategory);
      button.textContent = `${group.label} ${group.concepts.length}`;
      button.addEventListener("click", () => {
        activeSemanticCategory = group.id;
        renderSemanticMap();
      });
      dom.semanticMapFilters.appendChild(button);
    });
  }

  function buildSemanticGroups() {
    const baseGroups = semanticCategories.map((category) => ({
      ...category,
      concepts: category.id === "all" ? concepts.slice() : [],
    }));
    const groupsById = new Map(baseGroups.map((group) => [group.id, group]));

    concepts.forEach((concept) => {
      const categoryId = classifyConcept(concept);
      groupsById.get(categoryId || "other").concepts.push(concept);
    });

    baseGroups.forEach((group) => {
      group.concepts.sort((a, b) => {
        const candidateDelta = getCandidateCount(b) - getCandidateCount(a);
        if (candidateDelta) return candidateDelta;
        return Number(b.confidence || 0) - Number(a.confidence || 0);
      });
    });
    return baseGroups;
  }

  function classifyConcept(concept, contextText = "") {
    if (!concept) return "other";
    const contextCategory = classifyTextByLexicon(contextText);
    if (contextCategory) return contextCategory;

    const tags = concept.semantic_tags || [];
    const directTag = ["person", "action", "time", "place", "object", "emotion", "relation"]
      .find((tag) => tags.includes(tag));
    if (directTag) return directTag;

    const haystack = [
      contextText,
      concept.label,
      ...(concept.synonyms || []),
      ...tags,
      concept.explanation || "",
    ].join(" ");
    const lexicalCategory = classifyTextByLexicon(haystack);
    if (lexicalCategory) return lexicalCategory;

    const matched = semanticCategories.find((category) => (
      category.id !== "all" &&
      category.id !== "other" &&
      category.hints.some((hint) => haystack.includes(hint))
    ));
    return matched ? matched.id : "other";
  }

  function classifyTextByLexicon(text) {
    const lexicon = [
      { id: "person", terms: ["我", "我们", "他", "她", "男人", "女人", "人", "收银员", "警察"] },
      { id: "emotion", terms: ["害怕", "开心", "高兴", "紧张", "惊讶", "担心", "急了", "无语", "怕"] },
      { id: "place", terms: ["书店", "花店", "公司", "家", "厕所", "路口", "电梯", "工位", "商店", "餐厅"] },
      { id: "object", terms: ["礼物", "手机", "电话", "书", "电视", "车", "门", "空调", "游戏机", "咖啡"] },
      { id: "time", terms: ["时间", "凌晨", "早饭", "晚上", "明天", "两点", "分钟", "小时"] },
      { id: "action", terms: ["走", "走进", "走回", "离开", "想到", "想", "看", "听", "吃", "喝", "打开", "关闭", "坐", "睡", "工作", "学习", "拿"] },
    ];
    const matched = lexicon.find((group) => group.terms.some((term) => text.includes(term)));
    return matched ? matched.id : "";
  }

  function semanticNodeClass(concept) {
    const candidateCount = getCandidateCount(concept);
    if (candidateCount >= 8 || Number(concept.confidence || 0) >= 0.96) return "large";
    if (candidateCount >= 4 || Number(concept.confidence || 0) >= 0.9) return "medium";
    return "small";
  }

  function getCandidateCount(concept) {
    return Array.isArray(concept.candidates) ? concept.candidates.length : 0;
  }

  function selectSemanticConcept(concept) {
    selectedSemanticConceptId = concept.id;
    renderSemanticMap();
    renderSemanticMapDetail(concept);
    renderConceptDetail(concept, concept.label, "map");
  }

  function renderSemanticMapDetail(concept) {
    if (!dom.semanticMapDetail) return;
    const candidate = concept.primary || (concept.candidates || [])[0] || {};
    dom.semanticMapDetail.className = "semantic-map-detail";
    dom.semanticMapDetail.innerHTML = `
      <div class="semantic-detail-head">
        <span>${escapeHtml(classifyConceptLabel(concept))}</span>
        <strong>${escapeHtml(concept.label)}</strong>
        <small>${escapeHtml(concept.id)} · ${Math.round(Number(concept.confidence || 0) * 100)}%</small>
      </div>
      <p>${escapeHtml(concept.explanation || candidate.pragmatic_meaning || candidate.free_translation || "暂无解释")}</p>
      <p><strong>同义词：</strong>${escapeHtml((concept.synonyms || []).slice(0, 10).join("、") || "暂无")}</p>
    `;
    const tags = document.createElement("div");
    tags.className = "tags";
    (concept.semantic_tags || []).slice(0, 8).forEach((tag) => {
      const span = document.createElement("span");
      span.textContent = tag;
      tags.appendChild(span);
    });
    dom.semanticMapDetail.appendChild(tags);

    const strip = document.createElement("div");
    strip.className = "mini-strip";
    appendImages(strip, getImagePaths(concept), concept.label, 8);
    dom.semanticMapDetail.appendChild(strip);
  }

  function classifyConceptLabel(concept, contextText = "") {
    const id = classifyConcept(concept, contextText);
    return (semanticCategories.find((category) => category.id === id) || semanticCategories[semanticCategories.length - 1]).label;
  }

  function buildImageReviewPrompt() {
    const payload = createImageReviewPayload();
    if (!payload.items.length) {
      dom.imageReviewPromptOutput.value = "当前没有可审稿的图形序列。请先输入句子并翻译。";
      dom.imageReviewStatus.textContent = "没有可审稿的图形。";
      renderImageReviewResults(null);
      return;
    }

    dom.imageReviewPromptOutput.value = [
      "请作为视觉审稿助手，检查《地书》图形序列是否能表达输入片段。",
      "如果你能看到随请求附带的图片，请优先根据图片内容判断；如果只能看到 JSON，请明确说明视觉判断受限。",
      "请只返回合法 JSON，不要返回 Markdown。JSON 格式如下：",
      JSON.stringify({
        overall: {
          summary: "整体视觉表达是否清楚",
          visual_score: 0.0,
          main_risks: ["最重要的视觉误读风险"],
          revision_advice: "给创作者的修改建议",
        },
        items: [
          {
            index: 1,
            input_term: "原输入片段",
            concept_id: "概念 ID",
            visual_description: "这组图片看起来像什么",
            intended_meaning: "它试图表达的意思",
            fit_score: 0.0,
            misread_risk: "可能被误读成什么",
            suggested_fix: "是否需要换图或补充图形",
            caption: "一句适合展示的图形释义",
          },
        ],
      }, null, 2),
      "待审稿数据：",
      JSON.stringify(payload, null, 2),
    ].join("\n\n");

    dom.imageReviewStatus.textContent = `已生成 ${payload.items.length} 个图形的视觉审稿任务。`;
    renderImageReviewResults({ items: [], payload });
  }

  function createImageReviewPayload() {
    if (!lastResults.length) {
      translateCurrentInput({ saveHistory: false });
    }
    const source = dom.sourceInput.value.trim();
    const items = lastResults
      .map((item, index) => makeImageReviewItem(item, index))
      .filter(Boolean);
    return {
      source,
      task: "AI 图片审稿 + 图形释义",
      instruction: "检查图片视觉内容与 input_term / concept_label 是否一致，指出误读风险并给出改进建议。",
      items,
    };
  }

  function makeImageReviewItem(item, index) {
    if (item.type === "gap") {
      return {
        index: index + 1,
        type: "gap",
        input_term: item.text,
        concept_id: null,
        concept_label: null,
        category: "不可译空位",
        image_paths: [],
        local_note: "该片段没有图形候选，可请 AI 建议需要补充什么视觉元素。",
      };
    }
    const concept = item.concept || {};
    const candidate = concept.primary || (concept.candidates || [])[0] || {};
    const imagePaths = getImagePaths(concept).slice(0, 4).map((path) => getImagePathFallbacks(path)[0] || path);
    const alignment = getReverseAlignment(makeReverseItem(item));
    return {
      index: index + 1,
      type: "match",
      input_term: item.term || concept.label,
      concept_id: concept.id,
      concept_label: concept.label,
      category: classifyConceptLabel(concept, item.term || concept.label),
      confidence: Math.round(Number(concept.confidence || 0) * 100),
      alignment: alignment.note,
      image_paths: imagePaths,
      synonyms: (concept.synonyms || []).slice(0, 8),
      explanation: concept.explanation || candidate.pragmatic_meaning || candidate.free_translation || "",
      possible_misreadings: (concept.possible_misreadings || []).slice(0, 5),
    };
  }

  function copyImageReviewPrompt() {
    const text = dom.imageReviewPromptOutput.value.trim();
    if (!text) {
      buildImageReviewPrompt();
    }
    const value = dom.imageReviewPromptOutput.value;
    if (!value) {
      setButtonFeedback(dom.copyImageReviewPromptBtn, "无内容");
      return;
    }
    copyTextToClipboard(value).then((status) => {
      const label = status === "copied" ? "已复制" : (status === "selected" ? "已选中" : "复制失败");
      setButtonFeedback(dom.copyImageReviewPromptBtn, label);
    });
  }

  async function runImageReviewApi() {
    const payload = createImageReviewPayload();
    if (!payload.items.length) {
      dom.imageReviewStatus.textContent = "没有可审稿的图形。";
      return;
    }

    const endpoint = dom.imageEndpointInput.value.trim();
    const model = dom.imageModelInput.value.trim();
    const apiKey = dom.imageApiKeyInput.value.trim();
    if (!endpoint || !model || !apiKey) {
      dom.imageReviewStatus.textContent = "请先填写本区图像审稿 Endpoint、Model 和 Qwen API Key。";
      return;
    }

    dom.imageReviewStatus.textContent = "正在调用视觉模型审稿...";
    dom.runImageReviewApiBtn.disabled = true;
    renderImageReviewResults({ items: [], payload });
    try {
      const response = await fetch("/api/ai-image-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, model, apiKey, payload }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "视觉审稿失败");
      }
      dom.imageReviewResponseInput.value = JSON.stringify(data.parsed || { raw: data.raw }, null, 2);
      const normalized = normalizeImageReviewResponse(data.parsed);
      if (normalized) {
        renderImageReviewResults({ ...normalized, payload });
        dom.imageReviewStatus.textContent = `视觉审稿完成，已发送 ${data.image_count || 0} 张图片。`;
      } else {
        dom.imageReviewStatus.textContent = "模型返回内容未能解析为图像审稿 JSON，已放入返回框。";
      }
    } catch (error) {
      dom.imageReviewStatus.textContent = `视觉审稿失败：${error.message}`;
    } finally {
      dom.runImageReviewApiBtn.disabled = false;
    }
  }

  function readImageReviewFromText() {
    const raw = dom.imageReviewResponseInput.value.trim();
    if (!raw) {
      dom.imageReviewStatus.textContent = "请先粘贴视觉模型返回的 JSON。";
      return;
    }
    const parsed = normalizeImageReviewResponse(parseAiJson(raw));
    if (!parsed) {
      dom.imageReviewStatus.textContent = "解析失败：请粘贴包含 overall 和 items 的 JSON。";
      return;
    }
    renderImageReviewResults({ ...parsed, payload: createImageReviewPayload() });
    dom.imageReviewStatus.textContent = `已读取 ${parsed.items.length} 条图像审稿结果。`;
  }

  function normalizeImageReviewResponse(parsed) {
    if (!parsed) return null;
    if (Array.isArray(parsed)) {
      return { overall: null, items: parsed };
    }
    if (parsed.image_review) {
      return normalizeImageReviewResponse(parsed.image_review);
    }
    if (Array.isArray(parsed.items)) {
      return { overall: parsed.overall || null, items: parsed.items };
    }
    if (Array.isArray(parsed.reviews)) {
      return { overall: parsed.overall || null, items: parsed.reviews };
    }
    return null;
  }

  function renderImageReviewResults(review) {
    if (!dom.imageReviewResults) return;
    latestImageReview = review;
    dom.imageReviewResults.innerHTML = "";
    if (!review) {
      dom.imageReviewResults.className = "image-review-results empty-copy";
      dom.imageReviewResults.textContent = "AI 图片审稿和图形释义会显示在这里。";
      renderArtworkLayer();
      return;
    }

    const payloadItems = review.payload ? review.payload.items : createImageReviewPayload().items;
    if (!payloadItems.length) {
      dom.imageReviewResults.className = "image-review-results empty-copy";
      dom.imageReviewResults.textContent = "当前没有可审稿的图形。";
      renderArtworkLayer();
      return;
    }

    dom.imageReviewResults.className = "image-review-results";
    if (review.overall) {
      const overall = document.createElement("article");
      overall.className = "image-review-overall";
      overall.innerHTML = `
        <span>整体审稿</span>
        <strong>${escapeHtml(review.overall.summary || "暂无整体总结")}</strong>
        <p>${escapeHtml(review.overall.revision_advice || (review.overall.main_risks || []).join("、") || "暂无修改建议")}</p>
      `;
      dom.imageReviewResults.appendChild(overall);
    }

    payloadItems.forEach((item) => {
      const aiItem = findImageReviewItem(review.items || [], item);
      dom.imageReviewResults.appendChild(renderImageReviewCard(item, aiItem));
    });
    renderArtworkLayer();
  }

  function findImageReviewItem(items, payloadItem) {
    return items.find((item) => Number(item.index) === Number(payloadItem.index)) ||
      items.find((item) => item.concept_id && item.concept_id === payloadItem.concept_id) ||
      null;
  }

  function renderImageReviewCard(item, aiItem) {
    const card = document.createElement("article");
    card.className = "image-review-card";

    const strip = document.createElement("div");
    strip.className = "image-review-strip";
    appendImages(strip, item.image_paths || [], item.concept_label || item.input_term, 4);
    card.appendChild(strip);

    const body = document.createElement("div");
    body.className = "image-review-body";
    const fitScore = formatReviewScore(aiItem && aiItem.fit_score);
    body.innerHTML = `
      <div class="image-review-title">
        <strong>${escapeHtml(item.input_term || item.concept_label || "未命名")}</strong>
        <span>${escapeHtml(item.concept_id || "gap")} · ${escapeHtml(item.category || "未分类")} · ${escapeHtml(fitScore)}</span>
      </div>
      <p><b>图形释义：</b>${escapeHtml(aiItem?.visual_description || aiItem?.caption || "等待 AI 根据图片描述视觉内容。")}</p>
      <p><b>目标含义：</b>${escapeHtml(aiItem?.intended_meaning || item.concept_label || item.local_note || "暂无")}</p>
      <p><b>误读风险：</b>${escapeHtml(aiItem?.misread_risk || item.alignment || "等待 AI 判断。")}</p>
      <p><b>修改建议：</b>${escapeHtml(aiItem?.suggested_fix || "等待 AI 给出换图、补图或保留建议。")}</p>
    `;
    card.appendChild(body);
    return card;
  }

  function formatReviewScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "待审稿";
    return `${Math.round(numeric <= 1 ? numeric * 100 : numeric)}%`;
  }

  function buildAudiencePrompt() {
    const payload = createAudiencePayload();
    if (!payload.visible_sequence.length) {
      dom.audiencePromptOutput.value = "当前没有可盲读的图形序列。请先输入句子并翻译。";
      dom.audienceStatus.textContent = "没有可模拟的图形。";
      renderAudienceSimulation(null);
      renderAudienceWorkflow();
      return;
    }

    dom.audiencePromptOutput.value = [
      "请扮演第一次看到《地书》图形序列的观众。下面 JSON 不包含原句，请只根据 visible_sequence 推测这组图形表达了什么。",
      "请返回合法 JSON，不要返回 Markdown。JSON 格式如下：",
      JSON.stringify(payload.response_format, null, 2),
      "盲读任务数据：",
      JSON.stringify(payload, null, 2),
    ].join("\n\n");
    dom.audienceStatus.textContent = `已生成 ${payload.visible_sequence.length} 个图形的 AI 观众盲读任务。`;
    renderAudienceSimulation({ payload });
    renderAudienceWorkflow("prompt");
  }

  function createAudiencePayload() {
    if (!lastResults.length) {
      if (dom.sourceInput.value.trim()) {
        translateCurrentInput({ saveHistory: false });
      }
    }
    const visibleSequence = lastResults.map((item, index) => makeAudienceVisibleItem(item, index)).filter(Boolean);
    return {
      task: "AI 观众模拟器：不看原句，只看图形序列，推测它可能表达的自然语言含义。",
      blind_rules: [
        "不要假设你知道原始中文句子。",
        "把自己当成第一次观看作品的普通观众。",
        "可以利用 visible_label、synonyms、possible_misreadings 和 visual_note 推测图形可能被怎样读懂。",
        "输出应体现不确定性：哪里能读懂，哪里可能误读，哪里需要上下文。",
      ],
      visible_sequence: visibleSequence,
      response_format: {
        guessed_sentence: "AI 观众猜测出的自然句",
        conservative_reading: "更保守的逐图形读法",
        confidence: 0.0,
        reading_path: [
          {
            index: 1,
            seen: "观众看到的图形或标签",
            interpretation: "观众如何理解它",
            reason: "为什么这样读",
          },
        ],
        misread_points: [
          {
            index: 1,
            seen: "被看到的图形概念",
            guessed: "观众猜成了什么",
            risk_type: "保留 / 借用 / 漂移 / 不确定",
            note: "误读或不确定性的原因",
          },
        ],
        verdict: "这组图形对第一次观看者来说整体是否可读，以及最主要的误读风险。",
      },
    };
  }

  function makeAudienceVisibleItem(item, index) {
    if (item.type === "gap") {
      return {
        index: index + 1,
        type: "gap",
        visible_label: "不可译空位",
        concept_id: null,
        category: "unknown",
        synonyms: [],
        possible_misreadings: [],
        visual_note: "这一位置没有确定图形，观众可能感到意义缺失。",
      };
    }
    const concept = item.concept || {};
    const candidate = concept.primary || (concept.candidates || [])[0] || {};
    const reverseItem = makeReverseItem(item);
    const alignment = reverseItem ? getReverseAlignment(reverseItem) : null;
    return {
      index: index + 1,
      type: "glyph",
      visible_label: concept.label || item.term,
      concept_id: concept.id || "",
      category: classifyConceptLabel(concept, item.term || concept.label),
      glyph_count: getImagePaths(concept).length,
      synonyms: (concept.synonyms || []).slice(0, 8),
      possible_misreadings: (concept.possible_misreadings || []).slice(0, 5),
      visual_note: concept.explanation || candidate.pragmatic_meaning || candidate.free_translation || alignment?.note || "",
    };
  }

  function copyAudiencePrompt() {
    const text = dom.audiencePromptOutput.value.trim();
    if (!text) {
      buildAudiencePrompt();
    }
    const value = dom.audiencePromptOutput.value;
    if (!value) {
      setButtonFeedback(dom.copyAudiencePromptBtn, "无内容");
      return;
    }
    copyTextToClipboard(value).then((status) => {
      const label = status === "copied" ? "已复制" : (status === "selected" ? "已选中" : "复制失败");
      setButtonFeedback(dom.copyAudiencePromptBtn, label);
    });
  }

  async function runAudienceApi() {
    const payload = createAudiencePayload();
    if (!payload.visible_sequence.length) {
      dom.audienceStatus.textContent = "没有可模拟的图形。";
      return;
    }
    if (window.location.protocol === "file:") {
      dom.audienceStatus.textContent = "后台观众模拟需要通过本地 server.js 打开页面。";
      return;
    }
    const endpoint = dom.audienceEndpointInput.value.trim();
    const model = dom.audienceModelInput.value.trim();
    const apiKey = dom.audienceApiKeyInput.value.trim();
    if (!endpoint || !model || !apiKey) {
      dom.audienceStatus.textContent = "请先填写本区观众模拟 Endpoint、Model 和 API Key。";
      return;
    }

    dom.audienceStatus.textContent = "正在让 AI 观众盲读当前图形序列...";
    dom.runAudienceApiBtn.disabled = true;
    renderAudienceSimulation({ payload });
    renderAudienceWorkflow("running");
    try {
      const response = await fetch("/api/ai-audience-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, model, apiKey, payload }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = response.status === 405 && data.error === "Method not allowed"
          ? "当前本地 server.js 还是旧进程，没有观众模拟接口。请重启后端服务后再试。"
          : (data.error || "观众模拟失败");
        throw new Error(message);
      }
      dom.audienceResponseInput.value = JSON.stringify(data.parsed || { raw: data.raw }, null, 2);
      const normalized = normalizeAudienceResponse(data.parsed);
      if (normalized) {
        renderAudienceSimulation({ payload, simulation: normalized });
        dom.audienceStatus.textContent = "AI 观众模拟完成，已生成盲读结果与误读路径。";
      } else {
        dom.audienceStatus.textContent = "模型返回内容未能解析为观众模拟 JSON，已放入返回框。";
        renderAudienceWorkflow("prompt");
      }
    } catch (error) {
      dom.audienceStatus.textContent = `观众模拟失败：${error.message}`;
      renderAudienceWorkflow("prompt");
    } finally {
      dom.runAudienceApiBtn.disabled = false;
    }
  }

  function readAudienceSimulationFromText() {
    const raw = dom.audienceResponseInput.value.trim();
    if (!raw) {
      dom.audienceStatus.textContent = "请先粘贴 AI 观众返回的 JSON。";
      return;
    }
    const parsed = normalizeAudienceResponse(parseAiJson(raw));
    if (!parsed) {
      dom.audienceStatus.textContent = "解析失败：请粘贴包含 guessed_sentence 或 reading_path 的 JSON。";
      return;
    }
    renderAudienceSimulation({ payload: createAudiencePayload(), simulation: parsed });
    dom.audienceStatus.textContent = "已读取 AI 观众盲读结果。";
  }

  function normalizeAudienceResponse(parsed) {
    if (!parsed) return null;
    if (parsed.audience_simulation) return normalizeAudienceResponse(parsed.audience_simulation);
    if (parsed.audience) return normalizeAudienceResponse(parsed.audience);
    const guessed = parsed.guessed_sentence || parsed.guess || parsed.natural_reading || parsed.interpretation || "";
    const conservative = parsed.conservative_reading || parsed.literal_reading || parsed.step_reading || "";
    const readingPath = Array.isArray(parsed.reading_path) ? parsed.reading_path :
      (Array.isArray(parsed.path) ? parsed.path : []);
    const misreadPoints = Array.isArray(parsed.misread_points) ? parsed.misread_points :
      (Array.isArray(parsed.drifts) ? parsed.drifts :
        (Array.isArray(parsed.differences) ? parsed.differences : []));
    if (!guessed && !conservative && !readingPath.length && !misreadPoints.length) return null;
    return {
      guessed_sentence: guessed,
      conservative_reading: conservative,
      confidence: parsed.confidence,
      reading_path: readingPath,
      misread_points: misreadPoints,
      verdict: parsed.verdict || parsed.summary || parsed.note || "",
    };
  }

  function renderAudienceSimulation(result) {
    if (!dom.audienceResults) return;
    const payload = result?.payload || createAudiencePayload();
    const simulation = result?.simulation || null;
    latestAudienceSimulation = simulation ? { payload, simulation } : null;
    dom.audienceResults.innerHTML = "";

    if (!payload.visible_sequence.length) {
      dom.audienceResults.className = "audience-results empty-copy";
      dom.audienceResults.textContent = "翻译后可让 AI 观众盲读图形序列。";
      dom.audienceStats.textContent = "0 reading";
      renderArtworkLayer();
      renderAudienceWorkflow();
      return;
    }

    if (!simulation) {
      dom.audienceResults.className = "audience-results empty-copy";
      dom.audienceResults.textContent = "盲读任务已准备：AI 将看不到原句，只根据图形序列猜测含义。";
      dom.audienceStats.textContent = `${payload.visible_sequence.length} glyphs`;
      renderAudienceWorkflow("prompt");
      renderArtworkLayer();
      return;
    }

    dom.audienceResults.className = "audience-results";
    dom.audienceStats.textContent = `${Math.round(readAudienceConfidence(simulation) * 100)}% reading`;

    const overview = document.createElement("article");
    overview.className = "audience-overview";
    overview.innerHTML = `
      <span>AI 观众猜读</span>
      <strong>${escapeHtml(simulation.guessed_sentence || simulation.conservative_reading || "未给出完整自然句")}</strong>
      <p><b>对照原句：</b>${escapeHtml(dom.sourceInput.value.trim() || "暂无原句")}</p>
      <p><b>保守读法：</b>${escapeHtml(simulation.conservative_reading || "未给出")}</p>
      <p><b>结论：</b>${escapeHtml(simulation.verdict || "AI 观众未给出总评。")}</p>
    `;
    dom.audienceResults.appendChild(overview);

    const comparison = document.createElement("div");
    comparison.className = "audience-comparison";
    comparison.innerHTML = `
      <div>
        <span>原句</span>
        <strong>${escapeHtml(dom.sourceInput.value.trim() || "暂无")}</strong>
      </div>
      <div>
        <span>AI 观众读到</span>
        <strong>${escapeHtml(simulation.guessed_sentence || "暂无")}</strong>
      </div>
      <div>
        <span>本地漂移参照</span>
        <strong>${escapeHtml(getAudienceDriftSummary())}</strong>
      </div>
    `;
    dom.audienceResults.appendChild(comparison);

    const path = Array.isArray(simulation.reading_path) ? simulation.reading_path : [];
    if (path.length) {
      const pathWrap = document.createElement("div");
      pathWrap.className = "audience-path";
      path.slice(0, 8).forEach((item, index) => {
        const row = document.createElement("article");
        row.className = "audience-path-item";
        row.innerHTML = `
          <span>${escapeHtml(item.index || index + 1)}</span>
          <div>
            <strong>${escapeHtml(item.seen || item.visible_label || item.glyph || "图形")}</strong>
            <p>${escapeHtml(item.interpretation || item.reading || "未说明读法")}</p>
            <small>${escapeHtml(item.reason || item.note || "未说明原因")}</small>
          </div>
        `;
        pathWrap.appendChild(row);
      });
      dom.audienceResults.appendChild(pathWrap);
    }

    const misreads = Array.isArray(simulation.misread_points) ? simulation.misread_points : [];
    if (misreads.length) {
      const misreadWrap = document.createElement("div");
      misreadWrap.className = "audience-misreads";
      misreads.slice(0, 6).forEach((item, index) => {
        const card = document.createElement("article");
        card.className = "audience-misread";
        card.innerHTML = `
          <span>${escapeHtml(item.index || index + 1)}</span>
          <strong>${escapeHtml(item.seen || item.original || "图形")} → ${escapeHtml(item.guessed || item.reading || "未知读法")}</strong>
          <small>${escapeHtml(item.risk_type || item.type || "不确定")}</small>
          <p>${escapeHtml(item.note || item.reason || "未说明风险原因")}</p>
        `;
        misreadWrap.appendChild(card);
      });
      dom.audienceResults.appendChild(misreadWrap);
    }
    renderAudienceWorkflow("done");
    renderArtworkLayer();
  }

  function readAudienceConfidence(simulation) {
    const numeric = Number(simulation && simulation.confidence);
    if (!Number.isFinite(numeric)) return 0;
    return numeric > 1 ? numeric / 100 : numeric;
  }

  function getAudienceDriftSummary() {
    const model = buildArtworkModel();
    if (!model || !model.driftItems.length) return "暂无明显漂移";
    return model.driftItems.slice(0, 3).map((item) => `${item.input} → ${item.concept}`).join("；");
  }

  function getAudienceSummary() {
    if (!latestAudienceSimulation) return "";
    const simulation = latestAudienceSimulation.simulation || {};
    return simulation.guessed_sentence || simulation.conservative_reading || simulation.verdict || "";
  }

  function renderAudienceWorkflow(stage = "") {
    if (!dom.audienceWorkflow) return;
    const payload = createAudiencePayload();
    const hasPrompt = Boolean(dom.audiencePromptOutput && dom.audiencePromptOutput.value.trim());
    const hasResult = Boolean(latestAudienceSimulation);
    const steps = [
      {
        label: "隐藏原句",
        detail: payload.visible_sequence.length ? "只发送图形信息" : "等待翻译",
        state: payload.visible_sequence.length ? "done" : "idle",
      },
      {
        label: "观众盲读",
        detail: stage === "running" ? "模型正在猜读" : (hasPrompt ? "提示已生成" : "等待提示"),
        state: stage === "running" ? "active" : (hasPrompt ? "done" : (payload.visible_sequence.length ? "active" : "idle")),
      },
      {
        label: "生成读法",
        detail: hasResult ? "已得到自然句" : "等待 JSON",
        state: hasResult ? "done" : (stage === "running" ? "active" : "idle"),
      },
      {
        label: "对照误读",
        detail: hasResult ? "已和原句对比" : "尚未对比",
        state: hasResult ? "done" : "idle",
      },
    ];
    dom.audienceWorkflow.innerHTML = steps.map((step, index) => `
      <div class="workflow-step ${step.state}">
        <span class="workflow-index">${index + 1}</span>
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <small>${escapeHtml(step.detail)}</small>
        </div>
      </div>
    `).join("");
  }

  function renderArtworkLayer() {
    if (!dom.artworkCanvas || !dom.driftList || !dom.workCard) return;
    const model = buildArtworkModel();
    if (!model) {
      renderArtworkEmpty();
      return;
    }

    renderArtworkCanvas(model);
    renderDriftList(model);
    renderWorkCard(model);
  }

  function buildArtworkModel() {
    if (!lastResults.length) return null;
    const reverseSequence = lastResults.map(makeReverseItem).filter(Boolean);
    const readings = buildReverseReadings(reverseSequence);
    const matched = lastResults.filter((item) => item.type === "match");
    const avgConfidence = matched.length
      ? Math.round(matched.reduce((sum, item) => sum + Number(item.concept.confidence || 0), 0) / matched.length * 100)
      : 0;
    return {
      source: dom.sourceInput.value.trim() || "未命名输入",
      results: lastResults,
      reverseSequence,
      readings,
      confidence: avgConfidence,
      driftItems: buildDriftItems(reverseSequence),
      imageReviewSummary: getImageReviewSummary(),
    };
  }

  function renderArtworkEmpty() {
    dom.artworkCanvas.className = "artwork-canvas empty-copy";
    dom.artworkCanvas.textContent = "翻译后会生成可用于展示的地书图形画布。";
    dom.artworkSource.textContent = "等待输入";
    dom.artworkReading.textContent = "等待生成";
    dom.artworkConceptChain.textContent = "等待生成";
    dom.artworkConfidence.textContent = "0%";
    dom.driftStats.textContent = "0 drift";
    dom.driftList.className = "drift-list empty-copy";
    dom.driftList.textContent = "出现借用、近似或不可译空位时，会在这里显示语义漂移。";
    dom.workCard.className = "work-card empty-copy";
    dom.workCard.textContent = "翻译后会生成可直接截图或复制进报告的作品说明卡。";
  }

  function renderArtworkCanvas(model) {
    dom.artworkCanvas.className = "artwork-canvas";
    dom.artworkCanvas.innerHTML = "";
    model.results.forEach((item, index) => {
      const tile = document.createElement("article");
      tile.className = `artwork-glyph ${item.type === "gap" ? "gap" : ""}`;
      const visual = document.createElement("div");
      visual.className = "artwork-glyph-visual";
      if (item.type === "gap") {
        visual.innerHTML = `<span>${escapeHtml(item.text)}</span>`;
      } else {
        appendImages(visual, getImagePaths(item.concept), item.concept.label, 4);
      }
      const caption = document.createElement("div");
      caption.className = "artwork-glyph-caption";
      caption.innerHTML = `
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.type === "gap" ? item.text : item.term)}</strong>
        <small>${escapeHtml(item.type === "gap" ? "不可译空位" : item.concept.label)}</small>
      `;
      tile.appendChild(visual);
      tile.appendChild(caption);
      dom.artworkCanvas.appendChild(tile);
    });

    dom.artworkSource.textContent = model.source;
    dom.artworkReading.textContent = model.readings.natural || model.readings.literal;
    dom.artworkConceptChain.textContent = model.readings.conceptChain || "暂无概念链";
    dom.artworkConfidence.textContent = `${model.confidence}%`;
  }

  function buildDriftItems(reverseSequence) {
    return reverseSequence
      .map((item, index) => {
        const review = findImageReviewItem((latestImageReview && latestImageReview.items) || [], {
          index: index + 1,
          concept_id: item.concept_id,
        });
        if (item.type === "gap") {
          return {
            index: index + 1,
            input: item.text,
            concept: "无稳定图形",
            type: "不可译空位",
            level: "gap",
            risk: "需要补图或人工标注，否则会被保留为括号式回读。",
            aiRisk: review && (review.misread_risk || review.suggested_fix || review.caption || review.visual_description),
          };
        }

        const alignment = getReverseAlignment(item);
        if (!["shift", "partial"].includes(alignment.level)) return null;
        return {
          index: index + 1,
          input: getReversePrimaryText(item),
          concept: getReverseConceptLabel(item),
          type: alignment.level === "shift" ? "语义借用" : "近似回读",
          level: alignment.level,
          risk: alignment.level === "shift"
            ? "输入片段与实际图形概念不完全一致，展示时需要说明这是一种借用。"
            : "输入片段来自较长同义片段，含义基本接近但边界不完全相同。",
          aiRisk: review && (review.misread_risk || review.suggested_fix || review.caption || review.visual_description),
        };
      })
      .filter(Boolean);
  }

  function renderDriftList(model) {
    dom.driftStats.textContent = `${model.driftItems.length} drift`;
    dom.driftList.innerHTML = "";
    if (!model.driftItems.length) {
      dom.driftList.className = "drift-list empty-copy";
      dom.driftList.textContent = "当前图形链没有明显语义漂移；仍可结合 AI 图像审稿检查视觉误读。";
      return;
    }

    dom.driftList.className = "drift-list";
    model.driftItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = `drift-card ${item.level}`;
      card.innerHTML = `
        <div class="drift-route">
          <span>${item.index}</span>
          <strong>${escapeHtml(item.input)}</strong>
          <em>→</em>
          <strong>${escapeHtml(item.concept)}</strong>
        </div>
        <div class="drift-meta">语义漂移 · 创作者判定</div>
        <p>${escapeHtml(item.risk)}</p>
        ${item.aiRisk ? `<p class="drift-ai"><b>AI 视觉审稿：</b>${escapeHtml(item.aiRisk)}</p>` : ""}
      `;
      dom.driftList.appendChild(card);
    });
  }

  function getImageReviewSummary() {
    if (!latestImageReview) return "";
    if (latestImageReview.overall) {
      return latestImageReview.overall.summary ||
        latestImageReview.overall.revision_advice ||
        (latestImageReview.overall.main_risks || []).join("、") ||
        "";
    }
    const firstRisk = (latestImageReview.items || []).find((item) => item.misread_risk || item.suggested_fix);
    return firstRisk ? (firstRisk.misread_risk || firstRisk.suggested_fix) : "";
  }

  function renderWorkCard(model) {
    dom.workCard.className = "work-card";
    const driftText = model.driftItems.length
      ? model.driftItems.map((item) => `${item.input} → ${item.concept}`).join("；")
      : "暂无明显漂移";
    dom.workCard.innerHTML = `
      <div class="work-card-kicker">Book from the Ground Translator</div>
      <h3>地书翻译机：图形语言的语义漂移实验</h3>
      <p><strong>原句：</strong>${escapeHtml(model.source)}</p>
      <p><strong>回译：</strong>${escapeHtml(model.readings.natural || model.readings.literal)}</p>
      <p><strong>图形概念链：</strong>${escapeHtml(model.readings.conceptChain || "暂无")}</p>
      <p><strong>语义漂移：</strong>${escapeHtml(driftText)}</p>
      <p><strong>AI 图像审稿：</strong>${escapeHtml(model.imageReviewSummary || "尚未生成视觉审稿；可用阿里 Qwen-VL 检查图形释义与误读风险。")}</p>
    `;
  }

  function copyWorkCardText() {
    const model = buildArtworkModel();
    if (!model) {
      setButtonFeedback(dom.copyWorkCardBtn, "无内容");
      return;
    }
    const driftText = model.driftItems.length
      ? model.driftItems.map((item) => `${item.index}. ${item.input} → ${item.concept}（${item.type}）：${item.risk}${item.aiRisk ? ` AI审稿：${item.aiRisk}` : ""}`).join("\n")
      : "暂无明显漂移";
    const text = [
      "# 地书翻译机：图形语言的语义漂移实验",
      `原句：${model.source}`,
      `保守读法：${model.readings.literal}`,
      `自然回译：${model.readings.natural}`,
      `图形概念链：${model.readings.conceptChain}`,
      `平均置信度：${model.confidence}%`,
      "语义漂移：",
      driftText,
      `AI 图像审稿：${model.imageReviewSummary || "尚未生成视觉审稿。"}`,
      "作品说明：当自然语言被转换为《地书》图形，意义会在保留、借用与误读之间重新组织。",
    ].join("\n");
    copyTextToClipboard(text).then((status) => {
      const label = status === "copied" ? "已复制" : (status === "selected" ? "已选中" : "复制失败");
      setButtonFeedback(dom.copyWorkCardBtn, label);
    });
  }

  function buildAiPrompt() {
    const payload = createAiPayload();
    if (!payload.gaps.length) {
      dom.aiPromptOutput.value = "当前没有不可译空位，不需要 AI 补译。";
      renderAiWorkflow();
      return;
    }

    dom.aiPromptOutput.value = [
      "请根据下面 JSON 完成任务，只返回合法 JSON，不要返回 Markdown：",
      JSON.stringify(payload, null, 2),
    ].join("\n\n");
    dom.aiStatus.textContent = `已为 ${payload.gaps.length} 个不可译片段生成提示。`;
    renderAiWorkflow();
  }

  function createAiPayload() {
    if (!lastResults.length) {
      translateCurrentInput({ saveHistory: false });
    }
    const sourceResults = lastBaseResults.length ? lastBaseResults : lastResults;
    const gaps = sourceResults.filter((item) => item.type === "gap");
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
    if (!value) {
      setButtonFeedback(dom.copyAiPromptBtn, "无内容");
      return;
    }
    copyTextToClipboard(value, selectPromptText).then((status) => {
      const label = status === "copied" ? "已复制" : (status === "selected" ? "已选中" : "复制失败");
      setButtonFeedback(dom.copyAiPromptBtn, label);
    });
  }

  function selectPromptText() {
    dom.aiPromptOutput.focus();
    dom.aiPromptOutput.select();
  }

  async function copyTextToClipboard(text, fallbackSelect) {
    if (!text) return "empty";
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return "copied";
      } catch (error) {
        // Fall through to the textarea copy path for browsers that block clipboard access.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (document.execCommand && document.execCommand("copy")) {
        return "copied";
      }
    } catch (error) {
      // Fall back to selecting an existing visible field when available.
    } finally {
      document.body.removeChild(textarea);
    }

    if (fallbackSelect) {
      fallbackSelect();
      return "selected";
    }
    return "failed";
  }

  function setButtonFeedback(button, text) {
    if (!button) return;
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    if (button.dataset.feedbackTimer) {
      window.clearTimeout(Number(button.dataset.feedbackTimer));
    }
    button.textContent = text;
    button.dataset.feedbackTimer = String(window.setTimeout(() => {
      button.textContent = button.dataset.originalText;
      delete button.dataset.feedbackTimer;
    }, 1400));
  }

  function readAiSuggestionsFromText() {
    const raw = dom.aiResponseInput.value.trim();
    if (!raw) return;
    const parsed = normalizeAiResponse(parseAiJson(raw));
    if (!parsed) {
      dom.aiStatus.textContent = "解析失败：请粘贴完整 JSON，或只粘贴一条包含 gap、concept_id 的建议对象。";
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
    if (lastBaseResults.length) {
      renderTranslation(lastBaseResults, { source: dom.sourceInput.value.trim(), saveHistory: false });
    }
    renderAiSuggestions();
    renderAiWorkflow();
  }

  function renderAiSuggestions() {
    dom.aiSuggestions.innerHTML = "";
    dom.aiSuggestions.className = "ai-suggestions empty-copy";
    if (!currentAiSuggestions.length) {
      dom.aiSuggestions.textContent = "AI 或手动 JSON 的补译建议会显示在这里，采纳前不会自动替换结果。";
      renderAiWorkflow();
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
      row.appendChild(renderAiSuggestionComparison(suggestion));
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
    renderAiWorkflow();
  }

  function renderAiSuggestionComparison(suggestion) {
    const wrap = document.createElement("div");
    wrap.className = "ai-comparison";

    const original = document.createElement("div");
    original.className = "comparison-cell original";
    original.innerHTML = `
      <span class="comparison-label">原不可译片段</span>
      <strong>${escapeHtml(suggestion.gap || "未命名空位")}</strong>
      <small>字面版会保留为空位</small>
    `;
    wrap.appendChild(original);

    const recommended = document.createElement("div");
    recommended.className = "comparison-cell recommended";
    if (suggestion.concept) {
      const confidence = Math.round(Number(suggestion.concept.confidence || 0) * 100);
      recommended.innerHTML = `
        <span class="comparison-label">AI 推荐概念</span>
        <strong>${escapeHtml(suggestion.term || suggestion.concept.label)}</strong>
        <small>${escapeHtml(suggestion.concept.label)} · ${escapeHtml(suggestion.concept.id)} · ${confidence}%</small>
      `;
      const tags = document.createElement("div");
      tags.className = "comparison-tags";
      (suggestion.concept.semantic_tags || []).slice(0, 3).forEach((tag) => {
        const tagNode = document.createElement("span");
        tagNode.textContent = tag;
        tags.appendChild(tagNode);
      });
      recommended.appendChild(tags);
    } else {
      recommended.innerHTML = `
        <span class="comparison-label">AI 推荐概念</span>
        <strong>无有效候选</strong>
        <small>${escapeHtml(suggestion.concept_id || "concept_id 为空或不存在")}</small>
      `;
    }
    wrap.appendChild(recommended);

    const reason = document.createElement("div");
    reason.className = "comparison-cell reason";
    reason.innerHTML = `
      <span class="comparison-label">推荐理由 / 状态</span>
      <strong>${escapeHtml(readableSuggestionStatus(suggestion.status))}</strong>
      <small>${escapeHtml(suggestion.note || "模型没有提供理由")}</small>
      <small>来源：${escapeHtml(suggestion.source === "api" ? "后台 AI" : "手动 JSON")}</small>
    `;
    wrap.appendChild(reason);

    return wrap;
  }

  function readableSuggestionStatus(status) {
    return {
      pending: "待人工采纳",
      accepted: "已采纳",
      ignored: "已忽略",
      invalid: "无效建议",
    }[status] || status || "待检查";
  }

  function renderAiWorkflow() {
    if (!dom.aiWorkflow) return;
    const sourceResults = lastBaseResults.length ? lastBaseResults : lastResults;
    const gaps = sourceResults.filter((item) => item.type === "gap");
    const accepted = currentAiSuggestions.filter((item) => item.status === "accepted").length;
    const pending = currentAiSuggestions.filter((item) => item.status === "pending").length;
    const invalid = currentAiSuggestions.filter((item) => item.status === "invalid").length;
    const hasSuggestions = currentAiSuggestions.length > 0;
    const hasPrompt = Boolean(dom.aiPromptOutput && dom.aiPromptOutput.value.trim() && gaps.length);

    const steps = [
      {
        label: "发现空位",
        detail: gaps.length ? `${gaps.length} 个片段待补译` : "当前句子已完整匹配",
        state: gaps.length || hasSuggestions ? "done" : "idle",
      },
      {
        label: "生成候选",
        detail: gaps.length ? "已列出相近概念" : "无需候选",
        state: gaps.length ? "done" : "idle",
      },
      {
        label: "AI / JSON 建议",
        detail: hasSuggestions ? `${pending} 待采纳 · ${invalid} 无效` : (hasPrompt ? "提示已生成" : "等待提示或后台补译"),
        state: hasSuggestions ? "done" : (gaps.length ? "active" : "idle"),
      },
      {
        label: "人工采纳",
        detail: accepted ? `${accepted} 条已写入本地规则` : (pending ? "等待人工确认" : "尚未采纳"),
        state: accepted ? "done" : (pending ? "active" : "idle"),
      },
    ];

    dom.aiWorkflow.innerHTML = steps.map((step, index) => `
      <div class="workflow-step ${step.state}">
        <span class="workflow-index">${index + 1}</span>
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <small>${escapeHtml(step.detail)}</small>
        </div>
      </div>
    `).join("");
  }

  function applyAiSuggestion(index) {
    const suggestion = currentAiSuggestions[index];
    if (!suggestion || !suggestion.concept) return;
    saveUserAlias(suggestion.gap, suggestion.concept.id);
    const match = makeMatch(suggestion.term || suggestion.gap, suggestion.concept, "ai");
    const sourceResults = lastBaseResults.length ? lastBaseResults : lastResults;
    const nextResults = replaceGapInResults(sourceResults, suggestion.gap, match);
    suggestion.status = "accepted";
    activeVersionKey = "ai";
    renderTranslation(nextResults, { source: dom.sourceInput.value.trim(), saveHistory: true });
    renderAiSuggestions();
    renderAiWorkflow();
  }

  function applyAllAiSuggestions() {
    const sourceResults = lastBaseResults.length ? lastBaseResults : lastResults;
    let nextResults = sourceResults.slice();
    currentAiSuggestions.forEach((suggestion) => {
      if (!suggestion.concept || suggestion.status !== "pending") return;
      saveUserAlias(suggestion.gap, suggestion.concept.id);
      nextResults = replaceGapInResults(nextResults, suggestion.gap, makeMatch(suggestion.term || suggestion.gap, suggestion.concept, "ai"));
      suggestion.status = "accepted";
    });
    activeVersionKey = "ai";
    renderTranslation(nextResults, { source: dom.sourceInput.value.trim(), saveHistory: true });
    renderAiSuggestions();
    renderAiWorkflow();
  }

  function ignoreAiSuggestion(index) {
    if (!currentAiSuggestions[index]) return;
    currentAiSuggestions[index].status = "ignored";
    renderAiSuggestions();
    renderAiWorkflow();
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
    const cleaned = String(raw || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      try {
        if (objectMatch) return JSON.parse(objectMatch[0]);
      } catch (innerError) {
        // Continue to array or single-object repair attempts.
      }
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      try {
        if (arrayMatch) return JSON.parse(arrayMatch[0]);
      } catch (arrayError) {
        return null;
      }
      return null;
    }
  }

  function normalizeAiResponse(parsed) {
    if (!parsed) return null;
    if (Array.isArray(parsed)) {
      return { replacements: parsed };
    }
    if (Array.isArray(parsed.replacements)) {
      return parsed;
    }
    if (parsed.gap || parsed.concept_id || parsed.term) {
      return { replacements: [parsed] };
    }
    if (parsed.response && Array.isArray(parsed.response.replacements)) {
      return { replacements: parsed.response.replacements };
    }
    if (parsed.result && Array.isArray(parsed.result.replacements)) {
      return { replacements: parsed.result.replacements };
    }
    return null;
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
