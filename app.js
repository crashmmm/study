// =============== 物化生背诵助手 - 主逻辑 ===============
'use strict';

// ----- 全局状态 -----
const STORAGE_KEY = 'study_data_v1';
const DEFAULT_DATA = {
  learned: {},      // { id: { learnedAt, mastery, lastReviewAt, reviewCount } }
  errors: {},       // { id: [{ questionIdx, userAnswer, correct, at }] }
  favorites: [],    // [id, ...]
  theme: 'light',
  dailyCheckin: [], // [YYYY-MM-DD, ...]
  todayMode: 'freq',// 今日推荐模式：'order' | 'freq' | 'random'
  // 历史：保存所有学习事件用于图表
  history: [],      // [{ id, type: 'learn'|'review'|'quiz', at, correct? }]
};

// 艾宾浩斯复习间隔（天）
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];
// 高频节（5/4 星）复习间隔更紧凑
const EBBINGHAUS_HF = [1, 2, 3, 7, 14];
// 主题颜色
const COLORS = {
  brand: '#1F4E79',
  brandLight: '#3d72bd',
  star5: '#c0392b',
  star4: '#e67300',
  star3: '#f19d3a',
  star2: '#b8860b',
  star1: '#808080',
};

let data = loadData();

// ----- 工具函数 -----
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign({}, DEFAULT_DATA, JSON.parse(raw));
  } catch (e) { console.warn('数据加载失败', e); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error('数据保存失败', e); }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysBetween(d1, d2) {
  return Math.floor((new Date(d2) - new Date(d1)) / 86400000);
}
function getSection(id) { return SECTIONS.find(s => s.id === id); }

// mc 定制 · 关于页（点 header 旁 mc 标触发）
function showMcAbout() {
  showModal(`
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹</button>
        <div class="text-sm font-medium">关于本应用</div>
        <button class="w-8 h-8"></button>
      </div>
    </header>
    <div class="px-5 pt-6 pb-8 modal-enter">
      <div class="flex flex-col items-center text-center mb-6">
        <img src="assets/mc-brand.svg" alt="mc定制" class="h-9 w-auto mb-3">
        <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">mc定制 · 设计开发</h2>
        <p class="text-xs text-slate-500 mt-1">© 2026 mc定制 · 保留所有权利</p>
      </div>

      <div class="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4">
          <div class="font-medium mb-1">📚 应用</div>
          <div class="text-xs text-slate-500">物化生背诵助手 v1.0</div>
          <div class="text-xs text-slate-500 mt-1">高考 3+1+2 物理/化学/生物 · 148 节精选 · 艾宾浩斯记忆</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4">
          <div class="font-medium mb-1">⚙ 技术栈</div>
          <div class="text-xs text-slate-500">原生 HTML + JS + Tailwind + Chart.js</div>
          <div class="text-xs text-slate-500 mt-1">PWA · 离线可用 · 无后端</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4">
          <div class="font-medium mb-1">📜 许可</div>
          <div class="text-xs text-slate-500">MIT License · 学习使用</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4">
          <div class="font-medium mb-1">💬 反馈</div>
          <div class="text-xs text-slate-500">如需定制学习 App / 知识库系统</div>
          <div class="text-xs text-slate-500 mt-1">欢迎联系 mc定制</div>
        </div>
      </div>
    </div>
  `);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('toast-show');
  setTimeout(() => t.classList.add('hidden'), 2000);
}
function freqLabel(f) {
  return {5: '必考大题', 4: '高频考点', 3: '常考', 2: '低频', 1: '偶尔/选考'}[f] || '';
}
function freqClass(f) {
  return {5: 'freq-5', 4: 'freq-4', 3: 'freq-3', 2: 'freq-2', 1: 'freq-1'}[f] || 'freq-1';
}
function freqStars(f) {
  return '★'.repeat(f) + '☆'.repeat(5 - f);
}

// ----- 主题 -----
function initTheme() {
  const saved = localStorage.getItem('theme') || data.theme || 'light';
  setTheme(saved);
}
function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  data.theme = theme;
  localStorage.setItem('theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  saveData();
});

