// sidepanel.js — Google Flow Batch Feeder v1.5
// Supports:
//   🤖 全自动模式 (Full-Auto): 点 ➕ ➔ 上传的内容 ➔ 添加到提示 ➔ 填提示词 ➔ 自动点击右下角白色 → 按钮生成
//   🖐️ 半自动模式 (Semi-Auto): 点 ➕ ➔ 上传的内容 ➔ 添加到提示 ➔ 填提示词（最后一步 → 交由用户手动点击）

const state = {
  projects: [],
  activeProjectId: '',
  activeMode: 'image', // 'image' | 'video'
  execMode: 'auto',    // 'auto' (全自动: 加图+填词+点生成) | 'semi' (半自动: 加图+填词，用户手点生成)
  queueIntervalSec: 25,

  // Separate Image Mode Lock State
  autoPlusImgRef: true,
  plusImgTab: '上传的内容',
  plusImgIndex: 1,
  plusImgKeyword: '',
  autoSyncImgMode: true,
  paramImgAspect: '16:9',
  paramImgCount: 'x1',

  // Separate Video Mode Lock State
  autoPlusVidRef: true,
  plusVidTab: '上传的内容',
  plusVidIndex: 1,
  plusVidKeyword: '',
  autoSyncVidMode: true,
  paramVidSubmode: '素材',
  paramVidAspect: '16:9',
  paramVidRes: '720p',
  paramVidCount: 'x1',

  isQueueRunning: false,
  countdownSec: 0,
  timerId: null
};

// DOM Elements
const projectSelect = document.getElementById('project-select');
const deleteProjectBtn = document.getElementById('delete-project-btn');
const openImportBtn = document.getElementById('open-import-btn');
const tabImage = document.getElementById('tab-image');
const tabVideo = document.getElementById('tab-video');
const imgProgressText = document.getElementById('img-progress-text');
const vidProgressText = document.getElementById('vid-progress-text');
const batchProgress = document.getElementById('batch-progress');

// Execution Mode Switcher Elements (全自动 vs 半自动)
const execFullAutoBtn = document.getElementById('exec-full-auto-btn');
const execSemiAutoBtn = document.getElementById('exec-semi-auto-btn');

// Native + Picker Elements
const autoPlusRefCheck = document.getElementById('auto-plus-ref-check');
const plusRefTitle = document.getElementById('plus-ref-title');
const plusTabSelect = document.getElementById('plus-tab-select');
const plusItemIndexInput = document.getElementById('plus-item-index');
const plusItemKeywordInput = document.getElementById('plus-item-keyword');

// Separate Mode Sync Panels
const imgSyncPanel = document.getElementById('img-sync-panel');
const autoSyncImgCheck = document.getElementById('auto-sync-img-check');
const paramImgAspectSelect = document.getElementById('param-img-aspect');
const paramImgCountSelect = document.getElementById('param-img-count');

const vidSyncPanel = document.getElementById('vid-sync-panel');
const autoSyncVidCheck = document.getElementById('auto-sync-vid-check');
const paramVidSubmodeSelect = document.getElementById('param-vid-submode');
const paramVidAspectSelect = document.getElementById('param-vid-aspect');
const paramVidResSelect = document.getElementById('param-vid-res');
const paramVidCountSelect = document.getElementById('param-vid-count');

// Queue Controls
const toggleQueueBtn = document.getElementById('toggle-queue-btn');
const feedNextBtn = document.getElementById('feed-next-btn');
const intervalInput = document.getElementById('interval-input');
const resetProgressBtn = document.getElementById('reset-progress-btn');
const statusBanner = document.getElementById('status-banner');
const shotsContainer = document.getElementById('shots-container');

// Dialog Elements
const importDialog = document.getElementById('import-dialog');
const newProjectNameInput = document.getElementById('new-project-name');
const fileUploadInput = document.getElementById('file-upload-input');
const pasteImagePrompts = document.getElementById('paste-image-prompts');
const pasteVideoPrompts = document.getElementById('paste-video-prompts');
const confirmImportBtn = document.getElementById('confirm-import-btn');

// Light-dismiss fallback for browsers without native <dialog closedby="any">
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const isOutside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  importDialog.addEventListener('pointerdown', (e) => {
    pressedOutside = isOutside(e, importDialog);
  });
  importDialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && isOutside(e, importDialog)) {
      importDialog.close();
    }
  });
  importDialog.addEventListener('click', (event) => {
    if (event.target !== importDialog) return;
    const rect = importDialog.getBoundingClientRect();
    const isDialogContent = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
    if (!isDialogContent) importDialog.close();
  });
}

importDialog.addEventListener('close', () => {
  importDialog.returnValue = '';
});

function setStatus(msg) {
  statusBanner.textContent = msg;
}

function normalizeFlowDuration(durStr) {
  if (!durStr) return '6 秒';
  const num = parseInt(String(durStr).replace(/[^\d]/g, ''), 10);
  if (num <= 4) return '4 秒';
  if (num <= 6) return '6 秒';
  if (num <= 8) return '8 秒';
  return '10 秒';
}

// Automatically strip/replace celebrity names in video prompts with "图中的人物"
// so Google Flow video generation never blocks due to celebrity safety filters.
function cleanCelebrityNamesForVideo(text) {
  if (!text) return '';
  return text
    .replace(/左侧杰伦·布朗手部纸片/g, '左侧拉扯的手部纸片')
    .replace(/右侧詹姆斯后背/g, '右侧图中的人物后背')
    .replace(/左框科比穿Nike湖人球衣/g, '左框图中的人物穿Nike球衣')
    .replace(/中框艾弗森穿Champion球衣/g, '中框图中的人物穿Champion球衣')
    .replace(/左框科比剪纸立牌/g, '左框图中的人物剪纸立牌')
    .replace(/中框艾弗森剪纸立牌/g, '中框图中的人物剪纸立牌')
    .replace(/左框科比与首冠奖杯/g, '左框图中的人物与首冠奖杯')
    .replace(/中框艾弗森与警示红/g, '中框图中的人物与警示红')
    .replace(/艾弗森孤胆英雄剪纸立牌/g, '图中的人物剪纸立牌')
    .replace(/穿短袖球衣的库里与诺维茨基剪纸/g, '穿短袖球衣的两位图中的人物剪纸')
    .replace(/左侧库里卡肩膀特写/g, '左侧图中的人物卡肩膀特写')
    .replace(/右侧诺维茨基卡肩膀特写/g, '右侧图中的人物卡肩膀特写')
    .replace(/左侧库里手臂纸片/g, '左侧图中的人物手臂纸片')
    .replace(/右侧诺维茨基手臂纸片/g, '右侧图中的人物手臂纸片')
    .replace(/左侧库里肩部/g, '左侧图中的人物肩部')
    .replace(/右侧诺维茨基肩部/g, '右侧图中的人物肩部')
    .replace(/左侧JR·史密斯的高饱和/g, '左侧图中的人物手臂上的高饱和')
    .replace(/Nike乔丹剪影/g, 'Nike运动剪影')
    .replace(/Jordan飞人剪纸贴片/g, '飞人标志剪纸贴片')
    .replace(/湖人曼巴黑金版/g, '黑金配色城市版')
    .replace(/迈克尔·乔丹|乔丹/g, '图中的人物')
    .replace(/勒布朗·詹姆斯|詹姆斯|老詹/g, '图中的人物')
    .replace(/杰伦·布朗/g, '图中的对手人物')
    .replace(/科比·布莱恩特|科比/g, '图中的人物')
    .replace(/阿伦·艾弗森|艾弗森/g, '图中的人物')
    .replace(/斯蒂芬·库里|库里/g, '图中的人物')
    .replace(/德克·诺维茨基|诺维茨基/g, '图中的人物')
    .replace(/雷·阿伦|雷阿伦/g, '图中的人物')
    .replace(/史蒂夫·纳什|纳什/g, '图中的人物')
    .replace(/德怀恩·韦德|韦德/g, '图中的人物')
    .replace(/JR·史密斯|JR史密斯/g, '图中的人物')
    .replace(/拉里·伯德|伯德/g, '图中的人物')
    .replace(/魔术师约翰逊|约翰逊/g, '图中的人物')
    .replace(/沙奎尔·奥尼尔|奥尼尔/g, '图中的人物')
    .replace(/凯文·杜兰特|杜兰特/g, '图中的人物')
    .replace(/蒂姆·邓肯|邓肯/g, '图中的人物')
    .replace(/凯文·加内特|加内特/g, '图中的人物')
    .replace(/卡梅隆·安东尼|安东尼/g, '图中的人物')
    .replace(/文斯·卡特|卡特/g, '图中的人物')
    .replace(/特雷西·麦克格雷迪|麦迪/g, '图中的人物')
    .replace(/丹尼斯·罗德曼|罗德曼/g, '图中的人物')
    .replace(/斯科蒂·皮蓬|皮蓬/g, '图中的人物')
    .replace(/查尔斯·巴克利|巴克利/g, '图中的人物')
    .replace(/大卫·斯特恩|斯特恩/g, '图中的人物')
    .replace(/亚当·萧华|萧华/g, '图中的人物')
    .replace(/图中的人物图中的人物/g, '图中的人物');
}

