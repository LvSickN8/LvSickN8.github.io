const routes = [
  { id: 'home', label: '房间', icon: '✦' },
  { id: 'diary', label: '日记', icon: '✎' },
  { id: 'gallery', label: '照片', icon: '◌' },
  { id: 'mood', label: '心情', icon: '☾' },
  { id: 'timeline', label: '时间', icon: '│' },
  { id: 'knowledge', label: '思想', icon: '✧' },
  { id: 'map', label: '地图', icon: '⌖' },
  { id: 'capsule', label: '胶囊', icon: '◍' },
  { id: 'ai', label: '浮光 AI', icon: '⌘' },
  { id: 'settings', label: '设置', icon: '⚙' }
];

const state = {
  profile: null,
  diaries: [],
  gallery: null,
  music: null,
  mood: null,
  timeline: null,
  knowledge: null,
  capsule: null,
  notes: { items: [] },
  map: { pins: [] },
  aiEchoes: [],
  adminMode: false,
  route: 'home',
  themeMode: null,
  objectUrls: new Map(),
  lastPublished: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const app = $('#app');
const nav = $('#nav');
const LOSSLESS_EXTS = ['flac', 'wav', 'aiff', 'aif', 'alac', 'm4a', 'ape', 'dsf', 'dff'];
const GITHUB_FILE_LIMIT_BYTES = 100 * 1024 * 1024;
const STORAGE_KEYS = {
  drafts: 'fuguang.drafts',
  tracks: 'fuguang.tracks',
  files: 'fuguang.files',
  github: 'fuguang.github',
  deletedDiaries: 'fuguang.deletedDiaries',
  adminMode: 'fuguang.adminMode'
};

function readJsonStorage(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`本地存储 ${key} 已损坏，已忽略：`, error);
    return fallback;
  }
}

function writeJsonStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`无法写入本地存储 ${key}：`, error);
    toast(`本机存储空间不足或被禁用，未能保存 ${key}。`);
    return false;
  }
}

function readLocalJson(key, fallback) {
  return readJsonStorage(localStorage, key, fallback);
}

function writeLocalJson(key, value) {
  return writeJsonStorage(localStorage, key, value);
}
const publishSpaces = {
  home: { label: '房间', hint: '发布一条会出现在首页的房间便签。', back: 'home' },
  diary: { label: '日记', hint: '写下今天的文字、心情、地点和标签。', back: 'diary' },
  gallery: { label: '照片', hint: '上传一张照片，并写下标题与说明。', back: 'gallery' },
  mood: { label: '心情', hint: '记录此刻的情绪数值、天气和地点。', back: 'mood' },
  timeline: { label: '时间', hint: '把一件事放进人生时间轴。', back: 'timeline' },
  knowledge: { label: '思想', hint: '新增一个知识节点，并可选关联已有节点。', back: 'knowledge' },
  map: { label: '地图', hint: '在柔和地图上放下一枚地点玻璃窗。', back: 'map' },
  capsule: { label: '胶囊', hint: '封存一封给未来的信。', back: 'capsule' },
  ai: { label: '浮光 AI', hint: '保存一段你想让浮光记住的回声。', back: 'ai' }
};

init();

async function init() {
  applyTimeTheme();
  renderNav();
  renderMobileNav();
  initAuthMode();
  bindShellEvents();
  try {
    await loadData();
    routeFromHash();
  } catch (error) {
    app.innerHTML = `<section class="page"><article class="card glass glass-l2"><h1>房间还没点亮</h1><p>请用本地静态服务器或 GitHub Pages 打开，而不是直接双击 HTML。如果已经部署到 GitHub Pages，请确认仓库根目录包含 <code>.nojekyll</code> 和 <code>data/diary/index.json</code>，然后强制刷新一次。</p><p class="muted">${escapeHtml(error.message)}</p></article></section>`;
  }
  registerServiceWorker();
}

async function loadData() {
  const bundle = await loadDataBundle();

  state.profile = bundle.profile;
  state.gallery = await hydrateLocalPhotos(mergeLocalCollection('gallery', bundle.gallery, 'albums'));
  state.music = await hydrateLocalTracks(mergeLocalTracks(bundle.music));
  state.mood = mergeLocalCollection('mood', bundle.mood, 'entries');
  if (state.mood.entries[0]) state.mood.latest = state.mood.entries[0];
  rebuildMoodMonthly();
  state.timeline = mergeLocalCollection('timeline', bundle.timeline, 'events');
  state.knowledge = mergeLocalCollection('knowledge', bundle.knowledge, 'nodes');
  state.capsule = mergeLocalCollection('capsule', bundle.capsule, 'items');
  state.notes = mergeLocalCollection('notes', bundle.notes, 'items');
  state.map = mergeLocalCollection('map', bundle.map, 'pins');
  state.aiEchoes = mergeLocalCollection('ai', bundle.aiEchoes, 'items').items;

  const drafts = readLocalJson(STORAGE_KEYS.drafts, []);
  state.diaries = applyDiaryDeletions(dedupeDiaries([...drafts, ...normalizeDiaries(bundle.diaries?.items || [])]))
    .filter((diary) => state.adminMode || diary.visibility === 'public');
  applyHiddenCollections();
  updatePlayer();
}

async function loadDataBundle() {
  if (state.adminMode && hasGithubConfig()) {
    try {
      return await loadGithubDataBundle();
    } catch (error) {
      console.warn('GitHub 数据读取失败，改用静态数据：', error);
    }
  }
  const [profile, gallery, music, mood, timeline, knowledge, capsule, notes, map, aiEchoes, diaries] = await Promise.all([
    fetchJson(appPath('data/profile/profile.json')),
    fetchJson(appPath('data/gallery/gallery.json')),
    fetchJson(appPath('data/music/tracks.json')),
    fetchJson(appPath('data/mood/mood.json')),
    fetchJson(appPath('data/timeline/timeline.json')),
    fetchJson(appPath('data/knowledge/nodes.json')),
    fetchJson(appPath('data/capsule/capsules.json')),
    fetchJson(appPath('data/notes/notes.json')).catch(() => ({ items: [] })),
    fetchJson(appPath('data/map/map.json')).catch(() => ({ pins: [] })),
    fetchJson(appPath('data/ai/echoes.json')).catch(() => ({ items: [] })),
    loadDiaries()
  ]);
  return normalizeDataBundle({ profile, gallery, music, mood, timeline, knowledge, capsule, notes, map, aiEchoes, diaries: { items: diaries } });
}

async function loadGithubDataBundle() {
  const config = requireGithubConfig();
  const [profile, gallery, music, mood, timeline, knowledge, capsule, notes, map, aiEchoes, diaries] = await Promise.all([
    fetchGithubJson(config, 'data/profile/profile.json'),
    fetchGithubJson(config, 'data/gallery/gallery.json'),
    fetchGithubJson(config, 'data/music/tracks.json'),
    fetchGithubJson(config, 'data/mood/mood.json'),
    fetchGithubJson(config, 'data/timeline/timeline.json'),
    fetchGithubJson(config, 'data/knowledge/nodes.json'),
    fetchGithubJson(config, 'data/capsule/capsules.json'),
    fetchGithubJson(config, 'data/notes/notes.json').catch(() => ({ items: [] })),
    fetchGithubJson(config, 'data/map/map.json').catch(() => ({ pins: [] })),
    fetchGithubJson(config, 'data/ai/echoes.json').catch(() => ({ items: [] })),
    fetchGithubJson(config, 'data/diary/index.json').then((index) => normalizeDiaries(index.items || [])).catch(() => [])
  ]);
  return normalizeDataBundle({ profile, gallery, music, mood, timeline, knowledge, capsule, notes, map, aiEchoes, diaries: { items: diaries } });
}

function normalizeDataBundle(data) {
  return {
    profile: data.profile || { name: '浮光', nickname: '阿光', welcome: '欢迎回来。这里不是网站，是你的数字房间。', keywords: [] },
    gallery: data.gallery || { albums: [] },
    music: data.music || { nowPlaying: 0, tracks: [] },
    mood: data.mood || { latest: { emoji: '✦', label: '未记录', value: 0, time: '', weather: '', location: '' }, monthly: [], yearSummary: '', entries: [] },
    timeline: data.timeline || { events: [] },
    knowledge: data.knowledge || { nodes: [] },
    capsule: data.capsule || { items: [] },
    notes: data.notes || { items: [] },
    map: data.map || { pins: [] },
    aiEchoes: data.aiEchoes || { items: [] },
    diaries: data.diaries || { items: [] }
  };
}

async function loadDiaries() {
  try {
    const index = await fetchJson(appPath('data/diary/index.json'));
    const indexed = normalizeDiaries(index.items || []);
    if (indexed.length) return indexed;
    console.warn('日记索引为空，尝试读取内置 Markdown 日记。');
  } catch (error) {
    console.warn('日记索引读取失败，尝试直接读取 Markdown：', error);
  }

  const diaryFiles = [
    'data/diary/2026-08-25-moonlight.md'
  ];
  const diaryResults = await Promise.allSettled(diaryFiles.map((file) => fetchText(appPath(file))));
  const failedDiaries = diaryResults
    .map((result, index) => result.status === 'rejected' ? diaryFiles[index] : null)
    .filter(Boolean);
  if (failedDiaries.length) console.warn('部分日记读取失败，请确认 .nojekyll：', failedDiaries);
  return diaryResults
    .map((result, index) => result.status === 'fulfilled' ? parseMarkdownDiary(result.value, diaryFiles[index]) : null)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeDiaries(items) {
  return items.map((item) => {
    const diary = {
      id: item.id || '',
      title: item.title || '未命名记录',
      date: item.date || new Date().toISOString().slice(0, 10),
      mood: item.mood || '✦ 未标记',
      location: item.location || '未知地点',
      music: item.music || '无音乐',
      tags: Array.isArray(item.tags) ? item.tags : [],
      visibility: item.visibility || 'public',
      sourcePath: item.sourcePath || '',
      content: item.content || ''
    };
    diary.id = diary.id || diaryId(diary);
    diary.excerpt = (item.excerpt || diary.content).replace(/\n+/g, ' ').slice(0, 92);
    return diary;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function fallbackDiaries() {
  return normalizeDiaries([{
    title: '房间里的第一束光',
    date: new Date().toISOString().slice(0, 10),
    mood: '✦ 初始',
    location: '浮光',
    music: 'Lavender Room',
    tags: ['开始', '数字房间'],
    content: '如果远程数据暂时没有读取成功，浮光仍会先点亮房间。请检查 GitHub Pages 部署中是否包含 `.nojekyll` 与 `data/diary/index.json`。'
  }]);
}

function parseMarkdownDiary(text, sourcePath = '') {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const meta = {};
  let body = String(text || '');
  if (match) {
    body = match[2].trim();
    match[1].split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx < 0) return;
      const key = line.slice(0, idx).trim();
      if (!key) return;
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      }
      meta[key] = value;
    });
  }
  return normalizeDiaries([{ ...meta, content: body, sourcePath }])[0];
}

function appPath(path) {
  return new URL(path, document.baseURI).toString();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法读取 ${relativeUrl(url)}（HTTP ${response.status}）`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法读取 ${relativeUrl(url)}（HTTP ${response.status}）`);
  return response.text();
}

function relativeUrl(url) {
  try {
    return new URL(url).pathname.replace(location.pathname.replace(/[^/]*$/, ''), '');
  } catch {
    return url;
  }
}

function renderNav() {
  nav.innerHTML = routes.map((route) => `<a href="#${route.id}" data-route="${route.id}">${route.label}</a>`).join('');
}

function renderMobileNav() {
  const mobile = document.createElement('nav');
  mobile.className = 'mobile-nav glass glass-l3';
  mobile.setAttribute('aria-label', '移动端导航');
  mobile.innerHTML = routes.map((route) => `<a class="pill mobile-nav-item" href="#${route.id}" data-route="${route.id}" aria-label="${route.label}" title="${route.label}"><strong>${route.icon}</strong><span>${route.label}</span></a>`).join('');
  document.body.appendChild(mobile);
}

function bindShellEvents() {
  window.addEventListener('hashchange', routeFromHash);
  $('#themeButton').addEventListener('click', () => {
    const order = ['dawn', 'day', 'dusk', 'night'];
    const current = order.indexOf(state.themeMode || getTimeTheme());
    state.themeMode = order[(current + 1) % order.length];
    applyTimeTheme(state.themeMode);
  });
  $('#playerToggle').addEventListener('click', () => togglePanel('#musicPlayer', '#playerToggle'));
  bindPlayerEvents();
  refreshMusicSyncDefault();
  $('#dockToggle').addEventListener('click', () => {
    $('#memoryDock').classList.toggle('is-open');
    $('#dockToggle').setAttribute('aria-expanded', $('#memoryDock').classList.contains('is-open'));
  });
  $('#aiButton').addEventListener('click', () => $('#aiOutput').textContent = generateMemoryEcho());
  bindCaptureDialog();
  bindAuthDialog();
}

