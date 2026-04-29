// js/tags.js — 6대 분류 태그 시스템

const TAG_COLORS = {
  food:     { bg:'#2a2040', fg:'#cecbf6', bd:'#4e3d6b', cls:'tag-food'     },
  purpose:  { bg:'#1e2a3a', fg:'#b5d4f4', bd:'#3d4e6b', cls:'tag-purpose'  },
  space:    { bg:'#2e2e18', fg:'#e8d87a', bd:'#6b621e', cls:'tag-space'    },
  source:   { bg:'#3a2020', fg:'#f5c4b3', bd:'#6b3d3d', cls:'tag-source'   },
  facility: { bg:'#1e2e28', fg:'#9fe1cb', bd:'#3d6b5c', cls:'tag-facility' },
  status:   { bg:'#2e1a2e', fg:'#e8b5f4', bd:'#6b3d7a', cls:'tag-status'   },
}

const TAG_CATEGORIES = [
  {
    id:'food', num:'01', name:'음식 테마', isMultiple:false,
    groups:[
      { label:'국가별', tags:[
        {id:'food__한식', label:'한식'}, {id:'food__일식', label:'일식'},
        {id:'food__중식', label:'중식'}, {id:'food__양식', label:'양식'},
        {id:'food__아시안', label:'아시안'},
      ]},
      { label:'업장 유형', tags:[
        {id:'food__카페', label:'카페'}, {id:'food__베이커리', label:'베이커리'},
        {id:'food__주점', label:'주점'}, {id:'food__분식', label:'분식'},
      ]},
      { label:'다이닝', tags:[
        {id:'food__파인다이닝', label:'파인다이닝'},
        {id:'food__오마카세', label:'오마카세'},
        {id:'food__가성비', label:'가성비'},
      ]},
    ]
  },
  {
    id:'purpose', num:'02', name:'방문 목적', isMultiple:true,
    groups:[
      { label:'동행', tags:[
        {id:'purpose__혼밥', label:'혼밥'}, {id:'purpose__데이트', label:'데이트'},
        {id:'purpose__가족모임', label:'가족모임'}, {id:'purpose__회식', label:'회식'},
        {id:'purpose__단체모임', label:'단체모임'},
      ]},
      { label:'성격', tags:[
        {id:'purpose__비즈니스', label:'비즈니스'},
        {id:'purpose__기념일', label:'기념일'},
        {id:'purpose__가볍게', label:'가볍게'},
      ]},
    ]
  },
  {
    id:'space', num:'03', name:'공간 특징', isMultiple:true,
    groups:[
      { label:'스타일', tags:[
        {id:'space__노포', label:'노포/공력'}, {id:'space__모던', label:'모던/세련'},
        {id:'space__인스타', label:'인스타감성'}, {id:'space__이국적', label:'이국적인'},
      ]},
      { label:'공간 조건', tags:[
        {id:'space__뷰맛집', label:'뷰맛집'}, {id:'space__프라이빗', label:'프라이빗룸'},
        {id:'space__야외', label:'야외좌석'}, {id:'space__루프탑', label:'루프탑'},
      ]},
      { label:'분위기', tags:[
        {id:'space__조용한', label:'조용한'}, {id:'space__활기찬', label:'활기찬'},
        {id:'space__아늑한', label:'아늑한'},
      ]},
    ]
  },
  {
    id:'source', num:'04', name:'검증 출처', isMultiple:true,
    groups:[
      { label:'📺 방송 프로그램', tags:[
        {id:'source__식객허영만',      label:'백반기행'},
        {id:'source__수요미식회',      label:'수요미식회'},
        {id:'source__맛있는녀석들',    label:'맛있는녀석들'},
        {id:'source__생활의달인',      label:'생활의달인'},
        {id:'source__생생정보통',      label:'생생정보통'},
        {id:'source__성시경먹을텐데',  label:'성시경먹을텐데'},
        {id:'source__백종원3대천왕',   label:'백종원 3대천왕'},
        {id:'source__토요일은밥이좋아',label:'토요일은 밥이좋아'},
        {id:'source__줄서는식당',      label:'줄서는식당'},
        {id:'source__흑백요리사',      label:'흑백요리사'},
      ]},
      { label:'📕 미식 가이드', tags:[
        {id:'source__미슐랭가이드',    label:'미슐랭 가이드'},
        {id:'source__미슐랭빕구르망',  label:'미슐랭 빕구르망'},
        {id:'source__블루리본',        label:'블루리본'},
        {id:'source__식신우수',        label:'식신 우수레스토랑'},
        {id:'source__망고플레이트',    label:'망고플레이트 인기'},
        {id:'source__테이스트아틀라스',label:'테이스트아틀라스'},
      ]},
      { label:'✅ 국가/기관 인증', tags:[
        {id:'source__백년가게',        label:'백년가게'},
        {id:'source__백년소공인',      label:'백년소공인'},
        {id:'source__안심식당',        label:'안심식당'},
        {id:'source__모범음식점',      label:'모범음식점'},
        {id:'source__착한가격업소',    label:'착한가격업소'},
        {id:'source__위생등급우수',    label:'위생등급 매우우수'},
        {id:'source__지자체맛집',      label:'지자체 선정맛집'},
        {id:'source__명인인증',        label:'대한민국 명인'},
      ]},
      { label:'🌱 테마/특수 인증', tags:[
        {id:'source__비건인증',        label:'비건 인증'},
        {id:'source__할랄인증',        label:'할랄 인증'},
        {id:'source__친환경농산물',    label:'친환경 농산물'},
      ]},
      { label:'🔍 수집 출처', tags:[
        {id:'source__블로그',  label:'블로그 발굴'},
        {id:'source__인스타',  label:'인스타 발굴'},
        {id:'source__유튜브',  label:'유튜브 발굴'},
        {id:'source__지인',    label:'지인 추천'},
        {id:'source__직접',    label:'직접 발견'},
      ]},
    ]
  },
  {
    id:'facility', num:'05', name:'편의 시설', isMultiple:true,
    groups:[
      { label:'주차', tags:[
        {id:'facility__무료주차', label:'무료주차'}, {id:'facility__유료주차', label:'유료주차'},
        {id:'facility__발렛', label:'발렛'}, {id:'facility__주차불가', label:'주차 불가'},
      ]},
      { label:'예약/접근', tags:[
        {id:'facility__예약가능', label:'예약 가능'}, {id:'facility__예약필수', label:'예약 필수'},
        {id:'facility__역세권', label:'역세권'},
      ]},
      { label:'기타', tags:[
        {id:'facility__키즈존', label:'키즈존'}, {id:'facility__반려동물', label:'반려동물'},
        {id:'facility__콜키지', label:'콜키지'},
      ]},
    ]
  },
  {
    id:'status', num:'06', name:'나의 상태', isMultiple:false,
    groups:[
      { label:'방문 여부', tags:[
        {id:'status__가본곳', label:'가본 곳'}, {id:'status__가볼곳', label:'가볼 곳'},
        {id:'status__재방문', label:'재방문 예정'},
      ]},
      { label:'평가', tags:[
        {id:'status__인생맛집', label:'인생맛집'}, {id:'status__단골맛집', label:'단골맛집'},
        {id:'status__별로', label:'별로였던 곳'},
      ]},
    ]
  },
]

