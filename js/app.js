// js/app.js — My Gourmet Archive
'use strict'

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

const state = {
  user: null, restaurants: [], currentScreen: 'home', prevScreen: 'home',
  activeFilter: 'all', unsubscribe: null, mapInstance: null,
  detailTarget: null, userLat: null, userLng: null, mapMode: 'adaptive',
  listFilter: { food: null, source: null, status: null }
}

const $ = id => document.getElementById(id)
const qs  = (sel, ctx=document) => ctx.querySelector(sel)
const qsa = (sel, ctx=document) => [...ctx.querySelectorAll(sel)]
function show(el){ el.classList.remove('hidden') }
function hide(el){ el.classList.add('hidden') }

function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg
  $('app-wrapper').appendChild(t); setTimeout(()=>t.remove(),2200)
}
function confirm2(msg){ return window.confirm(msg) }

function distKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

/* ── 인증 ── */
onAuthStateChanged(window.auth, user=>{
  hide($('splash'))
  if(user){
    state.user=user
    show($('app-wrapper')); hide($('login-screen'))
    subscribeRestaurants(); getUserLocation(); navigate('home')
  } else {
    state.user=null; hide($('app-wrapper')); show($('login-screen'))
    if(state.unsubscribe) state.unsubscribe()
  }
})

$('btn-google-login').addEventListener('click', async()=>{
  const btn=$('btn-google-login'); btn.disabled=true; btn.textContent='로그인 중…'
  try{ await signInWithPopup(window.auth, new window.GoogleAuthProvider()) }
  catch(e){ btn.disabled=false; btn.textContent='Google로 시작하기' }
})

/* ── 위치 ── */
function getUserLocation(){
  navigator.geolocation?.getCurrentPosition(pos=>{
    state.userLat=pos.coords.latitude; state.userLng=pos.coords.longitude
    if(state.currentScreen==='home') refreshCurrentScreen()
  })
}

/* ── Firestore ── */
function subscribeRestaurants(){
  if(state.unsubscribe) state.unsubscribe()
  const q=query(collection(window.db,COL),where('userId','==',state.user.uid),orderBy('createdAt','desc'))
  state.unsubscribe=onSnapshot(q, snap=>{
    state.restaurants=snap.docs.map(d=>({id:d.id,...d.data()}))
    refreshCurrentScreen()
  }, err=>console.error(err))
}

async function addRestaurant(data){
  await addDoc(collection(window.db,COL),{
    userId:state.user.uid, name:data.name??'', address:data.address??'',
    shortAddr:data.shortAddr??'', phone:data.phone??'', hours:data.hours??'',
    lat:data.lat??null, lng:data.lng??null, tagIds:data.tagIds??[], memo:data.memo??'',
    rating:data.rating??null, visitLog:[], source:'manual', broadcast:null,
    createdAt:serverTimestamp(), updatedAt:serverTimestamp()
  })
}

async function updateRestaurantField(id,fields){
  await updateDoc(doc(window.db,COL,id),{...fields,updatedAt:serverTimestamp()})
}

async function removeRestaurant(id){ await deleteDoc(doc(window.db,COL,id)) }