function getActiveProject() {
  return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0] || null;
}

async function saveState() {
  try {
    await chrome.storage.local.set({
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      activeMode: state.activeMode,
      execMode: state.execMode,
      queueIntervalSec: state.queueIntervalSec,
      autoPlusImgRef: state.autoPlusImgRef,
      plusImgTab: state.plusImgTab,
      plusImgIndex: state.plusImgIndex,
      plusImgKeyword: state.plusImgKeyword,
      autoSyncImgMode: state.autoSyncImgMode,
      paramImgAspect: state.paramImgAspect,
      paramImgCount: state.paramImgCount,
      autoPlusVidRef: state.autoPlusVidRef,
      v16PlusInit: true,
      plusVidTab: state.plusVidTab,
      plusVidIndex: state.plusVidIndex,
      plusVidKeyword: state.plusVidKeyword,
      autoSyncVidMode: state.autoSyncVidMode,
      paramVidSubmode: state.paramVidSubmode,
      paramVidAspect: state.paramVidAspect,
      paramVidRes: state.paramVidRes,
      paramVidCount: state.paramVidCount
    });
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

function renderExecModeUI() {
  const isAuto = state.execMode === 'auto';
  execFullAutoBtn.classList.toggle('active', isAuto);
  execSemiAutoBtn.classList.toggle('active', !isAuto);

  if (!state.isQueueRunning) {
    toggleQueueBtn.textContent = isAuto
      ? '▶️ 启动全自动排队投喂'
      : '▶️ 启动半自动排队投喂';
  }
  feedNextBtn.textContent = isAuto
    ? '⚡ 全自动投喂下一镜'
    : '🖐️ 半自动装填下一镜';
}

function renderModePanels() {
  const isImg = state.activeMode === 'image';

  imgSyncPanel.hidden = !isImg;
  vidSyncPanel.hidden = isImg;

  if (isImg) {
    plusRefTitle.textContent = '【生图参考图】自动点左下角 ➕ ➔ 上传的内容 ➔ 添加到提示';
    autoPlusRefCheck.checked = state.autoPlusImgRef;
    plusTabSelect.value = state.plusImgTab;
    plusItemIndexInput.value = String(state.plusImgIndex);
    plusItemKeywordInput.value = state.plusImgKeyword;
  } else {
    plusRefTitle.textContent = '【视频参考图】自动点左下角 ➕ ➔ 选择分镜图 ➔ 添加到提示';
    autoPlusRefCheck.checked = state.autoPlusVidRef;
    plusTabSelect.value = state.plusVidTab;
    plusItemIndexInput.value = String(state.plusVidIndex);
    plusItemKeywordInput.value = state.plusVidKeyword;
  }
}

async function init() {
  try {
    const stored = await chrome.storage.local.get(null);

    if (Array.isArray(stored.projects) && stored.projects.length > 0) {
      state.projects = stored.projects;
      // Auto-register Episode 1 if not present
      if (window.DEFAULT_EP1_PROJECT && !state.projects.some(p => p.id === window.DEFAULT_EP1_PROJECT.id)) {
        state.projects.push(structuredClone(window.DEFAULT_EP1_PROJECT));
        state.activeProjectId = window.DEFAULT_EP1_PROJECT.id;
        saveState();
      }
    } else {
      state.projects = [];
      if (window.DEFAULT_EP0_PROJECT) state.projects.push(structuredClone(window.DEFAULT_EP0_PROJECT));
      if (window.DEFAULT_EP1_PROJECT) state.projects.push(structuredClone(window.DEFAULT_EP1_PROJECT));
      state.activeProjectId = window.DEFAULT_EP1_PROJECT ? window.DEFAULT_EP1_PROJECT.id : (state.projects[0]?.id ?? '');
    }

    for (const proj of state.projects) {
      for (const s of proj.shots) {
        if (!s.flowDur) {
          s.flowDur = normalizeFlowDuration(s.dur);
        }
        if (s.videoPrompt) {
          s.videoPrompt = cleanCelebrityNamesForVideo(s.videoPrompt);
        }
      }
    }

    state.activeProjectId = stored.activeProjectId || (state.projects[0]?.id ?? '');
    state.activeMode = stored.activeMode || 'image';
    state.execMode = stored.execMode || 'auto';
    state.queueIntervalSec = stored.queueIntervalSec || 25;

    state.autoPlusImgRef = stored.v16PlusInit ? (stored.autoPlusImgRef ?? true) : true;
    state.plusImgTab = stored.plusImgTab || '上传的内容';
    state.plusImgIndex = stored.plusImgIndex || 1;
    state.plusImgKeyword = stored.plusImgKeyword || '';
    state.autoSyncImgMode = stored.autoSyncImgMode !== undefined ? stored.autoSyncImgMode : true;
    state.paramImgAspect = stored.paramImgAspect || '16:9';
    state.paramImgCount = stored.paramImgCount || 'x1';

    state.autoPlusVidRef = stored.v16PlusInit ? (stored.autoPlusVidRef ?? true) : true;
    state.plusVidTab = stored.plusVidTab || '上传的内容';
    state.plusVidIndex = stored.plusVidIndex || 1;
    state.plusVidKeyword = stored.plusVidKeyword || '';
    state.autoSyncVidMode = stored.autoSyncVidMode !== undefined ? stored.autoSyncVidMode : true;
    state.paramVidSubmode = stored.paramVidSubmode || '素材';
    state.paramVidAspect = stored.paramVidAspect || '16:9';
    state.paramVidRes = stored.paramVidRes || '720p';
    state.paramVidCount = stored.paramVidCount || 'x1';

    intervalInput.value = String(state.queueIntervalSec);

    autoSyncImgCheck.checked = state.autoSyncImgMode;
    paramImgAspectSelect.value = state.paramImgAspect;
    paramImgCountSelect.value = state.paramImgCount;

    autoSyncVidCheck.checked = state.autoSyncVidMode;
    paramVidSubmodeSelect.value = state.paramVidSubmode;
    paramVidAspectSelect.value = state.paramVidAspect;
    paramVidResSelect.value = state.paramVidRes;
    paramVidCountSelect.value = state.paramVidCount;

    await saveState();
    renderAll();
  } catch (err) {
    console.error('Init failed:', err);
    setStatus('初始化失败：' + err.message);
  }
}

function renderProjectSelect() {
  projectSelect.innerHTML = '';
  for (const proj of state.projects) {
    const opt = document.createElement('option');
    opt.value = proj.id;
    opt.textContent = `${proj.name}`;
    if (proj.id === state.activeProjectId) opt.selected = true;
    projectSelect.appendChild(opt);
  }
}

function updateHeaderStats() {
  const proj = getActiveProject();
  if (!proj) return;

  const total = proj.shots.length;
  const imgDoneCount = proj.shots.filter((s) => s.imgDone).length;
  const vidDoneCount = proj.shots.filter((s) => s.vidDone).length;

  imgProgressText.textContent = `${imgDoneCount}/${total}`;
  vidProgressText.textContent = `${vidDoneCount}/${total}`;

  const currentDone = state.activeMode === 'image' ? imgDoneCount : vidDoneCount;
  const pct = total > 0 ? Math.round((currentDone / total) * 100) : 0;
  batchProgress.value = pct;
  batchProgress.textContent = `${pct}%`;

  tabImage.classList.toggle('active', state.activeMode === 'image');
  tabImage.setAttribute('aria-selected', String(state.activeMode === 'image'));
  tabVideo.classList.toggle('active', state.activeMode === 'video');
  tabVideo.setAttribute('aria-selected', String(state.activeMode === 'video'));
}

function renderShotsList() {
  shotsContainer.innerHTML = '';
  const proj = getActiveProject();
  if (!proj || proj.shots.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint-text';
    empty.textContent = '当前项目暂无分镜，请点击右上角「➕ 导入新期数」。';
    shotsContainer.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const isImg = state.activeMode === 'image';
  const isAuto = state.execMode === 'auto';

  proj.shots.forEach((shot, index) => {
    const doneKey = isImg ? 'imgDone' : 'vidDone';
    const promptKey = isImg ? 'imagePrompt' : 'videoPrompt';
    const isDone = Boolean(shot[doneKey]);
    const promptVal = shot[promptKey] || '';

    const card = document.createElement('article');
    card.className = `shot-card${isDone ? ' is-done' : ''}`;
    card.dataset.index = String(index);

    const header = document.createElement('div');
    header.className = 'shot-header';

    const meta = document.createElement('div');
    meta.className = 'shot-meta';

    const badge = document.createElement('span');
    badge.className = 'shot-badge';
    badge.textContent = `分镜${shot.id || String(index + 1).padStart(2, '0')}`;
    meta.appendChild(badge);

    if (shot.time) {
      const timeTag = document.createElement('span');
      timeTag.className = 'shot-time';
      timeTag.textContent = shot.time;
      meta.appendChild(timeTag);
    }

    if (!isImg) {
      const durSelect = document.createElement('select');
      durSelect.className = 'shot-dur-select';
      durSelect.title = '对应 Google Flow 视频生成秒数';
      for (const dOpt of ['4 秒', '6 秒', '8 秒', '10 秒']) {
        const o = document.createElement('option');
        o.value = dOpt;
        o.textContent = dOpt;
        if ((shot.flowDur || '6 秒') === dOpt) o.selected = true;
        durSelect.appendChild(o);
      }
      durSelect.addEventListener('change', async () => {
        shot.flowDur = durSelect.value;
        await saveState();
        renderShotsList();
      });
      meta.appendChild(durSelect);
    }

    if (shot.cam) {
      const camTag = document.createElement('span');
      camTag.className = 'shot-cam';
      camTag.textContent = shot.cam;
      meta.appendChild(camTag);
    }

    const doneLabel = document.createElement('label');
    doneLabel.className = 'setting-item checkbox-label';
    const doneCheck = document.createElement('input');
    doneCheck.type = 'checkbox';
    doneCheck.className = 'visually-hidden';
    doneCheck.checked = isDone;
    doneCheck.addEventListener('change', async () => {
      shot[doneKey] = doneCheck.checked;
      card.classList.toggle('is-done', doneCheck.checked);
      updateHeaderStats();
      await saveState();
    });
    const doneSpan = document.createElement('span');
    doneSpan.textContent = '已完成';
    doneLabel.appendChild(doneCheck);
    doneLabel.appendChild(doneSpan);

    header.appendChild(meta);
    header.appendChild(doneLabel);
    card.appendChild(header);

    if (shot.text) {
      const scriptLine = document.createElement('p');
      scriptLine.className = 'shot-script';
      scriptLine.textContent = shot.text;
      card.appendChild(scriptLine);
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'shot-prompt-preview';
    textarea.rows = 3;
    textarea.value = promptVal;
    textarea.setAttribute('aria-label', `分镜${shot.id}提示词编辑`);
    textarea.addEventListener('change', async () => {
      shot[promptKey] = textarea.value.trim();
      await saveState();
    });
    card.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'shot-actions';

    const tagSuffix = isImg ? `图片 ${state.paramImgAspect}` : (shot.flowDur || '6 秒');

    // Primary button follows current execMode, plus explicit quick button for the alternate mode
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = isAuto ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    autoBtn.textContent = `🤖 全自动生成 (${tagSuffix})`;
    autoBtn.title = '自动点 ➕ 添加参考图 ➔ 填提示词 ➔ 自动点击右下角白色 → 按钮生成';
    autoBtn.addEventListener('click', async () => {
      await feedShotToFlow(index, true);
    });

    const semiBtn = document.createElement('button');
    semiBtn.type = 'button';
    semiBtn.className = !isAuto ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    semiBtn.textContent = `🖐️ 半自动装填`;
    semiBtn.title = '自动点 ➕ 添加参考图 ➔ 填提示词（最后一步 → 交给你手动点击）';
    semiBtn.addEventListener('click', async () => {
      await feedShotToFlow(index, false);
    });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost btn-sm';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制提示词到剪贴板';
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(shot[promptKey] || '');
      setStatus(`已复制 分镜${shot.id} (${isImg ? '生图' : '视频'}) 提示词到剪贴板。`);
    });

    if (isAuto) {
      actions.appendChild(autoBtn);
      actions.appendChild(semiBtn);
    } else {
      actions.appendChild(semiBtn);
      actions.appendChild(autoBtn);
    }
    actions.appendChild(copyBtn);
    card.appendChild(actions);

    fragment.appendChild(card);
  });

  shotsContainer.appendChild(fragment);
}

function renderAll() {
  renderProjectSelect();
  renderExecModeUI();
  renderModePanels();
  updateHeaderStats();
  renderShotsList();
}

// Execution Mode Switcher Listeners (全自动 vs 半自动)
execFullAutoBtn.addEventListener('click', async () => {
  state.execMode = 'auto';
  await saveState();
  renderExecModeUI();
  renderShotsList();
  setStatus('已切换至「🤖 全自动模式」：自动加参考图 + 填提示词 + 自动点击右下角白色 → 生成按钮。');
});

execSemiAutoBtn.addEventListener('click', async () => {
  state.execMode = 'semi';
  await saveState();
  renderExecModeUI();
  renderShotsList();
  setStatus('已切换至「🖐️ 半自动模式」：自动加参考图 + 填提示词，最后一步 → 生成按钮交给你手动点击。');
});

// Listeners for Native + Asset Picker Settings
autoPlusRefCheck.addEventListener('change', async () => {
  if (state.activeMode === 'image') {
    state.autoPlusImgRef = autoPlusRefCheck.checked;
  } else {
    state.autoPlusVidRef = autoPlusRefCheck.checked;
  }
  await saveState();
});

plusTabSelect.addEventListener('change', async () => {
  if (state.activeMode === 'image') {
    state.plusImgTab = plusTabSelect.value;
  } else {
    state.plusVidTab = plusTabSelect.value;
  }
  await saveState();
});

plusItemIndexInput.addEventListener('change', async () => {
  const val = Math.max(1, parseInt(plusItemIndexInput.value, 10) || 1);
  plusItemIndexInput.value = String(val);
  if (state.activeMode === 'image') {
    state.plusImgIndex = val;
  } else {
    state.plusVidIndex = val;
  }
  await saveState();
});

plusItemKeywordInput.addEventListener('change', async () => {
  const val = plusItemKeywordInput.value.trim();
  if (state.activeMode === 'image') {
    state.plusImgKeyword = val;
  } else {
    state.plusVidKeyword = val;
  }
  await saveState();
});

autoSyncImgCheck.addEventListener('change', async () => {
  state.autoSyncImgMode = autoSyncImgCheck.checked;
  await saveState();
});

paramImgAspectSelect.addEventListener('change', async () => {
  state.paramImgAspect = paramImgAspectSelect.value;
  await saveState();
  renderShotsList();
});

paramImgCountSelect.addEventListener('change', async () => {
  state.paramImgCount = paramImgCountSelect.value;
  await saveState();
});

autoSyncVidCheck.addEventListener('change', async () => {
  state.autoSyncVidMode = autoSyncVidCheck.checked;
  await saveState();
});

paramVidSubmodeSelect.addEventListener('change', async () => {
  state.paramVidSubmode = paramVidSubmodeSelect.value;
  await saveState();
});

paramVidAspectSelect.addEventListener('change', async () => {
  state.paramVidAspect = paramVidAspectSelect.value;
  await saveState();
});

paramVidResSelect.addEventListener('change', async () => {
  state.paramVidRes = paramVidResSelect.value;
  await saveState();
});

paramVidCountSelect.addEventListener('change', async () => {
  state.paramVidCount = paramVidCountSelect.value;
  await saveState();
});

// Core Engine: Execute native "+ -> 上传的内容 -> 选择图 -> 添加到提示 -> 填提示词 -> (全自动点 → / 半自动停)" workflow
async function feedShotToFlow(shotIndex, overrideShouldSubmit = null) {
  const proj = getActiveProject();
  if (!proj || !proj.shots[shotIndex]) return false;

  const shot = proj.shots[shotIndex];
  const isImg = state.activeMode === 'image';
  const promptText = (isImg ? shot.imagePrompt : shot.videoPrompt) || '';
  const doneKey = isImg ? 'imgDone' : 'vidDone';
  const targetFlowDur = shot.flowDur || normalizeFlowDuration(shot.dur) || '6 秒';
  const shouldSubmit = overrideShouldSubmit !== null ? overrideShouldSubmit : (state.execMode === 'auto');

  if (!promptText) {
    setStatus(`⚠️ 分镜${shot.id} 在当前模式下没有提示词内容！`);
    return false;
  }

  document.querySelectorAll('.shot-card').forEach((el) => el.classList.remove('is-active'));
  const activeCard = shotsContainer.querySelector(`.shot-card[data-index="${shotIndex}"]`);
  if (activeCard) {
    activeCard.classList.add('is-active');
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const usePlusPicker = isImg ? state.autoPlusImgRef : state.autoPlusVidRef;
  const plusTab = isImg ? state.plusImgTab : state.plusVidTab;
  const plusIndex = isImg ? state.plusImgIndex : state.plusVidIndex;
  const plusKeyword = isImg ? state.plusImgKeyword : state.plusVidKeyword;

  setStatus(
    `⏳ 正在执行 分镜${shot.id} (${shouldSubmit ? '🤖 全自动' : '🖐️ 半自动'})：${
      usePlusPicker ? '点 ➕ 添加参考图 ➔ ' : ''
    }填提示词${shouldSubmit ? ' ➔ 自动点白色 → 生成...' : ' (等待你手点 →)...'}`
  );

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      setStatus(`⚠️ 未检测到活动网页标签。`);
      return false;
    }

    const payload = {
      promptText,
      mode: state.activeMode, // 'image' | 'video'
      shouldSubmit,
      usePlusPicker,
      plusTab,
      plusIndex,
      plusKeyword,
      autoSyncMode: isImg ? state.autoSyncImgMode : state.autoSyncVidMode,
      aspectRatio: isImg ? state.paramImgAspect : state.paramVidAspect,
      genCount: isImg ? state.paramImgCount : state.paramVidCount,
      vidSubmode: state.paramVidSubmode, // '素材' | '帧'
      vidRes: state.paramVidRes,         // '720p' | '360p'
      vidDur: targetFlowDur              // '4 秒' | '6 秒' | '8 秒' | '10 秒'
    };

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (cfg) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        function queryAllDeep(root = document) {
          const all = [];
          const walker = (node) => {
            if (!node || !node.querySelectorAll) return;
            const list = node.querySelectorAll('*');
            for (const el of list) {
              all.push(el);
              if (el.shadowRoot) {
                walker(el.shadowRoot);
              }
            }
          };
          walker(root);
          return all;
        }

        function isVisible(el) {
          if (!el || !el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        // Single clean click helper (never fires duplicate clicks!)
        function triggerSingleClick(el) {
          if (!el) return;
          if (typeof el.click === 'function') {
            el.click();
          } else {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                composed: true,
                cancelable: true,
                clientX: r.left + r.width / 2,
                clientY: r.top + r.height / 2
              })
            );
          }
        }

        // Full pointer+mouse sequence for custom elements that require pointerdown/up
        function triggerPointerSequence(el) {
          if (!el) return;
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const pointerOpts = {
            bubbles: true,
            composed: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: cx,
            clientY: cy
          };
          const mouseOpts = {
            bubbles: true,
            composed: true,
            cancelable: true,
            button: 0,
            buttons: 1,
            clientX: cx,
            clientY: cy
          };
          try {
            el.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
          } catch (_) {}
          el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
          try {
            el.dispatchEvent(new PointerEvent('pointerup', { ...pointerOpts, buttons: 0 }));
          } catch (_) {}
          el.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, buttons: 0 }));
        }

        // Safely open a popover/modal without ever toggling it open-then-shut!
        async function openOverlaySafely(triggerBtn, findOverlayFn) {
          let overlay = findOverlayFn();
          if (overlay) return overlay;
          if (!triggerBtn) return null;

          // Attempt 1: Native single .click()
          triggerSingleClick(triggerBtn);
          for (let w = 0; w < 5; w++) {
            await sleep(120);
            overlay = findOverlayFn();
            if (overlay) return overlay;
          }

          // Attempt 2: Pointerdown/up sequence ONLY (without .click() so we never double-toggle)
          triggerPointerSequence(triggerBtn);
          for (let w = 0; w < 5; w++) {
            await sleep(130);
            overlay = findOverlayFn();
            if (overlay) return overlay;
          }

          return findOverlayFn();
        }

        function triggerOptionClick(el) {
          if (!el) return;
          triggerSingleClick(el);
        }

        function isGenuineInput(el) {
          if (!el || !el.tagName) return false;
          const tag = el.tagName.toUpperCase();
          if (tag === 'HTML' || tag === 'BODY' || tag === 'MAIN' || tag === 'SECTION') return false;
          // Exclude the "搜索资源" / top search input!
          const ph = (el.getAttribute?.('placeholder') || '') + ' ' + (el.getAttribute?.('aria-label') || '');
          if (ph.includes('搜索') || ph.toLowerCase().includes('search')) return false;

          if (tag === 'TEXTAREA' && !el.disabled) return true;
          if (tag === 'INPUT' && !el.disabled && (!el.type || el.type === 'text')) return true;
          if (el.isContentEditable) return true;
          if (el.getAttribute?.('role') === 'textbox') return true;
          const ce = el.getAttribute?.('contenteditable');
          if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
          return false;
        }

        function findPromptInput() {
          const allEls = queryAllDeep(document).filter(isVisible);
          const editables = allEls.filter(isGenuineInput);

          const byPlaceholder = editables.find((el) => {
            const ph = (
              (el.getAttribute?.('placeholder') || '') +
              ' ' +
              (el.getAttribute?.('data-placeholder') || '') +
              ' ' +
              (el.getAttribute?.('aria-label') || '') +
              ' ' +
              (el.parentElement?.innerText || '')
            ).toLowerCase();
            return (
              ph.includes('创作什么') ||
              ph.includes('您希望') ||
              ph.includes('what do you want') ||
              ph.includes('describe')
            );
          });
          if (byPlaceholder) return byPlaceholder;

          const leafPlaceholder = allEls.find((el) => {
            if (el.children && el.children.length > 0) return false;
            const t = (el.textContent || '').trim();
            return (
              t === '您希望创作什么？' ||
              t === '您希望创作什么?' ||
              t.toLowerCase() === 'what do you want to create?'
            );
          });

          if (leafPlaceholder) {
            leafPlaceholder.click();
            let curr = leafPlaceholder.parentElement;
            for (let i = 0; i < 4 && curr; i++) {
              if (isGenuineInput(curr)) return curr;
              const inner = queryAllDeep(curr).find(isGenuineInput);
              if (inner) return inner;
              curr = curr.parentElement;
            }
            if (isGenuineInput(document.activeElement)) {
              return document.activeElement;
            }
          }

          if (editables.length > 0) {
            editables.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
            return editables[0];
          }

          return null;
        }

        let inputEl = findPromptInput();
        if (!inputEl || !isGenuineInput(inputEl)) {
          return { ok: false, reason: '未在页面底部找到「您希望创作什么？」输入框' };
        }

        // Find the dark floating composer card wrapping inputEl and the bottom toolbar.
        // No artificial height cap so even 15-line prompts (height > 500px) are matched!
        function findComposerBox(startEl) {
          let curr = startEl;
          for (let i = 0; i < 12 && curr && curr !== document.body; i++) {
            const r = curr.getBoundingClientRect?.();
            if (r && r.width > 240 && r.width < window.innerWidth * 0.85 && r.height >= 50) {
              const txt = curr.innerText || curr.textContent || '';
              if (
                txt.includes('智能体') ||
                txt.includes('Nano Banana') ||
                txt.includes('Omni') ||
                txt.includes('720p') ||
                txt.includes('360p') ||
                /\bx[1-4]\b/i.test(txt)
              ) {
                return curr;
              }
            }
            curr = curr.parentElement || curr.getRootNode?.()?.host;
          }
          return startEl.parentElement || document.body;
        }

        let composerBox = findComposerBox(inputEl);

        // Get all interactive buttons inside composerBox OR in the toolbar band right below inputEl
        function getComposerButtons() {
          inputEl = findPromptInput() || inputEl;
          composerBox = findComposerBox(inputEl);
          const inRect = inputEl.getBoundingClientRect();

          const fromBox = queryAllDeep(composerBox).filter(
            (el) =>
              isVisible(el) &&
              (el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button')
          );

          const fromBand = queryAllDeep(document).filter((el) => {
            if (!isVisible(el)) return false;
            if (el.tagName !== 'BUTTON' && el.getAttribute?.('role') !== 'button') return false;
            const r = el.getBoundingClientRect();
            return (
              r.top >= inRect.bottom - 30 &&
              r.bottom <= inRect.bottom + 100 &&
              r.left >= inRect.left - 80 &&
              r.right <= inRect.right + 150
            );
          });

          const merged = [...fromBox];
          for (const b of fromBand) {
            if (!merged.includes(b)) merged.push(b);
          }
          return merged;
        }

        // Helper to locate the mode pill button (e.g. "🍌 Nano Banana 2.1 ▭ x1" or "视频 · 720p · 6 秒 ▭ x1")
        function findModePillBtn() {
          const btns = getComposerButtons();
          return (
            btns.find((btn) => {
              const t = (btn.innerText || btn.textContent || '').replace(/\s+/g, ' ').trim();
              return (
                t.includes('Nano Banana') ||
                t.includes('Omni') ||
                t.includes('Veo') ||
                t.includes('Imagen') ||
                t.includes('720p') ||
                t.includes('360p') ||
                /\bx[1-4]\b/i.test(t) ||
                (t.includes('视频') && t.length > 2) ||
                (t.includes('图片') && t.length > 2)
              );
            }) || null
          );
        }

        // Helper: check if a reference image thumbnail is already attached in the composer top tray
        const getAttachedThumbs = () => {
          inputEl = findPromptInput() || inputEl;
          composerBox = findComposerBox(inputEl);
          const boxRect = composerBox.getBoundingClientRect();
          const inRect = inputEl.getBoundingClientRect();
          if (inRect.top - boxRect.top < 40) return [];
          return queryAllDeep(composerBox).filter((el) => {
            if (!isVisible(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 28 || r.width > 110 || r.height < 28 || r.height > 110) return false;
            if (r.top < boxRect.top - 4 || r.bottom > inRect.top + 14) return false;
            if (el.tagName === 'IMG') return true;
            const bg = window.getComputedStyle(el).backgroundImage || '';
            if (bg && bg !== 'none' && bg.includes('url(')) return true;
            return false;
          });
        };

        // =========================================================================
        // STEP 1: 先添加提示图 (Click bottom-left "+" -> 上传的内容 -> 选择图 -> 添加到提示)
        // =========================================================================
        if (cfg.usePlusPicker && getAttachedThumbs().length === 0) {
          const findAssetPickerModal = () => {
            const modals = queryAllDeep(document).filter((el) => {
              if (!isVisible(el)) return false;
              if (el.contains(inputEl)) return false; // NEVER match body/main/composerBox!
              const r = el.getBoundingClientRect();
              // Must be the floating asset picker popup (not the full page body/main!)
              if (r.width < 320 || r.width > 980 || r.height < 220 || r.height > 780) return false;
              const txt = el.innerText || el.textContent || '';
              return (
                txt.includes('上传的内容') &&
                (txt.includes('上传媒体内容') || txt.includes('搜索资源') || txt.includes('虚拟形象') || txt.includes('最近'))
              );
            });
            modals.sort(
              (a, b) =>
                a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                b.getBoundingClientRect().width * b.getBoundingClientRect().height
            );
            return modals[0] || null;
          };

          let pickerModal = findAssetPickerModal();
          if (!pickerModal) {
            const composerBtns = getComposerButtons();
            const agentBtn = composerBtns.find((b) =>
              (b.innerText || b.textContent || '').includes('智能体')
            );

            let plusBtn = null;
            if (agentBtn) {
              const agentRect = agentBtn.getBoundingClientRect();
              const leftBtns = composerBtns.filter(
                (b) =>
                  b !== agentBtn &&
                  b.getBoundingClientRect().right <= agentRect.left + 16 &&
                  Math.abs(b.getBoundingClientRect().top - agentRect.top) < 28
              );
              leftBtns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
              plusBtn = leftBtns[0] || null;
            }

            if (!plusBtn) {
              const inRect = inputEl.getBoundingClientRect();
              const bottomLeftBtns = composerBtns.filter(
                (b) => b.getBoundingClientRect().top >= inRect.bottom - 24
              );
              bottomLeftBtns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
              plusBtn = bottomLeftBtns[0] || null;
            }

            if (plusBtn) {
              pickerModal = await openOverlaySafely(plusBtn, findAssetPickerModal);
            }
          }

          if (pickerModal) {
            const modalEls = queryAllDeep(pickerModal).filter(isVisible);
            const targetTabName = cfg.plusTab || '上传的内容';

            const tabCandidates = modalEls.filter((el) => {
              const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
              return raw === targetTabName || raw.endsWith(' ' + targetTabName);
            });

            if (tabCandidates.length > 0) {
              const tabEl =
                tabCandidates[tabCandidates.length - 1].closest?.('button, [role="tab"], [role="button"], li, div') ||
                tabCandidates[tabCandidates.length - 1];
              triggerOptionClick(tabEl);
              await sleep(360);
            }

            pickerModal = findAssetPickerModal() || pickerModal;
            const modalRect = pickerModal.getBoundingClientRect();

            const findAddToPromptBtn = () => {
              return queryAllDeep(pickerModal)
                .filter(isVisible)
                .find((el) => {
                  const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                  return (
                    (raw === '添加到提示' || raw === 'Add to prompt') &&
                    (el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button' || el.children.length === 0)
                  );
                });
            };

            const middleImgs = queryAllDeep(pickerModal).filter((el) => {
              if (el.tagName !== 'IMG' || !isVisible(el)) return false;
              const r = el.getBoundingClientRect();
              return (
                r.width >= 26 &&
                r.width <= 165 &&
                r.left >= modalRect.left + 110 &&
                r.left <= modalRect.left + modalRect.width * 0.56 &&
                r.top >= modalRect.top + 44
              );
            });

            let targetAssetEl = null;
            const kw = (cfg.plusKeyword || '').toLowerCase();
            if (kw && middleImgs.length > 0) {
              const matchedImg = middleImgs.find((im) => {
                const card = im.closest?.('button, [role="button"], [role="option"], li, div') || im.parentElement;
                const txt = ((card?.innerText || '') + ' ' + (im.alt || '')).toLowerCase();
                return txt.includes(kw);
              });
              if (matchedImg) {
                targetAssetEl = matchedImg.closest?.('button, [role="button"], [role="option"], div') || matchedImg;
              }
            }

            if (!targetAssetEl && middleImgs.length > 0) {
              const idx = Math.max(0, Math.min(middleImgs.length - 1, (cfg.plusIndex || 1) - 1));
              const chosenImg = middleImgs[idx];
              targetAssetEl = chosenImg.closest?.('button, [role="button"], [role="option"], div') || chosenImg;
            }

            const alreadyReady = (cfg.plusIndex || 1) === 1 && !kw && Boolean(findAddToPromptBtn());
            if (!alreadyReady && targetAssetEl) {
              triggerOptionClick(targetAssetEl);
              await sleep(320);
            }
            if (!findAddToPromptBtn() && middleImgs.length > 0) {
              const idx = Math.max(0, Math.min(middleImgs.length - 1, (cfg.plusIndex || 1) - 1));
              triggerOptionClick(middleImgs[idx]);
              await sleep(320);
            }

            let addToPromptBtn = null;
            for (let w = 0; w < 12; w++) {
              const rawMatch = findAddToPromptBtn();
              if (rawMatch) {
                addToPromptBtn = rawMatch.closest?.('button, [role="button"]') || rawMatch;
                break;
              }
              await sleep(140);
            }

            if (addToPromptBtn) {
              triggerOptionClick(addToPromptBtn);
              for (let w = 0; w < 15; w++) {
                await sleep(150);
                if (!findAssetPickerModal() && getAttachedThumbs().length > 0) {
                  break;
                }
              }
              await sleep(350);
            }
          }
        }

        // =========================================================================
        // STEP 2: 然后添加提示词 (Fill Prompt Text into Genuine Editor "您希望创作什么？")
        // =========================================================================
        inputEl = findPromptInput() || inputEl;
        if (!inputEl || !isGenuineInput(inputEl)) {
          return { ok: false, reason: '未能锁定「您希望创作什么？」输入框' };
        }

        inputEl.focus();
        inputEl.click();
        await sleep(120);

        if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
          const proto =
            inputEl.tagName === 'TEXTAREA'
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(inputEl, cfg.promptText);
          } else {
            inputEl.value = cfg.promptText;
          }
          inputEl.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              composed: true,
              inputType: 'insertText',
              data: cfg.promptText
            })
          );
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, cfg.promptText);
          inputEl.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              composed: true,
              inputType: 'insertText',
              data: cfg.promptText
            })
          );
        }

        await sleep(320);

        // =========================================================================
        // STEP 3: 然后切换「图片 / 视频」模式与对应参数 (图2: 图片 16:9 x1 / 图3: 视频 6秒等)
        // =========================================================================
        if (cfg.autoSyncMode) {
          const modePillBtn = findModePillBtn();

          if (modePillBtn) {
            const findPopoverContainer = () => {
              const allDivs = queryAllDeep(document).filter((el) => {
                if (!isVisible(el)) return false;
                if (el.contains(inputEl)) return false; // NEVER match composerBox or page wrapper!
                const r = el.getBoundingClientRect();
                if (r.width < 180 || r.width > 540 || r.height < 130 || r.height > 640) return false;
                const txt = el.innerText || el.textContent || '';
                return (
                  txt.includes('生成将消耗') ||
                  (txt.includes('图片') && txt.includes('视频') && txt.includes('x2') && txt.includes('x3'))
                );
              });
              allDivs.sort(
                (a, b) =>
                  a.getBoundingClientRect().width * a.getBoundingClientRect().height -
                  b.getBoundingClientRect().width * b.getBoundingClientRect().height
              );
              return allDivs[0] || null;
            };

            // Always open the mode popover to verify/lock in Image (16:9, x1) or Video (素材, 16:9, 720p, 秒数, x1)
            let popover = await openOverlaySafely(modePillBtn, findPopoverContainer);

            const clickInPopover = (targetLabels) => {
              popover = findPopoverContainer() || popover;
              if (!popover) return false;
              const labels = Array.isArray(targetLabels) ? targetLabels : [targetLabels];
              const candidates = queryAllDeep(popover).filter((el) => {
                if (!isVisible(el)) return false;
                const tag = el.tagName;
                const role = el.getAttribute?.('role') || '';
                return (
                  tag === 'BUTTON' ||
                  role === 'tab' ||
                  role === 'radio' ||
                  role === 'option' ||
                  role === 'button' ||
                  tag === 'SPAN' ||
                  tag === 'DIV'
                );
              });

              for (const lb of labels) {
                const match = candidates.find((el) => {
                  const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                  return raw === lb || raw.endsWith(' ' + lb) || raw.startsWith(lb + ' ');
                });
                if (match) {
                  const btn =
                    match.closest?.('button, [role="tab"], [role="radio"], [role="option"], [role="button"]') ||
                    match;
                  triggerSingleClick(btn);
                  return true;
                }
              }
              return false;
            };

            if (popover) {
              if (cfg.mode === 'image') {
                clickInPopover(['图片', 'Image']);
                await sleep(240);
                clickInPopover([cfg.aspectRatio]);
                await sleep(140);
                clickInPopover([cfg.genCount]);
                await sleep(140);
              } else {
                clickInPopover(['视频', 'Video']);
                await sleep(260);
                clickInPopover([cfg.vidSubmode]);
                await sleep(150);
                clickInPopover([cfg.aspectRatio]);
                await sleep(140);
                clickInPopover([cfg.vidRes]);
                await sleep(140);
                clickInPopover([cfg.vidDur, cfg.vidDur.replace(/\s+/g, '')]);
                await sleep(140);
                clickInPopover([cfg.genCount]);
                await sleep(140);
              }

              // Close the mode popover cleanly if it is still open
              if (findPopoverContainer()) {
                triggerSingleClick(modePillBtn);
                for (let w = 0; w < 4; w++) {
                  await sleep(100);
                  if (!findPopoverContainer()) break;
                }
                if (findPopoverContainer()) {
                  document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                      key: 'Escape',
                      code: 'Escape',
                      keyCode: 27,
                      bubbles: true,
                      composed: true
                    })
                  );
                  await sleep(150);
                }
              }
            }
          }
        }

        await sleep(250);

        // =========================================================================
        // STEP 4: 全自动模式自动点击右下角白色圆形 "→" 生成按钮 / 半自动模式停驻交由用户点击
        // =========================================================================
        if (cfg.shouldSubmit) {
          // 1. 绝对精度定位：锁定右下角的箭头按钮或其 SVG (Arrow Button)
          const locateTheArrowTarget = () => {
            const pillBtn = findModePillBtn();
            const pillRect = pillBtn ? pillBtn.getBoundingClientRect() : null;

            // 策略 A：在模式胶囊按钮 (pillBtn) 右侧的物理坐标深层穿透探查
            if (pillRect) {
              const cy = pillRect.top + pillRect.height / 2;
              // 探测 pillBtn 右侧 15px 到 45px 的点
              for (const offset of [24, 20, 28, 16, 34]) {
                const px = pillRect.right + offset;
                const hits = document.elementsFromPoint ? document.elementsFromPoint(px, cy) : [];
                for (const h of hits) {
                  if (h === document.body || h === document.documentElement || h === inputEl || h === pillBtn) continue;
                  const r = h.getBoundingClientRect();
                  if (r.width >= 14 && r.width <= 75 && r.height >= 14 && r.height <= 75) {
                    const btn = h.closest?.('button, [role="button"]') || h;
                    return { el: btn, x: r.left + r.width / 2, y: r.top + r.height / 2 };
                  }
                }
              }
            }

            // 策略 B：查找位于胶囊按钮右侧最靠右的 SVG / 箭头元素
            const allSvgs = queryAllDeep(document).filter((el) => {
              if (!isVisible(el)) return false;
              const tag = el.tagName;
              if (tag !== 'SVG' && tag !== 'PATH') return false;
              const r = el.getBoundingClientRect();
              if (pillRect && r.left < pillRect.right - 5) return false;
              if (r.width > 70 || r.height > 70) return false;
              return r.top > window.innerHeight * 0.25;
            });

            if (allSvgs.length > 0) {
              allSvgs.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
              const bestSvg = allSvgs[0];
              const r = bestSvg.getBoundingClientRect();
              const btn = bestSvg.closest?.('button, [role="button"], div') || bestSvg;
              return { el: btn, x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }

            // 策略 C：若上述未命中，直接以 pillBtn 右侧预期区域为物理坐标
            if (pillRect) {
              return {
                el: pillBtn.nextElementSibling || pillBtn.parentElement?.lastElementChild || null,
                x: pillRect.right + 24,
                y: pillRect.top + pillRect.height / 2
              };
            }

            return null;
          };

          // 2. 模拟用户真实操作：鼠标移上去 (Hover 变成浅灰色) ➔ 等待变灰就绪 ➔ 真正点击
          const hoverAndClickArrow = async (targetInfo) => {
            if (!targetInfo) return false;
            const { x, y } = targetInfo;

            // 获取 (x, y) 处最顶层的实际 DOM 节点
            const topEl = (document.elementFromPoint ? document.elementFromPoint(x, y) : null) || targetInfo.el;
            if (!topEl) return false;

            const btn = topEl.closest?.('button, [role="button"]') || topEl;
            const nodes = [topEl, btn];

            const baseProps = {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              detail: 0,
              clientX: x,
              clientY: y,
              screenX: (window.screenX || 0) + x,
              screenY: (window.screenY || 0) + y
            };

            // 第一阶段：鼠标移动到箭头上方悬停 (Hover) —— 让白色箭头变成浅浅的灰色！
            for (const n of nodes) {
              n.dispatchEvent(new PointerEvent('pointerover', { ...baseProps }));
              n.dispatchEvent(new MouseEvent('mouseover', { ...baseProps }));
              n.dispatchEvent(new PointerEvent('pointerenter', { ...baseProps, bubbles: false }));
              n.dispatchEvent(new MouseEvent('mouseenter', { ...baseProps, bubbles: false }));
              n.dispatchEvent(new PointerEvent('pointermove', { ...baseProps }));
              n.dispatchEvent(new MouseEvent('mousemove', { ...baseProps }));
            }

            // 停顿 160ms：等待按钮渲染出浅浅的灰色 Hover 状态！
            await sleep(160);

            // 第二阶段：在浅灰色激活就绪状态下，执行标准的按下与点击
            for (const n of nodes) {
              try {
                n.dispatchEvent(
                  new PointerEvent('pointerdown', {
                    ...baseProps,
                    detail: 1,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    button: 0,
                    buttons: 1
                  })
                );
              } catch (_) {}
              n.dispatchEvent(new MouseEvent('mousedown', { ...baseProps, detail: 1, button: 0, buttons: 1 }));
            }

            if (typeof btn.focus === 'function') btn.focus();
            await sleep(80); // 模拟人类按下的物理停留

            for (const n of nodes) {
              try {
                n.dispatchEvent(
                  new PointerEvent('pointerup', {
                    ...baseProps,
                    detail: 1,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    button: 0,
                    buttons: 0
                  })
                );
              } catch (_) {}
              n.dispatchEvent(new MouseEvent('mouseup', { ...baseProps, detail: 1, button: 0, buttons: 0 }));
              n.dispatchEvent(new MouseEvent('click', { ...baseProps, detail: 1, button: 0, buttons: 0 }));
            }

            // 原生 .click() 触发
            try {
              if (typeof btn.click === 'function') btn.click();
              if (topEl !== btn && typeof topEl.click === 'function') topEl.click();
            } catch (_) {}

            return true;
          };

          // 执行悬停变灰并点击，循环尝试直到提交成功
          for (let attempt = 0; attempt < 4; attempt++) {
            const targetInfo = locateTheArrowTarget();
            if (targetInfo) {
              await hoverAndClickArrow(targetInfo);
            }

            // 辅助：输入框回车提交
            if (inputEl) {
              try {
                inputEl.focus();
                for (const t of ['keydown', 'keypress', 'keyup']) {
                  inputEl.dispatchEvent(
                    new KeyboardEvent(t, {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                      composed: true,
                      cancelable: true,
                      metaKey: true,
                      ctrlKey: true
                    })
                  );
                }
              } catch (_) {}
            }

            await sleep(500);

            // 检查：如果输入框文字被清空，或右侧箭头已消失/变暗/loading，说明已成功提交
            const remaining = findPromptInput();
            const txt = remaining ? (remaining.value || remaining.innerText || '').trim() : '';
            if (!txt || txt === '您希望创作什么？' || txt.length < 10) {
              break;
            }
          }
        }

        return { ok: true, submitted: cfg.shouldSubmit };
      },
      args: [payload]
    });

    const res = results?.[0]?.result;
    if (res && res.ok) {
      shot[doneKey] = true;
      await saveState();
      updateHeaderStats();
      if (activeCard) {
        activeCard.classList.add('is-done');
        const cb = activeCard.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = true;
      }
      setStatus(
        shouldSubmit
          ? `✅ 分镜${shot.id} 全自动已执行：${usePlusPicker ? '点 ➕ 添加参考图 ➔ ' : ''}${
              isImg ? '图片(' + state.paramImgAspect + ')' : '视频(' + targetFlowDur + ')'
            } ➔ 填入提示词 ➔ 已点击白色 → 生成！`
          : `🖐️ 分镜${shot.id} 半自动已就绪：${usePlusPicker ? '已点 ➕ 添加参考图 + ' : ''}已填入提示词，请点击左下框右下角的白色 → 按钮生成！`
      );
      return true;
    } else {
      setStatus(
        `⚠️ 分镜${shot.id}：${res?.reason || '未找到输入框'}`
      );
      return false;
    }
  } catch (err) {
    setStatus(`⚠️ 分镜${shot.id} 执行异常（${err.message}）。`);
    return false;
  }
}