// ----- Tab 切换 -----
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // 各 tab 单独刷新
  if (tab === 'today') renderToday();
  else if (tab === 'library') renderLibrary();
  else if (tab === 'errors') renderErrors();
  else if (tab === 'calendar') renderCalendar();
  else if (tab === 'stats') renderStats();
  location.hash = tab;
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// =============== 1. 今日页 ===============
function getTodayList() {
  const list = [];
  const t = today();

  // 1) 艾宾浩斯复习到期（任意学科）
  for (const id in data.learned) {
    const L = data.learned[id];
    const intervals = (L.frequency >= 4) ? EBBINGHAUS_HF : EBBINGHAUS_INTERVALS;
    const idx = Math.min(L.reviewCount || 0, intervals.length - 1);
    const dueDay = new Date(L.learnedAt);
    dueDay.setDate(dueDay.getDate() + intervals[idx]);
    if (dueDay <= new Date(t)) {
      list.push({ id, type: 'review', priority: L.frequency });
    }
  }

  // 2) 今日新学：三科（物理/化学/生物）各选 1 个未学过的节
  // 选节策略由 data.todayMode 决定：'order' 顺序 / 'freq' 频次优先（默认）/ 'random' 随机
  const mode = data.todayMode || 'freq';
  for (const sub of ['物理', '化学', '生物']) {
    const pool = SECTIONS
      .filter(s => s.subject === sub && (!data.learned[s.id] || data.learned[s.id].learnedAt !== t));
    if (pool.length === 0) continue;

    let candidate = null;
    if (mode === 'order') {
      // 顺序模式：选 num 最小的（适合新生从头学）
      candidate = [...pool].sort((a, b) => a.num - b.num)[0];
    } else if (mode === 'random') {
      // 随机模式：每天 3 节，跨天会变
      candidate = pool[Math.floor(Math.random() * pool.length)];
    } else {
      // freq 模式：按频次降序（5★优先），同频次按 num 升序
      candidate = [...pool].sort((a, b) => (b.frequency - a.frequency) || (a.num - b.num))[0];
    }
    list.push({ id: candidate.id, type: 'learn', priority: candidate.frequency });
  }

  return list;
}

