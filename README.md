# My Gourmet Archive (MGA)

순수 HTML + CSS + JS 기반 PWA 맛집 수첩
Firebase Hosting으로 배포, 별도 빌드 도구 불필요

## 파일 구조

```
/
├── index.html        ← 앱 진입점 (Firebase config 여기 입력)
├── manifest.json     ← PWA 매니페스트
├── sw.js             ← 서비스워커 (오프라인 지원)
├── firestore.rules   ← Firestore 보안 규칙
├── css/
│   ├── tokens.css    ← 색상·폰트·간격 디자인 토큰
│   ├── components.css← 공통 컴포넌트 스타일
│   └── screens.css   ← 화면별 스타일
├── js/
│   ├── tags.js       ← 6대 분류 태그 데이터
│   └── app.js        ← 앱 메인 로직
└── icons/
    ├── icon-192.png  ← PWA 아이콘 (직접 추가)
    └── icon-512.png  ← PWA 아이콘 (직접 추가)
```

## 시작하기

1. `index.html` 열고 `firebaseConfig` 값 입력
2. GitHub에 파일 업로드
3. Firebase Hosting 배포