function findNextUndoneIndex() {
  const proj = getActiveProject();
  if (!proj) return -1;
  const doneKey = state.activeMode === 'image' ? 'imgDone' : 'vidDone';
  return proj.shots.findIndex((s) => !s[doneKey]);
}

function stopQueue(reasonMsg) {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.isQueueRunning = false;
  toggleQueueBtn.classList.remove('running');
  renderExecModeUI();
  if (reasonMsg) setStatus(reasonMsg);
}

async function startQueue() {
  const nextIdx = findNextUndoneIndex();
  if (nextIdx === -1) {
    setStatus('🎉 当前模式下所有分镜均已勾选完成！如需从头跑，请先点「重置当前进度」。');
    return;
  }

  state.isQueueRunning = true;
  toggleQueueBtn.classList.add('running');
  toggleQueueBtn.textContent = '⏳ 正在投喂当前分镜...';

  const ok = await feedShotToFlow(nextIdx);
  if (!ok) {
    stopQueue('⚠️ 自动排队已暂停：请确认左侧 Google Flow 页面已加载并显示「您希望创作什么？」输入框。');
    return;
  }

  if (findNextUndoneIndex() === -1) {
    stopQueue('🎉 全部分镜已自动投喂完毕！');
    return;
  }

  state.countdownSec = state.queueIntervalSec;
  toggleQueueBtn.textContent = `⏸️ 排队运行中 (${state.countdownSec}s 后下一镜 · 点击暂停)`;

  state.timerId = setInterval(async () => {
    if (!state.isQueueRunning) return;
    state.countdownSec -= 1;
    if (state.countdownSec > 0) {
      toggleQueueBtn.textContent = `⏸️ 排队运行中 (${state.countdownSec}s 后下一镜 · 点击暂停)`;
      return;
    }

    const idx = findNextUndoneIndex();
    if (idx === -1) {
      stopQueue('🎉 当前模式全部分镜已自动投喂完毕！');
      return;
    }

    toggleQueueBtn.textContent = '⏳ 正在投喂下一镜...';
    const stepOk = await feedShotToFlow(idx);
    if (!stepOk) {
      stopQueue('⚠️ 自动排队已暂停：未检测到输入框，请检查左侧 Flow 页面状态。');
      return;
    }

    if (findNextUndoneIndex() === -1) {
      stopQueue('🎉 当前模式全部分镜已自动投喂完毕！');
    } else {
      state.countdownSec = state.queueIntervalSec;
      toggleQueueBtn.textContent = `⏸️ 排队运行中 (${state.countdownSec}s 后下一镜 · 点击暂停)`;
    }
  }, 1000);
}