// ID → 메타 빠른 조회
const TAG_MAP = {}
TAG_CATEGORIES.forEach(cat => {
  cat.groups.forEach(g => {
    g.tags.forEach(t => {
      TAG_MAP[t.id] = { ...t, categoryId: cat.id, color: TAG_COLORS[cat.id] }
    })
  })
})

// 태그 칩 HTML 생성
function makeTagChip(tagId, opts = {}) {
  const meta = TAG_MAP[tagId]
  if (!meta) return ''
  const c   = meta.color
  const cls = [
    'tag-chip',
    c.cls,
    opts.size === 'md' ? 'md' : '',
    opts.clickable ? 'clickable' : '',
    opts.selected  ? 'selected'  : '',
  ].filter(Boolean).join(' ')

  return `<span class="${cls}" data-tag-id="${tagId}"
    ${opts.onClick ? `onclick="${opts.onClick}"` : ''}
  >${meta.label}${opts.removable ? `<button class="tag-remove" onclick="event.stopPropagation()">×</button>` : ''}</span>`
}

// 카테고리 색상 스타일 문자열
function catColorStyle(catId) {
  const c = TAG_COLORS[catId]
  if (!c) return ''
  return `background:${c.bg};color:${c.fg};border-color:${c.bd};`
}

// 카테고리 텍스트 색상
function catFgColor(catId) {
  return TAG_COLORS[catId]?.fg ?? 'var(--t2)'
}