function bindCaptureDialog() {
  const dialog = $('#captureDialog');
  const closeDialog = () => {
    $('#captureForm').reset();
    $('#classifyHint').textContent = '未选择文件时，会按日记自动命名为 YYYY-MM-DD-标题.md';
    dialog.close();
  };
  $('#captureButton').addEventListener('click', () => {
    if (!state.adminMode) return toast('当前是访客模式，不能发布。请填写 GitHub Token 进入管理模式。');
    location.hash = `#publish-${currentPublishSpace()}`;
  });
  $('#captureClose')?.addEventListener('click', closeDialog);
  $('#captureCancel')?.addEventListener('click', closeDialog);
  $('#captureForm [name="file"]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    $('#classifyHint').textContent = file ? describeClassification(file) : '未选择文件时，会按日记自动命名为 YYYY-MM-DD-标题.md';
  });
  $('#captureForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.adminMode) return toast('当前是访客模式，不能发布。请填写 GitHub Token 进入管理模式。');
    const submitButtons = [$('#captureSubmit'), $('#captureSubmitTop')].filter(Boolean);
    try {
      submitButtons.forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = '发布中…';
      });
      const form = new FormData(event.currentTarget);
      const syncGithub = form.get('sync') === 'github';
      const draft = buildDraft(form);
      // A diary that is successfully published is public; local-only entries remain drafts.
      if (syncGithub) draft.visibility = 'public';
      saveLocalDraft(draft);
      const file = form.get('file');
      let extra = '';
      if (file && file.size) extra = await saveClassifiedFile(file, syncGithub, draft.title);
      if (syncGithub) {
        await uploadDraftToGithub(draft);
        await persistDiaryIndexToGithub();
        toast(`已保存并上传到 GitHub。${extra}`);
      } else {
        toast(`已保存为本地草稿。${extra}`);
      }
      markPublished('diary', diaryId(draft));
      event.currentTarget.reset();
      dialog.close();
      if (state.route === 'diary') renderRoute();
      else location.hash = '#diary';
    } catch (error) {
      toast(`发布失败：${error.message}`);
    } finally {
      submitButtons.forEach((button) => {
        button.disabled = false;
        button.textContent = button.dataset.originalText || '发布';
      });
    }
  });
}

function togglePanel(panelSelector, buttonSelector) {
  const panel = $(panelSelector);
  panel.classList.toggle('is-open');
  panel.classList.toggle('is-collapsed', !panel.classList.contains('is-open'));
  $(buttonSelector).setAttribute('aria-expanded', panel.classList.contains('is-open'));
}

function applyTimeTheme(forced) {
  const theme = forced || getTimeTheme();
  document.body.classList.remove('theme-dawn', 'theme-day', 'theme-dusk', 'theme-night');
  document.body.classList.add(`theme-${theme}`);
  state.themeMode = theme;
  $('#themeButton')?.setAttribute('title', `当前氛围：${theme}`);
}

function getTimeTheme() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'dawn';
  if (hour >= 10 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'dusk';
  return 'night';
}

function routeFromHash() {
  const id = location.hash.replace('#', '') || 'home';
  if (id.startsWith('publish-')) {
    const space = id.replace('publish-', '');
    state.route = publishSpaces[space] ? id : 'publish-home';
  } else {
    state.route = routes.some((route) => route.id === id) ? id : 'home';
  }
  renderRoute();
}

function renderRoute() {
  const activeNav = state.route.startsWith('publish-') ? state.route.replace('publish-', '') : state.route;
  $$('#nav a, .mobile-nav a').forEach((link) => link.classList.toggle('active', link.dataset.route === activeNav));
  app.innerHTML = (pages[state.route] || pages.home)();
  bindRouteEvents();
  hydrateVisiblePhotos();
  revealPublishedItem();
  app.focus({ preventScroll: true });
}