function parseMarkdownStoryboard(mdText) {
  const shots = [];
  const sections = mdText.split(/^###\s+分镜/m).slice(1);
  sections.forEach((sec, idx) => {
    const lines = sec.trim().split('\n');
    const headerLine = lines[0] || '';
    const parts = headerLine.split('｜');
    const id = (parts[0] || String(idx + 1).padStart(2, '0')).trim();
    const timePart = (parts[1] || '').trim();
    const scriptText = parts.slice(2).join('｜').trim();

    let imagePrompt = '';
    let videoPrompt = '';

    const imgMatch = sec.match(/\*\*生图提示词\*\*\s*\n+([\s\S]*?)(?=\n+\*\*视频生成提示词\*\*|\n+---|$)/);
    if (imgMatch) imagePrompt = imgMatch[1].trim();

    const vidMatch = sec.match(/\*\*视频生成提示词\*\*\s*\n+([\s\S]*?)(?=\n+---|$)/);
    if (vidMatch) videoPrompt = cleanCelebrityNamesForVideo(vidMatch[1].trim());

    let cam = '';
    const camMatch = videoPrompt.match(/唯一运镜[：:]\s*([^，,。]+)/);
    if (camMatch) cam = camMatch[1].trim();

    let durRaw = '6秒';
    const durMatch = timePart.match(/（(\d+秒)）/) || videoPrompt.match(/时长(\d+秒)/);
    if (durMatch) durRaw = durMatch[1];

    if (imagePrompt || videoPrompt) {
      shots.push({
        id,
        time: timePart,
        dur: durRaw,
        flowDur: normalizeFlowDuration(durRaw),
        act: '',
        text: scriptText,
        visual: '',
        cam,
        imagePrompt,
        videoPrompt,
        imgDone: false,
        vidDone: false
      });
    }
  });
  return shots;
}

function parseTxtPrompts(imgTxt, vidTxt) {
  const splitBlocks = (txt) =>
    (txt || '')
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);

  const imgBlocks = splitBlocks(imgTxt);
  const vidBlocks = splitBlocks(vidTxt);
  const count = Math.max(imgBlocks.length, vidBlocks.length);
  const shots = [];

  for (let i = 0; i < count; i++) {
    const id = String(i + 1).padStart(2, '0');
    const imagePrompt = imgBlocks[i] || '';
    const videoPrompt = cleanCelebrityNamesForVideo(vidBlocks[i] || '');
    let cam = '';
    const camMatch = videoPrompt.match(/唯一运镜[：:]\s*([^，,。]+)/);
    if (camMatch) cam = camMatch[1].trim();

    let durRaw = '6秒';
    const durMatch = videoPrompt.match(/时长(\d+秒)/);
    if (durMatch) durRaw = durMatch[1];

    shots.push({
      id,
      time: '',
      dur: durRaw,
      flowDur: normalizeFlowDuration(durRaw),
      act: '',
      text: `第 ${id} 镜`,
      visual: '',
      cam,
      imagePrompt,
      videoPrompt,
      imgDone: false,
      vidDone: false
    });
  }
  return shots;
}

