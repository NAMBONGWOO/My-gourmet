// js/app.js — My Gourmet Archive
'use strict'

// Firebase 함수 — index.html에서 window.*로 주입
const collection         = window.collection
const query              = window.query
const where              = window.where
const orderBy            = window.orderBy
const onSnapshot         = window.onSnapshot
const addDoc             = window.addDoc
const updateDoc          = window.updateDoc
const deleteDoc          = window.deleteDoc
const serverTimestamp    = window.serverTimestamp
const arrayUnion         = window.arrayUnion
const arrayRemove        = window.arrayRemove
const doc                = window.firestoreDoc
const onAuthStateChanged = window.onAuthStateChanged
const signInWithPopup    = window.signInWithPopup
const signOut            = window.signOut

const COL = 'restaurants'

/* ══════════════════════════════════════════
   상태
══════════════════════════════════════════ */
const state = {
  user:          null,
  restaurants:   [],
  currentScreen: 'home',
  activeFilter:  'all',   // 홈 필터
  unsubscribe:   null,
  mapInstance:   null,
  detailTarget:  null,
  // 리스트 화면 필터 상태
  listFilter: {
    food:     null,
    source:   null,
    status:   null,
    purpose:  null,
  }
}

/* ══════════════════════════════════════════
   DOM
══════════════════════════════════════════ */
const $ = id => document.getElementById(id)
const splash      = $('splash')
const loginScreen = $('login-screen')
const appWrapper  = $('app-wrapper')
const screenCont  = $('screen-container')
const fabAdd      = $('fab-add')
const tabBar      = $('tab-bar')

/* ══════════════════════════════════════════
   유틸
══════════════════════════════════════════ */
function show(el) { el.classList.remove('hidden') }
function hide(el) { el.classList.add('hidden') }
function qs(sel, ctx = document) { return ctx.querySelector(sel) }
function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)] }

function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  appWrapper.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

function confirm2(msg) { return window.confirm(msg) }

/* ══════════════════════════════════════════
   인증
══════════════════════════════════════════ */
onAuthStateChanged(window.auth, user => {
  hide(splash)
  if (user) {
    state.user = user
    show(appWrapper)
    hide(loginScreen)
    subscribeRestaurants()
    navigate('home')
  } else {
    state.user = null
    hide(appWrapper)
    show(loginScreen)
    if (state.unsubscribe) state.unsubscribe()
  }
})

$('btn-google-login').addEventListener('click', async () => {
  const btn = $('btn-google-login')
  btn.disabled = true
  btn.textContent = '로그인 중…'
  try {
    await signInWithPopup(window.auth, new window.GoogleAuthProvider())
  } catch(e) {
    console.error(e)
    btn.disabled = false
    btn.textContent = 'Google로 시작하기'
  }
})

/* ══════════════════════════════════════════
   Firestore 구독
══════════════════════════════════════════ */
function subscribeRestaurants() {
  if (state.unsubscribe) state.unsubscribe()
  const q = query(
    collection(window.db, COL),
    where('userId', '==', state.user.uid),
    orderBy('createdAt', 'desc')
  )
  state.unsubscribe = onSnapshot(q,
    snap => {
      state.restaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      refreshCurrentScreen()
    },
    err => console.error(err)
  )
}