function revealPublishedItem() {
  const published = state.lastPublished;
  if (!published || published.route !== state.route) return;
  const node = $(`[data-item-id="${cssEscape(published.id)}"]`);
  if (node) {
    node.classList.add('is-just-published');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  state.lastPublished = null;
}

function markPublished(route, id) {
  state.lastPublished = { route, id };
}

const pages = {
  home: () => `
    <section class="page home-page">
      <div class="hero hero-single">
        <article class="card glass glass-l2 hero-copy hero-ornamented">
          <aside class="hero-side hero-side-left" aria-hidden="true">
            <span class="hero-orb">浮</span>
            <span class="hero-thread"></span>
            <small>ROOM · LIGHT</small>
          </aside>
          <div class="hero-content">
            <div class="card-toolbar"><span class="kicker">${greeting()} · Liquid Glass Room</span><a class="liquid-button publish-only" href="#publish-home">发布到房间</a></div>
            <h1>我进入了自己的数字房间。</h1>
            <p class="lede">${state.profile.welcome} 这里把主页、日记、照片、心情、时间、思想和 AI 记忆连接在一起，让每一天都能被温柔地整理。</p>
            <div class="tag-row">${state.profile.keywords.map(pill).join('')}</div>
          </div>
          <aside class="hero-side hero-side-right" aria-label="房间概览">
            <div class="hero-mini-card"><strong>${state.diaries.length}</strong><span>文字</span></div>
            <div class="hero-mini-card"><strong>${state.gallery.albums.length}</strong><span>照片</span></div>
            <div class="hero-mini-card"><strong>${state.mood.entries.length}</strong><span>心情</span></div>
          </aside>
        </article>
      </div>
      <div class="grid-3">${todayMoodCard()}${latestDiaryCard(state.diaries[0])}${nowPlayingCard()}</div>
      <section class="grid-2">${recentPhotosCard()}${timeCapsuleCard()}</section>
      <section class="grid-2">${state.notes.items.map(noteCard).join('')}</section>
      <section class="stat-grid">${statCards()}</section>
    </section>
  `,
  diary: () => `
    <section class="page">
      ${pageHeader('我的日记', '每一篇文字都可以删除。删除会先在本机隐藏；配置 GitHub 后会同步更新 data/diary/index.json。', 'diary')}
      <div class="grid-2">${state.diaries.map(diaryCard).join('') || emptyState('还没有日记。')}</div>
    </section>
  `,
  gallery: () => `
    <section class="page gallery-page">${pageHeader('照片档案', 'Apple Photos 风格瀑布流。真实图片可放入 data/gallery 并在索引中登记 thumbnail / original。', 'gallery')}<div class="masonry">${state.gallery.albums.map(photoCard).join('') || emptyState('还没有照片。')}</div></section>
  `,
  mood: () => `
    <section class="page">
      ${pageHeader('心情系统', 'Emoji + 色彩 + 数值，生成月度与年度情绪报告。', 'mood')}
      <div class="grid-2">${todayMoodCard(true)}<article class="card glass glass-l2"><h2>年度情绪回声</h2><p>${state.mood.yearSummary}</p></article></div>
      <article class="card glass glass-l2"><h2>月度心情曲线</h2><div class="mood-chart">${moodMonthlyValues().map((value, index) => `<span class="bar" title="${index + 1}月 ${value}" style="height:${Math.max(8, Number(value) || 0) * 1.8}px"></span>`).join('')}</div></article>
      <div class="grid-2">${state.mood.entries.map(moodEntryCard).join('') || emptyState('还没有心情记录。')}</div>
    </section>
  `,
  timeline: () => `<section class="page">${pageHeader('我的时间', '垂直时间线，用玻璃圆点串起日记、照片、旅行、知识和时间胶囊。', 'timeline')}<article class="card glass glass-l2 timeline"><div>${state.timeline.events.map(timelineItem).join('') || emptyState('时间线还是空的。')}</div></article></section>`,
  knowledge: () => `<section class="page">${pageHeader('第二大脑', '知识节点从概念出发，经过关联、资料与思考，形成一座 3D 星系。', 'knowledge')}<article class="card glass glass-l2 knowledge-stage">${knowledgeLines()}${state.knowledge.nodes.map((node, index) => `<div class="star glass glass-l1" data-item-id="${escapeAttr(node.id)}" style="left:${node.x}%;top:${node.y}%;animation-delay:${index * -1.1}s"><strong>${escapeHtml(node.label)}</strong><button class="danger-button compact" type="button" data-action="delete-item" data-type="knowledge" data-id="${escapeHtml(node.id)}">删除</button></div>`).join('')}</article></section>`,
  map: () => `<section class="page">${pageHeader('地图系统', 'Apple Maps 风格：柔和地图、紫色轨迹和玻璃信息窗。', 'map')}<article class="card glass glass-l2 map-stage"><div class="map-canvas"><span class="trail"></span>${state.map.pins.map(mapPin).join('')}</div></article></section>`,
  capsule: () => `<section class="page">${pageHeader('时间胶囊', '让时间负责故事。封存此刻，交给未来的某一天打开。', 'capsule')}<div class="capsule-grid grid-3">${state.capsule.items.map(capsuleCard).join('') || emptyState('还没有时间胶囊。')}</div></section>`,
  ai: () => `
    <section class="page">
      ${pageHeader('浮光 AI', '读取日记、照片描述、标签与时间，提供过去的自己、兴趣变化、人生总结与关键词分析。', 'ai')}
      <article class="card glass glass-l3"><h2>本月回声</h2><p id="pageAiOutput">${generateMemoryEcho()}</p><button class="liquid-button" data-action="regen-ai">重新生成</button></article>
      <div class="grid-2">${state.aiEchoes.map(aiEchoCard).join('')}</div>
      <div class="grid-3"><article class="card glass glass-l1"><h3>过去的自己</h3><p>你在安静的夜晚更容易写下完整的感受。</p></article><article class="card glass glass-l1"><h3>兴趣变化</h3><p>摄影与知识整理正在连接，照片逐渐成为概念的入口。</p></article><article class="card glass glass-l1"><h3>关键词</h3><div class="tag-row">${['月光', '河流', '书桌', '光', '记忆'].map(pill).join('')}</div></article></div>
    </section>
  `,
  settings: () => `
    <section class="page">
      ${pageHeader('设置与数据', '所有数据可托管于 GitHub。公开内容直接展示，私密内容建议 AES-GCM 本地加密后再上传。')}
      <div class="settings-grid">
        <form class="card glass glass-l2" id="githubForm">
          <h2>GitHub 同步</h2><p class="muted">填写仓库和 Fine-grained Token 后，发布、删除和同步会直接写入 GitHub 仓库的 <code>data/</code> 目录。Token 只保存在当前浏览器，不要提交到仓库。</p>
          <label>Owner<input name="owner" placeholder="github 用户名" value="${escapeHtml(getConfig().owner || '')}"></label>
          <label>Repo<input name="repo" placeholder="仓库名" value="${escapeHtml(getConfig().repo || '')}"></label>
          <label>Branch<input name="branch" placeholder="main" value="${escapeHtml(getConfig().branch || 'main')}"></label>
          <label>Token<input name="token" type="password" placeholder="fine-grained token，需 Contents 读写权限" value="${escapeHtml(getConfig().token || '')}" autocomplete="current-password"></label>
          <div class="form-grid"><button class="liquid-button" type="submit">保存同步设置</button><button class="ghost-button" type="button" data-action="sync-all">同步本机数据到 GitHub</button></div>
          <p class="muted">当前身份：${state.adminMode ? '管理员' : '访客'}。管理员可以发布、删除和同步；访客只能浏览。</p>
          ${state.adminMode ? '<button class="ghost-button" type="button" data-action="leave-admin">退出管理模式</button>' : '<button class="ghost-button" type="button" data-action="open-auth">进入管理模式</button>'}
          <pre class="ai-output" id="syncOutput">如果另一台手机看不到内容，先点这里补传本机数据，并等待 GitHub Pages 完成部署。</pre>
        </form>
        <article class="card glass glass-l2">
          <h2>AES-256 私密文本</h2><p>浏览器 WebCrypto 使用 AES-GCM 256 位密钥。私密日记可先在本地加密，再上传到私密仓库或公开仓库的 encrypted 目录。</p>
          <label>待加密文本<textarea id="secretText" rows="5" placeholder="写下私密内容"></textarea></label><label>密码<input id="secretPass" type="password" placeholder="只记在你心里"></label>
          <div class="form-grid"><button class="liquid-button" data-action="encrypt" type="button">本地加密</button><button class="ghost-button" data-action="decrypt" type="button">本地解密</button></div><pre class="ai-output" id="cryptoOutput"></pre>
        </article>
      </div>
    </section>
  `
};

Object.keys(publishSpaces).forEach((space) => {
  pages[`publish-${space}`] = () => publishPage(space);
});

function pageHeader(title, text, space) {
  const action = space && publishSpaces[space]
    ? `<a class="liquid-button publish-only" href="#publish-${space}">发布到${publishSpaces[space].label}</a>`
    : '';
  return `<header class="card glass glass-l2"><div class="card-toolbar"><span class="kicker">浮光 · Personal Space</span>${action}</div><h1>${title}</h1><p class="lede">${text}</p></header>`;
}

function moodMonthlyValues() {
  const monthly = Array.isArray(state.mood?.monthly) ? state.mood.monthly.slice(0, 12) : [];
  const buckets = Array.from({ length: 12 }, () => []);
  for (const entry of state.mood?.entries || []) {
    const month = Number(String(entry.date || '').slice(5, 7)) - 1;
    if (month >= 0 && month < 12) buckets[month].push(clampNumber(entry.value, 0, 100, 0));
  }
  const hasEntries = buckets.some((values) => values.length);
  if (!hasEntries && monthly.length === 12) return monthly.map((value) => clampNumber(value, 0, 100, 0));
  return buckets.map((values, index) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : clampNumber(monthly[index], 0, 100, 0));
}

function todayMoodCard(expanded = false) {
  const mood = state.mood.latest;
  const id = moodId(mood);
  return `<article class="card glass glass-l2 mood-card"><div class="card-toolbar"><span class="kicker">今日心情</span>${mood.label !== '未记录' ? `<button class="danger-button" type="button" data-action="delete-item" data-type="mood" data-id="${escapeHtml(id)}">删除</button>` : ''}</div><h2>${mood.emoji} ${escapeHtml(mood.label)}</h2><p class="muted">${mood.time} · ${escapeHtml(mood.weather)} · ${escapeHtml(mood.location)}</p><strong style="font-size:36px">${mood.value}</strong><span class="pill">Mood Value / 100</span>${expanded ? '<p>平静不是没有波动，而是你正在学会让波动经过。</p>' : ''}</article>`;
}

function latestDiaryCard(diary) {
  if (!diary) return `<article class="card glass glass-l2 diary-card"><span class="kicker">最新日记</span><h2>还没有文章</h2><p class="muted">发布后会出现在这里，也可以随时删除。</p></article>`;
  return `<article class="card glass glass-l2 diary-card"><div class="card-toolbar"><span class="kicker">最新日记</span><button class="danger-button" type="button" data-action="delete-item" data-type="diary" data-id="${escapeHtml(diary.id)}">删除</button></div><h2>${escapeHtml(diary.title)}</h2><p>${escapeHtml(diary.excerpt)}…</p><div class="diary-meta"><span class="pill">${formatDate(diary.date)}</span><span class="pill">${diary.mood}</span><span class="pill">📍 ${escapeHtml(diary.location)}</span></div></article>`;
}

function nowPlayingCard() {
  const track = state.music.tracks[state.music.nowPlaying];
  if (!track) return `<article class="card glass glass-l2"><span class="kicker">正在播放</span><h2>暂无歌曲</h2><p class="muted">上传你的音乐后会出现在这里。</p></article>`;
  return `<article class="card glass glass-l2"><div class="card-toolbar"><span class="kicker">正在播放</span><button class="danger-button" type="button" data-action="delete-item" data-type="music" data-id="${escapeHtml(track.id)}">删除</button></div><h2>${escapeHtml(track.title)}</h2><p class="muted">${escapeHtml(track.artist || '上传你的音乐')} · ${escapeHtml(track.mood || '无损歌单')}</p><div class="progress"><span style="width:46%"></span></div></article>`;
}

function recentPhotosCard() {
  const photos = state.gallery.albums.slice(0, 3);
  return `<article class="card glass glass-l2"><span class="kicker">最近照片</span><h2>最近的光</h2><div class="grid-3">${photos.map(photoThumb).join('') || emptyState('还没有照片。')}</div></article>`;
}

function timeCapsuleCard() {
  const next = state.capsule.items[0];
  if (!next) return `<article class="card glass glass-l2"><span class="kicker">时间胶囊</span><h2>还没有胶囊</h2><p class="muted">封存后会出现在这里。</p></article>`;
  return `<article class="card glass glass-l2"><div class="card-toolbar"><span class="kicker">时间胶囊</span><button class="danger-button" type="button" data-action="delete-item" data-type="capsule" data-id="${escapeHtml(capsuleId(next))}">删除</button></div><h2>${escapeHtml(next.title)}</h2><p>${escapeHtml(next.preview)}</p><span class="pill">${next.unlock} 开启</span></article>`;
}

function statCards() {
  const labels = [['居住天数', residencyDays()], ['日记', state.diaries.length], ['照片', state.gallery.albums.length], ['心情记录', state.mood.entries.length]];
  return labels.map(([label, value]) => `<article class="card glass glass-l1"><span class="kicker">${label}</span><h2>${value}</h2></article>`).join('');
}

function residencyDays() {
  const since = state.profile?.stats?.since || '2019-02-17';
  const parts = String(since).split('-').map(Number);
  const year = parts[0] || 2019;
  const month = (parts[1] || 2) - 1;
  const day = parts[2] || 17;
  const start = Date.UTC(year, month, day);
  const today = new Date();
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
}

function diaryCard(diary) {
  return `<article class="card glass glass-l2 diary-card" data-diary-id="${escapeHtml(diary.id)}" data-item-id="${escapeAttr(diary.id)}"><div class="card-toolbar"><span class="pill">${formatDate(diary.date)}</span><button class="danger-button" type="button" data-action="delete-item" data-type="diary" data-id="${escapeHtml(diary.id)}">删除</button></div><h2>${escapeHtml(diary.title)}</h2><div class="diary-content">${markdownToHtml(diary.content)}</div><div class="footer-meta"><span class="pill">${diary.mood}</span><span class="pill">📍 ${escapeHtml(diary.location)}</span><span class="pill">🎵 ${escapeHtml(diary.music)}</span>${diary.tags.map(pill).join('')}</div></article>`;
}

function photoDisplaySrc(photo) {
  return photo?.objectUrl || photo?.src || photo?.path || photo?.thumbnail || '';
}

function photoCandidates(photo) {
  const seen = new Set();
  const list = [];
  const add = (value) => {
    const src = String(value || '').trim();
    if (!src || seen.has(src)) return;
    seen.add(src);
    list.push(src);
  };
  add(photo?.objectUrl);
  add(photo?.src);
  add(photo?.path);
  add(photo?.thumbnail);
  const repoPath = repoFilePath(photo?.path || photo?.src || photo?.thumbnail);
  if (repoPath) add(appPath(repoPath));
  return list;
}

function photoMarkup(photo, options = {}) {
  const src = photoDisplaySrc(photo);
  const candidates = photoCandidates(photo);
  const sizeClass = options.sizeClass ?? photo.size ?? 'square';
  const classes = ['photo', sizeClass, options.fit === 'contain' ? 'photo-contain' : ''].filter(Boolean).join(' ');
  const ratio = Number(photo.aspectRatio || 0);
  const aspect = options.aspect === 'auto' && ratio > 0 ? `aspect-ratio:${ratio};--photo-ratio:${ratio};` : '';
  const minHeight = options.minHeight ? `min-height:${options.minHeight};` : '';
  const caption = options.captionHtml || escapeHtml(photo.title);
  return `<button class="${escapeAttr(classes)}" data-photo="${escapeAttr(photo.id)}" style="${minHeight}${aspect}border:0;background-image:${gradient(photo.palette)}"><img class="photo-image" alt="${escapeAttr(photo.title)}" src="${escapeAttr(resolveMediaSrc(src))}" data-photo-id="${escapeAttr(photo.id)}" data-fit="${escapeAttr(options.fit || 'cover')}" data-src-candidates="${escapeAttr(JSON.stringify(candidates))}" loading="lazy"><span>${caption}</span></button>`;
}

function photoThumb(photo) {
  return `<div class="photo-card" data-item-id="${escapeAttr(photo.id)}">${photoMarkup(photo, { sizeClass: '', minHeight: '120px', aspect: 'auto' })}<button class="danger-button compact overlay-delete" type="button" data-action="delete-item" data-type="photo" data-id="${escapeAttr(photo.id)}">删除</button></div>`;
}

function photoCard(photo) {
  return `<div class="photo-card ${escapeAttr(photo.size || 'square')}" data-item-id="${escapeAttr(photo.id)}">${photoMarkup(photo, { aspect: 'auto', captionHtml: `<strong>${escapeHtml(photo.title)}</strong><br><small>${escapeHtml(photo.caption)}</small>` })}<button class="danger-button compact overlay-delete" type="button" data-action="delete-item" data-type="photo" data-id="${escapeAttr(photo.id)}">删除</button></div>`;
}

function moodEntryCard(entry) {
  const id = moodId(entry);
  return `<article class="card glass glass-l1" data-item-id="${escapeAttr(id)}"><div class="card-toolbar"><h3>${entry.emoji} ${escapeHtml(entry.label)}</h3><button class="danger-button compact" type="button" data-action="delete-item" data-type="mood" data-id="${escapeHtml(id)}">删除</button></div><p class="muted">${entry.date} · ${escapeHtml(entry.location)} · ${escapeHtml(entry.weather)}</p><strong>${entry.value}/100</strong></article>`;
}

function timelineItem(event) {
  const id = timelineId(event);
  return `<div class="timeline-item" data-item-id="${escapeAttr(id)}"><div class="card-toolbar"><span class="pill">${event.date}</span><button class="danger-button compact" type="button" data-action="delete-item" data-type="timeline" data-id="${escapeHtml(id)}">删除</button></div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.summary)}</p><small class="muted">${escapeHtml(event.kind)}</small></div>`;
}

function capsuleCard(item) {
  const id = capsuleId(item);
  const open = isCapsuleOpen(item);
  return `<article class="card glass ${open ? 'glass-l2' : 'glass-l1'}" data-item-id="${escapeAttr(id)}"><div class="card-toolbar"><span class="pill">${open ? '已开启' : '封存中'}</span><button class="danger-button compact" type="button" data-action="delete-item" data-type="capsule" data-id="${escapeHtml(id)}">删除</button></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(open ? (item.content || item.preview) : item.preview)}</p><p class="muted">开启时间：${item.unlock}</p></article>`;
}

function isCapsuleOpen(item) {
  if (item.status === 'open') return true;
  const unlock = String(item.unlock || '');
  return Boolean(unlock && unlock <= new Date().toISOString().slice(0, 10));
}

function emptyState(text) {
  return `<article class="card glass glass-l1"><p class="muted">${text}</p></article>`;
}

function noteCard(note) {
  return `<article class="card glass glass-l2" data-item-id="${escapeAttr(note.id)}"><div class="card-toolbar"><span class="kicker">房间便签</span><button class="danger-button compact" type="button" data-action="delete-item" data-type="note" data-id="${escapeHtml(note.id)}">删除</button></div><h2>${escapeHtml(note.title)}</h2><p>${escapeHtml(note.content)}</p><p class="muted">${note.date}</p></article>`;
}

function mapPin(pin) {
  return `<span class="pin glass glass-l2" data-item-id="${escapeAttr(pin.id)}" style="left:${Number(pin.left) || 24}%;top:${Number(pin.top) || 36}%">${escapeHtml(pin.label)}<button class="danger-button compact overlay-delete" type="button" data-action="delete-item" data-type="map" data-id="${escapeHtml(pin.id)}">删除</button></span>`;
}

function aiEchoCard(item) {
  return `<article class="card glass glass-l1" data-item-id="${escapeAttr(item.id)}"><div class="card-toolbar"><h3>${escapeHtml(item.title)}</h3><button class="danger-button compact" type="button" data-action="delete-item" data-type="ai" data-id="${escapeHtml(item.id)}">删除</button></div><p>${escapeHtml(item.content)}</p><p class="muted">${item.date}</p></article>`;
}

function currentPublishSpace() {
  const route = state.route.startsWith('publish-') ? state.route.replace('publish-', '') : state.route;
  return publishSpaces[route] ? route : 'home';
}

function publishPage(space) {
  const spec = publishSpaces[space];
  const hasGithub = hasSyncBackend();
  return `
    <section class="page">
      ${pageHeader(`发布到${spec.label}`, spec.hint)}
      <form class="card glass glass-l2 publish-form" id="spacePublishForm" data-space="${space}">
        ${publishFields(space)}
        <label>同步到 GitHub
          <select name="sync">
            <option value="github" ${hasGithub ? 'selected' : ''}>保存并上传 GitHub</option>
            <option value="local" ${hasGithub ? '' : 'selected'}>先保存到本机</option>
          </select>
        </label>
        <p class="muted">${hasGithub ? '已检测到 GitHub 配置，本次发布会默认同步；若只想存在本机，请改选本机。' : '未检测到完整 GitHub 配置，默认只保存在本机。'}</p>
        <menu>
          <a class="ghost-button" href="#${spec.back}">返回</a>
          <button class="liquid-button" type="submit">发布</button>
        </menu>
      </form>
    </section>
  `;
}

function publishFields(space) {
  const today = new Date().toISOString().slice(0, 10);
  if (space === 'home') return `
    <label>标题<input name="title" required placeholder="给这个房间留下一句什么？"></label>
    <label>内容<textarea name="content" rows="5" placeholder="会出现在首页的便签。"></textarea></label>
  `;
  if (space === 'diary') return `
    <label>标题<input name="title" required placeholder="今天发生了什么？"></label>
    <label>内容<textarea name="content" rows="6" placeholder="写下一段会被未来的你感谢的话。"></textarea></label>
    <label>心情<select name="mood"><option>🌙 平静</option><option>🌸 温柔</option><option>☀️ 明亮</option><option>🌧️ 低落</option><option>🔥 专注</option></select></label>
    <div class="form-grid"><label>地点<input name="location" placeholder="例如：岷县"></label><label>标签<input name="tags" placeholder="逗号分隔"></label></div>
  `;
  if (space === 'gallery') return `
    <label>标题<input name="title" required placeholder="这张照片叫什么？"></label>
    <label>说明<textarea name="caption" rows="3" placeholder="写下这张照片的光。"></textarea></label>
    <div class="form-grid"><label>地点<input name="place" placeholder="拍摄地点"></label><label>日期<input name="date" type="date" value="${today}"></label></div>
    <label>照片文件<input name="file" type="file" accept="image/*" required></label>
    <p class="muted">安全限制：仅允许图片，且必须小于 100MB；本机大图会保存到 IndexedDB，不写入 localStorage。GitHub Contents API 对大文件可能失败，失败时本机仍会保留。</p>
  `;
  if (space === 'mood') return `
    <label>心情<select name="mood"><option>🌙 平静</option><option>🌸 温柔</option><option>☀️ 明亮</option><option>🌧️ 低落</option><option>🔥 专注</option></select></label>
    <label>数值 0-100<input name="value" type="number" min="0" max="100" value="72" required></label>
    <div class="form-grid"><label>天气<input name="weather" placeholder="例如：薄雾"></label><label>地点<input name="location" placeholder="例如：岷县"></label></div>
  `;
  if (space === 'timeline') return `
    <label>标题<input name="title" required placeholder="这一刻叫什么？"></label>
    <label>摘要<textarea name="summary" rows="4" placeholder="用一两句话记住它。"></textarea></label>
    <div class="form-grid"><label>日期<input name="date" type="date" value="${today}"></label><label>类型<input name="kind" placeholder="日记 / 旅行 / 照片 / 思想"></label></div>
  `;
  if (space === 'knowledge') return `
    <label>节点名称<input name="label" required placeholder="例如：月光"></label>
    <div class="form-grid"><label>横向位置 %<input name="x" type="number" min="4" max="86" value="${18 + (state.knowledge.nodes.length * 9) % 70}"></label><label>纵向位置 %<input name="y" type="number" min="8" max="78" value="${16 + (state.knowledge.nodes.length * 13) % 60}"></label></div>
    <label>关联已有节点
      <select name="link">${['', ...state.knowledge.nodes.map((node) => node.id)].map((id) => `<option value="${escapeHtml(id)}">${id ? escapeHtml(state.knowledge.nodes.find((node) => node.id === id)?.label || id) : '不关联'}</option>`).join('')}</select>
    </label>
  `;
  if (space === 'map') return `
    <label>地点名称<input name="label" required placeholder="例如：洮河岸 · 风"></label>
    <div class="form-grid"><label>横向位置 %<input name="left" type="number" min="8" max="86" value="48"></label><label>纵向位置 %<input name="top" type="number" min="8" max="78" value="42"></label></div>
  `;
  if (space === 'capsule') return `
    <label>标题<input name="title" required placeholder="给未来的一封信"></label>
    <label>预览<textarea name="preview" rows="3" placeholder="现在只能看见这一小段。"></textarea></label>
    <label>完整内容<textarea name="content" rows="5" placeholder="写给未来自己的正文；到开启日期后显示。"></textarea></label>
    <label>开启日期<input name="unlock" type="date" value="${today}"></label>
  `;
  return `
    <label>标题<input name="title" required placeholder="这段回声叫什么？"></label>
    <label>内容<textarea name="content" rows="5" placeholder="写下你想让浮光记住的话。"></textarea></label>
  `;
}

function knowledgeLines() {
  const nodes = state.knowledge.nodes;
  return `<svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;opacity:.34">${nodes.flatMap((node) => (node.links || []).map((id) => {
    const target = nodes.find((item) => item.id === id);
    return target ? `<line x1="${Number(node.x) + 8}" y1="${Number(node.y) + 8}" x2="${Number(target.x) + 8}" y2="${Number(target.y) + 8}" stroke="currentColor" stroke-width=".22"/>` : '';
  })).join('')}</svg>`;
}

function bindRouteEvents() {
  $$('[data-photo]').forEach((button) => button.addEventListener('click', () => openPhoto(button.dataset.photo)));
  $$('[data-action="delete-item"]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    deletePublishedItem(button.dataset.type, button.dataset.id);
  }));
  $('#spacePublishForm')?.addEventListener('submit', handleSpacePublish);
  $('[data-action="regen-ai"]')?.addEventListener('click', () => $('#pageAiOutput').textContent = generateMemoryEcho());
  $('#githubForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    const config = {
      owner: String(data.owner || '').trim(),
      repo: String(data.repo || '').trim(),
      branch: String(data.branch || 'main').trim() || 'main',
      token: String(data.token || '').trim()
    };
    writeLocalJson(STORAGE_KEYS.github, config);
    try {
      if (submit) {
        submit.disabled = true;
        submit.dataset.originalText = submit.textContent;
        submit.textContent = '验证中…';
      }
      if (!hasGithubConfig()) throw new Error('Owner / Repo / Token 还不完整');
      await verifyGithubAccess(config);
      setAdminMode(true);
      await loadData();
      renderRoute();
      toast('GitHub 同步设置已保存，已进入管理模式。');
    } catch (error) {
      toast(`同步设置已保存，但未能进入管理模式：${error.message}`);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = submit.dataset.originalText || '保存同步设置';
      }
    }
  });
  $('[data-action="sync-all"]')?.addEventListener('click', syncAllLocalToGithub);
  $('[data-action="encrypt"]')?.addEventListener('click', encryptSecretText);
  $('[data-action="decrypt"]')?.addEventListener('click', decryptSecretText);
  $('[data-action="leave-admin"]')?.addEventListener('click', async () => {
    setAdminMode(false);
    await loadData();
    toast('已退出管理模式，当前是访客浏览。');
    renderRoute();
  });
  $('[data-action="open-auth"]')?.addEventListener('click', () => $('#authDialog')?.showModal());
}