/* ── 라우터 ── */
function navigate(screen, data=null){
  if(screen!=='detail') state.prevScreen=state.currentScreen
  state.currentScreen=screen; state.detailTarget=data
  qsa('.tab-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===screen))
  const hideFAB=['add','detail'].includes(screen)
  $('fab-add').classList.toggle('hidden-fab',hideFAB)
  $('screen-container').innerHTML=''
  const renders={ home:renderHome, list:renderList, my:renderMy, add:renderAdd, detail:()=>renderDetail(data) }
  const fn=renders[screen]; if(fn) fn()
}

function refreshCurrentScreen(){ navigate(state.currentScreen, state.detailTarget) }

$('tab-bar').addEventListener('click', e=>{
  const item=e.target.closest('.tab-item'); if(!item) return; navigate(item.dataset.tab)
})
$('fab-add').addEventListener('click', ()=>navigate('add'))
window.navigate=navigate

/* ══════════════════════════════════════════
   홈
══════════════════════════════════════════ */
function renderHome(){
  const nearby=getAdaptiveNearby()
  const filtered=applyHomeFilter(nearby.list)
  const radiusText=nearby.radius!=null?` (반경 ${nearby.radius.toFixed(1)}km)`:''
  $('screen-container').innerHTML=`
    <div class="home-screen screen-enter">
      <div class="filter-bar" style="padding:8px 0 0;">
        <div class="filter-inner" id="filter-inner"></div>
      </div>
      <div class="map-wrap" style="height:45vh;margin:8px 16px 0;position:relative;">
        <div id="map"></div>
        <div class="map-badge" id="map-badge">📍 ${filtered.length}곳${radiusText}</div>
        <button id="btn-search-area" style="display:none;position:absolute;top:10px;left:50%;
          transform:translateX(-50%);z-index:1000;padding:7px 16px;
          background:var(--bg1);color:var(--t1);border:0.5px solid var(--bg5);
          border-radius:var(--r-pill);font-size:12px;font-weight:500;
          font-family:var(--font-body);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);
          white-space:nowrap;">🔍 이 지역 검색</button>
        <button id="btn-my-location" style="position:absolute;bottom:10px;right:10px;
          z-index:1000;width:36px;height:36px;border-radius:50%;
          background:var(--bg1);border:0.5px solid var(--bg5);
          font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);">📍</button>
      </div>
      <div class="section-header" style="padding:10px 16px 6px;">
        <span class="section-title">NEARBY RESTAURANTS</span>
        <span class="section-count" id="section-count">${filtered.length}곳</span>
      </div>
      <div class="grid-scroll" id="rest-grid"></div>
    </div>`
  renderFilterChips()
  renderMap(filtered)
  renderGrid(filtered)
}

// 적응형 반경 — 거리순 상위 30개, 반경 자동 계산
function getAdaptiveNearby(){
  if(!state.userLat||!state.userLng) return {list:state.restaurants, radius:null}
  const withDist=state.restaurants.filter(r=>r.lat&&r.lng)
    .map(r=>({...r,_dist:distKm(state.userLat,state.userLng,r.lat,r.lng)}))
    .sort((a,b)=>a._dist-b._dist)
  const top30=withDist.slice(0,30)
  const radius=top30.length>0?top30[top30.length-1]._dist:null
  const noCoord=state.restaurants.filter(r=>!r.lat||!r.lng)
  return {list:[...top30,...noCoord], radius}
}

// 뷰포트 기준 필터
function getViewportRestaurants(map){
  const bounds=map.getBounds()
  return state.restaurants.filter(r=>{
    if(!r.lat||!r.lng) return false
    return bounds.contains([r.lat,r.lng])
  }).map(r=>({...r,_dist:
    state.userLat?distKm(state.userLat,state.userLng,r.lat,r.lng):null
  }))
}

function getNearbyRestaurants(){
  return getAdaptiveNearby().list
}

function applyHomeFilter(list){
  const f=state.activeFilter
  if(f==='all') return list
  if(!f.includes('__')) return list.filter(r=>(r.tagIds??[]).some(id=>id.startsWith(f+'__')))
  return list.filter(r=>(r.tagIds??[]).includes(f))
}

function renderFilterChips(){
  const inner=qs('#filter-inner'); if(!inner) return
  const cores=[
    {key:'all',label:'전체',color:null},
    {key:'food',label:'음식',color:TAG_COLORS['food']},
    {key:'source',label:'출처',color:TAG_COLORS['source']},
    {key:'status',label:'내상태',color:TAG_COLORS['status']},
  ]
  inner.innerHTML=cores.map(f=>{
    const isActive=state.activeFilter===f.key||
      (f.key!=='all'&&state.activeFilter.startsWith(f.key+'__'))
    const c=f.color; let style='',cls='filter-chip'
    if(f.key==='all'&&isActive) cls+=' active-all'
    else if(c&&isActive) style=`background:${c.fg};color:#fff;border-color:${c.fg};`
    else if(c) style=`background:${c.bg};color:${c.fg};border-color:${c.bd};`
    const dot=c?`<span class="filter-chip-dot" style="background:${c.fg}"></span>`:''
    return `<button class="${cls}" style="${style}" data-filter="${f.key}">${dot}${f.label}</button>`
  }).join('')+
  `<button class="filter-chip" id="btn-filter-more" style="background:var(--bg3);color:var(--t2);border-color:var(--bg5);">▼ 더보기</button>`

  inner.addEventListener('click', e=>{
    const btn=e.target.closest('.filter-chip'); if(!btn) return
    if(btn.id==='btn-filter-more'){ openFilterSheet(); return }
    const f=btn.dataset.filter
    if(f===state.activeFilter){ state.activeFilter='all'; renderHome(); return }
    if(f&&!f.includes('__')){ openCategoryFilterSheet(f); return }
    state.activeFilter=f??'all'; renderHome()
  })
}

function openCategoryFilterSheet(catId){
  const cat=TAG_CATEGORIES.find(c=>c.id===catId); if(!cat) return
  const c=TAG_COLORS[catId]
  const overlay=document.createElement('div'); overlay.className='sheet-overlay'
  overlay.innerHTML=`
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;background:${c.bg};color:${c.fg};border:0.5px solid ${c.bd};">${cat.num}</span>
        <p style="font-size:14px;font-weight:500;color:${c.fg};">${cat.name} 필터</p>
      </div>
      <button class="filter-tag-btn" data-tag="${catId}"
        style="margin-bottom:10px;width:100%;padding:8px;
        background:${state.activeFilter===catId?c.fg:'var(--bg3)'};
        color:${state.activeFilter===catId?'#fff':c.fg};
        border:0.5px solid ${c.bd};border-radius:var(--r-sm);
        font-size:12px;font-weight:500;font-family:var(--font-body);cursor:pointer;">
        전체 ${cat.name}
      </button>
      ${cat.groups.map(g=>`
        <div style="margin-bottom:10px;">
          <div style="font-size:10px;color:var(--t3);margin-bottom:6px;">${g.label}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${g.tags.map(t=>`
              <button class="filter-tag-btn" data-tag="${t.id}"
                style="padding:5px 12px;border-radius:var(--r-pill);
                border:0.5px solid ${state.activeFilter===t.id?c.fg:c.bd};
                background:${state.activeFilter===t.id?c.fg:c.bg};
                color:${state.activeFilter===t.id?'#fff':c.fg};
                font-size:12px;font-weight:500;font-family:var(--font-body);cursor:pointer;">
                ${t.label}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`
  document.getElementById('app').appendChild(overlay)
  overlay.addEventListener('click', e=>{
    const btn=e.target.closest('.filter-tag-btn')
    if(btn){ state.activeFilter=btn.dataset.tag; overlay.remove(); renderHome(); return }
    if(e.target===overlay) overlay.remove()
  })
}

function openFilterSheet(){
  const overlay=document.createElement('div'); overlay.className='sheet-overlay'
  overlay.innerHTML=`
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <p style="font-size:14px;font-weight:500;margin-bottom:14px;">필터 선택</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${TAG_CATEGORIES.map(cat=>{
          const c=TAG_COLORS[cat.id],isActive=state.activeFilter.startsWith(cat.id)
          return `<button class="filter-tag-btn" data-cat="${cat.id}"
            style="display:flex;align-items:center;gap:10px;padding:12px;
            border-radius:var(--r-md);border:0.5px solid ${isActive?c.fg:c.bd};
            background:${isActive?c.fg:c.bg};color:${isActive?'#fff':c.fg};
            font-family:var(--font-body);cursor:pointer;text-align:left;">
            <span style="font-size:11px;font-weight:500;opacity:0.7;">${cat.num}</span>
            <span style="font-size:13px;font-weight:500;">${cat.name}</span>
            <span style="font-size:11px;opacity:0.6;margin-left:auto;">▶</span>
          </button>`}).join('')}
        ${state.activeFilter!=='all'?`
          <button id="btn-clear-filter"
            style="padding:10px;border-radius:var(--r-md);border:0.5px solid var(--bg5);
            background:var(--bg3);color:var(--t3);font-family:var(--font-body);cursor:pointer;font-size:13px;">
            필터 초기화</button>`:''}
      </div>
    </div>`
  document.getElementById('app').appendChild(overlay)
  overlay.addEventListener('click', e=>{
    const btn=e.target.closest('.filter-tag-btn')
    if(btn?.dataset.cat){ overlay.remove(); openCategoryFilterSheet(btn.dataset.cat); return }
    if(e.target.id==='btn-clear-filter'){ state.activeFilter='all'; overlay.remove(); renderHome(); return }
    if(e.target===overlay) overlay.remove()
  })
}

function renderMap(filtered){
  if(state.mapInstance){ state.mapInstance.remove(); state.mapInstance=null }
  const center=(state.userLat&&state.userLng)?[state.userLat,state.userLng]:[37.5665,126.978]
  const map=L.map('map',{zoomControl:false}).setView(center,13)
  state.mapInstance=map
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map)
  const ACCENT={food:'#FF6B35',purpose:'#00B4D8',space:'#06D6A0',source:'#FFD166',facility:'#118AB2',status:'#EF476F'}
  filtered.filter(r=>r.lat&&r.lng).forEach(r=>{
    const catId=(r.tagIds??[]).find(id=>TAG_MAP[id])?.split('__')[0]??'food'
    const color=ACCENT[catId]??'#c9a96e'
    const icon=L.divIcon({
      html:`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
        <path d="M10 0C4.5 0 0 4.5 0 10c0 7 10 18 10 18S20 17 20 10C20 4.5 15.5 0 10 0z"
          fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="3" fill="#fff" opacity="0.8"/></svg>`,
      className:'',iconSize:[20,28],iconAnchor:[10,28],popupAnchor:[0,-30]
    })
    L.marker([r.lat,r.lng],{icon}).addTo(map).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:110px;">
        <strong style="font-size:13px;">${r.name}</strong><br>
        <small style="color:#868e96;">${r.shortAddr||''}</small><br>
        <button onclick="window._mgaDetail('${r.id}')"
          style="margin-top:7px;padding:5px 10px;background:#c9a96e;color:#fff;
          border:none;border-radius:6px;font-size:11px;cursor:pointer;
          width:100%;font-family:'DM Sans',sans-serif;">상세 보기 →</button>
      </div>`)
  })
  window._mgaDetail=id=>{
    const r=state.restaurants.find(x=>x.id===id); if(r) navigate('detail',r)
  }
  if(state.userLat&&state.userLng){
    L.circleMarker([state.userLat,state.userLng],{
      radius:10,fillColor:'#FF6B35',color:'#fff',weight:3,fillOpacity:1
    }).addTo(map).bindPopup('내 위치')
  }

  // 지도 이동 감지 → "이 지역 검색" 버튼 표시
  let moveTimer=null
  map.on('movestart', ()=>{
    const btn=document.getElementById('btn-search-area')
    if(btn) btn.style.display='none'
  })
  map.on('moveend', ()=>{
    clearTimeout(moveTimer)
    moveTimer=setTimeout(()=>{
      const btn=document.getElementById('btn-search-area')
      if(btn) btn.style.display='block'
    }, 300)
  })

  // 이 지역 검색 버튼
  const btnSearch=document.getElementById('btn-search-area')
  if(btnSearch){
    btnSearch.addEventListener('click', ()=>{
      btnSearch.style.display='none'
      const vpList=getViewportRestaurants(map)
      const vpFiltered=applyHomeFilter(vpList)
      // 지도 핀 업데이트
      map.eachLayer(layer=>{ if(layer instanceof L.Marker) map.removeLayer(layer) })
      const ACCENT={food:'#FF6B35',purpose:'#00B4D8',space:'#06D6A0',source:'#FFD166',facility:'#118AB2',status:'#EF476F'}
      vpFiltered.forEach(r=>{
        if(!r.lat||!r.lng) return
        const catId=(r.tagIds??[]).find(id=>TAG_MAP[id])?.split('__')[0]??'food'
        const color=ACCENT[catId]??'#c9a96e'
        const icon=L.divIcon({
          html:`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
            <path d="M10 0C4.5 0 0 4.5 0 10c0 7 10 18 10 18S20 17 20 10C20 4.5 15.5 0 10 0z"
              fill="${color}" stroke="#fff" stroke-width="1.5"/>
            <circle cx="10" cy="10" r="3" fill="#fff" opacity="0.8"/></svg>`,
          className:'',iconSize:[20,28],iconAnchor:[10,28],popupAnchor:[0,-30]
        })
        L.marker([r.lat,r.lng],{icon}).addTo(map).bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;min-width:110px;">
            <strong style="font-size:13px;">${r.name}</strong><br>
            <small style="color:#868e96;">${r.shortAddr||''}</small><br>
            <button onclick="window._mgaDetail('${r.id}')"
              style="margin-top:7px;padding:5px 10px;background:#c9a96e;color:#fff;
              border:none;border-radius:6px;font-size:11px;cursor:pointer;
              width:100%;font-family:'DM Sans',sans-serif;">상세 보기 →</button>
          </div>`)
      })
      // 카드 + 배지 업데이트
      const badge=document.getElementById('map-badge')
      const count=document.getElementById('section-count')
      if(badge) badge.textContent=`🔍 ${vpFiltered.length}곳 (현 지도 기준)`
      if(count) count.textContent=`${vpFiltered.length}곳`
      renderGrid(vpFiltered)
    })
  }

  // 내 위치 버튼
  const btnMyLoc=document.getElementById('btn-my-location')
  if(btnMyLoc){
    btnMyLoc.addEventListener('click', ()=>{
      if(state.userLat&&state.userLng){
        map.setView([state.userLat,state.userLng],13)
        const nearby=getAdaptiveNearby()
        const filtered=applyHomeFilter(nearby.list)
        const radiusText=nearby.radius!=null?` (반경 ${nearby.radius.toFixed(1)}km)`:''
        const badge=document.getElementById('map-badge')
        const count=document.getElementById('section-count')
        if(badge) badge.textContent=`📍 ${filtered.length}곳${radiusText}`
        if(count) count.textContent=`${filtered.length}곳`
        renderGrid(filtered)
        document.getElementById('btn-search-area').style.display='none'
      }
    })
  }
}