async function addRestaurant(data) {
  await addDoc(collection(window.db, COL), {
    userId: state.user.uid,
    name: data.name ?? '', address: data.address ?? '',
    shortAddr: data.shortAddr ?? '', phone: data.phone ?? '',
    hours: data.hours ?? '', lat: data.lat ?? null, lng: data.lng ?? null,
    tagIds: data.tagIds ?? [], memo: data.memo ?? '',
    rating: data.rating ?? null, visitLog: [], source: 'manual', broadcast: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
}

async function updateRestaurantField(id, fields) {
  await updateDoc(doc(window.db, COL, id), { ...fields, updatedAt: serverTimestamp() })
}

async function removeRestaurant(id) {
  await deleteDoc(doc(window.db, COL, id))
}

/* ══════════════════════════════════════════
   라우터
══════════════════════════════════════════ */
function navigate(screen, data = null) {
  state.currentScreen = screen
  state.detailTarget  = data

  qsa('.tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === screen)
  })

  const hideFAB = ['add', 'detail'].includes(screen)
  fabAdd.classList.toggle('hidden-fab', hideFAB)

  screenCont.innerHTML = ''

  const renders = {
    home:   renderHome,
    list:   renderList,
    my:     renderMy,
    add:    renderAdd,
    detail: () => renderDetail(data),
  }
  const fn = renders[screen]
  if (fn) fn()
}

function refreshCurrentScreen() {
  navigate(state.currentScreen, state.detailTarget)
}

tabBar.addEventListener('click', e => {
  const item = e.target.closest('.tab-item')
  if (!item) return
  navigate(item.dataset.tab)
})

fabAdd.addEventListener('click', () => navigate('add'))
window.navigate = navigate

/* ══════════════════════════════════════════
   홈 화면 — 지도 45% + 필터칩 + 2열 그리드
══════════════════════════════════════════ */
function renderHome() {
  const filtered = getHomeFiltered()

  screenCont.innerHTML = `
    <div class="home-screen screen-enter">

      <!-- 필터 칩바 (얇게) -->
      <div class="filter-bar" style="padding:8px 0 0;">
        <div class="filter-inner" id="filter-inner"></div>
      </div>

      <!-- 지도 45% -->
      <div class="map-wrap" style="height:45vh;margin:8px 16px 0;">
        <div id="map"></div>
        <div class="map-badge" id="map-badge">내 주변 ${filtered.length}곳</div>
      </div>

      <!-- 섹션 헤더 -->
      <div class="section-header" style="padding:10px 16px 6px;">
        <span class="section-title">NEARBY RESTAURANTS</span>
        <span class="section-count">${filtered.length}곳</span>
      </div>

      <!-- 2열 그리드 -->
      <div class="grid-scroll" id="rest-grid"></div>
    </div>`

  renderFilterChips()
  renderMap(filtered)
  renderGrid(filtered)
}

function getHomeFiltered() {
  const f = state.activeFilter
  if (f === 'all') return state.restaurants
  return state.restaurants.filter(r =>
    (r.tagIds ?? []).some(id => id.startsWith(f + '__'))
  )
}

/* 필터 칩 */
function renderFilterChips() {
  const inner = qs('#filter-inner')
  if (!inner) return

  const items = [
    { key: 'all', label: '전체', color: null },
    ...TAG_CATEGORIES.map(c => ({ key: c.id, label: c.name, color: TAG_COLORS[c.id] }))
  ]

  inner.innerHTML = items.map(f => {
    const isActive = state.activeFilter === f.key
    const c = f.color
    let style = '', cls = 'filter-chip'
    if (f.key === 'all' && isActive) cls += ' active-all'
    else if (c) style = `background:${c.bg};color:${c.fg};border-color:${c.bd};`
    const dot = c ? `<span class="filter-chip-dot" style="background:${c.fg}"></span>` : ''
    return `<button class="${cls}" style="${style}" data-filter="${f.key}">${dot}${f.label}</button>`
  }).join('')

  inner.addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip')
    if (!btn) return
    state.activeFilter = btn.dataset.filter
    renderHome()
  })
}

/* 지도 */
function renderMap(filtered) {
  if (state.mapInstance) { state.mapInstance.remove(); state.mapInstance = null }

  const map = L.map('map', { zoomControl: false }).setView([37.5665, 126.978], 13)
  state.mapInstance = map

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map)

  const ACCENT = {
    food: '#c9a96e', purpose: '#1864ab', space: '#7a5800',
    source: '#7d3800', facility: '#1a5c2a', status: '#6a0dad',
  }

  filtered.filter(r => r.lat && r.lng).forEach(r => {
    const catId = (r.tagIds ?? []).find(id => TAG_MAP[id])?.split('__')[0] ?? 'food'
    const color = ACCENT[catId] ?? '#c9a96e'

    const icon = L.divIcon({
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
        <path d="M10 0C4.5 0 0 4.5 0 10c0 7 10 18 10 18S20 17 20 10C20 4.5 15.5 0 10 0z"
          fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="3" fill="#fff" opacity="0.8"/>
      </svg>`,
      className: '', iconSize: [20, 28], iconAnchor: [10, 28], popupAnchor: [0, -30],
    })

    L.marker([r.lat, r.lng], { icon }).addTo(map)
      .bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;min-width:110px;">
          <strong style="font-size:13px;">${r.name}</strong><br>
          <small style="color:#868e96;">${r.shortAddr || ''}</small><br>
          <button onclick="window._mgaDetail('${r.id}')"
            style="margin-top:7px;padding:5px 10px;background:#c9a96e;color:#fff;
                   border:none;border-radius:6px;font-size:11px;cursor:pointer;
                   width:100%;font-family:'DM Sans',sans-serif;">
            상세 보기 →
          </button>
        </div>`)
  })

  window._mgaDetail = id => {
    const r = state.restaurants.find(x => x.id === id)
    if (r) navigate('detail', r)
  }

  navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords
    map.setView([lat, lng], 14)
    L.circleMarker([lat, lng], {
      radius: 8, fillColor: '#c9a96e', color: '#fff', weight: 2, fillOpacity: 1,
    }).addTo(map).bindPopup('내 위치')
  })
}