async function handleSpacePublish(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const space = form.dataset.space;
  const data = new FormData(form);
  try {
    if (submit) {
      submit.disabled = true;
      submit.dataset.originalText = submit.textContent;
      submit.textContent = '发布中…';
    }
    if (!state.adminMode) throw new Error('当前是访客模式，不能发布。请填写 GitHub Token 进入管理模式。');
    const syncGithub = data.get('sync') === 'github';
    if (syncGithub && !hasGithubConfig()) throw new Error('请先在登录框或设置页填写 GitHub Owner / Repo / Token');
    const published = await publishToSpace(space, data, syncGithub);
    const back = publishSpaces[space].back;
    if (published?.id) markPublished(back, published.id);
    toast(published?.syncWarning || (syncGithub ? '已发布并同步到 GitHub。' : '已安全保存到本机。'));
    form.reset();
    if (location.hash === `#${back}`) renderRoute();
    else location.hash = `#${back}`;
  } catch (error) {
    toast(`发布失败：${error.message}`);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = submit.dataset.originalText || '发布';
    }
  }
}

async function publishToSpace(space, data, syncGithub) {
  if (space === 'home') return publishRoomNote(data, syncGithub);
  if (space === 'diary') return publishDiary(data, syncGithub);
  if (space === 'gallery') return publishPhoto(data, syncGithub);
  if (space === 'mood') return publishMood(data, syncGithub);
  if (space === 'timeline') return publishTimeline(data, syncGithub);
  if (space === 'knowledge') return publishKnowledge(data, syncGithub);
  if (space === 'map') return publishMapPin(data, syncGithub);
  if (space === 'capsule') return publishCapsule(data, syncGithub);
  if (space === 'ai') return publishAiEcho(data, syncGithub);
  throw new Error('未知发布空间');
}

function openPhoto(id) {
  const photo = state.gallery.albums.find((item) => item.id === id);
  if (!photo) return;
  let viewer = $('.viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.className = 'viewer';
    viewer.innerHTML = '<article class="viewer-card card glass glass-l4"></article>';
    document.body.appendChild(viewer);
    viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.classList.remove('is-open'); });
  }
  $('.viewer-card', viewer).innerHTML = `${photoMarkup(photo, { sizeClass: 'viewer-photo', fit: 'contain', aspect: 'auto' })}<h2>${escapeHtml(photo.title)}</h2><p>${escapeHtml(photo.caption)}</p><p class="muted">${escapeHtml(photo.date)} · ${escapeHtml(photo.place)}</p><button class="liquid-button" type="button">关闭</button>`;
  $('.viewer-card .liquid-button', viewer).addEventListener('click', () => viewer.classList.remove('is-open'));
  hydrateVisiblePhotos(viewer);
  viewer.classList.add('is-open');
}

function bindPlayerEvents() {
  const audio = $('#audioElement');
  $$('[data-player-action]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (button.dataset.playerAction === 'play') togglePlayback();
    if (button.dataset.playerAction === 'prev') skipTrack(-1);
    if (button.dataset.playerAction === 'next') skipTrack(1);
  }));
  $('#musicUpload')?.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    try {
      if (files.length) await addUploadedTracks(files, $('#musicSyncGithub')?.checked);
    } catch (error) {
      toast(`音乐上传失败：${error.message}`);
    }
    event.target.value = '';
  });
  audio?.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    $('#playerProgress span').style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  });
  audio?.addEventListener('ended', () => skipTrack(1));
  audio?.addEventListener('play', () => $('[data-player-action="play"]').textContent = '❚❚');
  audio?.addEventListener('pause', () => $('[data-player-action="play"]').textContent = '▶');
}

function updatePlayer() {
  const tracks = state.music?.tracks || [];
  if (!tracks.length) {
    $('#trackTitle').textContent = '暂无歌曲';
    $('#panelTrackTitle').textContent = '暂无歌曲';
    $('#trackArtist').textContent = '上传一首无损音乐开始播放';
    $('#trackMeta').textContent = '支持 FLAC / WAV / AIFF / ALAC / M4A / APE / DSF';
    $('#trackList').innerHTML = '<p class="muted">歌单还是空的。</p>';
    return;
  }
  if (state.music.nowPlaying >= tracks.length) state.music.nowPlaying = 0;
  const track = tracks[state.music.nowPlaying];
  $('#trackTitle').textContent = track.title;
  $('#panelTrackTitle').textContent = track.title;
  $('#trackArtist').textContent = `${track.artist || '未知艺术家'} · ${track.duration || '无损'}`;
  $('#trackMeta').textContent = `${formatLabel(track.format)} · ${formatBytes(track.size)}`;
  $('#trackList').innerHTML = tracks.map((item, index) => `<div class="track-row ${index === state.music.nowPlaying ? 'is-active' : ''}"><button class="track-item" type="button" data-track-index="${index}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.artist || '未知艺术家')} · ${escapeHtml(formatLabel(item.format))}</small></button><button class="danger-button compact" type="button" data-action="delete-item" data-type="music" data-id="${escapeHtml(item.id)}">删除</button></div>`).join('');
  $$('[data-track-index]').forEach((button) => button.addEventListener('click', () => playTrack(Number(button.dataset.trackIndex))));
  $$('#trackList [data-action="delete-item"]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    deletePublishedItem(button.dataset.type, button.dataset.id);
  }));
  const audio = $('#audioElement');
  const src = resolveTrackSrc(track);
  if (audio && src && audio.dataset.src !== src) {
    audio.src = src;
    audio.dataset.src = src;
    $('#playerProgress span').style.width = '0%';
  }
}

