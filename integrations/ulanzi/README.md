# WHENTERMINAL · Ulanzi 덱 플러그인

Ulanzi Studio(D200 등) 키에 WHENTERMINAL 대화 상태와 구독 사용량을 보여 주고, 홈 화면으로 가는 키와 분할창을 켜고 끄는 키를 둔다. 앱의 로컬 통로 `127.0.0.1:37630`(`src/main/deck.ts`)에서 SSE로 받는다.

## 설치

1. `com.ulanzi.whenterminal.ulanziPlugin` 폴더를 `%APPDATA%\Ulanzi\UlanziDeck\Plugins\`에 복사한다
2. Ulanzi Studio를 다시 켠다 → 액션 목록에 **WHENTERMINAL** 분류가 생긴다

플러그인을 고친 뒤에는 다시 복사하고 Ulanzi Studio를 다시 켠다.

## 액션

| 액션 | 보이는 것 | 누르면 |
|---|---|---|
| 대화 상태 | 위에 상태(RUNNING·NEEDS YOU·DONE·ERROR…, 턴이 끝났어도 백그라운드 셸·모니터·하위 에이전트가 돌면 BG RUNNING), 가운데 프로젝트 글자(앱의 Alt+A·S·D… 순서. 대화가 여럿인 프로젝트는 S1·S2), 아래에 프로젝트 이름 | 그 대화를 연다 |
| 사용량 | 키 설정에서 한도(요약·5시간·주간·모델별 주간)를 고르면 그것만. 자동이면 키가 하나면 5시간·주간 사용률(80% 넘으면 빨강) · 5시간 초기화 시각 · 실행 중(▶)/확인 대기(!) 수. 여럿이면 놓은 순서대로 5시간 → 주간 → 모델별 주간을 한 키에 하나씩 | 사용량을 새로 받는다 |
| 홈 | 집 아이콘 | 창을 열고 홈 화면으로 간다(앱 단축키 Go home과 같다) |
| 분할 | 분할창 상태: 켜져 있으면 두 칸에 프로젝트 글자(키를 받는 창은 흰 칸), 꺼져 있으면 OFF, 앱 창이 좁아 나눌 수 없으면 NARROW | 창을 열고 분할을 켜거나 끈다(앱 단축키 Split view와 같다). 홈 화면이면 마지막으로 본 대화를 열고 나눈다 |

- **대화 상태**는 놓은 키를 위→아래, 왼쪽→오른쪽 순서로 세어 N번째 키에 N번째 대화(사이드바 순서, 닫은 대화 제외)를 보여 준다. 키를 더 놓으면 그만큼 더 보인다
- 대화가 키보다 많으면 마지막 키가 `+남은 수`와 그중 가장 급한 상태를 보여 준다
- 키 설정에서 순번을 고정할 수 있다(기본은 자동)
- 앱이 꺼져 있으면 `OFFLINE`

## 디버깅

Ulanzi Studio를 `--webRemoteDebug`로 켜고 `localhost:9292`에서 주 서비스(`plugin/app.html`) 콘솔을 본다. 통로는 `curl http://127.0.0.1:37630/state`로 확인한다.

`libs/`는 [UlanziDeckPlugin-SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) 데모의 공용 라이브러리 사본이다(Apache-2.0, `libs/LICENSE-ulanzi-sdk`).