/* 2열 그리드 카드 */
function renderGrid(filtered) {
  const grid = qs('#rest-grid')
  if (!grid) return

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🍽️</div>
        <p>아직 저장된 맛집이 없어요</p>
        <button onclick="window.navigate('add')">첫 맛집 추가하기 +</button>
      </div>`
    return
  }

  const ACCENT = {
    food: '#5f3dc4', purpose: '#1864ab', space: '#7a5800',
    source: '#7d3800', facility: '#1a5c2a', status: '#6a0dad',
  }
  const BG = {
    food: '#f3f0ff', purpose: '#e7f5ff', space: '#fff9db',
    source: '#fff4e6', facility: '#ebfbee', status: '#f8f0fc',
  }

  grid.innerHTML = filtered.map(r => {
    const catId  = (r.tagIds ?? []).find(id => TAG_MAP[id])?.split('__')[0] ?? 'food'
    const accent = ACCENT[catId] ?? '#c9a96e'
    const bg     = BG[catId] ?? '#f8f8f8'
    const tags   = (r.tagIds ?? []).slice(0, 2)
      .map(id => makeTagChip(id)).join('')
    const dist   = (r.lat && r.lng) ? '' : ''

    return `
      <div class="grid-card" data-id="${r.id}" style="border-left:2.5px solid ${accent};">
        <div class="grid-card-name">${r.name}</div>
        <div class="grid-card-addr">${r.shortAddr || r.address || '주소 없음'}</div>
        <div class="grid-card-tags">${tags}</div>
        ${r.rating ? `<div class="grid-card-rating">★ ${r.rating.toFixed(1)}</div>` : ''}
      </div>`
  }).join('')

  grid.addEventListener('click', e => {
    const card = e.target.closest('.grid-card')
    if (!card) return
    const r = state.restaurants.find(x => x.id === card.dataset.id)
    if (r) navigate('detail', r)
  })
}

/* ══════════════════════════════════════════
   리스트 화면 — 계층형 태그 필터 + 실시간 카운터
══════════════════════════════════════════ */
function renderList() {
  const filtered = getListFiltered()

  screenCont.innerHTML = `
    <div class="list-screen screen-enter">

      <!-- 검색창 -->
      <div style="padding:10px 16px 0;">
        <div class="search-bar" style="margin:0;">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="list-search" style="border:none;outline:none;background:transparent;
            font-family:var(--font-body);font-size:13px;color:var(--t1);flex:1;width:100%;"
            placeholder="식당명, 태그, 지역 검색…" autocomplete="off" />
        </div>
      </div>

      <!-- 계층형 태그 필터 -->
      <div style="padding:10px 16px 0;">
        <div class="filter-panel" id="filter-panel">

          <!-- 음식 종류 -->
          <div class="filter-section">
            <div class="filter-label">음식 종류</div>
            <div class="filter-row" id="filter-food">
              ${TAG_CATEGORIES.find(c => c.id === 'food').groups
                .flatMap(g => g.tags)
                .map(t => `
                  <button class="filter-tag ${state.listFilter.food === t.id ? 'active-tag' : ''}"
                    data-cat="food" data-id="${t.id}"
                    style="${state.listFilter.food === t.id
                      ? 'background:var(--food-bg);color:var(--food-fg);border-color:var(--food-bd);'
                      : ''}"
                  >${t.label}</button>`).join('')}
            </div>
          </div>

          <!-- 검증 출처 -->
          <div class="filter-section">
            <div class="filter-label">검증 출처</div>
            <div class="filter-row" id="filter-source">
              ${TAG_CATEGORIES.find(c => c.id === 'source').groups
                .flatMap(g => g.tags).slice(0, 10)
                .map(t => `
                  <button class="filter-tag ${state.listFilter.source === t.id ? 'active-tag' : ''}"
                    data-cat="source" data-id="${t.id}"
                    style="${state.listFilter.source === t.id
                      ? 'background:var(--source-bg);color:var(--source-fg);border-color:var(--source-bd);'
                      : ''}"
                  >${t.label}</button>`).join('')}
            </div>
          </div>

          <!-- 나의 상태 -->
          <div class="filter-section">
            <div class="filter-label">나의 상태</div>
            <div class="filter-row" id="filter-status">
              ${TAG_CATEGORIES.find(c => c.id === 'status').groups
                .flatMap(g => g.tags)
                .map(t => `
                  <button class="filter-tag ${state.listFilter.status === t.id ? 'active-tag' : ''}"
                    data-cat="status" data-id="${t.id}"
                    style="${state.listFilter.status === t.id
                      ? 'background:var(--status-bg);color:var(--status-fg);border-color:var(--status-bd);'
                      : ''}"
                  >${t.label}</button>`).join('')}
            </div>
          </div>

        </div>
      </div>

      <!-- 결과 카운터 버튼 -->
      <div style="padding:10px 16px 0;">
        <button id="btn-result-count" style="
          width:100%;padding:12px;
          background:var(--t1);color:var(--bg1);
          border:none;border-radius:var(--r-md);
          font-size:14px;font-weight:500;
          font-family:var(--font-body);cursor:pointer;
          transition:opacity 150ms;">
          <span id="result-count-text">${filtered.length}곳 보기</span>
        </button>
      </div>

      <!-- 결과 리스트 -->
      <div class="list-result" id="list-result">
        ${renderListCards(filtered)}
      </div>

    </div>`

  // 필터 태그 클릭
  qs('#filter-panel').addEventListener('click', e => {
    const btn = e.target.closest('.filter-tag')
    if (!btn) return
    const cat = btn.dataset.cat
    const id  = btn.dataset.id

    // 토글
    state.listFilter[cat] = state.listFilter[cat] === id ? null : id

    // 결과 업데이트
    const newFiltered = getListFiltered()
    qs('#result-count-text').textContent = `${newFiltered.length}곳 보기`
    qs('#list-result').innerHTML = renderListCards(newFiltered)

    // 버튼 스타일 업데이트
    const catColors = {
      food: 'var(--food-bg),var(--food-fg),var(--food-bd)',
      source: 'var(--source-bg),var(--source-fg),var(--source-bd)',
      status: 'var(--status-bg),var(--status-fg),var(--status-bd)',
    }
    qs(`#filter-${cat}`).querySelectorAll('.filter-tag').forEach(b => {
      const isActive = state.listFilter[cat] === b.dataset.id
      const [bg, fg, bd] = (catColors[cat] || ',,').split(',')
      b.style.background  = isActive ? bg : ''
      b.style.color       = isActive ? fg : ''
      b.style.borderColor = isActive ? bd : ''
      b.classList.toggle('active-tag', isActive)
    })

    attachListCardEvents()
  })

  // 검색
  qs('#list-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    const searched = getListFiltered().filter(r => {
      if (!q) return true
      return r.name.toLowerCase().includes(q) ||
        (r.address ?? '').includes(q) ||
        (r.tagIds ?? []).some(id => TAG_MAP[id]?.label.includes(q))
    })
    qs('#result-count-text').textContent = `${searched.length}곳 보기`
    qs('#list-result').innerHTML = renderListCards(searched)
    attachListCardEvents()
  })

  // 결과 보기 버튼 (스크롤 다운)
  qs('#btn-result-count').addEventListener('click', () => {
    qs('#list-result').scrollIntoView({ behavior: 'smooth' })
  })

  attachListCardEvents()
}