function resolveTrackSrc(track) {
  if (track.objectUrl) return track.objectUrl;
  return resolveMediaSrc(track.src);
}

function playTrack(index) {
  if (!state.music.tracks[index]) return;
  state.music.nowPlaying = index;
  persistLocalTracks();
  updatePlayer();
  const audio = $('#audioElement');
  const src = resolveTrackSrc(state.music.tracks[index]);
  if (!src) return toast('这首歌还没有可播放文件。请上传音频，或把无损文件放到 data/music/files/。');
  audio.play().catch(() => toast('浏览器暂时无法播放这个格式；文件仍已加入歌单。推荐 FLAC / WAV / ALAC(M4A)。'));
}

function togglePlayback() {
  const audio = $('#audioElement');
  if (!audio.src) return playTrack(state.music.nowPlaying || 0);
  if (audio.paused) audio.play();
  else audio.pause();
}

function skipTrack(step) {
  const total = state.music.tracks.length;
  if (total) playTrack((state.music.nowPlaying + step + total) % total);
}

async function addUploadedTracks(files, syncGithub) {
  if (!state.adminMode) return toast('当前是访客模式，不能上传音乐。');
  if (syncGithub && !hasGithubConfig()) return toast('请先在登录框或设置页填写 GitHub Owner / Repo / Token。');
  const accepted = files.filter(isAudioFile);
  if (!accepted.length) return toast('请上传音频文件。推荐 FLAC / WAV / AIFF / ALAC / M4A。');
  const newTracks = [];
  for (const file of accepted) {
    const track = await createTrackFromFile(file);
    newTracks.push(track);
    state.music.tracks.unshift(track);
    if (syncGithub) {
      try {
        if (file.size >= GITHUB_FILE_LIMIT_BYTES) throw new Error('GitHub 单文件必须小于 100MB；大音乐可本机播放，但不能通过 GitHub Contents API 上传');
        await uploadBinaryToGithub(track.src, new Uint8Array(await file.arrayBuffer()), `Add music ${track.fileName}`);
        track.local = false;
        track.synced = true;
      } catch (error) {
        toast(`《${track.title}》已加入本机歌单，GitHub 上传失败：${error.message}`);
      }
    }
  }
  state.music.nowPlaying = 0;
  await persistAudioBlobs(newTracks, accepted);
  persistLocalTracks();
  if (syncGithub) {
    try {
      await persistMusicIndexToGithub();
    } catch (error) {
      toast(`音乐文件可能已上传，但歌单索引同步失败：${error.message}`);
    }
  }
  updatePlayer();
  playTrack(0);
  const syncedCount = newTracks.filter((track) => track.synced).length;
  toast(syncGithub ? `音乐已加入歌单；成功同步 ${syncedCount}/${newTracks.length} 首到 GitHub。` : '音乐已加入本机歌单。');
}

function isAudioFile(file) {
  return file.type.startsWith('audio/') || /\.(flac|wav|aiff|aif|alac|m4a|aac|ape|dsf|dff|ogg|opus|mp3)$/i.test(file.name);
}