function renderGrid(filtered){
  const grid=qs('#rest-grid'); if(!grid) return
  if(!filtered.length){
    grid.innerHTML=`<div class="empty-state"><div class="emoji">🍽️</div>
      <p>${state.userLat?'주변에 저장된 맛집이 없어요':'아직 저장된 맛집이 없어요'}</p>
      <button onclick="window.navigate('add')">첫 맛집 추가하기 +</button></div>`
    return
  }
  const ACCENT={food:'#5f3dc4',purpose:'#1864ab',space:'#7a5800',source:'#7d3800',facility:'#1a5c2a',status:'#6a0dad'}
  grid.innerHTML=filtered.map(r=>{
    const catId=(r.tagIds??[]).find(id=>TAG_MAP[id])?.split('__')[0]??'food'
    const accent=ACCENT[catId]??'#c9a96e'
    const tags=(r.tagIds??[]).slice(0,2).map(id=>makeTagChip(id)).join('')
    const dist=r._dist!=null?`<span style="font-size:10px;color:var(--t3);">${r._dist.toFixed(1)}km</span>`:''
    return `<div class="grid-card" data-id="${r.id}" style="border-left:2.5px solid ${accent};">
      <div class="grid-card-name">${r.name}</div>
      <div class="grid-card-addr">${r.shortAddr||r.address||'주소 없음'}</div>
      <div class="grid-card-tags">${tags}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
        ${dist}${r.rating?`<span style="font-size:11px;color:var(--gold);">★ ${r.rating.toFixed(1)}</span>`:''}
      </div></div>`
  }).join('')
  grid.addEventListener('click', e=>{
    const card=e.target.closest('.grid-card'); if(!card) return
    const r=state.restaurants.find(x=>x.id===card.dataset.id); if(r) navigate('detail',r)
  })
}

