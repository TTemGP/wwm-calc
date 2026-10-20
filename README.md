# 연운 딜 계산기

**사이트: <https://ttemgp.github.io/wwm-calc/>** · BiS 공략: <https://ttemgp.github.io/wwm-calc/bis/>

연운(Where Winds Meet)의 장비·심법·로테이션으로 DPS를 계산하고 빌드끼리 비교하는 한국어 계산기예요.

## 원작과 라이선스

계산 엔진과 게임 데이터는 greydust의 [Where Builds Meet](https://github.com/greydust/where-builds-meet)을 가져와 쓰고, 화면과 한국어 번역을 새로 만들었어요. 원작과 같은 [GNU GPL v3](LICENSE)로 배포해요. 원작에 쓰인 글꼴·아이콘 라이선스는 `public/licenses/`에 있어요.

이 저장소는 원작의 `.upstream-commit`에 적힌 커밋을 기준으로 해요. 원작을 고쳐서 배포하는 버전이고, 마지막으로 원작을 반영하고 수정한 날짜는 2026-10-20이에요.

## 원작과 달라진 점

- 한국어 전용 화면, 게임 공식 한국어 명칭으로 번역 (`locales/translations.csv`의 `ko` 열)
- 빌드 비교, 빌드 목록의 평균 DPS, 공식 대시보드에서 불러온 장비로 기존 빌드 갱신
- BiS 조율표 이미지 읽기(한국어 OCR)와 조율표 이미지로 저장
- 무기·장비 세트를 조합 하나로 고르기 (예: 진천 4, 화계 2 + 단비 2)
- BiS 공략 페이지 (`public/bis/`, 생성 도구는 `tools/bis/`)

## 실행

Node.js 24 이상이 필요해요.

```bash
npm ci
npm run dev      # 개발 서버
npm run build    # 번역 확인 → 테스트 → 타입 검사 → dist/에 빌드
```