async function createTrackFromFile(file) {
  const fileName = autoFileName(file);
  const objectUrl = URL.createObjectURL(file);
  const duration = await readAudioDuration(objectUrl);
  const format = guessFormat(file.name);
  return {
    id: `track-${Date.now()}-${Math.random().toString(36).slice(2)}-${slugify(file.name)}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    artist: '我的上传',
    mood: LOSSLESS_EXTS.includes(format.toLowerCase()) ? '无损' : '自选',
    duration,
    format,
    size: file.size,
    src: `data/music/files/${fileName}`,
    fileName,
    objectUrl,
    local: true
  };
}

function mergeLocalCollection(name, remote, key) {
  const local = readLocalJson(`fuguang.local.${name}`, []);
  const remoteItems = Array.isArray(remote?.[key]) ? remote[key] : [];
  const merged = [...local, ...remoteItems].filter((item, index, list) => {
    const id = item.id || `${name}-${index}`;
    return list.findIndex((candidate, candidateIndex) => (candidate.id || `${name}-${candidateIndex}`) === id) === index;
  });
  return { ...(remote || {}), [key]: merged };
}

function persistLocalCollection(name, items) {
  const list = Array.isArray(items) ? items : [];
  const payload = name === 'gallery'
    ? list.map(({ objectUrl, ...item }) => ({ ...item, src: item.local && item.storage === 'indexedDB' ? '' : item.src }))
    : list;
  writeLocalJson(`fuguang.local.${name}`, payload);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function createLocalId(prefix, seed) {
  return `${prefix}-${Date.now()}-${slugify(seed || prefix)}`;
}

function moodParts(value) {
  const text = cleanText(value, '✦ 未标记');
  const [emoji, ...rest] = text.split(' ');
  return { emoji: emoji || '✦', label: rest.join(' ') || text };
}

async function publishRoomNote(data, syncGithub) {
  const note = {
    id: createLocalId('note', data.get('title')),
    title: cleanText(data.get('title'), '未命名便签'),
    content: cleanText(data.get('content')),
    date: new Date().toISOString().slice(0, 10)
  };
  state.notes.items.unshift(note);
  persistLocalCollection('notes', state.notes.items);
  if (syncGithub) {
    try {
      await persistCollectionToGithub('note');
    } catch (error) {
      note.syncWarning = `便签已保存在本机，但 GitHub 同步失败：${error.message}`;
    }
  }
  return note;
}

async function publishDiary(data, syncGithub) {
  const draft = buildDraft(data);
  if (syncGithub) draft.visibility = 'public';
  saveLocalDraft(draft);
  if (syncGithub) {
    try {
      await uploadDraftToGithub(draft);
      await persistDiaryIndexToGithub();
    } catch (error) {
      draft.syncWarning = `文章已保存在本机，但 GitHub 同步失败：${error.message}`;
    }
  }
  return { ...draft, id: diaryId(draft) };
}

async function publishPhoto(data, syncGithub) {
  const file = data.get('file');
  if (!(file instanceof File) || !file.size) throw new Error('请选择一张图片');
  if (!file.type.startsWith('image/')) throw new Error('只允许上传图片文件');
  if (file.size >= 100 * 1024 * 1024) throw new Error('安全起见，照片必须小于 100MB');
  const filename = uniqueDataFileName(file, data.get('title') || file.name, 'data/gallery/originals');
  const photo = {
    id: createLocalId('photo', data.get('title') || file.name),
    title: cleanText(data.get('title'), '未命名照片'),
    caption: cleanText(data.get('caption')),
    place: cleanText(data.get('place'), '未知地点'),
    date: cleanText(data.get('date'), new Date().toISOString().slice(0, 10)),
    src: '',
    path: `data/gallery/originals/${filename}`,
    fileName: filename,
    fileSize: file.size,
    local: true,
    storage: 'indexedDB',
    size: 'square',
    palette: ['#d8c7ff', '#b8d9ff']
  };
  await putPhotoBlob(photo.id, file);
  photo.objectUrl = URL.createObjectURL(file);
  photo.src = photo.objectUrl;
  photo.aspectRatio = await readImageAspectRatio(file);
  photo.size = photoSizeFromRatio(photo.aspectRatio);
  state.objectUrls.set(photo.id, photo.objectUrl);
  state.gallery.albums.unshift(photo);
  persistLocalCollection('gallery', state.gallery.albums);
  if (syncGithub) {
    try {
      await uploadBinaryToGithub(photo.path, new Uint8Array(await file.arrayBuffer()), `Add photo ${filename}`);
      photo.synced = true;
      persistLocalCollection('gallery', state.gallery.albums);
      await persistCollectionToGithub('photo');
    } catch (error) {
      photo.syncWarning = `照片已保存在本机，但 GitHub 同步失败：${error.message}`;
    }
  }
  return photo;
}

async function publishMood(data, syncGithub) {
  const parts = moodParts(data.get('mood'));
  const entry = {
    id: createLocalId('mood', parts.label),
    emoji: parts.emoji,
    label: parts.label,
    value: clampNumber(data.get('value'), 0, 100, 72),
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    weather: cleanText(data.get('weather'), '未记录天气'),
    location: cleanText(data.get('location'), '未知地点')
  };
  state.mood.entries.unshift(entry);
  state.mood.latest = entry;
  rebuildMoodMonthly();
  persistLocalCollection('mood', state.mood.entries);
  if (syncGithub) {
    try { await persistCollectionToGithub('mood'); }
    catch (error) { entry.syncWarning = `心情已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return entry;
}

async function publishTimeline(data, syncGithub) {
  const event = {
    id: createLocalId('timeline', data.get('title')),
    title: cleanText(data.get('title'), '未命名时刻'),
    summary: cleanText(data.get('summary')),
    date: cleanText(data.get('date'), new Date().toISOString().slice(0, 10)),
    kind: cleanText(data.get('kind'), '记录')
  };
  state.timeline.events.unshift(event);
  persistLocalCollection('timeline', state.timeline.events);
  if (syncGithub) {
    try { await persistCollectionToGithub('timeline'); }
    catch (error) { event.syncWarning = `时间节点已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return event;
}

async function publishKnowledge(data, syncGithub) {
  const label = cleanText(data.get('label'), '未命名节点');
  const node = {
    id: createLocalId('node', label),
    label,
    x: clampNumber(data.get('x'), 4, 86, 42),
    y: clampNumber(data.get('y'), 8, 78, 36),
    links: state.knowledge.nodes.some((item) => item.id === cleanText(data.get('link'))) ? [cleanText(data.get('link'))] : []
  };
  state.knowledge.nodes.push(node);
  persistLocalCollection('knowledge', state.knowledge.nodes);
  if (syncGithub) {
    try { await persistCollectionToGithub('knowledge'); }
    catch (error) { node.syncWarning = `知识节点已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return node;
}

async function publishMapPin(data, syncGithub) {
  const pin = {
    id: createLocalId('pin', data.get('label')),
    label: cleanText(data.get('label'), '未命名地点'),
    left: clampNumber(data.get('left'), 8, 86, 48),
    top: clampNumber(data.get('top'), 8, 78, 42)
  };
  state.map.pins.push(pin);
  persistLocalCollection('map', state.map.pins);
  if (syncGithub) {
    try { await persistCollectionToGithub('map'); }
    catch (error) { pin.syncWarning = `地点已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return pin;
}

async function publishCapsule(data, syncGithub) {
  const item = {
    id: createLocalId('capsule', data.get('title')),
    title: cleanText(data.get('title'), '未命名胶囊'),
    preview: cleanText(data.get('preview')),
    content: cleanText(data.get('content')),
    unlock: cleanText(data.get('unlock'), new Date().toISOString().slice(0, 10)),
    status: 'sealed'
  };
  state.capsule.items.unshift(item);
  persistLocalCollection('capsule', state.capsule.items);
  if (syncGithub) {
    try { await persistCollectionToGithub('capsule'); }
    catch (error) { item.syncWarning = `胶囊已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return item;
}

async function publishAiEcho(data, syncGithub) {
  const item = {
    id: createLocalId('ai', data.get('title')),
    title: cleanText(data.get('title'), '未命名回声'),
    content: cleanText(data.get('content')),
    date: new Date().toISOString().slice(0, 10)
  };
  state.aiEchoes.unshift(item);
  persistLocalCollection('ai', state.aiEchoes);
  if (syncGithub) {
    try { await persistCollectionToGithub('ai'); }
    catch (error) { item.syncWarning = `回声已保存在本机，但 GitHub 同步失败：${error.message}`; }
  }
  return item;
}

async function hydrateLocalPhotos(gallery) {
  for (const photo of gallery.albums || []) {
    if (photo.objectUrl && !String(photo.objectUrl).startsWith('blob:')) {
      photo.objectUrl = '';
    }
    if (photo.objectUrl) continue;
    let blob = null;
    if (photo.storage === 'indexedDB' || photo.local) blob = await getPhotoBlob(photo.id);
    if (!blob) blob = await fetchGithubMediaBlob(photo.path || photo.src || photo.thumbnail);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    photo.objectUrl = url;
    state.objectUrls.set(photo.id, url);
  }
  return gallery;
}

function hydrateVisiblePhotos(root = document) {
  $$('.photo-image', root).forEach((image) => bindPhotoImage(image));
}

function bindPhotoImage(image) {
  if (!image || image.dataset.bound === 'true') return;
  image.dataset.bound = 'true';
  let candidates = [];
  try { candidates = JSON.parse(image.dataset.srcCandidates || '[]'); } catch { candidates = []; }
  if (!candidates.length && image.getAttribute('src')) candidates = [image.getAttribute('src')];
  let index = Math.max(0, candidates.indexOf(image.getAttribute('src')));
  const tryNext = async () => {
    index += 1;
    while (index < candidates.length) {
      const next = resolveMediaSrc(candidates[index]);
      if (next && next !== image.getAttribute('src')) {
        image.src = next;
        return;
      }
      index += 1;
    }
    const photo = state.gallery?.albums?.find((item) => item.id === image.dataset.photoId);
    if (!photo) return;
    if (!photo.objectUrl) {
      const blob = await fetchGithubMediaBlob(photo.path || photo.src || photo.thumbnail);
      if (blob) {
        const url = URL.createObjectURL(blob);
        photo.objectUrl = url;
        state.objectUrls.set(photo.id, url);
        image.src = url;
        $$('.photo-image').filter((node) => node.dataset.photoId === photo.id).forEach((node) => { node.src = url; });
      }
    }
  };
  image.addEventListener('load', () => applyPhotoNaturalSize(image));
  image.addEventListener('error', () => { tryNext(); });
  if (image.complete && image.naturalWidth > 0) applyPhotoNaturalSize(image);
  if (image.complete && image.naturalWidth === 0) tryNext();
}

function photoSizeFromRatio(ratio) {
  const value = Number(ratio) || 1;
  if (value >= 1.28) return 'wide';
  if (value <= 0.78) return 'tall';
  return 'square';
}

function readImageAspectRatio(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
      URL.revokeObjectURL(url);
      resolve(Number(ratio.toFixed(4)));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(1);
    };
    image.src = url;
  });
}

function applyPhotoNaturalSize(image) {
  const width = image.naturalWidth || 0;
  const height = image.naturalHeight || 0;
  if (!width || !height) return;
  const ratio = width / height;
  const button = image.closest('.photo');
  const card = image.closest('.photo-card');
  const photo = state.gallery?.albums?.find((item) => item.id === image.dataset.photoId);
  if (photo) {
    photo.aspectRatio = Number(ratio.toFixed(4));
    photo.size = photoSizeFromRatio(ratio);
  }
  if (button) {
    button.style.aspectRatio = `${width} / ${height}`;
    button.style.setProperty('--photo-ratio', String(ratio));
  }
  if (button?.classList.contains('viewer-photo')) return;
  if (card) {
    const size = photoSizeFromRatio(ratio);
    card.classList.toggle('wide', size === 'wide');
    card.classList.toggle('tall', size === 'tall');
    card.classList.toggle('square', size === 'square');
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function mergeLocalTracks(music) {
  const remoteTracks = (music?.tracks || []).map((track, index) => ({
    id: track.id || `remote-${index}-${slugify(track.title || 'track')}`,
    title: track.title || '未命名曲目',
    artist: track.artist || '未知艺术家',
    mood: track.mood || '',
    duration: track.duration || '',
    format: track.format || guessFormat(track.src || track.title),
    size: track.size || 0,
    src: track.src || '',
    local: false
  }));
  const localTracks = readLocalJson(STORAGE_KEYS.tracks, []);
  const merged = [...localTracks, ...remoteTracks].filter((track, index, list) => {
    const key = track.id || `${track.title}-${track.src}`;
    return list.findIndex((item) => (item.id || `${item.title}-${item.src}`) === key) === index;
  });
  return { nowPlaying: Number(music?.nowPlaying || 0), tracks: merged };
}

async function hydrateLocalTracks(music) {
  for (const track of music.tracks) {
    if (track.objectUrl) continue;
    let blob = null;
    if (track.local) blob = await getAudioBlob(track.id);
    if (!blob) blob = await fetchGithubMediaBlob(track.src);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    track.objectUrl = url;
    state.objectUrls.set(track.id, url);
  }
  return music;
}

async function persistAudioBlobs(tracks, files) {
  for (let i = 0; i < tracks.length; i += 1) {
    await putAudioBlob(tracks[i].id, files[i]);
  }
}

function persistLocalTracks() {
  const local = (state.music.tracks || [])
    .filter((track) => track.local || track.objectUrl)
    .map(({ objectUrl, ...track }) => ({ ...track, local: true }));
  writeLocalJson(STORAGE_KEYS.tracks, local);
}

function rebuildMoodMonthly() {
  if (!state.mood) return;
  state.mood.monthly = moodMonthlyValues();
}

async function persistMusicIndexToGithub() {
  const payload = {
    nowPlaying: state.music.nowPlaying || 0,
    tracks: state.music.tracks
      .filter((track) => !track.local || track.synced)
      .map(({ objectUrl, local, synced, ...track }) => track)
  };
  await uploadTextToGithub('data/music/tracks.json', JSON.stringify(payload, null, 2), 'Update music playlist');
}

function readAudioDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = src;
    audio.onloadedmetadata = () => resolve(formatDuration(audio.duration));
    audio.onerror = () => resolve('无损');
  });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '无损';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '未记录大小';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLabel(format) {
  return format ? String(format).toUpperCase() : 'AUDIO';
}

function buildDraft(form) {
  const date = new Date().toISOString().slice(0, 10);
  const title = cleanText(form.get('title'), '未命名记录');
  const content = cleanText(form.get('content'));
  const tags = cleanText(form.get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean);
  const filename = uniqueDiaryFilename(date, title);
  const draft = { title, content, tags, date, mood: cleanText(form.get('mood'), '✦ 未标记'), location: cleanText(form.get('location'), '未知地点'), music: '未选择音乐', visibility: 'draft', filename };
  draft.sourcePath = `data/diary/${draft.filename}`;
  // Use the filename rather than title alone so two same-day entries never overwrite each other.
  draft.id = `${date}-${slugify(filename.replace(/\.md$/i, ''))}`;
  draft.excerpt = content.slice(0, 92);
  return draft;
}

function uniqueDiaryFilename(date, title) {
  const base = `${date}-${slugify(title)}`;
  const taken = new Set([
    ...state.diaries.map((item) => item.sourcePath || item.filename || ''),
    ...readLocalJson(STORAGE_KEYS.drafts, []).map((item) => item.sourcePath || item.filename || '')
  ].map((value) => String(value).split('/').pop()));
  let candidate = `${base}.md`;
  let number = 2;
  while (taken.has(candidate)) candidate = `${base}-${number++}.md`;
  return candidate;
}

function saveLocalDraft(draft) {
  const id = diaryId(draft);
  const drafts = readLocalJson(STORAGE_KEYS.drafts, [])
    .filter((item) => diaryId(item) !== id);
  drafts.unshift(draft);
  writeLocalJson(STORAGE_KEYS.drafts, drafts);
  state.diaries = applyDiaryDeletions(dedupeDiaries([draft, ...state.diaries]));
}

function dedupeDiaries(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = diaryId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function diaryId(diary) {
  return diary.id || `${diary.date || 'undated'}-${slugify(diary.title || diary.filename || 'untitled')}`;
}

function getDeletedDiaryIds() {
  return readLocalJson(STORAGE_KEYS.deletedDiaries, []);
}

function applyDiaryDeletions(items) {
  const deleted = new Set(getDeletedDiaryIds());
  return items.filter((item) => !deleted.has(diaryId(item)));
}

function getHiddenIds(type) {
  return readLocalJson(`fuguang.hidden.${type}`, []);
}

function setHiddenIds(type, ids) {
  writeLocalJson(`fuguang.hidden.${type}`, [...ids]);
}

function hideId(type, id) {
  const ids = new Set(getHiddenIds(type));
  ids.add(id);
  setHiddenIds(type, ids);
}

function applyHiddenCollections() {
  const hiddenPhotos = new Set(getHiddenIds('photo'));
  const hiddenMoods = new Set(getHiddenIds('mood'));
  const hiddenTimeline = new Set(getHiddenIds('timeline'));
  const hiddenKnowledge = new Set(getHiddenIds('knowledge'));
  const hiddenCapsules = new Set(getHiddenIds('capsule'));
  const hiddenMusic = new Set(getHiddenIds('music'));
  state.gallery.albums = (state.gallery.albums || []).filter((item) => !hiddenPhotos.has(item.id));
  state.mood.entries = (state.mood.entries || []).filter((item) => !hiddenMoods.has(moodId(item)));
  if (state.mood.latest && hiddenMoods.has(moodId(state.mood.latest))) {
    state.mood.latest = state.mood.entries[0] || { emoji: '✦', label: '未记录', value: 0, time: '', weather: '', location: '' };
  }
  state.timeline.events = (state.timeline.events || []).filter((item) => !hiddenTimeline.has(timelineId(item)));
  state.knowledge.nodes = (state.knowledge.nodes || []).filter((item) => !hiddenKnowledge.has(item.id));
  state.capsule.items = (state.capsule.items || []).filter((item) => !hiddenCapsules.has(capsuleId(item)));
  const hiddenNotes = new Set(getHiddenIds('note'));
  const hiddenMap = new Set(getHiddenIds('map'));
  const hiddenAi = new Set(getHiddenIds('ai'));
  state.music.tracks = (state.music.tracks || []).filter((item) => !hiddenMusic.has(item.id));
  state.notes.items = (state.notes.items || []).filter((item) => !hiddenNotes.has(item.id));
  state.map.pins = (state.map.pins || []).filter((item) => !hiddenMap.has(item.id));
  state.aiEchoes = (state.aiEchoes || []).filter((item) => !hiddenAi.has(item.id));
}

function moodId(entry) {
  return entry.id || `${entry.date || 'mood'}-${slugify(entry.label || 'mood')}`;
}

function timelineId(event) {
  return event.id || `${event.date || 'event'}-${slugify(event.title || 'event')}`;
}

function capsuleId(item) {
  return item.id || `${item.unlock || 'capsule'}-${slugify(item.title || 'capsule')}`;
}

async function deletePublishedItem(type, id) {
  if (!state.adminMode) return toast('当前是访客模式，不能删除内容。');
  if (type === 'diary') return deleteDiary(id);
  const labels = { photo: '这张照片', mood: '这条心情', timeline: '这个时间节点', knowledge: '这个知识节点', capsule: '这个时间胶囊', music: '这首歌', note: '这条房间便签', map: '这个地图地点', ai: '这段 AI 回声' };
  if (!window.confirm(`删除${labels[type] || '这项内容'}？删除后本机不会再显示。`)) return;
  hideId(type, id);
  const pendingFileDeletes = [];
  if (type === 'photo') {
    const photo = state.gallery.albums.find((item) => item.id === id);
    if (photo?.objectUrl) URL.revokeObjectURL(photo.objectUrl);
    state.objectUrls.delete(id);
    state.gallery.albums = state.gallery.albums.filter((item) => item.id !== id);
    persistLocalCollection('gallery', state.gallery.albums);
    await deletePhotoBlob(id);
    const photoPath = repoFilePath(photo?.path || photo?.src);
    if (photoPath) pendingFileDeletes.push({ path: photoPath, message: `Delete photo ${photo.title}` });
  } else if (type === 'music') {
    const track = state.music.tracks.find((item) => item.id === id);
    if (track?.objectUrl) URL.revokeObjectURL(track.objectUrl);
    state.objectUrls.delete(id);
    await deleteAudioBlob(id);
    state.music.tracks = state.music.tracks.filter((item) => item.id !== id);
    persistLocalTracks();
    if (state.music.nowPlaying >= state.music.tracks.length) state.music.nowPlaying = 0;
    updatePlayer();
    const trackPath = repoFilePath(track?.src);
    if (trackPath) pendingFileDeletes.push({ path: trackPath, message: `Delete music ${track.title}` });
  } else if (type === 'note') {
    state.notes.items = state.notes.items.filter((item) => item.id !== id);
    persistLocalCollection('notes', state.notes.items);
  } else if (type === 'map') {
    state.map.pins = state.map.pins.filter((item) => item.id !== id);
    persistLocalCollection('map', state.map.pins);
  } else if (type === 'ai') {
    state.aiEchoes = state.aiEchoes.filter((item) => item.id !== id);
    persistLocalCollection('ai', state.aiEchoes);
  } else {
    applyHiddenCollections();
  }
  if (type === 'mood') rebuildMoodMonthly();
  renderRoute();
  if (!hasSyncBackend()) return toast('已在本机删除。');
  try {
    await persistCollectionToGithub(type);
    for (const file of pendingFileDeletes) await deleteGithubFile(file.path, file.message);
    toast('已删除并同步。');
  } catch (error) {
    toast(`本机已删除。GitHub 同步失败：${error.message}`);
  }
}

function repoFilePath(value) {
  const path = String(value || '').replace(/^\.?\//, '');
  if (!path || /^(blob:|data:|https?:)/i.test(path)) return '';
  if (path.startsWith('data/') || path.startsWith('assets/')) return path;
  return '';
}

async function persistCollectionToGithub(type) {
  if (!hasGithubConfig()) throw new Error('请先在登录框或设置页填写 GitHub Owner / Repo / Token');
  if (type === 'photo') {
    const payload = {
      ...state.gallery,
      albums: state.gallery.albums
        .filter((album) => !album.local || album.synced)
        .map(({ objectUrl, local, storage, synced, ...album }) => ({
          ...album,
          src: album.path || (/^(data:|blob:)/.test(String(album.src || '')) ? '' : album.src)
        }))
    };
    await uploadTextToGithub('data/gallery/gallery.json', JSON.stringify(payload, null, 2), 'Update gallery');
  }
  if (type === 'mood') {
    rebuildMoodMonthly();
    await uploadTextToGithub('data/mood/mood.json', JSON.stringify(state.mood, null, 2), 'Update mood');
  }
  if (type === 'timeline') await uploadTextToGithub('data/timeline/timeline.json', JSON.stringify(state.timeline, null, 2), 'Update timeline');
  if (type === 'knowledge') await uploadTextToGithub('data/knowledge/nodes.json', JSON.stringify(state.knowledge, null, 2), 'Update knowledge');
  if (type === 'capsule') await uploadTextToGithub('data/capsule/capsules.json', JSON.stringify(state.capsule, null, 2), 'Update capsules');
  if (type === 'music') await persistMusicIndexToGithub();
  if (type === 'note') await uploadTextToGithub('data/notes/notes.json', JSON.stringify(state.notes, null, 2), 'Update room notes');
  if (type === 'map') await uploadTextToGithub('data/map/map.json', JSON.stringify(state.map, null, 2), 'Update map pins');
  if (type === 'ai') await uploadTextToGithub('data/ai/echoes.json', JSON.stringify({ items: state.aiEchoes }, null, 2), 'Update AI echoes');
}

async function deleteDiary(id) {
  const diary = state.diaries.find((item) => diaryId(item) === id);
  if (!diary) return;
  if (!window.confirm(`删除《${diary.title}》？删除后本机不会再显示；如果配置了 GitHub，也会同步删除索引。`)) return;
  const deleted = new Set(getDeletedDiaryIds());
  deleted.add(id);
  writeLocalJson(STORAGE_KEYS.deletedDiaries, [...deleted]);
  const drafts = readLocalJson(STORAGE_KEYS.drafts, []).filter((item) => diaryId(item) !== id);
  writeLocalJson(STORAGE_KEYS.drafts, drafts);
  state.diaries = applyDiaryDeletions(state.diaries);
  renderRoute();
  try {
    await persistDiaryIndexToGithub();
    if (diary.sourcePath) await deleteGithubFile(diary.sourcePath, `Delete diary ${diary.title}`);
    toast('这篇文字已删除。');
  } catch (error) {
    toast(`本机已删除。GitHub 同步失败：${error.message}`);
  }
}

async function persistDiaryIndexToGithub() {
  if (!hasSyncBackend()) return;
  const payload = { items: state.diaries
    .filter((diary) => diary.visibility === 'public')
    .map((diary) => ({ id: diaryId(diary), title: diary.title, date: diary.date, mood: diary.mood, location: diary.location, music: diary.music, tags: diary.tags, visibility: diary.visibility, sourcePath: diary.sourcePath || '', content: diary.content })) };
  await uploadTextToGithub('data/diary/index.json', JSON.stringify(payload, null, 2), 'Update diary index');
}

async function uploadDraftToGithub(draft) {
  const path = `data/diary/${draft.filename}`;
  await uploadTextToGithub(path, diaryToMarkdown(draft), `Add diary ${draft.filename}`);
}

function diaryToMarkdown(diary) {
  return `---\ntitle: ${diary.title}\ndate: ${diary.date}\nmood: ${diary.mood}\nlocation: ${diary.location}\nmusic: ${diary.music}\ntags: [${diary.tags.join(', ')}]\nvisibility: ${diary.visibility}\n---\n\n${diary.content}\n`;
}

async function uploadTextToGithub(path, text, message) {
  const config = requireGithubConfig();
  const sha = await getGithubSha(config, path);
  const response = await fetch(githubContentUrl(config, path, { ref: false }), {
    method: 'PUT',
    headers: githubHeaders(config),
    body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(text))), branch: config.branch || 'main', ...(sha ? { sha } : {}) })
  });
  if (!response.ok) throw new Error(await githubErrorMessage(response));
  return response.json();
}