// Event Listeners
projectSelect.addEventListener('change', async () => {
  stopQueue();
  state.activeProjectId = projectSelect.value;
  await saveState();
  renderAll();
  setStatus(`已切换至项目：${getActiveProject()?.name || ''}`);
});

deleteProjectBtn.addEventListener('click', async () => {
  if (state.projects.length <= 1) {
    setStatus('⚠️ 至少需要保留一个项目。');
    return;
  }
  const current = getActiveProject();
  if (!current) return;
  stopQueue();
  state.projects = state.projects.filter((p) => p.id !== current.id);
  state.activeProjectId = state.projects[0].id;
  await saveState();
  renderAll();
  setStatus(`已删除项目：${current.name}`);
});

tabImage.addEventListener('click', async () => {
  stopQueue();
  state.activeMode = 'image';
  await saveState();
  renderAll();
  setStatus('已切换至「🎨 批量生图」：自动点左下角 ➕ ➔ 上传的内容 ➔ 添加到提示。');
});

tabVideo.addEventListener('click', async () => {
  stopQueue();
  state.activeMode = 'video';
  await saveState();
  renderAll();
  setStatus('已切换至「🎬 批量生视频」：自动匹配视频模式与对应秒数。');
});

intervalInput.addEventListener('change', async () => {
  const val = Math.max(5, Math.min(600, parseInt(intervalInput.value, 10) || 25));
  state.queueIntervalSec = val;
  intervalInput.value = String(val);
  await saveState();
});