function getListFiltered() {
  return state.restaurants.filter(r => {
    const tagIds = r.tagIds ?? []
    if (state.listFilter.food   && !tagIds.includes(state.listFilter.food))   return false
    if (state.listFilter.source && !tagIds.includes(state.listFilter.source)) return false
    if (state.listFilter.status && !tagIds.includes(state.listFilter.status)) return false
    return true
  })
}

function renderListCards(list) {
  if (!list.length) return `
    <div class="empty-state">
      <div class="emoji">😅</div>
      <p>검색 결과가 없습니다</p>
    </div>`

  return list.map(r => {
    const tags = (r.tagIds ?? []).slice(0, 3).map(id => makeTagChip(id)).join('')
    return `
      <div class="rest-card" data-id="${r.id}">
        <div class="rest-info">
          <div class="rest-name">${r.name}</div>
          <div class="rest-addr">${r.shortAddr || r.address || ''}</div>
          <div class="rest-tags">${tags}</div>
        </div>
        ${r.rating ? `<span class="rest-rating">★ ${r.rating.toFixed(1)}</span>` : ''}
      </div>`
  }).join('')
}

function attachListCardEvents() {
  const result = qs('#list-result')
  if (!result) return
  result.onclick = e => {
    const card = e.target.closest('.rest-card')
    if (!card) return
    const r = state.restaurants.find(x => x.id === card.dataset.id)
    if (r) navigate('detail', r)
  }
}