async function uploadBinaryToGithub(path, bytes, message) {
  if (bytes.byteLength >= GITHUB_FILE_LIMIT_BYTES) throw new Error('GitHub 单文件必须小于 100MB');
  const config = requireGithubConfig();
  const sha = await getGithubSha(config, path);
  const response = await fetch(githubContentUrl(config, path, { ref: false }), {
    method: 'PUT',
    headers: githubHeaders(config),
    body: JSON.stringify({ message, content: toBase64(bytes), branch: config.branch || 'main', ...(sha ? { sha } : {}) })
  });
  if (!response.ok) throw new Error(await githubErrorMessage(response));
  return response.json();
}

async function deleteGithubFile(path, message) {
  const config = getConfig();
  if (!config.owner || !config.repo || !config.token) return;
  const sha = await getGithubSha(config, path);
  if (!sha) return;
  const response = await fetch(githubContentUrl(config, path, { ref: false }), { method: 'DELETE', headers: githubHeaders(config), body: JSON.stringify({ message, sha, branch: config.branch || 'main' }) });
  if (!response.ok && response.status !== 404) throw new Error(await githubErrorMessage(response));
}

async function getGithubSha(config, path) {
  const existing = await fetch(githubContentUrl(config, path), { headers: githubHeaders(config) });
  if (existing.status === 404) return '';
  if (!existing.ok) throw new Error(await githubErrorMessage(existing));
  return (await existing.json()).sha;
}

async function fetchGithubJson(config, path) {
  const response = await fetch(githubContentUrl(config, path), { headers: githubHeaders(config) });
  if (!response.ok) throw new Error(await githubErrorMessage(response));
  const payload = await response.json();
  const text = payload.encoding === 'base64' ? decodeBase64Utf8(payload.content || '') : String(payload.content || '');
  return JSON.parse(text);
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeBase64Bytes(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function mediaTypeForPath(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  const types = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg'
  };
  return types[ext] || 'application/octet-stream';
}

async function fetchGithubMediaBlob(path) {
  const filePath = repoFilePath(path);
  if (!filePath || !hasGithubConfig()) return null;
  const config = getConfig();
  try {
    const headers = { ...githubHeaders(config), Accept: 'application/vnd.github.raw' };
    const rawResponse = await fetch(githubContentUrl(config, filePath), { headers });
    if (rawResponse.ok) {
      const buffer = await rawResponse.arrayBuffer();
      if (buffer.byteLength) return new Blob([buffer], { type: mediaTypeForPath(filePath) });
    }
  } catch (error) {
    console.warn(`GitHub 原始媒体读取失败：${filePath}`, error);
  }
  try {
    const response = await fetch(githubContentUrl(config, filePath), { headers: githubHeaders(config) });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload.download_url) {
      const download = await fetch(payload.download_url, { headers: { Authorization: `Bearer ${config.token}` } });
      if (download.ok) {
        const buffer = await download.arrayBuffer();
        if (buffer.byteLength) return new Blob([buffer], { type: mediaTypeForPath(filePath) });
      }
    }
    if (!payload.content) return null;
    const bytes = decodeBase64Bytes(payload.content);
    return new Blob([bytes], { type: mediaTypeForPath(filePath) });
  } catch (error) {
    console.warn(`GitHub 媒体读取失败：${filePath}`, error);
    return null;
  }
}

async function githubErrorMessage(response) {
  let detail = '';
  try {
    const body = await response.clone().json();
    detail = body.error?.message || body.message || JSON.stringify(body);
  } catch {
    try { detail = await response.text(); } catch { detail = ''; }
  }
  const hint = response.status === 401 || response.status === 403
    ? '；请检查 Token 是否有目标仓库 Contents 读写权限，以及是否允许访问该仓库'
    : '';
  return `GitHub API ${response.status}${detail ? `：${detail}` : ''}${hint}`;
}

function requireGithubConfig() {
  const config = getConfig();
  if (!config.owner || !config.repo || !config.token) throw new Error('请先在登录框或设置页填写 GitHub Owner / Repo / Token');
  return config;
}

function getConfig() {
  const config = readLocalJson(STORAGE_KEYS.github, {});
  return config && typeof config === 'object' ? config : {};
}

function hasGithubConfig() {
  const config = getConfig();
  return Boolean(config.owner && config.repo && config.token);
}

function hasSyncBackend() {
  return hasGithubConfig();
}

function refreshMusicSyncDefault() {
  const checkbox = $('#musicSyncGithub');
  if (checkbox) checkbox.checked = hasSyncBackend();
}

function initAuthMode() {
  const savedMode = sessionStorage.getItem(STORAGE_KEYS.adminMode) === 'true';
  setAdminMode(savedMode && hasGithubConfig());
}

function bindAuthDialog() {
  const dialog = $('#authDialog');
  const form = $('#authForm');
  if (!dialog || !form) return;
  const config = getConfig();
  if (form.elements.owner) form.elements.owner.value = config.owner || '';
  if (form.elements.repo) form.elements.repo.value = config.repo || '';
  if (form.elements.branch) form.elements.branch.value = config.branch || 'main';
  if (form.elements.token) form.elements.token.value = config.token || '';
  $('#visitorButton')?.addEventListener('click', () => {
    setAdminMode(false);
    dialog.close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    try {
      if (submit) {
        submit.disabled = true;
        submit.dataset.originalText = submit.textContent;
        submit.textContent = '验证中…';
      }
      const owner = String(form.elements.owner.value || '').trim();
      const repo = String(form.elements.repo.value || '').trim();
      const branch = String(form.elements.branch.value || 'main').trim() || 'main';
      const token = String(form.elements.token.value || '').trim();
      if (!owner || !repo || !token) throw new Error('请填写 GitHub Owner、仓库名和 Token');
      writeLocalJson(STORAGE_KEYS.github, { owner, repo, branch, token });
      await verifyGithubAccess({ owner, repo, branch, token });
      setAdminMode(true);
      await loadData();
      dialog.close();
      toast('已进入管理模式，GitHub Token 可用。');
    } catch (error) {
      toast(`进入管理模式失败：${error.message}`);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = submit.dataset.originalText || '进入管理模式';
      }
    }
  });
  if (!state.adminMode) dialog.showModal();
}

async function verifyGithubAccess(config) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, {
    headers: githubHeaders(config)
  });
  if (!response.ok) throw new Error(await githubErrorMessage(response));
  const repo = await response.json();
  if (repo.private === undefined) throw new Error('GitHub 未返回仓库信息');
}

function setAdminMode(enabled) {
  state.adminMode = Boolean(enabled);
  sessionStorage.setItem(STORAGE_KEYS.adminMode, state.adminMode ? 'true' : 'false');
  document.body.classList.toggle('visitor-mode', !state.adminMode);
  document.body.classList.toggle('admin-mode', state.adminMode);
  refreshMusicSyncDefault();
}

async function syncAllLocalToGithub() {
  if (!state.adminMode) return toast('当前是访客模式，不能同步。');
  if (!hasGithubConfig()) return toast('请先在登录框或设置页填写 GitHub Owner / Repo / Token。');
  const output = $('#syncOutput');
  const log = [];
  const record = (text) => {
    log.push(text);
    if (output) output.textContent = log.join('\n');
  };
  try {
    record('开始同步本机数据到 GitHub…');
    await persistDiaryIndexToGithub();
    record('日记索引已同步。');
    await syncPendingLocalMedia(record);
    await syncPendingAttachments(record);
    for (const type of ['mood', 'timeline', 'knowledge', 'capsule', 'note', 'map', 'ai', 'photo', 'music']) {
      await persistCollectionToGithub(type);
      record(`${type} 已同步。`);
    }
    toast('本机数据已同步到 GitHub。GitHub Pages 部署完成后另一台设备即可看到。');
  } catch (error) {
    record(`同步失败：${error.message}`);
    toast(`同步失败：${error.message}`);
  }
}