resetProgressBtn.addEventListener('click', async () => {
  stopQueue();
  const proj = getActiveProject();
  if (!proj) return;
  const doneKey = state.activeMode === 'image' ? 'imgDone' : 'vidDone';
  proj.shots.forEach((s) => {
    s[doneKey] = false;
  });
  await saveState();
  renderAll();
  setStatus(`已重置当前项目「${state.activeMode === 'image' ? '生图' : '生视频'}」进度。`);
});

toggleQueueBtn.addEventListener('click', async () => {
  if (state.isQueueRunning) {
    stopQueue('⏸️ 已手动暂停自动排队投喂。');
  } else {
    await startQueue();
  }
});

feedNextBtn.addEventListener('click', async () => {
  const idx = findNextUndoneIndex();
  if (idx === -1) {
    setStatus('🎉 当前模式下所有分镜均已完成！');
    return;
  }
  await feedShotToFlow(idx);
});

openImportBtn.addEventListener('click', () => {
  newProjectNameInput.value = '';
  fileUploadInput.value = '';
  pasteImagePrompts.value = '';
  pasteVideoPrompts.value = '';
  importDialog.showModal();
});

fileUploadInput.addEventListener('change', async () => {
  const files = Array.from(fileUploadInput.files || []);
  if (files.length === 0) return;

  if (!newProjectNameInput.value.trim()) {
    newProjectNameInput.value = files[0].name.replace(/\.(md|txt)$/i, '');
  }

  for (const file of files) {
    const content = await file.text();
    if (file.name.endsWith('.md') || content.includes('### 分镜')) {
      pasteImagePrompts.value = content;
    } else if (file.name.toLowerCase().includes('video') || file.name.includes('视频')) {
      pasteVideoPrompts.value = content;
    } else if (file.name.toLowerCase().includes('image') || file.name.includes('生图')) {
      pasteImagePrompts.value = content;
    } else if (!pasteImagePrompts.value) {
      pasteImagePrompts.value = content;
    } else {
      pasteVideoPrompts.value = content;
    }
  }
});