/* ══════════════════════════════════════════
   추가 화면
══════════════════════════════════════════ */
function renderAdd() {
  const sel = {}

  screenCont.innerHTML = `
    <div class="add-screen screen-enter">
      <div class="add-screen-header">
        <button class="back-btn" id="add-back">←</button>
        <span class="screen-title">새 맛집 추가</span>
      </div>
      <div class="card">
        <p style="font-size:12px;font-weight:500;color:var(--t2);margin-bottom:10px;">기본 정보</p>
        ${[
          { k:'name',      label:'상호명 *',  ph:'예) 삼청동 수제비' },
          { k:'address',   label:'주소',       ph:'서울 종로구 삼청동 35-10' },
          { k:'shortAddr', label:'단축 주소',  ph:'종로구 삼청동' },
          { k:'phone',     label:'전화번호',   ph:'02-000-0000' },
          { k:'hours',     label:'영업시간',   ph:'11:00 - 21:00' },
        ].map(f => `
          <div style="margin-bottom:8px;">
            <label class="input-label">${f.label}</label>
            <input class="input-field" id="f-${f.k}" placeholder="${f.ph}" />
          </div>`).join('')}
      </div>
      <div class="card">
        <p style="font-size:12px;font-weight:500;color:var(--t2);margin-bottom:12px;">태그 선택</p>
        <div id="tag-select-body"></div>
        <div id="selected-preview" style="margin-top:12px;padding-top:12px;border-top:0.5px solid var(--bg5);display:none;">
          <div class="input-label">선택된 태그</div>
          <div id="selected-tags-row" style="display:flex;gap:5px;flex-wrap:wrap;"></div>
        </div>
      </div>
      <div class="card">
        <label class="input-label">개인 메모</label>
        <textarea class="input-field" id="f-memo"
          placeholder="기억하고 싶은 것들… (메뉴, 팁, 느낌)"
          rows="3" style="resize:vertical;min-height:72px;"></textarea>
      </div>
      <div id="add-error" class="error-box" style="display:none;"></div>
      <button class="btn-gold" id="btn-save-add">저장하기</button>
    </div>`

  renderTagSelectUI(qs('#tag-select-body'), sel, () => updateSelectedPreview(sel))
  qs('#add-back').addEventListener('click', () => navigate('home'))

  qs('#btn-save-add').addEventListener('click', async () => {
    const name = qs('#f-name').value.trim()
    if (!name) { showAddError('상호명을 입력해주세요'); return }
    const btn = qs('#btn-save-add')
    btn.disabled = true; btn.textContent = '저장 중…'
    try {
      await addRestaurant({
        name,
        address:   qs('#f-address').value.trim(),
        shortAddr: qs('#f-shortAddr').value.trim(),
        phone:     qs('#f-phone').value.trim(),
        hours:     qs('#f-hours').value.trim(),
        tagIds:    collectTagIds(sel),
        memo:      qs('#f-memo').value.trim(),
      })
      toast('저장되었습니다!')
      navigate('home')
    } catch(e) {
      showAddError('저장 중 오류가 발생했습니다')
      btn.disabled = false; btn.textContent = '저장하기'
    }
  })

  function showAddError(msg) {
    const el = qs('#add-error')
    el.textContent = msg; el.style.display = 'block'
  }

  function updateSelectedPreview(sel) {
    const ids = collectTagIds(sel)
    const prev = qs('#selected-preview')
    const row  = qs('#selected-tags-row')
    if (!ids.length) { prev.style.display = 'none'; return }
    prev.style.display = 'block'
    row.innerHTML = ids.map(id => makeTagChip(id)).join('')
  }
}