function renderToday() {
  const list = getTodayList();
  const t = today();
  // 今日已学节（按 id 反查学科）
  const learnedTodayEntries = Object.entries(data.learned).filter(([id, L]) => L.learnedAt === t);
  const learnedTodayIds = learnedTodayEntries.map(([id]) => id);
  const learnedTodaySubjects = new Set(
    learnedTodayIds.map(id => getSection(id)?.subject).filter(Boolean)
  );

  // stats
  document.getElementById('stat-learned').textContent = learnedTodayIds.length;
  document.getElementById('stat-review').textContent = list.filter(x => x.type === 'review').length;
  // 连胜
  const streak = computeStreak();
  document.getElementById('stat-streak').textContent = streak;
  if (streak >= 3) {
    const badge = document.getElementById('streak-badge');
    badge.textContent = `🔥 ${streak}天连胜`;
    badge.classList.remove('hidden');
  } else {
    document.getElementById('streak-badge').classList.add('hidden');
  }
  // 自动打卡
  if (!data.dailyCheckin.includes(t) && learnedTodayIds.length > 0) {
    data.dailyCheckin.push(t);
    saveData();
  }

  // 拆分：今日新学（每科 1 个）+ 待复习
  const newLearnItems = list.filter(x => x.type === 'learn');
  const reviewItems = list.filter(x => x.type === 'review');

  // 渲染模式选择器（顺序 / 频次 / 随机）
  const modeSel = document.getElementById('today-mode');
  if (modeSel) {
    const cur = data.todayMode || 'freq';
    modeSel.querySelectorAll('button[data-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === cur);
    });
  }

  const container = document.getElementById('today-list');
  if (newLearnItems.length === 0 && reviewItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
        <div class="text-4xl mb-2">🎉</div>
        <p class="text-sm text-slate-600 dark:text-slate-300">今日任务完成！</p>
        <p class="text-xs text-slate-400 mt-1">明天再回来继续</p>
      </div>`;
    return;
  }

  // 渲染：今日新学分组（在最前） + 待复习分组
  const subjectBadge = {
    '物理': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    '化学': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    '生物': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  };
  const renderCard = (item) => {
    const sec = getSection(item.id);
    if (!sec) return '';
    const typeLabel = item.type === 'review' ? '📌 待复习' : '🆕 今日新学';
    const typeColor = item.type === 'review'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    const subBadge = subjectBadge[sec.subject] || 'bg-slate-100 text-slate-600';
    return `
      <div class="section-card" data-id="${sec.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 mb-1 flex-wrap">
              <span class="text-xs px-1.5 py-0.5 rounded ${typeColor}">${typeLabel}</span>
              <span class="text-xs px-1.5 py-0.5 rounded ${subBadge}">${sec.subject}</span>
              <span class="text-xs ${freqClass(sec.frequency)}">${freqStars(sec.frequency)}</span>
            </div>
            <div class="text-sm font-medium leading-snug">
              <span class="text-slate-400 mr-1">第${sec.num}节</span>
              ${sec.title}
            </div>
            ${item.type === 'learn' ? `<div class="text-xs text-slate-400 mt-1">默读 1-2 遍后做 2-3 题巩固</div>` :
              `<div class="text-xs text-slate-400 mt-1">根据艾宾浩斯曲线复习更高效</div>`}
          </div>
          <span class="text-slate-400 self-center">›</span>
        </div>
      </div>`;
  };

  let html = '';
  if (newLearnItems.length > 0) {
    html += `<div class="text-xs text-slate-500 font-medium px-1 mb-1">📅 今日新学（${newLearnItems.length}/3 科）</div>`;
    html += newLearnItems.map(renderCard).join('');
  }
  if (reviewItems.length > 0) {
    html += `<div class="text-xs text-slate-500 font-medium px-1 mt-3 mb-1">🔁 待复习（${reviewItems.length}）</div>`;
    html += reviewItems.map(renderCard).join('');
  }
  container.innerHTML = html;
  // 点击进入背诵
  container.querySelectorAll('.section-card').forEach(el => {
    el.addEventListener('click', () => openReview(el.dataset.id));
  });
}

function computeStreak() {
  if (data.dailyCheckin.length === 0) return 0;
  const days = [...data.dailyCheckin].sort().reverse();
  let streak = 0;
  let cur = new Date(today());
  for (const d of days) {
    if (d === cur.toISOString().slice(0,10)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else break;
  }
  return streak;
}

// =============== 2. 节详情/背诵/检测 Modal ===============
function openReview(id) {
  const sec = getSection(id);
  if (!sec) return;
  const isLearned = !!data.learned[id];
  const isReview = isLearned;  // 复习模式：已学习过的
  showModal(buildReviewView(sec, isReview));
}

function buildReviewView(sec, isReviewMode) {
  const actionButtons = isReviewMode
    ? `<button class="review-start-btn w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium" data-mode="test">📝 进入默写测试</button>
       <button class="review-start-btn w-full py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm" data-mode="full">📖 重新默读</button>`
    : `<button class="review-start-btn w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium" data-mode="test">🧠 默写测试（推荐）</button>
       <button class="review-start-btn w-full py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm" data-mode="full">📖 完整默读</button>
       <button class="review-start-btn w-full py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm" data-mode="brief">⚡ 简略（仅标题+概念）</button>`;
  const isFav = data.favorites.includes(sec.id);

  return `
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹ 返回</button>
        <div class="text-sm font-medium truncate">${sec.subject} · 第${sec.num}节</div>
        <button id="fav-toggle" class="w-8 h-8 text-lg">${isFav ? '⭐' : '☆'}</button>
      </div>
    </header>
    <div class="px-4 pt-3 pb-6 modal-enter">
      <div class="section-detail">
        <h2>${sec.subject} · 第${sec.num}节 · ${sec.title}
          <span class="text-xs ${freqClass(sec.frequency)} ml-1">${freqStars(sec.frequency)} ${freqLabel(sec.frequency)}</span>
        </h2>
        <div class="text-xs text-slate-500 mb-1">📌 学习目标</div>
        <ul>${sec.goal.map(g => `<li>${g}</li>`).join('')}</ul>
      </div>

      <div class="section-detail">
        <h3>📐 核心公式</h3>
        ${sec.formulas.map(f => `<div class="formula-box">${f}</div>`).join('')}
      </div>

      <div class="section-detail">
        <h3>💡 关键概念</h3>
        <ul>${sec.concepts.map(c => `<li>${c}</li>`).join('')}</ul>
      </div>

      <div class="section-detail">
        <h3>⚠ 易错提醒</h3>
        <div class="traps">${sec.traps}</div>
      </div>

      <div class="section-detail">
        <h3>📝 典型例题</h3>
        <div class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">${sec.example}</div>
      </div>

      <div class="mt-4 space-y-2">
        <p class="text-xs text-slate-500 text-center">选择学习方式：</p>
        ${actionButtons}
      </div>
    </div>`;
}

function showModal(html, onShow) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  bindModalEvents();
  if (onShow) onShow();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function bindModalEvents() {
  // 关闭按钮
  document.querySelectorAll('.close-modal').forEach(el => {
    el.addEventListener('click', closeModal);
  });
  // 收藏
  const fav = document.getElementById('fav-toggle');
  if (fav) {
    const headerHTML = document.getElementById('modal-content').innerHTML;
    const idMatch = headerHTML.match(/(\w+) · 第\d+节/);
    if (idMatch) {
      const id = Array.from(document.querySelectorAll('.review-start-btn')).length > 0
        ? document.querySelector('.section-card[data-id]')?.dataset.id : null;
      // 简化：从 review data-id 取
    }
  }
  // 模式按钮
  document.querySelectorAll('.review-start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      // 从 section 找 - 用最近浏览过的 id
      const id = currentReviewId;
      if (id) enterStudyMode(id, mode);
    });
  });
  // 收藏（从 review card 获取 id）
  document.querySelectorAll('[data-favid]').forEach(btn => {
    btn.addEventListener('click', () => toggleFav(btn.dataset.favid));
  });
  // 蒙层点击关闭（点 #modal 本身而非 #modal-content）
  const modalEl = document.getElementById('modal');
  if (modalEl && !modalEl._overlayBound) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });
    modalEl._overlayBound = true;
  }
}

// 记录当前打开的节 id
let currentReviewId = null;
const _openReview = openReview;
openReview = function(id) {
  currentReviewId = id;
  _openReview(id);
};

// 收藏
function toggleFav(id) {
  const idx = data.favorites.indexOf(id);
  if (idx >= 0) {
    data.favorites.splice(idx, 1);
    showToast('已取消收藏');
  } else {
    data.favorites.push(id);
    showToast('⭐ 已收藏');
  }
  saveData();
  // 重新打开 modal 刷新收藏图标
  if (currentReviewId) openReview(currentReviewId);
}

// 学习模式
function enterStudyMode(id, mode) {
  const sec = getSection(id);
  if (!sec) return;

  // 标记为已学
  if (!data.learned[id]) {
    data.learned[id] = { learnedAt: today(), mastery: 0, reviewCount: 0 };
    data.history.push({ id, type: 'learn', at: new Date().toISOString() });
    // 自动打卡
    const t = today();
    if (!data.dailyCheckin.includes(t)) data.dailyCheckin.push(t);
  } else if (data.learned[id].learnedAt !== today()) {
    data.learned[id].reviewCount = (data.learned[id].reviewCount || 0) + 1;
    data.history.push({ id, type: 'review', at: new Date().toISOString() });
  }
  saveData();

  if (mode === 'full') {
    // 完整默读
    showModal(buildFullReadView(sec));
  } else if (mode === 'brief') {
    showModal(buildBriefView(sec));
  } else {
    // 默写测试
    const qi = 0;
    showModal(buildQuizView(sec, qi), () => bindQuizEvents(sec, qi));
  }
}

function buildFullReadView(sec) {
  return `
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹</button>
        <div class="text-sm font-medium">默读模式</div>
        <button class="w-8 h-8"></button>
      </div>
    </header>
    <div class="px-4 pt-3 pb-6 modal-enter">
      <div class="section-detail">
        <h2>${sec.title} <span class="text-xs ${freqClass(sec.frequency)}">${freqStars(sec.frequency)}</span></h2>
        <div class="text-sm">${sec.goal.join(' · ')}</div>
      </div>
      <div class="section-detail">
        <h3>📐 核心公式</h3>
        ${sec.formulas.map(f => `<div class="formula-box">${f}</div>`).join('')}
      </div>
      <div class="section-detail">
        <h3>💡 关键概念</h3>
        <ul>${sec.concepts.map(c => `<li>${c}</li>`).join('')}</ul>
      </div>
      <div class="section-detail">
        <div class="traps">⚠ ${sec.traps}</div>
      </div>
      <div class="section-detail">
        <h3>📝 典型例题</h3>
        <div class="text-sm">${sec.example}</div>
      </div>
      <div class="section-detail">
        <h3>❓ 每日检验</h3>
        <div class="text-sm">${sec.quiz.map((q, i) => `<div class="mb-2">${i+1}. ${q}</div>`).join('')}</div>
        <div class="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-800 dark:text-amber-300">
          💡 参考答案：${sec.answer}
        </div>
      </div>
      <button id="to-quiz" class="w-full mt-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium">📝 现在做检测题</button>
      <div class="mt-4">
        <div class="text-xs text-slate-500 mb-1 text-center">自评掌握度：</div>
        <div class="grid grid-cols-5 gap-1">
          ${[1,2,3,4,5].map(n => `<button class="mastery-btn mastery-${n}" data-n="${n}" style="border-color: ${getMasteryColor(n)}; color: ${getMasteryColor(n)}">${'★'.repeat(n)}</button>`).join('')}
        </div>
      </div>
    </div>`;
  // 重新绑定事件
  setTimeout(() => {
    document.querySelectorAll('.mastery-btn').forEach(btn => {
      btn.addEventListener('click', () => setMastery(sec.id, parseInt(btn.dataset.n)));
    });
    const toQuiz = document.getElementById('to-quiz');
    if (toQuiz) toQuiz.addEventListener('click', () => showModal(buildQuizView(sec, 0)));
    document.querySelectorAll('.close-modal').forEach(el => el.addEventListener('click', closeModal));
  }, 0);
}

function buildBriefView(sec) {
  return `
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹</button>
        <div class="text-sm font-medium">简略模式</div>
        <button class="w-8 h-8"></button>
      </div>
    </header>
    <div class="px-4 pt-3 pb-6 modal-enter">
      <div class="section-detail">
        <h2>${sec.title}</h2>
        <ul>${sec.concepts.map(c => `<li>${c}</li>`).join('')}</ul>
      </div>
      <button id="to-full" class="w-full mt-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm">📖 展开完整内容</button>
      <button id="to-quiz2" class="w-full mt-2 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium">📝 直接做检测题</button>
    </div>`;
  setTimeout(() => {
    const toFull = document.getElementById('to-full');
    if (toFull) toFull.addEventListener('click', () => showModal(buildFullReadView(sec)));
    const toQuiz = document.getElementById('to-quiz2');
    if (toQuiz) toQuiz.addEventListener('click', () => showModal(buildQuizView(sec, 0)));
    document.querySelectorAll('.close-modal').forEach(el => el.addEventListener('click', closeModal));
  }, 0);
}

function buildQuizView(sec, qIndex) {
  const q = sec.quiz[qIndex];
  if (!q) {
    // 全部完成
    return buildQuizResultView(sec);
  }
  // 解析选项
  const isJudgement = q.includes('判断');
  let options = [];
  if (!isJudgement) {
    // 提取 A. B. C. D. 选项：按 A./B./C./D. 切分
    const parts = q.split(/\s*[A-D][.、．]\s*/);
    // parts[0] = 题干，parts[1..4] = 选项
    if (parts.length >= 3) {
      options = parts.slice(1, 5).filter(p => p && p.trim());
    }
    if (options.length < 2) {
      // 退化：抓 A./B. 这种不严格的
      const matches = q.match(/[A-D][.、．][^A-D]*/g);
      if (matches) options = matches.map(m => m.replace(/^[A-D][.、．]\s*/, ''));
    }
  }

  // 题目正文：去掉 A. B. C. D. 及之后内容，只保留题干
  const questionText = isJudgement ? q : q.split(/\s*[A-D][.、．]/)[0].trim();

  return `
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹</button>
        <div class="text-sm font-medium">第 ${qIndex+1}/${sec.quiz.length} 题</div>
        <button class="w-8 h-8"></button>
      </div>
    </header>
    <div class="px-4 pt-3 pb-6 modal-enter">
      <div class="bg-white dark:bg-slate-800 rounded-lg p-4 mb-3">
        <div class="text-xs text-slate-500 mb-2">${sec.subject} · 第${sec.num}节</div>
        <div class="text-sm leading-relaxed">${questionText}</div>
      </div>

      <div id="options" class="space-y-2">
        ${isJudgement ? `
          <button class="quiz-option" data-answer="对">✓ 对</button>
          <button class="quiz-option" data-answer="错">✗ 错</button>
        ` : options.map((opt, i) => `
          <button class="quiz-option" data-answer="${String.fromCharCode(65+i)}">${opt.trim()}</button>
        `).join('')}
      </div>

      <div id="feedback" class="hidden mt-3"></div>
    </div>`;
}

// 绑定 quiz 视图事件（在 modal innerHTML 替换后调用）
function bindQuizEvents(sec, qIndex) {
  const q = sec.quiz[qIndex];
  if (!q) return;  // result view 走自己的绑定
  document.querySelectorAll('.close-modal').forEach(el => el.addEventListener('click', closeModal));
  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const userAnswer = btn.dataset.answer;
        // 解析正确答案
        const correctAnswer = parseCorrectAnswer(sec, qIndex, q);
        const isCorrect = userAnswer === correctAnswer;
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect) {
          document.querySelectorAll('.quiz-option').forEach(b => {
            if (b.dataset.answer === correctAnswer) b.classList.add('correct');
          });
        }
        document.querySelectorAll('.quiz-option').forEach(b => b.classList.add('disabled'));

        // 记录错题
        if (!isCorrect) {
          if (!data.errors[sec.id]) data.errors[sec.id] = [];
          data.errors[sec.id].push({
            questionIdx: qIndex,
            userAnswer,
            correct: false,
            at: new Date().toISOString(),
          });
        } else {
          // 记录对
          if (!data.errors[sec.id]) data.errors[sec.id] = [];
          // 只在最后一次答错时记录，避免重复
        }

        // 显示反馈
        const feedback = document.getElementById('feedback');
        feedback.classList.remove('hidden');
        feedback.innerHTML = `
          <div class="p-3 rounded-lg ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300'} text-sm">
            ${isCorrect ? '✅ 回答正确！' : `❌ 答错了，正确答案是 ${correctAnswer}`}
          </div>
          <div class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-800 dark:text-amber-300">
            📌 参考解析：${sec.answer.split(/\d+\./)[qIndex+1] || sec.answer}
          </div>
          <button id="next-q" class="w-full mt-3 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium">
            ${qIndex + 1 < sec.quiz.length ? '下一题' : '查看结果'}
          </button>`;
        document.getElementById('next-q').addEventListener('click', () => {
          if (qIndex + 1 < sec.quiz.length) {
            const next = qIndex + 1;
            showModal(buildQuizView(sec, next), () => bindQuizEvents(sec, next));
          } else {
            showModal(buildQuizResultView(sec));
          }
        });
        saveData();
      });
    });
}

function parseCorrectAnswer(sec, qIndex, qText) {
  // 从 sec.answer 中解析
  // 答案格式: "1.A 2.对 3.B"
  const match = sec.answer.match(new RegExp(`${qIndex+1}\\.([A-D对错])`));
  return match ? match[1] : 'A';
}

function buildQuizResultView(sec) {
  const errors = data.errors[sec.id] || [];
  const correctCount = sec.quiz.length - errors.filter(e => sec.quiz.indexOf(sec.quiz[e.questionIdx]) >= 0).length;
  // 简化：本次会话的错误
  const sessionErrors = errors.filter(e => {
    const t = new Date(e.at);
    const now = new Date();
    return (now - t) < 600000; // 10 分钟内
  });
  const total = sec.quiz.length;
  const correct = total - sessionErrors.length;
  const pct = Math.round(correct / total * 100);

  return `
    <header class="sticky top-0 z-10 bg-white dark:bg-slate-800 shadow-sm">
      <div class="flex items-center justify-between px-4 h-12 max-w-2xl mx-auto">
        <button class="close-modal text-slate-500 w-8 h-8">‹</button>
        <div class="text-sm font-medium">检测完成</div>
        <button class="w-8 h-8"></button>
      </div>
    </header>
    <div class="px-4 pt-3 pb-6 modal-enter">
      <div class="text-center py-6">
        <div class="text-5xl mb-2">${pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪'}</div>
        <div class="text-2xl font-bold mb-1">${correct}/${total} 正确</div>
        <div class="text-sm text-slate-500">正确率 ${pct}%</div>
      </div>

      ${sessionErrors.length > 0 ? `
        <div class="section-detail">
          <h3 class="text-rose-500">❌ 错题已收录</h3>
          <div class="text-xs text-slate-500">${sessionErrors.length} 道题进入错题本</div>
        </div>
      ` : `
        <div class="section-detail">
          <h3 class="text-emerald-500">✨ 全对！</h3>
          <div class="text-xs text-slate-500">继续保持！</div>
        </div>
      `}

      <div class="mt-4">
        <div class="text-xs text-slate-500 mb-1 text-center">自评掌握度：</div>
        <div class="grid grid-cols-5 gap-1">
          ${[1,2,3,4,5].map(n => `<button class="mastery-btn mastery-${n}" data-n="${n}" style="border-color: ${getMasteryColor(n)}; color: ${getMasteryColor(n)}">${'★'.repeat(n)}</button>`).join('')}
        </div>
      </div>

      <button class="close-modal w-full mt-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium">返回</button>
    </div>`;
  setTimeout(() => {
    document.querySelectorAll('.mastery-btn').forEach(btn => {
      btn.addEventListener('click', () => setMastery(sec.id, parseInt(btn.dataset.n)));
    });
    document.querySelectorAll('.close-modal').forEach(el => el.addEventListener('click', closeModal));
  }, 0);
}

function setMastery(id, n) {
  if (!data.learned[id]) data.learned[id] = { learnedAt: today(), mastery: 0, reviewCount: 0 };
  data.learned[id].mastery = n;
  saveData();
  showToast(`掌握度已设为 ${'★'.repeat(n)}`);
  setTimeout(closeModal, 800);
  // 刷新今日
  setTimeout(() => renderToday(), 1000);
}

function getMasteryColor(n) {
  return {1:'#9ca3af', 2:'#fbbf24', 3:'#f97316', 4:'#ef4444', 5:'#dc2626'}[n];
}

// =============== 3. 知识库 ===============
let libraryFilter = { subject: 'all', freq: 0 };
let searchKeyword = '';

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    // 同组内的 active 切换
    btn.parentElement.querySelectorAll(`.filter-btn[data-type="${type}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (type === 'subject') libraryFilter.subject = btn.dataset.filter;
    else libraryFilter.freq = parseInt(btn.dataset.filter);
    renderLibrary();
  });
});
document.getElementById('search-input').addEventListener('input', (e) => {
  searchKeyword = e.target.value.toLowerCase().trim();
  renderLibrary();
});