confirmImportBtn.addEventListener('click', async () => {
  const rawPrimary = pasteImagePrompts.value.trim();
  const rawSecondary = pasteVideoPrompts.value.trim();

  if (!rawPrimary && !rawSecondary) {
    setStatus('⚠️ 请先上传分镜文件或粘贴提示词内容！');
    return;
  }

  let parsedShots = [];
  if (rawPrimary.includes('### 分镜') && rawPrimary.includes('**生图提示词**')) {
    parsedShots = parseMarkdownStoryboard(rawPrimary);
  } else {
    parsedShots = parseTxtPrompts(rawPrimary, rawSecondary);
  }

  if (parsedShots.length === 0) {
    setStatus('⚠️ 未能解析出有效分镜，请检查格式是否包含空行分隔或标准分镜标题。');
    return;
  }

  const projName =
    newProjectNameInput.value.trim() ||
    `导入项目 (${new Date().toLocaleDateString('zh-CN')} · ${parsedShots.length}镜)`;

  const newProj = {
    id: 'proj-' + Date.now(),
    name: projName,
    createdAt: new Date().toISOString().slice(0, 10),
    shots: parsedShots
  };

  state.projects.unshift(newProj);
  state.activeProjectId = newProj.id;
  await saveState();
  renderAll();
  importDialog.close('confirm');
  setStatus(`🎉 成功导入「${projName}」，共 ${parsedShots.length} 个分镜！`);
});

init();