/* ══════════════════════════════════════════
   태그 선택 UI (공용)
══════════════════════════════════════════ */
function renderTagSelectUI(container, sel, onChange) {
  container.innerHTML = TAG_CATEGORIES.map(cat => {
    const c = TAG_COLORS[cat.id]
    return `
      <div style="margin-bottom:14px;">
        <div class="cat-header">
          <span class="cat-num-badge" style="${catColorStyle(cat.id)}">${cat.num}</span>
          <span class="cat-name-label" style="color:${catFgColor(cat.id)}">${cat.name}</span>
          <span class="cat-rule-badge">${cat.isMultiple ? '복수' : '단수'}</span>
        </div>
        ${cat.groups.map(g => `
          <div>
            <p class="tag-group-title">${g.label}</p>
            <div class="tag-group-row">
              ${g.tags.map(t => `
                <span class="tag-chip ${c.cls} clickable"
                      data-tag-id="${t.id}" data-cat-id="${cat.id}"
                      data-multiple="${cat.isMultiple}">${t.label}</span>
              `).join('')}
            </div>
          </div>`).join('')}
      </div>`
  }).join('')

  container.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip')
    if (!chip) return
    const tagId = chip.dataset.tagId
    const catId = chip.dataset.catId
    const isMulti = chip.dataset.multiple === 'true'

    if (isMulti) {
      const arr = sel[catId] ?? []
      sel[catId] = arr.includes(tagId) ? arr.filter(x => x !== tagId) : [...arr, tagId]
    } else {
      sel[catId] = sel[catId] === tagId ? null : tagId
    }

    container.querySelectorAll(`[data-cat-id="${catId}"]`).forEach(el => {
      const cur = sel[catId]
      const isSel = isMulti
        ? (Array.isArray(cur) && cur.includes(el.dataset.tagId))
        : cur === el.dataset.tagId
      el.classList.toggle('selected', isSel)
    })
    onChange()
  })
}

function collectTagIds(sel) {
  return Object.entries(sel).flatMap(([, val]) =>
    Array.isArray(val) ? val : val ? [val] : []
  )
}