/* ══════════════════════════════════════════
   리스트
══════════════════════════════════════════ */
function renderList(){
  const filtered=getListFiltered()
  $('screen-container').innerHTML=`
    <div class="list-screen screen-enter">
      <div style="padding:10px 16px 0;">
        <div class="search-bar" style="margin:0;">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="list-search" style="border:none;outline:none;background:transparent;
            font-family:var(--font-body);font-size:13px;color:var(--t1);flex:1;width:100%;"
            placeholder="식당명, 태그, 지역 검색…" autocomplete="off"/>
        </div>
      </div>
      <!-- 홈처럼 핵심 칩 + 더보기 -->
      <div style="padding:8px 16px 0;">
        <div class="filter-inner" id="list-filter-inner"></div>
      </div>
      <!-- 활성 필터 표시 -->
      <div id="list-active-filters" style="padding:4px 16px 0;display:flex;gap:5px;flex-wrap:wrap;min-height:0;"></div>
      <div style="padding:8px 16px 10px;">
        <button id="btn-result-count" style="width:100%;padding:12px;background:var(--t1);color:var(--bg1);
          border:none;border-radius:var(--r-md);font-size:14px;font-weight:500;
          font-family:var(--font-body);cursor:pointer;">
          <span id="result-count-text">${filtered.length}곳 보기</span>
        </button>
      </div>
      <div class="list-result" id="list-result">${renderListCards(filtered)}</div>
    </div>`

  renderListFilterChips()

  qs('#list-search').addEventListener('input', e=>{
    const q=e.target.value.trim().toLowerCase()
    const searched=getListFiltered().filter(r=>{
      if(!q) return true
      return r.name.toLowerCase().includes(q)||(r.address??'').includes(q)||
        (r.tagIds??[]).some(id=>TAG_MAP[id]?.label.includes(q))
    })
    qs('#result-count-text').textContent=`${searched.length}곳 보기`
    qs('#list-result').innerHTML=renderListCards(searched)
    attachListCardEvents()
  })

  qs('#btn-result-count').addEventListener('click',()=>{
    qs('#list-result').scrollIntoView({behavior:'smooth'})
  })
  attachListCardEvents()
}

function renderListFilterChips(){
  const inner=qs('#list-filter-inner'); if(!inner) return
  const cats=[
    {key:'food',  label:'음식'},
    {key:'source',label:'출처'},
    {key:'status',label:'내상태'},
  ]
  inner.innerHTML=cats.map(f=>{
    const c=TAG_COLORS[f.key]
    const isActive=!!state.listFilter[f.key]
    const style=isActive?`background:${c.fg};color:#fff;border-color:${c.fg};`:
      `background:${c.bg};color:${c.fg};border-color:${c.bd};`
    const dot=`<span class="filter-chip-dot" style="background:${isActive?'#fff':c.fg}"></span>`
    return `<button class="filter-chip" style="${style}" data-lcat="${f.key}">${dot}${f.label}</button>`
  }).join('')+
  `<button class="filter-chip" id="btn-list-filter-more"
    style="background:var(--bg3);color:var(--t2);border-color:var(--bg5);">▼ 더보기</button>
  ${Object.values(state.listFilter).some(v=>v)?
    `<button class="filter-chip" id="btn-list-reset"
      style="background:var(--bg3);color:var(--t3);border-color:var(--bg5);">✕ 초기화</button>`
    :''}`

  inner.addEventListener('click', e=>{
    const btn=e.target.closest('.filter-chip'); if(!btn) return
    if(btn.id==='btn-list-filter-more'){ openListFilterSheet(); return }
    if(btn.id==='btn-list-reset'){
      state.listFilter={food:null,source:null,status:null}
      updateListResults(); renderListFilterChips(); renderListActiveFilters(); return
    }
    const cat=btn.dataset.lcat; if(!cat) return
    openListCategorySheet(cat)
  })

  renderListActiveFilters()
}

