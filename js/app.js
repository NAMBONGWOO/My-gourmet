// js/app.js — My Gourmet Archive 메인 앱
// Firebase SDK는 index.html에서 window.db / window.auth 로 주입됨

'use strict'

/* ══════════════════════════════════════════
   Firestore 헬퍼
══════════════════════════════════════════ */
// Firebase 함수는 index.html에서 window.*로 주입됨
const { collection, query, where, orderBy,
        onSnapshot, addDoc, updateDoc, deleteDoc,
        serverTimestamp, arrayUnion, arrayRemove } = window

const doc              = window.firestoreDoc
const onAuthStateChanged = window.onAuthStateChanged
const signInWithPopup  = window.signInWithPopup
const signOut          = window.signOut

const COL = 'restaurants'

/* ══════════════════════════════════════════
   상태 (State)
══════════════════════════════════════════ */
const state = {
  user:         null,
  restaurants:  [],
  currentScreen:'home',
  activeFilter: 'all',
  unsubscribe:  null,    // Firestore 구독 해제 함수
  mapInstance:  null,    // Leaflet 지도 인스턴스
  mapMarkers:   [],
  detailTarget: null,    // 현재 상세보기 대상
}

/* ══════════════════════════════════════════
   DOM 참조
══════════════════════════════════════════ */
const $ = id => document.getElementById(id)
const splash       = $('splash')
const loginScreen  = $('login-screen')
const appWrapper   = $('app-wrapper')
const screenCont   = $('screen-container')
const userAvatar   = $('user-avatar')
const fabAdd       = $('fab-add')
const tabBar       = $('tab-bar')
const appBar       = $('app-bar')

/* ══════════════════════════════════════════
   유틸
══════════════════════════════════════════ */
function show(el)   { el.classList.remove('hidden') }
function hide(el)   { el.classList.add('hidden') }
function qs(sel, ctx = document) { return ctx.querySelector(sel) }
function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)] }

function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  appWrapper.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

function confirm2(msg) {
  return window.confirm(msg)
}

/* ══════════════════════════════════════════
   인증
══════════════════════════════════════════ */
onAuthStateChanged(window.auth, user => {
  hide(splash)
  if (user) {
    state.user = user
    userAvatar.textContent = (user.displayName ?? 'U')[0]
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
    const provider = new window.GoogleAuthProvider()
    await signInWithPopup(window.auth, provider)
  } catch (e) {
    console.error(e)
    btn.disabled = false
    btn.textContent = 'Google로 시작하기'
  }
})
// 이메일 회원가입
document.getElementById('btn-email-join')
  ?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value
    const pw    = document.getElementById('login-pw').value
    if (!email || !pw) { alert('이메일과 비밀번호를 입력하세요'); return }
    try {
      const { createUserWithEmailAndPassword } =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
      await createUserWithEmailAndPassword(window.auth, email, pw)
    } catch(e) {
      alert('오류: ' + e.message)
    }
})

// 이메일 로그인
document.getElementById('btn-email-login')
  ?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value
    const pw    = document.getElementById('login-pw').value
    if (!email || !pw) { alert('이메일과 비밀번호를 입력하세요'); return }
    try {
      const { signInWithEmailAndPassword } =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
      await signInWithEmailAndPassword(window.auth, email, pw)
    } catch(e) {
      alert('오류: ' + e.message)
    }
})