/* ══════════════════════════════════════════
   상세 화면
══════════════════════════════════════════ */
function renderDetail(r) {
  if (!r) return navigate('home')
  const fresh = state.restaurants.find(x => x.id === r.id) ?? r

  const tagsByCat = {}
  ;(fresh.tagIds ?? []).forEach(id => {
    const m = TAG_MAP[id]; if (!m) return
    if (!tagsByCat[m.categoryId]) tagsByCat[m.categoryId] = []
    tagsByCat[m.categoryId].push(id)
  })

  screenCont.innerHTML = `
    <div class="detail-screen screen-enter">
      <div class="detail-header">
        <button class="back-btn" id="detail-back">←</button>
        <span class="detail-title">${fresh.name}</span>
        <button class="delete-btn" id="detail-delete">삭제</button>
      </div>
      <div class="detail-inner">

        <div class="card">
          <div class="detail-rest-name">${fresh.name}</div>
          ${fresh.address ? `<div class="detail-info-row"><span>📍</span><span>${fresh.address}</span></div>` : ''}
          ${fresh.phone   ? `<div class="detail-info-row"><span>📞</span><span>${fresh.phone}</span></div>` : ''}
          ${fresh.hours   ? `<div class="detail-info-row"><span>🕐</span><span>${fresh.hours}</span></div>` : ''}
          <div class="rating-row">
            <span class="rating-label">내 평점</span>
            <div class="star-row" id="star-row">
              ${[1,2,3,4,5].map(n => `
                <button class="star-btn ${n <= (fresh.rating ?? 0) ? 'filled' : ''}" data-val="${n}">★</button>`).join('')}
            </div>
            <span class="rating-value" id="rating-value">${fresh.rating ? fresh.rating.toFixed(1) : ''}</span>
          </div>
        </div>

        <div class="card">
          <div class="tag-section-header">
            <span class="tag-section-title">나의 태그</span>
            <button class="btn-edit-tag" id="btn-tag-edit">+ 편집</button>
          </div>
          <div id="detail-tag-body">
            ${Object.entries(tagsByCat).length === 0
              ? '<p style="font-size:12px;color:var(--t4);text-align:center;padding:8px 0;">편집 버튼으로 태그를 추가하세요</p>'
              : Object.entries(tagsByCat).map(([catId, ids]) => {
                  const cat = TAG_CATEGORIES.find(c => c.id === catId)
                  return `
                    <div style="margin-bottom:8px;">
                      <p style="font-size:10px;color:var(--t3);margin-bottom:5px;">${cat?.name ?? ''}</p>
                      <div style="display:flex;gap:5px;flex-wrap:wrap;">
                        ${ids.map(id => makeTagChip(id, { size: 'md' })).join('')}
                      </div>
                    </div>`
                }).join('')}
          </div>
        </div>

        ${fresh.broadcast ? `
          <div class="card">
            <p style="font-size:13px;font-weight:500;margin-bottom:10px;">방송 출연</p>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="broadcast-badge">${fresh.broadcast.program}</span>
              <span style="font-size:12px;color:var(--t3);">${fresh.broadcast.date ?? ''}</span>
            </div>
          </div>` : ''}

        <div class="card">
          <div class="tag-section-header">
            <span class="tag-section-title">방문 기록</span>
            <button class="btn-edit-tag" id="btn-visit-add">+ 추가</button>
          </div>
          <div id="visit-form-wrap" style="display:none;">
            <div style="background:var(--bg3);border-radius:var(--r-sm);padding:12px;margin-bottom:12px;">
              <div class="star-row" id="visit-star-row">
                ${[1,2,3,4,5].map(n => `<button class="star-btn ${n<=4?'filled':''}" data-val="${n}">★</button>`).join('')}
              </div>
              <textarea class="input-field" id="visit-memo-input"
                placeholder="이번 방문 메모…" rows="2"
                style="resize:none;min-height:56px;margin-top:8px;"></textarea>
              <button class="btn-gold" id="btn-visit-save"
                style="padding:8px;font-size:13px;margin-top:8px;">저장</button>
            </div>
          </div>
          <div id="visit-log-body">${renderVisitLog(fresh.visitLog ?? [])}</div>
        </div>

        ${fresh.memo ? `
          <div class="card">
            <p style="font-size:13px;font-weight:500;margin-bottom:8px;">메모</p>
            <p style="font-size:13px;color:var(--t2);line-height:1.7;">${fresh.memo}</p>
          </div>` : ''}

        <button class="btn-ghost" id="btn-directions">카카오맵에서 길찾기 →</button>
      </div>
    </div>`

  qs('#detail-back').addEventListener('click', () => navigate('home'))
  qs('#detail-delete').addEventListener('click', async () => {
    if (!confirm2(`"${fresh.name}"을 삭제할까요?`)) return
    await removeRestaurant(fresh.id)
    toast('삭제되었습니다')
    navigate('home')
  })

  let currentRating = fresh.rating ?? 0
  qs('#star-row').addEventListener('click', async e => {
    const btn = e.target.closest('.star-btn'); if (!btn) return
    currentRating = Number(btn.dataset.val)
    updateStars(qs('#star-row'), currentRating)
    qs('#rating-value').textContent = currentRating.toFixed(1)
    await updateRestaurantField(fresh.id, { rating: currentRating })
  })

  qs('#btn-tag-edit').addEventListener('click', () => openTagEditSheet(fresh))

  let visitRating = 4
  qs('#btn-visit-add').addEventListener('click', () => {
    const w = qs('#visit-form-wrap')
    w.style.display = w.style.display === 'none' ? 'block' : 'none'
  })
  qs('#visit-star-row').addEventListener('click', e => {
    const btn = e.target.closest('.star-btn'); if (!btn) return
    visitRating = Number(btn.dataset.val)
    updateStars(qs('#visit-star-row'), visitRating)
  })
  qs('#btn-visit-save').addEventListener('click', async () => {
    const memo = qs('#visit-memo-input').value.trim()
    const log  = { memo, rating: visitRating, date: new Date().toISOString().slice(0, 10) }
    await updateRestaurantField(fresh.id, { visitLog: arrayUnion(log) })
    qs('#visit-log-body').innerHTML = renderVisitLog([...(fresh.visitLog ?? []), log])
    qs('#visit-form-wrap').style.display = 'none'
    qs('#visit-memo-input').value = ''
    toast('방문 기록 추가!')
  })

  qs('#btn-directions').addEventListener('click', () => {
    window.open(`https://map.kakao.com/link/search/${encodeURIComponent(fresh.name)}`, '_blank')
  })
}