function renderLibrary() {
  let list = SECTIONS;
  if (libraryFilter.subject !== 'all') list = list.filter(s => s.subject === libraryFilter.subject);
  if (libraryFilter.freq > 0) list = list.filter(s => s.frequency === libraryFilter.freq);
  if (searchKeyword) {
    const kw = searchKeyword;
    list = list.filter(s => {
      const haystack = [
        s.title, s.subject,
        ...(s.goal || []), ...(s.formulas || []), ...(s.concepts || []),
        s.traps || '', s.example || '', ...(s.quiz || []),
      ].join(' ').toLowerCase();
      return haystack.includes(kw);
    });
  }
  // 排序：物理→化学→生物，学科内按 num 升序（章节顺序）
  const SUBJECT_ORDER = { '物理': 0, '化学': 1, '生物': 2 };
  list = list.sort((a, b) => {
    const sa = SUBJECT_ORDER[a.subject] ?? 99;
    const sb = SUBJECT_ORDER[b.subject] ?? 99;
    return sa - sb || a.num - b.num;
  });

  const container = document.getElementById('library-list');
  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">没有匹配的节</div>`;
    return;
  }
  container.innerHTML = list.map(sec => {
    const isLearned = !!data.learned[sec.id];
    const isFav = data.favorites.includes(sec.id);
    const mastery = isLearned ? data.learned[sec.id].mastery || 0 : 0;
    return `
    <div class="section-card" data-id="${sec.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="text-xs px-1.5 py-0.5 rounded ${sec.subject === '物理' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : sec.subject === '化学' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}">${sec.subject}</span>
            <span class="text-xs text-slate-400">第${sec.num}节</span>
            <span class="text-xs ${freqClass(sec.frequency)}">${freqStars(sec.frequency)}</span>
            ${isLearned ? `<span class="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">已学</span>` : ''}
            ${mastery > 0 ? `<span class="text-xs" style="color: ${getMasteryColor(mastery)}">${'★'.repeat(mastery)}</span>` : ''}
          </div>
          <div class="text-sm font-medium">${sec.title}</div>
          <div class="text-xs text-slate-400 mt-1 line-clamp-2">${sec.concepts.slice(0, 2).join(' · ')}</div>
        </div>
        <div class="flex flex-col items-center gap-1">
          <button class="fav-btn text-lg" data-favid="${sec.id}">${isFav ? '⭐' : '☆'}</button>
          <span class="text-slate-300 self-center">›</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // 绑定
  container.querySelectorAll('.section-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      openReview(el.dataset.id);
    });
  });
  container.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(btn.dataset.favid);
    });
  });
}

// =============== 4. 错题本 ===============
function renderErrors() {
  const container = document.getElementById('errors-list');
  const ids = Object.keys(data.errors);
  if (ids.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
        <div class="text-4xl mb-2">✨</div>
        <p class="text-sm text-slate-500">还没有错题</p>
        <p class="text-xs text-slate-400 mt-1">检测中答错会自动收录</p>
      </div>`;
    return;
  }
  // 按错误次数排序
  const sorted = ids.map(id => {
    const sec = getSection(id);
    const errs = data.errors[id];
    return { sec, errs, count: errs.length };
  }).filter(x => x.sec).sort((a, b) => b.count - a.count);

  container.innerHTML = sorted.map(({ sec, errs, count }) => {
    const lastErr = errs[errs.length - 1];
    const lastErrText = (lastErr && typeof lastErr === 'object' && lastErr.userAnswer)
      ? `最近错答：${lastErr.userAnswer}（正确答案见检测）`
      : `最近做错 ${count} 次（点开重做）`;
    return `
    <div class="section-card" data-id="${sec.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="text-xs px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">错题</span>
            <span class="text-xs text-slate-400">${sec.subject} · 第${sec.num}节</span>
            <span class="text-xs ${freqClass(sec.frequency)}">${freqStars(sec.frequency)}</span>
            <span class="text-xs text-rose-500">×${count}</span>
          </div>
          <div class="text-sm font-medium">${sec.title}</div>
          <div class="text-xs text-slate-400 mt-1">${lastErrText}</div>
        </div>
        <span class="text-slate-400 self-center">›</span>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.section-card').forEach(el => {
    el.addEventListener('click', () => openReview(el.dataset.id));
  });
}

document.getElementById('clear-errors').addEventListener('click', () => {
  if (confirm('确定清空所有错题？')) {
    data.errors = {};
    saveData();
    renderErrors();
    showToast('错题本已清空');
  }
});

// =============== 5. 日历 ===============
let calendarYear, calendarMonth;

function renderCalendar() {
  const now = new Date();
  if (!calendarYear) {
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
  }
  document.getElementById('current-month').textContent = `${calendarYear}年${calendarMonth+1}月`;

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay = new Date(calendarYear, calendarMonth+1, 0);
  const startWeekday = firstDay.getDay();
  const days = lastDay.getDate();

  // 学习日期集合
  const learnedDays = new Set(data.dailyCheckin);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push('');
  for (let d = 1; d <= days; d++) cells.push(d);

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = cells.map(d => {
    if (!d) return '<div></div>';
    const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isLearned = learnedDays.has(dateStr);
    const isToday = dateStr === today();
    return `<div class="calendar-day${isLearned ? ' has-learned' : ''}${isToday ? ' today' : ''}" data-date="${dateStr}">${d}</div>`;
  }).join('');

  grid.querySelectorAll('.calendar-day[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      grid.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
      el.classList.add('selected');
      showDayDetail(el.dataset.date);
    });
  });
}

document.getElementById('prev-month').addEventListener('click', () => {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
  document.getElementById('day-detail').innerHTML = '';
});
document.getElementById('next-month').addEventListener('click', () => {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
  document.getElementById('day-detail').innerHTML = '';
});

function showDayDetail(dateStr) {
  const container = document.getElementById('day-detail');
  document.getElementById('day-detail-title').textContent = `${dateStr} 学习记录`;
  // 找当天的学习记录
  const events = data.history.filter(h => h.at.startsWith(dateStr));
  const learned = Object.entries(data.learned).filter(([id, L]) => L.learnedAt === dateStr);

  if (events.length === 0 && learned.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-400 text-sm">当天没有学习记录</div>`;
    return;
  }
  container.innerHTML = learned.map(([id, L]) => {
    const sec = getSection(id);
    if (!sec) return '';
    const type = events.find(e => e.id === id && e.type === 'learn') ? '🆕 新学' : '📌 复习';
    return `<div class="section-card" data-id="${id}">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs ${type.includes('新学') ? 'text-emerald-600' : 'text-amber-600'}">${type}</span>
        <span class="text-xs text-slate-400">${sec.subject} · 第${sec.num}节</span>
      </div>
      <div class="text-sm font-medium">${sec.title}</div>
    </div>`;
  }).join('');
  container.querySelectorAll('.section-card').forEach(el => {
    el.addEventListener('click', () => openReview(el.dataset.id));
  });
}

// =============== 6. 统计 ===============
let chartSubject, chartFreq;

function renderStats() {
  // 基础数字
  const totalLearned = Object.keys(data.learned).length;
  const totalErrors = Object.values(data.errors).reduce((s, arr) => s + arr.length, 0);
  document.getElementById('stat-total').textContent = totalLearned;
  document.getElementById('stat-errors').textContent = totalErrors;
  document.getElementById('stat-favorites').textContent = data.favorites.length;
  document.getElementById('stat-best-streak').textContent = bestStreak();

  // 各科学习进度
  const subjects = ['物理', '化学', '生物'];
  const subjectData = subjects.map(sub => {
    const total = SECTIONS.filter(s => s.subject === sub).length;
    const learned = Object.entries(data.learned).filter(([id]) => id.startsWith(sub[0])).length;
    return { name: sub, learned, total, pct: Math.round(learned / total * 100) };
  });

  const ctx1 = document.getElementById('chart-subject').getContext('2d');
  if (chartSubject) chartSubject.destroy();
  chartSubject = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: subjectData.map(s => s.name),
      datasets: [{
        label: '已学节数',
        data: subjectData.map(s => s.learned),
        backgroundColor: [COLORS.brandLight, COLORS.star4, '#10b981'],
      }, {
        label: '总节数',
        data: subjectData.map(s => s.total),
        backgroundColor: 'rgba(0,0,0,0.1)',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // 频次分布
  const freqData = [5, 4, 3, 2, 1].map(f => ({
    freq: f,
    label: {5: '必考', 4: '高频', 3: '常考', 2: '低频', 1: '偶尔'}[f],
    count: Object.entries(data.learned).filter(([id]) => getSection(id)?.frequency === f).length,
  }));
  const ctx2 = document.getElementById('chart-freq').getContext('2d');
  if (chartFreq) chartFreq.destroy();
  chartFreq = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: freqData.map(f => `${'★'.repeat(f.freq)} ${f.label}`),
      datasets: [{
        data: freqData.map(f => f.count),
        backgroundColor: [COLORS.star5, COLORS.star4, COLORS.star3, COLORS.star2, COLORS.star1],
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function bestStreak() {
  if (data.dailyCheckin.length === 0) return 0;
  const sorted = [...data.dailyCheckin].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i-1], sorted[i]) === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

// =============== 数据管理 ===============
document.getElementById('export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `study-data-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出数据');
});

document.getElementById('import-data').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (confirm('导入将覆盖当前所有数据，是否继续？')) {
        data = Object.assign({}, DEFAULT_DATA, imported);
        saveData();
        showToast('数据已导入');
        renderToday();
        renderStats();
      }
    } catch (err) {
      alert('文件格式错误：' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('reset-data').addEventListener('click', () => {
  if (confirm('确定要重置所有学习数据吗？此操作不可恢复！')) {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData();
    showToast('已重置');
    renderToday();
    renderStats();
  }
});

// =============== 启动 ===============
initTheme();

// 今日推荐模式切换
document.querySelectorAll('#today-mode button[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    if (data.todayMode === m) return;
    data.todayMode = m;
    saveData();
    renderToday();
    // 滚动到今日列表顶部
    document.getElementById('today-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// 默认 tab
const initialTab = (location.hash || '#today').slice(1);
if (['today', 'library', 'errors', 'calendar', 'stats'].includes(initialTab)) {
  switchTab(initialTab);
} else {
  switchTab('today');
}

// 监听 hash 变化
window.addEventListener('hashchange', () => {
  const t = (location.hash || '#today').slice(1);
  if (['today', 'library', 'errors', 'calendar', 'stats'].includes(t)) {
    switchTab(t);
  }
});