userAvatar.addEventListener('click', () => {
  if (confirm2('로그아웃 할까요?')) signOut(window.auth)
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

  state.unsubscribe = onSnapshot(q, snap => {
    state.restaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    refreshCurrentScreen()
  }, err => console.error(err))
}

async function addRestaurant(data) {
  await addDoc(collection(window.db, COL), {
    userId:    state.user.uid,
    name:      data.name      ?? '',
    address:   data.address   ?? '',
    shortAddr: data.shortAddr ?? '',
    phone:     data.phone     ?? '',
    hours:     data.hours     ?? '',
    lat:       data.lat       ?? null,
    lng:       data.lng       ?? null,
    tagIds:    data.tagIds    ?? [],
    memo:      data.memo      ?? '',
    rating:    data.rating    ?? null,
    visitLog:  [],
    source:    'manual',
    broadcast: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

async function updateRestaurantField(id, fields) {
  await updateDoc(doc(window.db, COL, id), { ...fields, updatedAt: serverTimestamp() })
}

async function removeRestaurant(id) {
  await deleteDoc(doc(window.db, COL, id))
}

async function doToggleTag(restId, tagId, isMultiple, currentTagIds) {
  const catId = tagId.split('__')[0]
  let next

  if (isMultiple) {
    const has = currentTagIds.includes(tagId)
    next = has
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId]
  } else {
    const others  = currentTagIds.filter(id => !id.startsWith(catId + '__'))
    const already = currentTagIds.includes(tagId)
    next = already ? others : [...others, tagId]
  }

  await updateRestaurantField(restId, { tagIds: next })
  return next
}

/* ══════════════════════════════════════════
   라우터 (화면 전환)
══════════════════════════════════════════ */
function navigate(screen, data = null) {
  state.currentScreen = screen
  state.detailTarget  = data

  // 탭 active
  qsa('.tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === screen)
  })

  // FAB / appBar 표시 제어
  const hideFAB = ['add','detail'].includes(screen)
  fabAdd.classList.toggle('hidden-fab', hideFAB)

  // 화면 렌더
  const renders = {
    home:   renderHome,
    search: renderSearch,
    my:     renderMy,
    add:    renderAdd,
    detail: () => renderDetail(data),
  }

  screenCont.innerHTML = ''
  const fn = renders[screen]
  if (fn) fn()
}

function refreshCurrentScreen() {
  navigate(state.currentScreen, state.detailTarget)
}

/* ══════════════════════════════════════════
   탭바 이벤트
══════════════════════════════════════════ */
tabBar.addEventListener('click', e => {
  const item = e.target.closest('.tab-item')
  if (!item) return
  navigate(item.dataset.tab)
})

fabAdd.addEventListener('click', () => navigate('add'))

/* ══════════════════════════════════════════
   홈 화면
══════════════════════════════════════════ */
function renderHome() {
  const filtered = getFiltered()

  screenCont.innerHTML = `
    <div class="home-screen screen-enter">

      <!-- 검색바 -->
      <div class="search-bar" id="home-search-bar">
        <svg width="15" height="15" fill="none" stroke="currentColor"
             stroke-width="1.8" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <span>식당 이름, 태그로 검색…</span>
      </div>

      <!-- 필터 칩바 -->
      <div class="filter-bar">
        <div class="filter-inner" id="filter-inner"></div>
      </div>

      <!-- 지도 -->
      <div class="map-wrap">
        <div id="map"></div>
        <div class="map-badge" id="map-badge">주변 ${filtered.length}곳</div>
      </div>

      <!-- 목록 헤더 -->
      <div class="section-header">
        <span class="section-title">NEARBY RESTAURANTS</span>
        <span class="section-count" id="list-count">${filtered.length}곳</span>
      </div>

      <!-- 목록 -->
      <div class="list-scroll" id="rest-list"></div>
    </div>
  `

  renderFilterChips()
  renderMap(filtered)
  renderList(filtered)

  // 검색바 클릭 → 검색 화면
  qs('#home-search-bar').addEventListener('click', () => navigate('search'))
}

function getFiltered() {
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
    { key:'all', label:'전체', color: null },
    ...TAG_CATEGORIES.map(c => ({
      key: c.id, label: c.name,
      color: TAG_COLORS[c.id],
    }))
  ]

  inner.innerHTML = items.map(f => {
    const isActive = state.activeFilter === f.key
    const c = f.color

    let style = ''
    let cls   = 'filter-chip'

    if (f.key === 'all' && isActive) {
      cls += ' active-all'
    } else if (c) {
      style = `background:${c.bg};color:${c.fg};border-color:${c.bd};`
    }

    const dot = c
      ? `<span class="filter-chip-dot" style="background:${c.fg}"></span>`
      : ''

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
  if (state.mapInstance) {
    state.mapInstance.remove()
    state.mapInstance = null
  }

  const map = L.map('map', { zoomControl: false }).setView([37.5665, 126.978], 14)
  state.mapInstance = map

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map)

  // 핀 색상 매핑
  const ACCENT = {
    food:'#cecbf6', purpose:'#b5d4f4', space:'#e8d87a',
    source:'#f5c4b3', facility:'#9fe1cb', status:'#e8b5f4',
  }

  filtered.filter(r => r.lat && r.lng).forEach(r => {
    const catId = (r.tagIds ?? []).find(id => TAG_MAP[id])?.split('__')[0] ?? 'food'
    const color = ACCENT[catId] ?? '#cecbf6'

    const icon = L.divIcon({
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
        <path d="M11 0C4.9 0 0 4.9 0 11c0 7.7 11 19 11 19S22 18.7 22 11C22 4.9 17.1 0 11 0z"
          fill="${color}" stroke="#141414" stroke-width="1.5"/>
        <circle cx="11" cy="11" r="3.5" fill="#141414" opacity="0.6"/>
      </svg>`,
      className: '',
      iconSize: [22,30], iconAnchor: [11,30], popupAnchor: [0,-32],
    })

    const marker = L.marker([r.lat, r.lng], { icon }).addTo(map)
    marker.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:120px;">
        <strong>${r.name}</strong><br>
        <small style="color:#999">${r.shortAddr || ''}</small><br>
        <button onclick="window._mgaDetail('${r.id}')"
          style="margin-top:8px;padding:5px 10px;background:#c9a96e;
                 color:#1a1100;border:none;border-radius:6px;
                 font-size:11px;cursor:pointer;width:100%;
                 font-family:'DM Sans',sans-serif;">
          상세 보기 →
        </button>
      </div>
    `)
  })

  // 팝업에서 상세 이동을 위한 전역 함수
  window._mgaDetail = (id) => {
    const r = state.restaurants.find(x => x.id === id)
    if (r) navigate('detail', r)
  }

  // 내 위치 시도
  navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords
    map.setView([lat, lng], 15)
    L.circleMarker([lat, lng], {
      radius: 7, fillColor: '#c9a96e', color: '#141414',
      weight: 2, fillOpacity: 1,
    }).addTo(map)
  })
}

/* 맛집 목록 */
function renderList(filtered) {
  const listEl = qs('#rest-list')
  if (!listEl) return

  const ACCENT = {
    food:'#cecbf6', purpose:'#b5d4f4', space:'#e8d87a',
    source:'#f5c4b3', facility:'#9fe1cb', status:'#e8b5f4',
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🍽️</div>
        <p>아직 저장된 맛집이 없어요</p>
        <button onclick="window.navigate('add')">첫 맛집 추가하기 +</button>
      </div>`
    return
  }

  listEl.innerHTML = filtered.map(r => {
    const catId  = (r.tagIds ?? []).find(id => TAG_MAP[id])?.split('__')[0] ?? 'food'
    const accent = ACCENT[catId] ?? '#cecbf6'
    const tags   = (r.tagIds ?? []).slice(0, 3)
      .map(id => makeTagChip(id)).join('')

    return `
      <div class="rest-card" data-id="${r.id}"
           style="border-left-color: transparent"
           onmouseenter="this.style.borderLeftColor='${accent}'"
           onmouseleave="this.style.borderLeftColor='transparent'">
        <div class="rest-thumb"
             style="background:${accent}18;color:${accent}">
          ${r.name[0] ?? '?'}
        </div>
        <div class="rest-info">
          <div class="rest-name">${r.name}</div>
          <div class="rest-addr">${r.shortAddr || r.address}</div>
          <div class="rest-tags">${tags}</div>
        </div>
        ${r.rating ? `<span class="rest-rating">★ ${r.rating.toFixed(1)}</span>` : ''}
      </div>`
  }).join('')

  listEl.addEventListener('click', e => {
    const card = e.target.closest('.rest-card')
    if (!card) return
    const r = state.restaurants.find(x => x.id === card.dataset.id)
    if (r) navigate('detail', r)
  })
}

// 전역 navigate 노출 (팝업 버튼용)
window.navigate = navigate

/* ══════════════════════════════════════════
   추가 화면
══════════════════════════════════════════ */
function renderAdd() {
  // 선택된 태그 상태
  const sel = {} // catId → tagId(단수) | tagId[](복수)

  screenCont.innerHTML = `
    <div class="add-screen screen-enter">

      <div class="add-screen-header">
        <button class="back-btn" id="add-back">←</button>
        <span class="screen-title">새 맛집 추가</span>
      </div>

      <!-- 기본 정보 -->
      <div class="card">
        <p style="font-size:12px;font-weight:500;color:var(--t2);margin-bottom:10px;">기본 정보</p>
        ${[
          { k:'name',      label:'상호명 *',   ph:'예) 삼청동 수제비'        },
          { k:'address',   label:'주소',        ph:'서울 종로구 삼청동 35-10' },
          { k:'shortAddr', label:'단축 주소',   ph:'종로구 삼청동'             },
          { k:'phone',     label:'전화번호',    ph:'02-000-0000'               },
          { k:'hours',     label:'영업시간',    ph:'11:00 - 21:00'             },
        ].map(f => `
          <div style="margin-bottom:8px;">
            <label class="input-label">${f.label}</label>
            <input class="input-field" id="f-${f.k}" placeholder="${f.ph}" />
          </div>`).join('')}
      </div>

      <!-- 태그 선택 -->
      <div class="card" id="tag-select-card">
        <p style="font-size:12px;font-weight:500;color:var(--t2);margin-bottom:12px;">태그 선택</p>
        <div id="tag-select-body"></div>
        <div id="selected-preview" style="margin-top:12px;padding-top:12px;
             border-top:0.5px solid var(--bg5);display:none;">
          <div class="input-label">선택된 태그</div>
          <div id="selected-tags-row" style="display:flex;gap:5px;flex-wrap:wrap;"></div>
        </div>
      </div>

      <!-- 메모 -->
      <div class="card">
        <label class="input-label">개인 메모</label>
        <textarea class="input-field" id="f-memo"
          placeholder="기억하고 싶은 것들… (메뉴, 팁, 느낌)"
          rows="3" style="resize:vertical;min-height:72px;"></textarea>
      </div>

      <div id="add-error" class="error-box" style="display:none;"></div>

      <button class="btn-gold" id="btn-save-add">저장하기</button>
    </div>
  `

  // 태그 선택 UI 렌더
  renderTagSelectUI(qs('#tag-select-body'), sel, () => {
    updateSelectedPreview(sel)
  })

  qs('#add-back').addEventListener('click', () => navigate('home'))

  qs('#btn-save-add').addEventListener('click', async () => {
    const name = qs('#f-name').value.trim()
    if (!name) {
      showAddError('상호명을 입력해주세요')
      return
    }
    const btn = qs('#btn-save-add')
    btn.disabled = true
    btn.textContent = '저장 중…'

    const tagIds = collectTagIds(sel)

    try {
      await addRestaurant({
        name,
        address:   qs('#f-address').value.trim(),
        shortAddr: qs('#f-shortAddr').value.trim(),
        phone:     qs('#f-phone').value.trim(),
        hours:     qs('#f-hours').value.trim(),
        tagIds,
        memo:      qs('#f-memo').value.trim(),
      })
      toast('저장되었습니다!')
      navigate('home')
    } catch (e) {
      console.error(e)
      showAddError('저장 중 오류가 발생했습니다')
      btn.disabled = false
      btn.textContent = '저장하기'
    }
  })

  function showAddError(msg) {
    const el = qs('#add-error')
    el.textContent = msg
    el.style.display = 'block'
  }

  function updateSelectedPreview(sel) {
    const ids = collectTagIds(sel)
    const prev = qs('#selected-preview')
    const row  = qs('#selected-tags-row')
    if (ids.length === 0) { prev.style.display = 'none'; return }
    prev.style.display = 'block'
    row.innerHTML = ids.map(id => makeTagChip(id)).join('')
  }
}

/* ══════════════════════════════════════════
   공통 태그 선택 UI (추가/편집 공용)
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
                      data-tag-id="${t.id}"
                      data-cat-id="${cat.id}"
                      data-multiple="${cat.isMultiple}"
                      style="cursor:pointer">${t.label}</span>
              `).join('')}
            </div>
          </div>`).join('')}
      </div>`
  }).join('')

  container.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip')
    if (!chip) return
    const tagId   = chip.dataset.tagId
    const catId   = chip.dataset.catId
    const isMulti = chip.dataset.multiple === 'true'
    const cat     = TAG_CATEGORIES.find(c => c.id === catId)

    if (isMulti) {
      const arr = sel[catId] ?? []
      sel[catId] = arr.includes(tagId)
        ? arr.filter(x => x !== tagId)
        : [...arr, tagId]
    } else {
      sel[catId] = sel[catId] === tagId ? null : tagId
    }

    // 시각적 업데이트
    const allInCat = container.querySelectorAll(`[data-cat-id="${catId}"]`)
    allInCat.forEach(el => {
      const tid = el.dataset.tagId
      const cur = sel[catId]
      const isSel = isMulti
        ? (Array.isArray(cur) && cur.includes(tid))
        : cur === tid
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

  // Firestore에서 최신 데이터 가져오기
  const fresh = state.restaurants.find(x => x.id === r.id) ?? r

  const tagsByCat = {}
  ;(fresh.tagIds ?? []).forEach(id => {
    const m = TAG_MAP[id]
    if (!m) return
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

        <!-- 기본 정보 -->
        <div class="card">
          <div class="detail-rest-name">${fresh.name}</div>
          ${fresh.address ? `<div class="detail-info-row"><span>📍</span><span>${fresh.address}</span></div>` : ''}
          ${fresh.phone   ? `<div class="detail-info-row"><span>📞</span><span>${fresh.phone}</span></div>` : ''}
          ${fresh.hours   ? `<div class="detail-info-row"><span>🕐</span><span>${fresh.hours}</span></div>` : ''}
          <div class="rating-row">
            <span class="rating-label">내 평점</span>
            <div class="star-row" id="star-row">
              ${[1,2,3,4,5].map(n => `
                <button class="star-btn ${n <= (fresh.rating ?? 0) ? 'filled' : ''}"
                        data-val="${n}">★</button>`).join('')}
            </div>
            <span class="rating-value" id="rating-value">
              ${fresh.rating ? fresh.rating.toFixed(1) : ''}
            </span>
          </div>
        </div>

        <!-- 태그 -->
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
                        ${ids.map(id => makeTagChip(id, { size:'md' })).join('')}
                      </div>
                    </div>`
                }).join('')
            }
          </div>
        </div>

        <!-- 방송 정보 -->
        ${fresh.broadcast ? `
          <div class="card">
            <p style="font-size:13px;font-weight:500;margin-bottom:10px;">방송 출연</p>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="broadcast-badge">${fresh.broadcast.program}</span>
              <span style="font-size:12px;color:var(--t3);">
                ${fresh.broadcast.episode ?? ''} · ${fresh.broadcast.date ?? ''}
              </span>
            </div>
          </div>` : ''}

        <!-- 방문 기록 -->
        <div class="card">
          <div class="tag-section-header">
            <span class="tag-section-title">방문 기록</span>
            <button class="btn-edit-tag" id="btn-visit-add">+ 추가</button>
          </div>
          <div id="visit-form-wrap" style="display:none;">
            <div style="background:var(--bg3);border-radius:var(--r-sm);
                        padding:12px;margin-bottom:12px;">
              <div class="star-row" id="visit-star-row">
                ${[1,2,3,4,5].map(n => `
                  <button class="star-btn ${n <= 4 ? 'filled' : ''}"
                          data-val="${n}">★</button>`).join('')}
              </div>
              <textarea class="input-field" id="visit-memo-input"
                placeholder="이번 방문 메모…" rows="2"
                style="resize:none;min-height:56px;margin-top:8px;"></textarea>
              <button class="btn-gold" id="btn-visit-save"
                style="padding:8px;font-size:13px;margin-top:8px;">저장</button>
            </div>
          </div>
          <div id="visit-log-body">
            ${renderVisitLog(fresh.visitLog ?? [])}
          </div>
        </div>

        <!-- 메모 -->
        ${fresh.memo ? `
          <div class="card">
            <p style="font-size:13px;font-weight:500;margin-bottom:8px;">메모</p>
            <p style="font-size:13px;color:var(--t2);line-height:1.7;">${fresh.memo}</p>
          </div>` : ''}

        <!-- 길찾기 -->
        <button class="btn-ghost" id="btn-directions">카카오맵에서 길찾기 →</button>

      </div>
    </div>
  `

  // 이벤트
  qs('#detail-back').addEventListener('click', () => navigate('home'))

  qs('#detail-delete').addEventListener('click', async () => {
    if (!confirm2(`"${fresh.name}"을 삭제할까요?`)) return
    await removeRestaurant(fresh.id)
    toast('삭제되었습니다')
    navigate('home')
  })

  // 별점
  let currentRating = fresh.rating ?? 0
  qs('#star-row').addEventListener('click', async e => {
    const btn = e.target.closest('.star-btn')
    if (!btn) return
    currentRating = Number(btn.dataset.val)
    updateStars(qs('#star-row'), currentRating)
    qs('#rating-value').textContent = currentRating.toFixed(1)
    await updateRestaurantField(fresh.id, { rating: currentRating })
    state.detailTarget = { ...fresh, rating: currentRating }
  })

  // 태그 편집 바텀시트
  qs('#btn-tag-edit').addEventListener('click', () => {
    openTagEditSheet(fresh)
  })

  // 방문 기록 추가
  let visitRating = 4
  qs('#btn-visit-add').addEventListener('click', () => {
    const wrap = qs('#visit-form-wrap')
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'
  })

  qs('#visit-star-row').addEventListener('click', e => {
    const btn = e.target.closest('.star-btn')
    if (!btn) return
    visitRating = Number(btn.dataset.val)
    updateStars(qs('#visit-star-row'), visitRating)
  })

  qs('#btn-visit-save').addEventListener('click', async () => {
    const memo = qs('#visit-memo-input').value.trim()
    const log  = { memo, rating: visitRating,
                   date: new Date().toISOString().slice(0,10) }
    await updateRestaurantField(fresh.id, {
      visitLog: arrayUnion(log)
    })
    const logBody = qs('#visit-log-body')
    const updated = [...(fresh.visitLog ?? []), log]
    if (logBody) logBody.innerHTML = renderVisitLog(updated)
    qs('#visit-form-wrap').style.display = 'none'
    qs('#visit-memo-input').value = ''
    toast('방문 기록 추가!')
  })

  // 길찾기
  qs('#btn-directions').addEventListener('click', () => {
    window.open(`https://map.kakao.com/link/search/${encodeURIComponent(fresh.name)}`, '_blank')
  })
}

function renderVisitLog(logs) {
  if (!logs.length)
    return '<p style="font-size:12px;color:var(--t4);text-align:center;padding:8px 0;">아직 방문 기록이 없습니다</p>'

  return [...logs].reverse().map((v, i) => `
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

/* 태그 편집 바텀시트 */
function openTagEditSheet(r) {
  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'

  // 현재 태그를 sel에 초기화
  const sel = {}
  TAG_CATEGORIES.forEach(cat => {
    const ids = (r.tagIds ?? []).filter(id => id.startsWith(cat.id + '__'))
    if (cat.isMultiple) sel[cat.id] = ids
    else                sel[cat.id] = ids[0] ?? null
  })

  overlay.innerHTML = `
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <p style="font-size:14px;font-weight:500;margin-bottom:14px;">태그 편집</p>
      <div id="sheet-tag-body"></div>
      <button class="btn-gold" id="sheet-save"
              style="margin-top:16px;">저장</button>
    </div>`

  document.getElementById('app').appendChild(overlay)

  const body = overlay.querySelector('#sheet-tag-body')
  renderTagSelectUI(body, sel, () => {})

  // 현재 선택 상태 표시
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
    const updated = { ...r, tagIds }
    state.detailTarget = updated
    navigate('detail', updated)
    toast('태그가 저장되었습니다')
  })

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove()
  })
}

/* ══════════════════════════════════════════
   검색 화면
══════════════════════════════════════════ */
function renderSearch() {
  screenCont.innerHTML = `
    <div class="search-screen screen-enter">
      <div class="search-input-wrap">
        <svg width="15" height="15" fill="none" stroke="currentColor"
             stroke-width="1.8" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input class="input-field search-input" id="search-input"
               placeholder="식당 이름 또는 태그로 검색…"
               autocomplete="off" />
      </div>
      <div class="search-results" id="search-results">
        <div class="empty-state">
          <div class="emoji">🔍</div>
          <p>검색어를 입력하세요</p>
        </div>
      </div>
    </div>`

  const input   = qs('#search-input')
  const results = qs('#search-results')

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    if (!q) {
      results.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div><p>검색어를 입력하세요</p></div>`
      return
    }

    const matched = state.restaurants.filter(r => {
      const nameMatch = r.name.toLowerCase().includes(q)
      const tagMatch  = (r.tagIds ?? []).some(id => {
        const meta = TAG_MAP[id]
        return meta?.label.includes(q)
      })
      const addrMatch = (r.address ?? '').includes(q)
      return nameMatch || tagMatch || addrMatch
    })

    if (!matched.length) {
      results.innerHTML = `<div class="empty-state"><div class="emoji">😅</div><p>"${q}" 검색 결과가 없습니다</p></div>`
      return
    }

    results.innerHTML = matched.map(r => {
      const tags = (r.tagIds ?? []).slice(0,3).map(id => makeTagChip(id)).join('')
      return `
        <div class="rest-card" data-id="${r.id}">
          <div class="rest-thumb" style="background:var(--bg3);color:var(--t2);">
            ${r.name[0]}
          </div>
          <div class="rest-info">
            <div class="rest-name">${r.name}</div>
            <div class="rest-addr">${r.shortAddr || r.address}</div>
            <div class="rest-tags">${tags}</div>
          </div>
        </div>`
    }).join('')

    results.addEventListener('click', e => {
      const card = e.target.closest('.rest-card')
      if (!card) return
      const r = state.restaurants.find(x => x.id === card.dataset.id)
      if (r) navigate('detail', r)
    })
  })

  input.focus()
}

/* ══════════════════════════════════════════
   마이 화면
══════════════════════════════════════════ */
function renderMy() {
  const u = state.user
  screenCont.innerHTML = `
    <div class="my-screen screen-enter">
      <div class="my-avatar-large">
        ${(u?.displayName ?? 'U')[0]}
      </div>
      <div style="text-align:center;">
        <div class="my-name">${u?.displayName ?? ''}</div>
        <div class="my-email">${u?.email ?? ''}</div>
      </div>
      <div style="text-align:center;color:var(--t3);font-size:13px;">
        저장된 맛집: <strong style="color:var(--gold);">${state.restaurants.length}곳</strong>
      </div>
      <button class="btn-ghost" id="btn-signout"
              style="width:auto;padding:10px 28px;">로그아웃</button>
    </div>`

  qs('#btn-signout').addEventListener('click', () => {
    if (confirm2('로그아웃 할까요?')) signOut(window.auth)
  })
}

/* ══════════════════════════════════════════
   서비스 워커 등록
══════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/My-gourmet/sw.js')
      .then(() => console.log('SW 등록 완료'))
      .catch(e => console.warn('SW 등록 실패', e))
  })
}