function renderVisitLog(logs) {
  if (!logs.length)
    return '<p style="font-size:12px;color:var(--t4);text-align:center;padding:8px 0;">아직 방문 기록이 없습니다</p>'
  return [...logs].reverse().map(v => `
    <div class="visit-item">
      <div class="visit-dot"></div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="visit-date">${v.date}</span>
          <span class="visit-stars">${'★'.repeat(v.rating ?? 0)}</span>
        </div>
        ${v.memo ? `<div class="visit-memo">${v.memo}</div>` : ''}
      </div>
    </div>`).join('')
}

function updateStars(container, val) {
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.classList.toggle('filled', Number(btn.dataset.val) <= val)
  })
}

function openTagEditSheet(r) {
  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  const sel = {}
  TAG_CATEGORIES.forEach(cat => {
    const ids = (r.tagIds ?? []).filter(id => id.startsWith(cat.id + '__'))
    sel[cat.id] = cat.isMultiple ? ids : (ids[0] ?? null)
  })
  overlay.innerHTML = `
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <p style="font-size:14px;font-weight:500;margin-bottom:14px;">태그 편집</p>
      <div id="sheet-tag-body"></div>
      <button class="btn-gold" id="sheet-save" style="margin-top:16px;">저장</button>
    </div>`
  document.getElementById('app').appendChild(overlay)
  const body = overlay.querySelector('#sheet-tag-body')
  renderTagSelectUI(body, sel, () => {})
  TAG_CATEGORIES.forEach(cat => {
    const cur = sel[cat.id]
    const ids = Array.isArray(cur) ? cur : cur ? [cur] : []
    ids.forEach(tid => {
      const chip = body.querySelector(`[data-tag-id="${tid}"]`)
      if (chip) chip.classList.add('selected')
    })
  })
  overlay.querySelector('#sheet-save').addEventListener('click', async () => {
    const tagIds = collectTagIds(sel)
    await updateRestaurantField(r.id, { tagIds })
    overlay.remove()
    navigate('detail', { ...r, tagIds })
    toast('태그가 저장되었습니다')
  })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

/* ══════════════════════════════════════════
   마이 화면
══════════════════════════════════════════ */
function renderMy() {
  const u = state.user
  const menuStyle = `
    display:block;padding:13px;
    background:var(--bg2);color:var(--t1);
    border:0.5px solid var(--bg5);border-radius:var(--r-md);
    font-size:14px;font-weight:500;
    text-decoration:none;text-align:center;`

  screenCont.innerHTML = `
    <div class="my-screen screen-enter">
      <div class="my-avatar-large">${(u?.displayName ?? 'U')[0]}</div>
      <div style="text-align:center;">
        <div class="my-name">${u?.displayName ?? ''}</div>
        <div class="my-email">${u?.email ?? ''}</div>
      </div>
      <div style="text-align:center;color:var(--t3);font-size:13px;">
        저장된 맛집: <strong style="color:var(--gold);">${state.restaurants.length}곳</strong>
      </div>
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <a href="upload.html"    style="${menuStyle}">📂 데이터 업로드</a>
        <a href="geocode.html"   style="${menuStyle}">🗺️ 주소 → 좌표 변환</a>
        <a href="duplicate.html" style="${menuStyle}">🔍 중복 관리</a>
        <button id="btn-signout" style="
          width:100%;padding:13px;
          background:var(--bg3);color:var(--t3);
          border:0.5px solid var(--bg5);border-radius:var(--r-md);
          font-size:14px;font-weight:500;font-family:var(--font-body);cursor:pointer;">
          로그아웃
        </button>
      </div>
    </div>`

  qs('#btn-signout').addEventListener('click', () => {
    if (confirm2('로그아웃 할까요?')) signOut(window.auth)
  })
}

/* ══════════════════════════════════════════
   서비스워커
══════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/My-gourmet/sw.js')
      .then(() => console.log('SW 등록 완료'))
      .catch(e => console.warn('SW 등록 실패', e))
  })
}