async function syncPendingAttachments(record = () => {}) {
  const files = readLocalJson(STORAGE_KEYS.files, []);
  let changed = false;
  for (const item of files) {
    if (!item.local || item.synced || !item.path) continue;
    const blob = await getAttachmentBlob(item.path);
    if (!blob) { record(`附件《${item.name || item.path}》缺少本机文件，已跳过。`); continue; }
    if (blob.size >= GITHUB_FILE_LIMIT_BYTES) { record(`附件《${item.name || item.path}》超过 100MB，已跳过。`); continue; }
    await uploadBinaryToGithub(item.path, new Uint8Array(await blob.arrayBuffer()), `Sync ${item.category || 'file'} ${item.name || item.path}`);
    item.synced = true;
    changed = true;
    record(`附件《${item.name || item.path}》已上传。`);
  }
  if (changed) writeLocalJson(STORAGE_KEYS.files, files);
}

async function syncPendingLocalMedia(record = () => {}) {
  for (const photo of state.gallery.albums || []) {
    if (!photo.local || photo.synced || !photo.path) continue;
    const blob = await getPhotoBlob(photo.id);
    if (!blob) { record(`照片《${photo.title}》缺少本机文件，已跳过二进制上传。`); continue; }
    if (blob.size >= GITHUB_FILE_LIMIT_BYTES) { record(`照片《${photo.title}》超过 100MB，已跳过。`); continue; }
    await uploadBinaryToGithub(photo.path, new Uint8Array(await blob.arrayBuffer()), `Sync photo ${photo.fileName || photo.title}`);
    photo.synced = true;
    record(`照片《${photo.title}》已上传。`);
  }
  for (const track of state.music.tracks || []) {
    if (!track.local || track.synced || !track.src) continue;
    const blob = await getAudioBlob(track.id);
    if (!blob) { record(`音乐《${track.title}》缺少本机文件，已跳过二进制上传。`); continue; }
    if (blob.size >= GITHUB_FILE_LIMIT_BYTES) { record(`音乐《${track.title}》超过 100MB，已跳过。`); continue; }
    await uploadBinaryToGithub(track.src, new Uint8Array(await blob.arrayBuffer()), `Sync music ${track.fileName || track.title}`);
    track.synced = true;
    record(`音乐《${track.title}》已上传。`);
  }
  persistLocalCollection('gallery', state.gallery.albums);
  persistLocalTracks();
}

function githubHeaders(config) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
}

function githubContentUrl(config, path, options = {}) {
  const encodedPath = String(path || '').split('/').map((part) => encodeURIComponent(part)).join('/');
  const ref = options.ref === false ? '' : `?ref=${encodeURIComponent(config.branch || 'main')}`;
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}${ref}`;
}

function githubRawUrl(config, path) {
  const encodedPath = String(path || '').split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch || 'main')}/${encodedPath}`;
}

async function encryptSecretText() {
  const text = $('#secretText').value;
  const pass = $('#secretPass').value;
  if (!text || !pass) return toast('请先输入文本与密码。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(pass, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  $('#cryptoOutput').textContent = JSON.stringify({ alg: 'AES-GCM-256', salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) }, null, 2);
}

async function decryptSecretText() {
  const pass = $('#secretPass').value;
  const raw = $('#secretText').value.trim() || $('#cryptoOutput').textContent.trim();
  if (!pass || !raw) return toast('请输入密码，并把密文 JSON 贴到文本框。');
  try {
    const payload = JSON.parse(raw);
    const key = await deriveAesKey(pass, fromBase64(payload.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.data));
    $('#cryptoOutput').textContent = new TextDecoder().decode(plain);
  } catch {
    toast('解密失败，请检查密文格式与密码。');
  }
}

async function deriveAesKey(pass, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function classifyFile(file) {
  if (file.type.startsWith('image/')) return { category: 'gallery', folder: 'data/gallery/originals' };
  if (file.type.startsWith('audio/') || isAudioFile(file)) return { category: 'music', folder: 'data/music/files' };
  if (/\.(md|txt)$/i.test(file.name)) return { category: 'diary', folder: 'data/diary' };
  if (/\.json$/i.test(file.name)) return { category: 'knowledge', folder: 'data/knowledge' };
  return { category: 'capsule', folder: 'data/capsule' };
}

function uniqueDataFileName(file, title, folder) {
  const original = autoFileName(file, title);
  const dot = original.lastIndexOf('.');
  const stem = dot >= 0 ? original.slice(0, dot) : original;
  const ext = dot >= 0 ? original.slice(dot) : '';
  const known = new Set([
    ...(state.gallery?.albums || []).map((item) => item.path || item.src || ''),
    ...(state.music?.tracks || []).map((item) => item.src || ''),
    ...readLocalJson(STORAGE_KEYS.files, []).map((item) => item.path || '')
  ].map((value) => String(value).replace(/^\.\//, '')));
  let candidate = original;
  let number = 2;
  while (known.has(`${folder}/${candidate}`)) candidate = `${stem}-${number++}${ext}`;
  return candidate;
}

function autoFileName(file, title) {
  const date = new Date().toISOString().slice(0, 10);
  const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  const base = slugify(title || file.name.replace(/\.[^.]+$/, ''));
  return `${date}-${base}${ext}`;
}

function describeClassification(file) {
  const { category, folder } = classifyFile(file);
  return `将按「${category}」分类，自动命名为 ${folder}/${autoFileName(file)}`;
}

async function saveClassifiedFile(file, syncGithub, title) {
  const { category, folder } = classifyFile(file);
  const filename = uniqueDataFileName(file, title, folder);
  const path = `${folder}/${filename}`;

  if (category === 'gallery') {
    if (file.size >= GITHUB_FILE_LIMIT_BYTES) throw new Error('照片必须小于 100MB');
    const photo = {
      id: createLocalId('photo', title || file.name), title: cleanText(title, file.name.replace(/\.[^.]+$/, '')),
      caption: '', place: '未记录地点', date: new Date().toISOString().slice(0, 10), path, fileName: filename,
      fileSize: file.size, local: true, storage: 'indexedDB', size: 'square', palette: ['#d8c7ff', '#b8d9ff']
    };
    await putPhotoBlob(photo.id, file);
    photo.objectUrl = URL.createObjectURL(file);
    photo.src = photo.objectUrl;
    photo.aspectRatio = await readImageAspectRatio(file);
    photo.size = photoSizeFromRatio(photo.aspectRatio);
    state.objectUrls.set(photo.id, photo.objectUrl);
    state.gallery.albums.unshift(photo);
    persistLocalCollection('gallery', state.gallery.albums);
    if (syncGithub) {
      await uploadBinaryToGithub(path, new Uint8Array(await file.arrayBuffer()), `Add photo ${filename}`);
      photo.synced = true;
      persistLocalCollection('gallery', state.gallery.albums);
      await persistCollectionToGithub('photo');
    }
    return `照片已加入照片档案${syncGithub ? '并同步到 GitHub' : ''}。`;
  }

  if (category === 'music') {
    if (file.size >= GITHUB_FILE_LIMIT_BYTES) throw new Error('音乐文件必须小于 100MB');
    const track = await createTrackFromFile(file);
    track.src = path;
    track.fileName = filename;
    state.music.tracks.unshift(track);
    await putAudioBlob(track.id, file);
    persistLocalTracks();
    if (syncGithub) {
      await uploadBinaryToGithub(path, new Uint8Array(await file.arrayBuffer()), `Add music ${filename}`);
      track.synced = true;
      persistLocalTracks();
      await persistMusicIndexToGithub();
    }
    updatePlayer();
    return `音乐已加入歌单${syncGithub ? '并同步到 GitHub' : ''}。`;
  }

  const files = readLocalJson(STORAGE_KEYS.files, []);
  const record = { category, path, name: file.name, size: file.size, savedAt: new Date().toISOString(), local: true, synced: false };
  await putAttachmentBlob(path, file);
  files.unshift(record);
  if (syncGithub) {
    await uploadBinaryToGithub(path, new Uint8Array(await file.arrayBuffer()), `Add ${category} ${filename}`);
    record.synced = true;
    writeLocalJson(STORAGE_KEYS.files, files);
    return `附件已分类到 ${path} 并同步到 GitHub。`;
  }
  writeLocalJson(STORAGE_KEYS.files, files);
  return `附件已安全保存在本机，分类为 ${category} / ${filename}。`;
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return resolve(null);
    const request = indexedDB.open('fuguang-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putPhotoBlob(id, blob) {
  const db = await openPhotoDb();
  if (!db) throw new Error('当前浏览器不支持 IndexedDB，无法安全保存大图');
  await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getPhotoBlob(id) {
  const db = await openPhotoDb();
  if (!db) return null;
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function deletePhotoBlob(id) {
  const db = await openPhotoDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function openAttachmentDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return resolve(null);
    const request = indexedDB.open('fuguang-attachments', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAttachmentBlob(path, blob) {
  const db = await openAttachmentDb();
  if (!db) throw new Error('当前浏览器不支持 IndexedDB，无法安全保存附件');
  await new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, path);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getAttachmentBlob(path) {
  const db = await openAttachmentDb();
  if (!db) return null;
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(path);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return resolve(null);
    const request = indexedDB.open('fuguang-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAudioBlob(id, blob) {
  const db = await openAudioDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getAudioBlob(id) {
  const db = await openAudioDb();
  if (!db) return null;
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction('tracks').objectStore('tracks').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function deleteAudioBlob(id) {
  const db = await openAudioDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function generateMemoryEcho() {
  const latest = state.diaries[0] || { date: '此刻', title: '尚未写下的日记' };
  const mood = state.mood?.latest || { label: '平静' };
  const tags = [...new Set(state.diaries.flatMap((diary) => diary.tags || []))].slice(0, 5).join('、');
  const photoPlaces = [...new Set((state.gallery?.albums || []).map((photo) => photo.place).filter(Boolean))].slice(0, 3).join('、');
  const knowledge = (state.knowledge?.nodes || []).slice(0, 3).map((node) => node.label).filter(Boolean).join('、');
  const placeLine = photoPlaces ? `照片里反复出现 ${photoPlaces}。` : '照片还在等待下一次被点亮。';
  const thoughtLine = knowledge ? `思想星系此刻围绕着 ${knowledge}。` : '思想星系还很安静。';
  return `最近的你更常靠近“${tags || '安静'}”。${latest.date} 的《${latest.title}》显示，你正在把${mood.label}变成一种可以停留的能力。${placeLine}${thoughtLine}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '深夜好';
  if (hour < 10) return '早安';
  if (hour < 18) return '白昼好';
  if (hour < 23) return '黄昏好';
  return '夜深了';
}

function formatDate(date) {
  return date.replaceAll('-', '.');
}

function pill(text) {
  return `<span class="pill">${escapeHtml(String(text))}</span>`;
}

function gradient(palette) {
  const colors = Array.isArray(palette) ? palette : [];
  const [a = '#d8c8ff', b = '#b8d9ff'] = colors;
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function resolveMediaSrc(src) {
  const value = String(src || '');
  if (!value) return '';
  if (/^(blob:|data:|https?:)/i.test(value)) return value;
  const path = value.replace(/^\.?\//, '');
  if (hasGithubConfig() && (path.startsWith('data/') || path.startsWith('assets/'))) {
    return githubRawUrl(getConfig(), path);
  }
  return appPath(path);
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}

function cssUrl(src) {
  const resolved = resolveMediaSrc(src);
  if (!resolved) return 'none';
  return `url("${resolved.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\"')}")`;
}

function markdownToHtml(markdown) {
  return escapeHtml(markdown).split(/\n{2,}/).filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

function guessFormat(value) {
  const match = String(value || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'AUDIO';
}

function toast(message) {
  let node = $('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast glass glass-l3';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    Object.assign(node.style, { position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 100, padding: '12px 16px', borderRadius: '999px', maxWidth: 'calc(100vw - 32px)', textAlign: 'center' });
    document.body.appendChild(node);
  }
  node.textContent = message;
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.remove(), 3600);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('service-worker.js').catch((error) => console.warn('Service worker registration failed', error));
}