function renderListActiveFilters(){
  const el=qs('#list-active-filters'); if(!el) return
  const active=Object.entries(state.listFilter).filter(([,v])=>v)
  if(!active.length){ el.innerHTML=''; return }
  el.innerHTML=active.map(([cat,id])=>{
    const c=TAG_COLORS[cat], tag=TAG_MAP[id]
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
      border-radius:var(--r-pill);font-size:11px;font-weight:500;
      background:${c.bg};color:${c.fg};border:0.5px solid ${c.bd};">
      ${tag?.label??id}
      <button data-clear="${cat}" style="background:none;border:none;color:${c.fg};
        cursor:pointer;font-size:12px;padding:0;line-height:1;">×</button>
    </span>`
  }).join('')
  el.querySelectorAll('[data-clear]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation()
      state.listFilter[btn.dataset.clear]=null
      updateListResults(); renderListFilterChips(); renderListActiveFilters()
    })
  })
}

function openListCategorySheet(catId){
  const cat=TAG_CATEGORIES.find(c=>c.id===catId); if(!cat) return
  const c=TAG_COLORS[catId]
  const overlay=document.createElement('div'); overlay.className='sheet-overlay'
  overlay.innerHTML=`
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;
          background:${c.bg};color:${c.fg};border:0.5px solid ${c.bd};">${cat.num}</span>
        <p style="font-size:14px;font-weight:500;color:${c.fg};">${cat.name} 필터</p>
      </div>
      <button class="list-filter-tag-btn" data-tag=""
        style="margin-bottom:10px;width:100%;padding:8px;
        background:${!state.listFilter[catId]?c.fg:'var(--bg3)'};
        color:${!state.listFilter[catId]?'#fff':c.fg};
        border:0.5px solid ${c.bd};border-radius:var(--r-sm);
        font-size:12px;font-weight:500;font-family:var(--font-body);cursor:pointer;">
        전체 ${cat.name}
      </button>
      ${cat.groups.map(g=>`
        <div style="margin-bottom:10px;">
          <div style="font-size:10px;color:var(--t3);margin-bottom:6px;">${g.label}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${g.tags.map(t=>`
              <button class="list-filter-tag-btn" data-tag="${t.id}"
                style="padding:5px 12px;border-radius:var(--r-pill);
                border:0.5px solid ${state.listFilter[catId]===t.id?c.fg:c.bd};
                background:${state.listFilter[catId]===t.id?c.fg:c.bg};
                color:${state.listFilter[catId]===t.id?'#fff':c.fg};
                font-size:12px;font-weight:500;font-family:var(--font-body);cursor:pointer;">
                ${t.label}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`
  document.getElementById('app').appendChild(overlay)
  overlay.addEventListener('click', e=>{
    const btn=e.target.closest('.list-filter-tag-btn')
    if(btn){
      state.listFilter[catId]=btn.dataset.tag||null
      overlay.remove()
      updateListResults(); renderListFilterChips(); renderListActiveFilters()
      return
    }
    if(e.target===overlay) overlay.remove()
  })
}

function openListFilterSheet(){
  const overlay=document.createElement('div'); overlay.className='sheet-overlay'
  overlay.innerHTML=`
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <p style="font-size:14px;font-weight:500;margin-bottom:14px;">필터 선택</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[{key:'food',label:'음식 종류'},{key:'source',label:'검증 출처'},{key:'status',label:'나의 상태'}].map(f=>{
          const c=TAG_COLORS[f.key], isActive=!!state.listFilter[f.key]
          return `<button class="list-sheet-cat" data-cat="${f.key}"
            style="display:flex;align-items:center;gap:10px;padding:12px;
            border-radius:var(--r-md);border:0.5px solid ${isActive?c.fg:c.bd};
            background:${isActive?c.fg:c.bg};color:${isActive?'#fff':c.fg};
            font-family:var(--font-body);cursor:pointer;text-align:left;">
            <span style="font-size:13px;font-weight:500;">${f.label}</span>
            ${isActive?`<span style="font-size:11px;margin-left:auto;opacity:0.8;">
              ${TAG_MAP[state.listFilter[f.key]]?.label??''}</span>`:''}
            <span style="font-size:11px;opacity:0.6;margin-left:auto;">▶</span>
          </button>`}).join('')}
      </div>
    </div>`
  document.getElementById('app').appendChild(overlay)
  overlay.addEventListener('click', e=>{
    const btn=e.target.closest('.list-sheet-cat')
    if(btn){ overlay.remove(); openListCategorySheet(btn.dataset.cat); return }
    if(e.target===overlay) overlay.remove()
  })
}

function updateListResults(){
  const newFiltered=getListFiltered()
  const countEl=qs('#result-count-text')
  const resultEl=qs('#list-result')
  if(countEl) countEl.textContent=`${newFiltered.length}곳 보기`
  if(resultEl){ resultEl.innerHTML=renderListCards(newFiltered); attachListCardEvents() }
}

function getListFiltered(){
  return state.restaurants.filter(r=>{
    const t=r.tagIds??[]
    if(state.listFilter.food&&!t.includes(state.listFilter.food)) return false
    if(state.listFilter.source&&!t.includes(state.listFilter.source)) return false
    if(state.listFilter.status&&!t.includes(state.listFilter.status)) return false
    return true
  })
}

function renderListCards(list){
  if(!list.length) return `<div class="empty-state"><div class="emoji">😅</div><p>검색 결과가 없습니다</p></div>`
  const ACCENT={food:'#5f3dc4',purpose:'#1864ab',space:'#7a5800',source:'#7d3800',facility:'#1a5c2a',status:'#6a0dad'}
  return `<div class="list-grid">${list.map(r=>{
    const catId=(r.tagIds??[]).find(id=>TAG_MAP[id])?.split('__')[0]??'food'
    const accent=ACCENT[catId]??'#c9a96e'
    const tags=(r.tagIds??[]).slice(0,2).map(id=>makeTagChip(id)).join('')
    return `<div class="grid-card" data-id="${r.id}" style="border-left:2.5px solid ${accent};">
      <div class="grid-card-name">${r.name}</div>
      <div class="grid-card-addr">${r.shortAddr||r.address||''}</div>
      <div class="grid-card-tags">${tags}</div>
      ${r.rating?`<div style="font-size:11px;color:var(--gold);margin-top:4px;">★ ${r.rating.toFixed(1)}</div>`:''}</div>`
  }).join('')}</div>`
}

function attachListCardEvents(){
  const result=qs('#list-result'); if(!result) return
  result.onclick=e=>{
    const card=e.target.closest('.grid-card'); if(!card) return
    const r=state.restaurants.find(x=>x.id===card.dataset.id); if(r) navigate('detail',r)
  }
}

/* ══════════════════════════════════════════
   추가
══════════════════════════════════════════ */
function renderAdd(){
  const sel={}
  $('screen-container').innerHTML=`
    <div class="add-screen screen-enter">
      <div class="add-screen-header">
        <button class="back-btn" id="add-back">←</button>
        <span class="screen-title">새 맛집 추가</span>
      </div>
      <div class="card">
        <p style="font-size:12px;font-weight:500;color:var(--t2);margin-bottom:10px;">기본 정보</p>
        ${[{k:'name',label:'상호명 *',ph:'예) 삼청동 수제비'},{k:'address',label:'주소',ph:'서울 종로구 삼청동 35-10'},
           {k:'shortAddr',label:'단축 주소',ph:'종로구 삼청동'},{k:'phone',label:'전화번호',ph:'02-000-0000'},
           {k:'hours',label:'영업시간',ph:'11:00 - 21:00'}].map(f=>`
          <div style="margin-bottom:8px;">
            <label class="input-label">${f.label}</label>
            <input class="input-field" id="f-${f.k}" placeholder="${f.ph}"/>
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
        <textarea class="input-field" id="f-memo" placeholder="기억하고 싶은 것들…" rows="3"
          style="resize:vertical;min-height:72px;"></textarea>
      </div>
      <div id="add-error" style="display:none;padding:10px;background:rgba(220,53,69,.1);
        border:0.5px solid rgba(220,53,69,.3);border-radius:var(--r-sm);font-size:13px;color:#dc3545;margin:0 16px;"></div>
      <button class="btn-gold" id="btn-save-add">저장하기</button>
    </div>`

  renderTagSelectUI(qs('#tag-select-body'),sel,()=>updateSelectedPreview(sel))
  qs('#add-back').addEventListener('click',()=>navigate('home'))
  qs('#btn-save-add').addEventListener('click', async()=>{
    const name=qs('#f-name').value.trim()
    if(!name){ showAddError('상호명을 입력해주세요'); return }
    const btn=qs('#btn-save-add'); btn.disabled=true; btn.textContent='저장 중…'
    try{
      await addRestaurant({ name, address:qs('#f-address').value.trim(),
        shortAddr:qs('#f-shortAddr').value.trim(), phone:qs('#f-phone').value.trim(),
        hours:qs('#f-hours').value.trim(), tagIds:collectTagIds(sel), memo:qs('#f-memo').value.trim() })
      toast('저장되었습니다!'); navigate('home')
    }catch(e){ showAddError('저장 중 오류가 발생했습니다'); btn.disabled=false; btn.textContent='저장하기' }
  })
  function showAddError(msg){ const el=qs('#add-error'); el.textContent=msg; el.style.display='block' }
  function updateSelectedPreview(sel){
    const ids=collectTagIds(sel), prev=qs('#selected-preview'), row=qs('#selected-tags-row')
    if(!ids.length){ prev.style.display='none'; return }
    prev.style.display='block'; row.innerHTML=ids.map(id=>makeTagChip(id)).join('')
  }
}

/* ══════════════════════════════════════════
   태그 UI (공용)
══════════════════════════════════════════ */
function renderTagSelectUI(container,sel,onChange){
  container.innerHTML=TAG_CATEGORIES.map(cat=>{
    const c=TAG_COLORS[cat.id]
    return `<div style="margin-bottom:14px;">
      <div class="cat-header">
        <span class="cat-num-badge" style="${catColorStyle(cat.id)}">${cat.num}</span>
        <span class="cat-name-label" style="color:${catFgColor(cat.id)}">${cat.name}</span>
        <span class="cat-rule-badge">${cat.isMultiple?'복수':'단수'}</span>
      </div>
      ${cat.groups.map(g=>`
        <div><p class="tag-group-title">${g.label}</p>
          <div class="tag-group-row">
            ${g.tags.map(t=>`<span class="tag-chip ${c.cls} clickable"
              data-tag-id="${t.id}" data-cat-id="${cat.id}" data-multiple="${cat.isMultiple}">${t.label}</span>`).join('')}
          </div></div>`).join('')}
    </div>`
  }).join('')

  container.addEventListener('click', e=>{
    const chip=e.target.closest('.tag-chip'); if(!chip) return
    const tagId=chip.dataset.tagId, catId=chip.dataset.catId, isMulti=chip.dataset.multiple==='true'
    if(isMulti){ const arr=sel[catId]??[]; sel[catId]=arr.includes(tagId)?arr.filter(x=>x!==tagId):[...arr,tagId] }
    else { sel[catId]=sel[catId]===tagId?null:tagId }
    container.querySelectorAll(`[data-cat-id="${catId}"]`).forEach(el=>{
      const cur=sel[catId]
      const isSel=isMulti?(Array.isArray(cur)&&cur.includes(el.dataset.tagId)):cur===el.dataset.tagId
      el.classList.toggle('selected',isSel)
    })
    onChange()
  })
}

function collectTagIds(sel){
  return Object.entries(sel).flatMap(([,val])=>Array.isArray(val)?val:val?[val]:[])
}

/* ══════════════════════════════════════════
   상세 (편집 기능 추가)
══════════════════════════════════════════ */
function renderDetail(r){
  if(!r) return navigate('home')
  const fresh=state.restaurants.find(x=>x.id===r.id)??r
  const tagsByCat={}
  ;(fresh.tagIds??[]).forEach(id=>{ const m=TAG_MAP[id]; if(!m) return
    if(!tagsByCat[m.categoryId]) tagsByCat[m.categoryId]=[]
    tagsByCat[m.categoryId].push(id) })

  $('screen-container').innerHTML=`
    <div class="detail-screen screen-enter">
      <div class="detail-header">
        <button class="back-btn" id="detail-back">←</button>
        <span class="detail-title">${fresh.name}</span>
        <button class="delete-btn" id="detail-delete">삭제</button>
      </div>
      <div class="detail-inner">

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div class="detail-rest-name">${fresh.name}</div>
            <button id="btn-edit-info" style="font-size:11px;color:var(--gold);
              background:rgba(201,169,110,.1);border:0.5px solid rgba(201,169,110,.3);
              padding:4px 10px;border-radius:8px;cursor:pointer;font-family:var(--font-body);">✏️ 편집</button>
          </div>
          <div id="info-display">
            <div class="detail-info-row">
              <span>📍</span>
              <span>${fresh.address||'주소 없음'}</span>
              <a href="https://map.kakao.com/link/search/${encodeURIComponent(fresh.name)}" target="_blank"
                style="margin-left:auto;font-size:11px;color:var(--gold);
                background:rgba(201,169,110,.1);border:0.5px solid rgba(201,169,110,.3);
                padding:3px 8px;border-radius:6px;text-decoration:none;flex-shrink:0;">길찾기</a>
            </div>
            ${fresh.phone?`<div class="detail-info-row"><span>📞</span><span>${fresh.phone}</span></div>`:''}
            ${fresh.hours?`<div class="detail-info-row"><span>🕐</span><span>${fresh.hours}</span></div>`:''}
          </div>
          <div id="info-edit" style="display:none;">
            ${[{k:'name',label:'상호명',val:fresh.name},{k:'address',label:'주소',val:fresh.address??''},
               {k:'shortAddr',label:'단축주소',val:fresh.shortAddr??''},{k:'phone',label:'전화번호',val:fresh.phone??''},
               {k:'hours',label:'영업시간',val:fresh.hours??''}].map(f=>`
              <div style="margin-bottom:8px;">
                <label class="input-label">${f.label}</label>
                <input class="input-field" id="edit-${f.k}" value="${f.val.replace(/"/g,'&quot;')}"/>
              </div>`).join('')}
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button id="btn-save-info" style="flex:1;padding:9px;background:var(--gold);color:#fff;
                border:none;border-radius:var(--r-sm);font-size:13px;font-weight:500;
                font-family:var(--font-body);cursor:pointer;">저장</button>
              <button id="btn-cancel-info" style="flex:1;padding:9px;background:var(--bg3);color:var(--t2);
                border:0.5px solid var(--bg5);border-radius:var(--r-sm);font-size:13px;
                font-family:var(--font-body);cursor:pointer;">취소</button>
            </div>
          </div>
          <div class="rating-row" style="margin-top:12px;padding-top:12px;border-top:0.5px solid var(--bg5);">
            <span class="rating-label">내 평점</span>
            <div class="star-row" id="star-row">
              ${[1,2,3,4,5].map(n=>`<button class="star-btn ${n<=(fresh.rating??0)?'filled':''}" data-val="${n}">★</button>`).join('')}
            </div>
            <span class="rating-value" id="rating-value">${fresh.rating?fresh.rating.toFixed(1):''}</span>
          </div>
        </div>

        <div class="card">
          <div class="tag-section-header">
            <span class="tag-section-title">나의 태그</span>
            <button class="btn-edit-tag" id="btn-tag-edit">+ 편집</button>
          </div>
          <div id="detail-tag-body">
            ${Object.entries(tagsByCat).length===0
              ?'<p style="font-size:12px;color:var(--t4);text-align:center;padding:8px 0;">편집 버튼으로 태그를 추가하세요</p>'
              :Object.entries(tagsByCat).map(([catId,ids])=>{
                const cat=TAG_CATEGORIES.find(c=>c.id===catId)
                return `<div style="margin-bottom:8px;">
                  <p style="font-size:10px;color:var(--t3);margin-bottom:5px;">${cat?.name??''}</p>
                  <div style="display:flex;gap:5px;flex-wrap:wrap;">
                    ${ids.map(id=>makeTagChip(id,{size:'md'})).join('')}
                  </div></div>`}).join('')}
          </div>
        </div>

        ${fresh.broadcast?`
          <div class="card">
            <p style="font-size:13px;font-weight:500;margin-bottom:10px;">방송 출연</p>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="broadcast-badge">${fresh.broadcast.program}</span>
              <span style="font-size:12px;color:var(--t3);">${fresh.broadcast.date??''}</span>
            </div>
          </div>`:''}

        <div class="card">
          <div class="tag-section-header">
            <span class="tag-section-title">방문 기록 & 후기</span>
            <button class="btn-edit-tag" id="btn-visit-add">+ 추가</button>
          </div>
          <div id="visit-form-wrap" style="display:none;">
            <div style="background:var(--bg3);border-radius:var(--r-sm);padding:12px;margin-bottom:12px;">
              <div style="font-size:11px;color:var(--t3);margin-bottom:6px;">이번 방문 평점</div>
              <div class="star-row" id="visit-star-row">
                ${[1,2,3,4,5].map(n=>`<button class="star-btn ${n<=4?'filled':''}" data-val="${n}">★</button>`).join('')}
              </div>
              <textarea class="input-field" id="visit-memo-input"
                placeholder="방문 후기, 메뉴 추천, 팁 등…" rows="3"
                style="resize:vertical;min-height:72px;margin-top:8px;"></textarea>
              <button class="btn-gold" id="btn-visit-save"
                style="padding:8px;font-size:13px;margin-top:8px;">후기 저장</button>
            </div>
          </div>
          <div id="visit-log-body">${renderVisitLog(fresh.visitLog??[])}</div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <p style="font-size:13px;font-weight:500;">메모</p>
            <button id="btn-edit-memo" style="font-size:11px;color:var(--gold);
              background:rgba(201,169,110,.1);border:0.5px solid rgba(201,169,110,.3);
              padding:4px 10px;border-radius:8px;cursor:pointer;font-family:var(--font-body);">✏️ 편집</button>
          </div>
          <div id="memo-display">
            ${fresh.memo
              ?`<p style="font-size:13px;color:var(--t2);line-height:1.7;">${fresh.memo}</p>`
              :`<p style="font-size:12px;color:var(--t4);">메모를 추가해보세요</p>`}
          </div>
          <div id="memo-edit" style="display:none;">
            <textarea class="input-field" id="edit-memo" rows="4"
              style="resize:vertical;min-height:80px;">${fresh.memo??''}</textarea>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button id="btn-save-memo" style="flex:1;padding:9px;background:var(--gold);color:#fff;
                border:none;border-radius:var(--r-sm);font-size:13px;font-weight:500;
                font-family:var(--font-body);cursor:pointer;">저장</button>
              <button id="btn-cancel-memo" style="flex:1;padding:9px;background:var(--bg3);color:var(--t2);
                border:0.5px solid var(--bg5);border-radius:var(--r-sm);font-size:13px;
                font-family:var(--font-body);cursor:pointer;">취소</button>
            </div>
          </div>
        </div>

      </div>
    </div>`

  qs('#detail-back').addEventListener('click',()=>navigate(state.prevScreen))
  qs('#detail-delete').addEventListener('click', async()=>{
    if(!confirm2(`"${fresh.name}"을 삭제할까요?`)) return
    await removeRestaurant(fresh.id); toast('삭제되었습니다'); navigate('home')
  })

  let currentRating=fresh.rating??0
  qs('#star-row').addEventListener('click', async e=>{
    const btn=e.target.closest('.star-btn'); if(!btn) return
    currentRating=Number(btn.dataset.val)
    updateStars(qs('#star-row'),currentRating)
    qs('#rating-value').textContent=currentRating.toFixed(1)
    await updateRestaurantField(fresh.id,{rating:currentRating})
  })

  qs('#btn-edit-info').addEventListener('click',()=>{
    qs('#info-display').style.display='none'; qs('#info-edit').style.display='block'
    qs('#btn-edit-info').style.display='none'
  })
  qs('#btn-cancel-info').addEventListener('click',()=>{
    qs('#info-display').style.display='block'; qs('#info-edit').style.display='none'
    qs('#btn-edit-info').style.display=''
  })
  qs('#btn-save-info').addEventListener('click', async()=>{
    const fields={ name:qs('#edit-name').value.trim(), address:qs('#edit-address').value.trim(),
      shortAddr:qs('#edit-shortAddr').value.trim(), phone:qs('#edit-phone').value.trim(),
      hours:qs('#edit-hours').value.trim() }
    if(!fields.name){ toast('상호명을 입력해주세요'); return }
    await updateRestaurantField(fresh.id,fields); toast('저장되었습니다!')
    navigate('detail',{...fresh,...fields})
  })

  qs('#btn-tag-edit').addEventListener('click',()=>openTagEditSheet(fresh))

  let visitRating=4
  qs('#btn-visit-add').addEventListener('click',()=>{
    const w=qs('#visit-form-wrap'); w.style.display=w.style.display==='none'?'block':'none'
  })
  qs('#visit-star-row').addEventListener('click', e=>{
    const btn=e.target.closest('.star-btn'); if(!btn) return
    visitRating=Number(btn.dataset.val); updateStars(qs('#visit-star-row'),visitRating)
  })
  qs('#btn-visit-save').addEventListener('click', async()=>{
    const memo=qs('#visit-memo-input').value.trim()
    const log={memo,rating:visitRating,date:new Date().toISOString().slice(0,10)}
    await updateRestaurantField(fresh.id,{visitLog:arrayUnion(log)})
    qs('#visit-log-body').innerHTML=renderVisitLog([...(fresh.visitLog??[]),log])
    qs('#visit-form-wrap').style.display='none'; qs('#visit-memo-input').value=''
    toast('후기가 추가되었습니다!')
  })

  qs('#btn-edit-memo').addEventListener('click',()=>{
    qs('#memo-display').style.display='none'; qs('#memo-edit').style.display='block'
    qs('#btn-edit-memo').style.display='none'
  })
  qs('#btn-cancel-memo').addEventListener('click',()=>{
    qs('#memo-display').style.display='block'; qs('#memo-edit').style.display='none'
    qs('#btn-edit-memo').style.display=''
  })
  qs('#btn-save-memo').addEventListener('click', async()=>{
    const memo=qs('#edit-memo').value.trim()
    await updateRestaurantField(fresh.id,{memo}); toast('메모가 저장되었습니다!')
    navigate('detail',{...fresh,memo})
  })
}

function renderVisitLog(logs){
  if(!logs.length) return '<p style="font-size:12px;color:var(--t4);text-align:center;padding:8px 0;">아직 방문 기록이 없습니다</p>'
  return [...logs].reverse().map(v=>`
    <div class="visit-item">
      <div class="visit-dot"></div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="visit-date">${v.date}</span>
          <span class="visit-stars">${'★'.repeat(v.rating??0)}</span>
        </div>
        ${v.memo?`<div class="visit-memo">${v.memo}</div>`:''}
      </div>
    </div>`).join('')
}

function updateStars(container,val){
  container.querySelectorAll('.star-btn').forEach(btn=>{
    btn.classList.toggle('filled',Number(btn.dataset.val)<=val)
  })
}

function openTagEditSheet(r){
  const overlay=document.createElement('div'); overlay.className='sheet-overlay'
  const sel={}
  TAG_CATEGORIES.forEach(cat=>{
    const ids=(r.tagIds??[]).filter(id=>id.startsWith(cat.id+'__'))
    sel[cat.id]=cat.isMultiple?ids:(ids[0]??null)
  })
  overlay.innerHTML=`
    <div class="sheet-panel">
      <div class="sheet-handle"></div>
      <p style="font-size:14px;font-weight:500;margin-bottom:14px;">태그 편집</p>
      <div id="sheet-tag-body"></div>
      <button class="btn-gold" id="sheet-save" style="margin-top:16px;">저장</button>
    </div>`
  document.getElementById('app').appendChild(overlay)
  const body=overlay.querySelector('#sheet-tag-body')
  renderTagSelectUI(body,sel,()=>{})
  TAG_CATEGORIES.forEach(cat=>{
    const cur=sel[cat.id],ids=Array.isArray(cur)?cur:cur?[cur]:[]
    ids.forEach(tid=>{ const chip=body.querySelector(`[data-tag-id="${tid}"]`); if(chip) chip.classList.add('selected') })
  })
  overlay.querySelector('#sheet-save').addEventListener('click', async()=>{
    const tagIds=collectTagIds(sel)
    await updateRestaurantField(r.id,{tagIds}); overlay.remove()
    navigate('detail',{...r,tagIds}); toast('태그가 저장되었습니다')
  })
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove() })
}

/* ══════════════════════════════════════════
   마이
══════════════════════════════════════════ */
function renderMy(){
  const u=state.user
  const totalCount=state.restaurants.length
  const visitedCount=state.restaurants.filter(r=>(r.tagIds??[]).includes('status__가본곳')||(r.visitLog??[]).length>0).length
  const wishCount=state.restaurants.filter(r=>(r.tagIds??[]).includes('status__가볼곳')).length
  const favCount=state.restaurants.filter(r=>(r.tagIds??[]).includes('status__인생맛집')).length
  const photoUrl=u?.photoURL
  const menuStyle=`display:block;padding:13px;background:var(--bg2);color:var(--t1);
    border:0.5px solid var(--bg5);border-radius:var(--r-md);font-size:14px;
    font-weight:500;text-decoration:none;text-align:center;`

  $('screen-container').innerHTML=`
    <div class="my-screen screen-enter">
      <div style="display:flex;align-items:center;gap:16px;width:100%;
        background:var(--bg2);border:0.5px solid var(--bg5);border-radius:var(--r-md);padding:16px;">
        <div style="flex-shrink:0;">
          ${photoUrl
            ?`<img src="${photoUrl}" style="width:56px;height:56px;border-radius:50%;border:2px solid var(--gold);"/>`
            :`<div style="width:56px;height:56px;border-radius:50%;background:var(--gold);
               display:flex;align-items:center;justify-content:center;font-size:22px;
               font-weight:500;color:#fff;">${(u?.displayName??'U')[0]}</div>`}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:500;color:var(--t1);margin-bottom:3px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u?.displayName??''}</div>
          <div style="font-size:12px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${u?.email??''}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;">
        ${[{label:'전체',value:totalCount,color:'var(--gold)'},{label:'방문',value:visitedCount,color:'#9fe1cb'},
           {label:'가볼곳',value:wishCount,color:'#b5d4f4'},{label:'인생맛집',value:favCount,color:'#f5c4b3'}].map(s=>`
          <div style="background:var(--bg2);border:0.5px solid var(--bg5);border-radius:var(--r-md);
            padding:12px 8px;text-align:center;">
            <div style="font-size:20px;font-weight:500;color:${s.color};margin-bottom:3px;">${s.value}</div>
            <div style="font-size:10px;color:var(--t3);">${s.label}</div>
          </div>`).join('')}
      </div>
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:11px;color:var(--t3);letter-spacing:0.05em;padding:0 2px;">데이터 관리</div>
        <a href="upload.html"    style="${menuStyle}">📂 데이터 업로드</a>
        <a href="geocode.html"   style="${menuStyle}">🗺️ 주소 → 좌표 변환</a>
        <a href="duplicate.html" style="${menuStyle}">🔍 중복 관리</a>
        <a href="viewer.html"    style="${menuStyle}">📊 데이터 뷰어</a>
      </div>
      <button id="btn-signout" style="width:100%;padding:13px;background:var(--bg3);color:var(--t3);
        border:0.5px solid var(--bg5);border-radius:var(--r-md);font-size:14px;font-weight:500;
        font-family:var(--font-body);cursor:pointer;">로그아웃</button>
    </div>`

  qs('#btn-signout').addEventListener('click',()=>{ if(confirm2('로그아웃 할까요?')) signOut(window.auth) })
}

/* ── 태그 헬퍼 ── */
function catColorStyle(catId){
  const c=TAG_COLORS[catId]; if(!c) return ''
  return `background:${c.bg};color:${c.fg};border:0.5px solid ${c.bd};`
}
function catFgColor(catId){ return TAG_COLORS[catId]?.fg??'var(--t2)' }
function makeTagChip(id, opts={}){
  const tag=TAG_MAP[id]; if(!tag) return ''
  const c=TAG_COLORS[tag.categoryId]??{cls:'',bg:'var(--bg3)',fg:'var(--t2)',bd:'var(--bg5)'}
  const size=opts.size==='md'?'font-size:12px;padding:4px 10px;':'font-size:10px;padding:2px 7px;'
  return `<span class="tag-chip ${c.cls}" style="${size}background:${c.bg};color:${c.fg};border-color:${c.bd};">${tag.label}</span>`
}

/* ── SW ── */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/My-gourmet/sw.js')
      .then(()=>console.log('SW 등록 완료'))
      .catch(e=>console.warn('SW 등록 실패',e))
  })
}
