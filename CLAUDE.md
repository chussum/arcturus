# Arcturus

팀 전용 셀프호스팅 미니 PaaS. zip 업로드 또는 CLI로 정적 사이트/Dockerfile 앱을 배포하고, 제어 평면(API+대시보드)은 `:7777`, 배포된 앱은 **별도 오리진** `:7778`(`ARCTURUS_APPS_PORT`)에서 `/{username}/{appName}` 경로로 서빙한다 — 앱 코드를 제어 평면 쿠키에서 격리(C1 방어).

## ⚠️ 문서 동기화 (필수 트리거)

다음에 해당하는 변경을 했다면 **같은 커밋에서** `CLAUDE.md` + `README.md` + `README.ko.md`(한/영 항상 쌍으로)를 함께 갱신할 것. 코드만 고치고 문서를 남겨두면 미완성이다:

- 기능 추가/제거/동작 변경, CLI 명령·옵션 변경
- 환경 변수, 포트, 명령어(스크립트), 폴더 구조 변경
- API 계약(`packages/shared`) 변경, 배포/라우팅/롤백 동작 변경
- 새로운 함정/제약 발견 → CLAUDE.md "함정" 섹션에 추가
- 위 변경이 사용자-facing이면 `docs/` 사이트도 함께 갱신 — en/ko 4페이지(`index.html`/`guide.html` × `ko/`)는 README처럼 항상 내용 동일한 쌍 유지

README 두 파일은 내용이 동일해야 한다(언어만 다름). 커밋 전 셀프 체크: "이 변경으로 README의 어떤 문장이 거짓이 되었나?"

**용어 규칙**: 사용자-facing 한국어 문서/문구(docs/, README.ko.md, 대시보드)에 "멱등" 금지 — "여러 번 실행해도 안전"처럼 풀어쓸 것(사용자가 반복 지적).

## 모노레포 (Bun workspaces)

```
apps/api/        NestJS — REST API + 게이트웨이(리버스 프록시/정적 서빙) + CLI 배포 서버, Bun 런타임으로 직접 실행
apps/web/        Next.js 대시보드 — Rspack(next-rspack) + Linaria, FSD 아키텍처, basePath /dashboard
apps/cli/        arcturus CLI — commander, bun build --compile 단일 바이너리 (4종 크로스컴파일)
packages/shared/ API 계약 타입 + enum — api/web/cli가 공유. 계약 변경은 반드시 여기서 시작
apps/api/data/   런타임 데이터(SQLite/사이트/빌드) — API 실행 cwd 기준. gitignore
docs/            GitHub Pages 프로젝트 사이트 — 빌드 스텝 없는 순수 정적 HTML/CSS, en(index/guide.html) + ko/ 쌍. 배포는 .github/workflows/pages.yml (공개 후 ENABLE_PAGES repo variable로 활성화). 마스코트 "Arky"(별을 품은 아기곰)의 단일 원본은 docs/assets/mascot.svg — README 두 파일과 docs 히어로가 모두 이 파일을 상대 경로로 참조, 사본 만들지 말 것.
```

## 명령어

```bash
bun run server:up                            # 프로덕션 원클릭: 설치→기동 (여러 번 실행해도 안전). 첫 기동 시 api-swap+ingress+web-swap 순서로 기동
bun run server:up -- --build                 # 양쪽 무중단 재배포: 대시보드 블루-그린 재빌드 + API 블루-그린 교체 (:7777/:7778 무중단)
bun run server:up -- --api                   # API 블루-그린 교체 (:7777/:7778 무중단) + 활성 웹 색 in-place restart
bun run server:up -- --ingress               # ingress 재시작 (순간 :7777/:7778 단절 발생, ingress.ts 코드 자체를 바꿀 때만 필요)
bun run server:down|status|logs              # pm2 운영 (로그 logs/)
bun run server:restart                       # = server:up -- --api (API + 웹 재시작, 재빌드 없음)
bun run secrets:init                         # (macOS, 멱등) 평문 키 파일 → dotenvx 암호화 .env.secrets + Keychain 이전
bun run secrets:update                       # .env.secrets 손편집(KEY=평문) 후 재암호화 + 복호화 검증
bun install                                  # 루트에서 (isolated linker; bunfig.toml minimumReleaseAge=7일 — 갓 올라온 npm 버전 차단, 공급망 방어)
cd apps/api && bun run dev                   # 제어 평면 :7777 + 앱 오리진 :7778 (--watch), 첫 실행 시 admin 시드(터미널이면 비번 입력 프롬프트, 비대화형이면 비번 1회 출력)
cd apps/web && bun run dev                   # 대시보드 dev :3000 (rspack)
cd apps/web && bun run build && bun run start # 프로덕션 (게이트웨이가 :3000으로 프록시)
cd apps/cli && bun run build:all             # CLI 크로스컴파일 → dist/cli/ (게이트웨이가 /install.sh로 서빙)
bunx biome check --write .                   # lint+format
bun test apps/api                            # 단위 테스트
cd apps/<x> && bunx tsc --noEmit             # 워크스페이스별 타입체크 (3개 모두 통과해야 함)
cd apps/api && bunx drizzle-kit generate     # 스키마 변경 후 마이그레이션 생성 (boot 시 자동 적용)
```

## 아키텍처 규칙

- **api**: 도메인 모듈(`modules/*`)은 `infrastructure/`의 port(추상 클래스 = DI 토큰)에만 의존. 구현체 교체는 `persistence.module.ts` / `container-runtime.module.ts`에서. 배포는 전략 패턴(`modules/deployments/pipeline/` — 타입별 DeployStrategy).
- **API i18n**: API 에러 메시지는 `Accept-Language` 기반 en/ko. 단일 카탈로그는 `common/i18n/messages.ts`. 서비스/가드/컨트롤러는 `LocalizedException` 서브클래스(`LocalizedBadRequest` 등)에 **키만** throw하고, 글로벌 `I18nExceptionFilter`(`app.module.ts`에 `APP_FILTER` 등록)가 번역. web은 `apiFetch`에서 localStorage locale → `Accept-Language` 전송, CLI는 `ARCTURUS_LANG` env(없으면 `LC_ALL`/`LANG`) 감지. **에러 메시지 신규 추가 시 카탈로그 en/ko 쌍 필수** — 누락 시 키 문자열이 그대로 반환됨(런타임 안전이나 i18n.test.ts 카탈로그 완전성 검사로 감지).
- **web**: FSD — `app/`(라우트) → `widgets/` → `features/` → `entities/` → `shared/`. 상위 레이어만 하위를 import.
- **라우팅**: 게이트웨이 미들웨어(`modules/gateway/gateway.middleware.ts`)가 모든 요청을 본다. 예약 첫 세그먼트는 `common/reserved-paths.ts` — 새 최상위 경로를 추가하면 반드시 여기 등록(게이트웨이 바이패스 + 사용자명 금지). **포트 분기(ingress 도입 후)**: 공개 포트(:7777/:7778)는 `arcturus-ingress`(`src/ingress.ts`)가 영구적으로 bind하고, API는 `ARCTURUS_LISTEN_PORT`/`ARCTURUS_LISTEN_APPS_PORT`(내부 동적 포트)에 bind. `main.ts`가 같은 Express 인스턴스로 리스너 2개(`listenGatewayPort` 제어, `listenAppsPort` 앱)를 열고, 미들웨어가 `req.socket.localPort`로 분기(branch 기준 = **listenAppsPort**, 내부 포트) — 앱 포트는 **앱만** 서빙(예약/`/api`/대시보드는 404, `next()` 호출 안 함 → API가 앱 오리진에서 절대 안 보임), 제어 포트는 `/{user}/{app}`를 **공개** `appsPort`로 302(클라이언트가 보는 주소). URL 빌드·리다이렉트는 공개 포트, bind는 내부 포트 — 혼동 주의. 새 제어 평면 경로(`/api` 외)는 앱 포트에서 노출되지 않게 주의.
- **롤백**: 정적은 `releases/{deploymentId}/` 디렉터리, 컨테이너는 `arcturus/{u}--{a}:{deploymentId}` 이미지 태그. `apps.active_deployment_id`가 서빙 버전을 가리킴. 보관 5개(`ARCTURUS_KEEP_RELEASES`) 초과는 배포 시 자동 정리.
- **접속 방식/포트**: `routeMode` 기본값은 타입 조건부 — 컨테이너 앱은 `redirect`(전용 포트로 302), 정적은 `proxy` (`deployments.service.ts` `findOrCreateApp`). 포트 할당(`port-allocator.service.ts`)은 자기 DB의 `assigned_port` + **호스트 bind 프로브**(`port-probe.service.ts`) 둘 다 통과해야 하고 스캔 시작점은 랜덤 — 같은 머신의 다른 인스턴스(계정별 Arcturus)와 충돌 회피용. 배포 중 컨테이너 시작이 포트 점유 에러로 실패하면 1회 새 포트 재할당+재시도(`container-deploy.strategy.ts` `isPortConflictError`) → **전용 포트는 영구 고정이 아니라 외부 점유 시 바뀔 수 있음**. sticky 포트 사전 프로브는 금지(재배포 시 자기 구 컨테이너가 점유 중이라 false-positive). 게이트웨이 자체가 EADDRINUSE면 `main.ts`가 `ARCTURUS_PORT` 안내 후 exit.
- **앱 공유**: 배포된 앱은 인증 없이 앱 포트에서 퍼블릭 서빙 — 공유는 대시보드 가시성/접근 + 배포 권한을 제어. 세 권한 단계: **owner/admin** (전체), **manage** (배포·env·메모리·라우팅·설명·중지·재시작·롤백·로그), **view** (읽기 전용, env·로그 숨김). 공유 설정(GET/PUT `/api/apps/:id/sharing`)과 삭제는 owner/admin만. `appShares` 테이블(app_id+user_id unique)과 `apps.shared_all_role` 컬럼으로 퍼시스트.
  - **크로스계정 배포 (manage)**: `manage` 이상이면 남의 앱에도 배포 가능. CLI는 `arcturus deploy --name <owner>/<app>`(명시 owner는 프롬프트 없음), 대시보드는 앱 상세의 RedeployButton(이제 `canManage`에 노출, `app.ownerUsername`을 멀티파트 `owner` 필드로 전송 — 안 보내면 공유 앱 재배포가 호출자 계정에 **같은 이름 포크**를 만들던 잠재 버그였음). 멀티파트 `owner` 필드(`CreateDeploymentFields.owner`) → 컨트롤러 → `DeploymentsService.create({ownerUsername})` → owner가 호출자와 다르면 `AppsService.resolveManagedAppByRef`(username→user→`findByOwnerAndName`→`assertManageRow`)가 **기존** 앱+실제 owner를 돌려주고(타계정에 신규 생성 불가), 파이프라인은 **실제 owner**의 username으로 아티팩트(이미지 태그·정적 디렉터리) 키잉, 권한은 **호출자** 기준 검사. CLI는 **bare 이름**(`--name <app>`/생략, owner prefix 없음)일 때 TTY면 `pickCrossAccountCandidates`(name 일치 + 내 것 아님 + `viewerRole==='manage'`, admin은 전부 `admin` 롤이라 자동 프롬프트 제외)로 후보를 찾아 `selectOption`으로 물음(기본=내 계정), 비TTY는 무조건 내 계정.

## 디자인 시스템

- **웜 에디토리얼 다크**: void `#111008`, 크림 텍스트 `#ede9e0`, 단일 웜 오렌지 액센트 `#d9823b`(eyebrow/링크/마커/주요 버튼), 주요 버튼은 **오렌지 액센트 필 + 다크 텍스트**(`onCream`). 그림자 금지 — 깊이는 헤어라인과 서피스 밝기 단계로.
- **타이포**: Geist(UI 본문 14-15px, 페이지 타이틀 24px), Geist Mono(id/포트/경로/로그), Instrument Serif 이탤릭(로그인 히어로 한정). fontsource로 self-host — next/font 쓰지 말 것(rspack 호환 불확실).
- **컴팩트 스케일 유지**: 버튼 36px/radius 8px, 인풋 40px 직사각, 카드 radius 14px. *크고 화려한 것 금지 — 사용자가 두 번 거부한 방향.*
- 토큰은 `apps/web/src/shared/styles/tokens/`에서만. 컴포넌트에 hex 인라인 금지.
- 모션: 컬러 150ms `cubic-bezier(0.4,0,0.2,1)`, 진입 스태거는 `Reveal`(delay=index*60~70), `prefers-reduced-motion` 존중.

## UX 규칙 (필수)

- 모든 변이 액션은 `useAsyncAction`(shared/lib) 사용: busy 스피너 + 중복 클릭 차단 + 실패 시 에러 토스트 자동. 버튼은 `<Button busy={...}>` / `<TextButton busy>`.
- `window.confirm`/`alert` 금지 → `ConfirmDialog`(shared/ui). 복사 등 성공 피드백은 토스트.
- UI 문구는 전부 `shared/i18n/messages.ts`에 en/ko 쌍으로. 전문용어는 영어 유지. 하드코딩 문구 금지.
- 폼 에러는 레이아웃을 밀지 않게(absolute) + 인풋 `aria-invalid` 보더.

## 함정 (시간을 날려먹은 것들)

- **Biome `useImportType`은 apps/api에서 off** — NestJS DI는 런타임 클래스 참조가 필요해서 `import type` 변환이 DI를 깨뜨림. `--write` 후 의심되면 서버 부팅으로 확인.
- **Bun isolated install**: 전이 의존성이 자동 호이스팅되지 않음. "Cannot find module X"가 나오면 해당 워크스페이스에 `bun add X` (예: multer, @wyw-in-js/babel-preset, bun-types).
- **Next 16 dev는 localhost 외 origin의 dev 내부 요청을 조용히 차단** → hydration이 에러 없이 실패. `allowedDevOrigins`에 `127.0.0.1` 설정돼 있음. LAN 접근은 `ARCTURUS_DEV_ORIGINS`.
- **`next start`는 번들러 래퍼 금지** — package.json에서 `ARCTURUS_BUNDLER=none`으로 분기(next.config.ts). argv 스니핑은 워커 프로세스에서 깨지므로 env 사용.
- **게이트웨이 미들웨어의 `req.path`는 마운트 상대 경로** — 반드시 `req.originalUrl` 기반으로 파싱.
- NestJS 모듈에서 AuthGuard를 쓰면 그 모듈이 `PersistenceModule`도 import해야 함(가드 의존성 해석이 사용 모듈 컨텍스트에서 일어남).
- 서버 재시작 시 `pkill` 매칭 실패로 EADDRINUSE가 잦음 → `lsof -ti :3000 | xargs kill -9`로 포트 기준 정리.
- **앱 env는 저장 시 AES-256-GCM 암호화** — `apps.env` 컬럼은 `enc:v1:<iv>:<ct||tag>` 포맷(접두사 없으면 레거시 평문). 키는 `ARCTURUS_ENV_KEY` 또는 `data/env-key`(자동 생성, 0600 — fallback이며 부팅 시 WARN 로그). 읽기/쓰기는 `EnvCryptoService`(`infrastructure/crypto/`)를 거쳐야 하며 `parseEnvColumn`은 복호화된 문자열에만 적용. 기존 평문 행은 부팅 시 `EnvEncryptionMigrator`가 자동 재암호화. **키 분실/변경 시 기존 env 복호화 불가** → `decrypt`가 throw하므로 배포가 조용히 실패하지 않음. `data/`는 0700, DB 파일 0600으로 부팅 시 강제.
  - **deploy 시 `.env` 자동 시드(컨테이너, 최초 생성 시만)**: CLI `deploy`가 디렉터리에 Dockerfile + `.env`(또는 `--env-file`)가 있으면 파싱해 멀티파트 `env` 필드(JSON)로 전송(`apps/cli/src/lib/env-file.ts` 파서 + `deploy.ts resolveDeployEnv`). 컨트롤러가 JSON 파싱(`deployments.envInvalidJson`) 후 `DeploymentsService.create` → `findOrCreateApp`이 **신규 생성 분기에서만** `assertValidEnv`+`EnvCryptoService.encrypt`해 `CreateAppData.env`로 저장(`encryptInitialEnv`). 기존 앱 재배포는 env 무시(대시보드/`env --set`로 넣은 값 보존). 크로스계정 배포는 항상 기존 앱이라 env가 무시되며, CLI는 이 경우 `.env`를 아예 안 읽음(오해 소지 로그 방지). CLI `pack.ts`는 모든 `.env*`(`^\.env(\..*)?$`)를 zip에서 **항상 제외** → 빌드 이미지 레이어에 평문 시크릿 안 남김. 옵션 `--env-file <path>`/`--no-env-file`.
- **시크릿은 dotenvx 암호화 `.env.secrets`(루트, gitignore) + macOS Keychain** — `bun run secrets:init`이 `ARCTURUS_ENV_KEY`/`ARCTURUS_JWT_SECRET`을 암호화 파일로 옮기고 private key는 Keychain(서비스 `arcturus-dotenvx`)에만 보관. 실행은 `scripts/with-secrets.sh` 래퍼(pm2·dev·start 공용)가 매 기동마다 Keychain에서 키를 가져와 `dotenvx run -f .env.secrets`로 주입. **파일명을 `.env`로 바꾸지 말 것** — Bun이 cwd의 `.env`를 자동 로드해 암호문이 process.env에 들어감(`.env.secrets`는 자동 로드 대상 아님). `.env.secrets`가 있는데 키를 못 구하면 래퍼가 **의도적으로 exit 1** — 조용히 부팅하면 새 `data/env-key`가 생성돼 기존 DB 복호화가 깨지기 때문(ssh-only 세션은 `security unlock-keychain`). dotenvx 키 변수명은 파일명을 따라 `DOTENV_PRIVATE_KEY_SECRETS`이며, `dotenvx get`은 키가 틀려도 exit 0으로 암호문을 그대로 출력하므로 검증은 값 비교로(스크립트들이 이미 그렇게 함). 래퍼가 주입한 값(실제 env)이 Bun이 읽는 `apps/api/.env`보다 우선(실측 확인) — 거기에 두 시크릿이 중복 정의돼 있으면 래퍼가 부팅 때 경고. 사용법 주석은 secrets:init이 `.env.secrets` 생성 시 헤더로 직접 써넣음(별도 example 파일 없음, dotenvx set은 기존 주석 보존).
- **pm2 `restart`는 ecosystem의 `script`/`interpreter` 변경을 기존 프로세스에 반영하지 않음** — 부분 병합되어 `bash <bun 바이너리>` 같은 크래시 루프가 남. 그래서 `server-up.sh --api`는 기존 API 프로세스를 delete 후 start로 재기동.
- **pm2 7.x `describe`는 파이프해도 ANSI 색을 출력 → `grep -w 'online'`이 깨진다** — 상태가 `\x1b[1monline\x1b[22m`로 나와 "online"이 `1monline`의 일부가 되어 whole-word 매칭 실패. swap 스크립트의 `pm2_online()`은 반드시 **ANSI strip 후** 판정(`sed $'s/\x1b\\[[0-9;]*m//g' | grep -qw 'online'`). 이걸 빼먹으면 `pm2_online`이 항상 false → 블루-그린이 색을 **안 바꾸고** idle=현재색으로 보고 live distDir을 제자리 `rm -rf`+재빌드 → 스왑마다 정적 파일 500(실측, web-swap/api-swap/server-up 3곳 모두 영향). 또한 pm2 데몬(in-memory)과 CLI 버전 불일치 시 "In-memory PM2 is out-of-date" 경고가 **stdout**으로 섞여 `pm2 pid`/`jlist` 파싱을 오염시키므로(`pm2 update`로 동기화 권장) 상태 판정은 describe+ANSI strip 방식이 가장 안전.
- **재시작은 graceful drain** — `main.ts`가 `enableShutdownHooks()` + `forceCloseConnections: true`로 SIGINT 시 in-flight 응답을 마무리하고 종료(forceClose는 SSE 로그 스트림·keep-alive 소켓이 close를 영원히 막아서 필수), `DatabaseLifecycle`(database.module.ts)이 SQLite를 close해 WAL을 checkpoint. API pm2 프로세스에 `kill_timeout: 15000`(기본 1.6초) — 드레인 시간 내 안 끝나면 SIGKILL. 시그널 체인은 pm2 → dotenvx(포워딩 구현 있음) → bun. **API 블루-그린(ingress 방식)**: `api-swap.sh`가 새 색을 내부 포트로 기동·헬스체크 후 `data/api-upstream`(JSON `{"control":N,"apps":N}`)을 원자적 mv → `ingress.ts`가 다음 요청부터 새 포트로 전환. 드레인 15초 후 옛 색 정리. API 인스턴스는 단일(SQLite·포트할당기·boot 마이그레이션이 단일 전제)이지만 ingress 덕분에 공개 포트 단절 없음. **대시보드도 블루-그린**: `web-swap.sh`가 `.next-a`↔`.next-b` distDir + 랜덤 포트로 기동·헬스체크 후 `data/dashboard-upstream`(한 줄 URL)을 원자적 mv → `DashboardUpstreamService`(gateway)가 새 포트로 라우팅. ecosystem.config.cjs는 `arcturus-ingress` 만 정의(API·웹 색은 swap 스크립트가 임시 JSON으로 동적 기동).
- **블루-그린 포트 충돌 방지** — `api-swap.sh`와 `web-swap.sh` 모두 `net.createServer({host:'0.0.0.0', exclusive:true})` 바인드 프로브(41000–60000 랜덤 시작)로 내부 포트를 고르므로, 같은 Mac Studio에서 다른 OS 계정의 Arcturus 인스턴스가 점유한 포트도 감지. 각 계정은 `ARCTURUS_PORT`/`ARCTURUS_APPS_PORT`로 **공개** 포트를 분리하고, API·웹 내부 포트는 알아서 충돌 없이 할당. 각 계정이 **별도 repo 클론**을 써야 `.next-a`/`.next-b` distDir 충돌도 없음 — 체크아웃 공유는 지원하지 않음.
- **ingress(`src/ingress.ts`) 아키텍처 주의사항**:
  - `data/api-upstream`이 없으면 503 반환 — cold boot 시 `api-swap.sh`(상태 파일 생성)보다 **먼저** ingress를 기동하면 안 됨. `server-up.sh`는 항상 api-swap → ingress 순서를 보장.
  - ingress는 NestJS/Nest 의존성이 없는 순수 Bun TS 스크립트 — `biome useImportType` off 규칙과 무관하지만, apps/api 루트 `biome.json` 설정을 그대로 적용받음. biome fix 후 확인.
  - `changeOrigin:false`(기본값) 명시 필수 — `true`로 바꾸면 `Host` 헤더가 업스트림 주소(`127.0.0.1:N`)로 교체돼 C1 Origin 가드·쿠키 도메인이 깨짐.
  - ingress 자체가 `ARCTURUS_TRUST_PROXY`를 쓰지 않는다(proxy 앞에 있으므로). API는 `api-swap.sh`가 주입한 `ARCTURUS_TRUST_PROXY=loopback`으로 ingress 홉을 신뢰. 외부 TLS 프록시까지 있으면 `ARCTURUS_TRUST_PROXY` 홉 수를 늘려야 함(`loopback,1` 등).
  - **`--api` 재시작 중 파괴적 DB 마이그레이션**(컬럼 drop 등): drain 15초 동안 옛 API가 에러 응답을 낼 수 있음 → 그런 마이그레이션은 `--ingress`(짧은 단절 감수)나 점검 창을 열고 수행 권장.
  - **ingress·대시보드 프록시 502/503 응답에 반드시 `charset=utf-8` 명시** — `Content-Type: text/plain`만 보내면 em-dash(`—`) 등 멀티바이트 문자가 브라우저에서 `??`로 깨짐. `ingress.ts`와 `container-proxy.service.ts`의 에러 응답은 `'text/plain; charset=utf-8'` 유지.
  - **ingress는 http-proxy가 아니라 수동 `http.request` + 요청 본문 버퍼링으로 전달**(`forward()`) — native pipe(`req.pipe(proxyReq)`)는 업스트림 백프레셔를 클라이언트로 전파하는데, 배포 CLI(bun-compile 바이너리)의 스트리밍-fetch 업로드가 백프레셔를 만나면 **~2MB에서 송신을 멈춰** 큰 배포 zip이 잘리고(서버에 truncated zip 도착) multipart 파서가 나머지 바이트를 무한 대기 → `arcturus deploy`가 "Uploading…100%"에서 hang(특히 큰 정적 사이트; 직접 포트 배포·작은 업로드는 백프레셔가 적어 통과해서 "ingress만 멈춤"으로 보였음, 실측). 그래서 `forward()`는 **요청 본문을 메모리에 전부 받은 뒤**(클라가 풀스피드 송신 → 백프레셔 0 → 안 멈춤) 실제 받은 길이를 authoritative `Content-Length`로 박아 완전한 본문을 API에 1회 전달. 업로드 상한(`maxUploadMb`)이 버퍼 크기를 bound. **응답은 그대로 스트리밍**(SSE 로그 tail은 본문 없는 GET이라 즉시 forward + `proxyRes.pipe(res)` 실시간). 블루-그린 flip 흡수용 connect-probe/retry(멱등 GET/HEAD/OPTIONS, 250ms×최대6회, 재프로브 때 상태파일 fresh 재읽기)·xfwd 헤더(for/port/proto append, host 1회)·Host 보존은 유지. http-proxy 의존성은 이제 **컨테이너 프록시(`container-proxy.service.ts`)에서만** 사용.
  - **컨테이너 프록시에서 같은 req/res로 `proxy.web()`를 재호출하지 말 것(크래시 함정)** — http-proxy 1.18.1은 `proxy.web()`에서 `req`를 파이프(`web-incoming.js`)하므로, 에러 후 같은 req로 재호출하면 이미 끝난 스트림을 재파이프하다 **동기 throw → uncaughtException → 프로세스 종료**. 재시도가 필요하면 **proxy.web 호출 전에** `net.connect`로 타깃 포트 도달성을 프로브하고 도달 가능해진 뒤 **proxy.web은 딱 한 번** 호출한다. 대시보드 프록시(`container-proxy.service.ts forwardToOrigin`)는 connect-probe 후 1회 proxy — 스왑 중 웹 포트 전환 순간의 ECONNREFUSED를 흡수(없으면 "Dashboard is not running" 502가 스왑마다 노출됨, 실측). origin 문자열에서 포트 파싱해 프로브.
  - **ingress는 절대 죽으면 안 됨 → `process.on('uncaughtException'|'unhandledRejection')` 가드 필수** — 로그만 남기고 exit하지 않음(공개 정문). bind 에러(EADDRINUSE)만 의도적으로 exit.
  - **ingress `max_memory_restart`는 Bun 베이스라인(~67MB) 위로(≥256M, 현재 300M)** — 64M처럼 낮게 잡으면 pm2가 약 30초마다 ingress를 메모리 킬·재시작하는 루프에 빠져 공개 :7777/:7778이 계속 끊긴다(실측 ↺13). `ecosystem.config.cjs`.
  - **ingress.ts/`ecosystem.config.cjs` 변경은 `server:up`/`--build`로 반영 안 됨** — ingress는 그 경로에서 재시작되지 않는다. `bun run server:up -- --ingress`(순간 단절)로만 새 ingress 코드·설정이 적용됨.
  - **web 블루-그린에서 `.next`를 색 간에 교차 복사(머지)하지 말 것** — `cp -R .next-OLD/static/. .next-NEW/static/` 같은 머지는 client-reference-manifest ↔ 청크 정합성을 깨 SSR이 `Expected clientReferenceManifest to be defined`로 **500**난다(실측 — 머지 도입 커밋 시점부터 에러 발생, 이전엔 0건). Next는 `.next`를 불투명 단위로 다룬다. 열린 탭이 옛 빌드 청크를 요청해 깨지는 건 **배포 후 한 번 새로고침**으로 해결되는 정상 동작으로 수용(머지로 풀려다 더 큰 회귀).
  - **옛 색 distDir `rm -rf`는 프로세스 완전 종료 확인 후** — `pm2 delete`는 종료를 안 기다리고, kill_timeout 15초 동안 옛 `next start`가 in-flight 요청을 distDir에서 서빙 중일 수 있음 → 삭제하면 500. `web-swap.sh`는 delete 전 PID 캡처 후 `kill -0`가 실패할 때까지(~20초) 폴링하고 삭제.
  - **레거시 단일 `arcturus-api` → ingress 최초 전환 시 ~1초 공개 포트 핸드오프 갭** — `server-up.sh`가 레거시를 api-swap 성공 후 즉시 삭제하고 ingress를 기동하므로 갭이 1회성 ~1초로 최소화됨. 정착 후 `--build`/`--api`는 갭 없음. 레거시 단일 `arcturus-web`도 web-swap flip 완료 후 삭제(무중단); `server-down.sh`도 두 레거시 이름 포함.
- **rate limit: 로그인/가입/토큰 생성 IP당 분당 10회, 배포 20회** — `ThrottlerModule`은 `@Global()`이라 **`forRoot`는 `AppModule`에서 딱 한 번만**. 모듈마다 `forRoot`를 또 부르면 마지막 등록이 전역 설정을 조용히 덮어쓴다(실측 — 과거 `DeploymentsModule`의 20이 로그인에도 적용돼 문서상 10이 거짓이었음). 라우트는 `@UseGuards(ThrottlerGuard)`로 옵트인하고, 다른 한도가 필요하면 `@Throttle({default:{...}})` 오버라이드(배포 create가 그 예). 전역 가드(APP_GUARD)로 만들면 대시보드 폴링이 막히니 금지.
- **세션은 DB-backed(즉시 폐기 가능)** — 세션 JWT의 `jti`가 `sessions` 테이블 행과 1:1, `SessionService.verify`가 서명 검증(`algorithms:['HS256']` 고정) 후 행 존재까지 확인하고 로그아웃은 행 삭제(`revoke`). **쿠키만 지우는 로그아웃으로 되돌리지 말 것** — 유출 쿠키가 7일 만료까지 살아남는 회귀가 됨. 만료 행 GC는 `issue()`에서 lazy 수행. 이 변경 배포 직후 기존 쿠키(jti 없음)는 전부 무효 → 1회 재로그인 필요.
- **TLS 종단 프록시 뒤에서는 `ARCTURUS_TRUST_PROXY` 필수** — 미설정이면 `req.secure`가 항상 false라 Secure 쿠키가 안 붙고, throttler가 프록시 IP 하나로 전 사용자의 rate limit을 공유. 값은 Express `trust proxy` 형식 그대로(`1`, `loopback` 등), `main.ts`에서 적용.
- **컨테이너→호스트 트래픽은 못 막는다(알려진 한계)** — `arcturus-apps`의 ICC-off는 컨테이너 간만 차단. 악성 앱/빌드 `RUN` 스텝이 호스트 바인딩 서비스(제어 평면 :7777, 다른 앱의 공개 포트, LAN)에 도달 가능. Linux는 `DOCKER-USER` iptables로 차단 가능하지만 macOS Docker Desktop에선 불가 — 배포 코드는 준신뢰로 취급. 게이트웨이 프록시는 클라이언트 `X-Forwarded-*`를 strip 후 `xfwd:true`로 실측값 재주입(`container-proxy.service.ts`).
- **API 토큰은 선택적 만료** — `api_tokens.expires_at`(null=무기한). 생성 시 대시보드에서 30/90/365일 또는 무기한 선택(`CreateTokenRequest.expiresInDays`); 허용 프리셋은 `ApiTokenService.ALLOWED_EXPIRY_DAYS`와 web의 `EXPIRY_OPTIONS`가 **쌍으로 일치해야** 함(불일치 시 400). `authenticate`가 만료 시각 경과 토큰을 `null` 반환으로 거부(별도 cleanup 잡 불필요 — 인증 시 거부로 충분). 토큰은 여전히 SHA-256 at-rest + 수동 revoke 가능.
- **프로덕션(`NODE_ENV=production`)은 시크릿 fail-closed** — `AppConfig.isProduction`이 true면 `ARCTURUS_JWT_SECRET`(`session.service.ts resolveSecret`)·`ARCTURUS_ENV_KEY`(`env-crypto.service.ts resolveKeyMaterial`)·`ARCTURUS_ADMIN_PASSWORD`(`admin.seeder.ts`) 미설정 시 부팅을 throw로 막음(평문 키 파일 폴백/생성 비번 로그 출력 금지). dev/로컬은 기존 자동 생성 폴백 유지. pm2 `logs/`는 `server-up.sh`가 `chmod 700`. **어드민 비번 최초 시드는 대화형 입력 지원**: admin 없음 + `ARCTURUS_ADMIN_PASSWORD` 미설정 시 `admin.seeder.ts`가 stdin이 TTY면 비번을 대화형(마스킹·재확인·최소 8자)으로 입력받아 시드(prod에서도 throw 대신 프롬프트). TTY 아니면 기존 분기(prod throw / dev 생성+로그). pm2는 TTY가 없으므로 `server-up.sh`가 최초 1회(DB 부재+TTY+미설정) 셸에서 프롬프트해 `export` → `api-swap.sh`가 tmp pm2 설정 **env 블록**에 주입(부모 셸 env는 autorestart에 안 남지만 비번은 최초 시드에만 필요). 값이 pm2 dump에 남을 수 있음(저민감·변경 가능).
- **배포 컨테이너 하드닝** — `dockerode.adapter.ts runContainer`의 `HostConfig`에 `CapDrop:['ALL']` + `SecurityOpt:['no-new-privileges']`(CPU/PID 제한과 함께), 그리고 ICC 끈 전용 브리지 `arcturus-apps`(`ensureAppNetwork`가 멱등 생성, `NetworkMode`로 부착)에 배치해 테넌트 간 도달 차단. egress(아웃바운드)는 유지. ReadonlyRootfs는 앱이 디스크 쓰기를 자주 해 깨질 수 있어 의도적으로 미적용.
  - **메모리 제한은 앱별**: `apps.memory_limit_mb`(null=서버 기본 `ARCTURUS_DEFAULT_MEMORY_MB`, 기본 1024). 대시보드 앱 상세에서 변경 → `AppsService.updateMemoryLimit`이 `requireOwnedOrAdmin` 후 저장하고 실행 중 컨테이너를 `recreateContainer`로 재생성(env 변경과 동일 패턴). 상한은 `ARCTURUS_MAX_MEMORY_MB`(기본 4096) — 초과/0 이하는 400. `RunContainerOptions.memoryBytes`로 어댑터에 전달.
  - **컨테이너는 기본적으로 이미지의 USER(주로 root)로 실행** — `ARCTURUS_CONTAINER_USER`(예 `1000:1000`)를 설정하면 `createContainer`의 `User`로 강제(하드닝 옵트인). 미설정이면 이미지 USER 존중. CapDrop ALL + no-new-privileges가 root 위험을 완화하지만 비root 강제가 더 안전.
  - **빌드 격리(H1)**: `buildImage`도 untrusted Dockerfile을 호스트 데몬에서 빌드하므로 빌드에 `memory` 상한(앱 메모리값 재사용)을 걸고 `networkmode: arcturus-apps`(ICC-off 브리지)로 붙여 빌드 중 다른 테넌트 컨테이너 도달을 차단(외부 egress=의존성 설치는 유지). networkmode는 classic 빌더에서만 적용되고 BuildKit은 무시하지만 메모리 상한은 양쪽 다 적용. `ensureAppNetwork()`를 빌드 전에도 호출.
- **C1 오리진 분리 + Origin 가드**(배포 앱이 방문자 세션으로 API 호출하는 confused-deputy 방어) — 앱은 `appsPort`(별도 오리진)에서 서빙(위 라우팅 참고)하고, `auth.guard.ts`가 **쿠키 인증 + 변이 메서드(GET/HEAD/OPTIONS 외)**면 same-origin을 강제(`assertSameOriginWrite`: `Origin` 호스트 === 요청 `Host`, 없으면 `Sec-Fetch-Site`가 same-origin/none이어야). 베어러(CLI)는 ambient하지 않아 검사 면제(Origin·Sec-Fetch 헤더 없으면 통과). **핵심 함정**: 쿠키는 포트로 스코프되지 않고 `:7777`↔`:7778`은 schemeful same-site라 `sameSite=lax`로는 못 막음 — 그래서 포트 분리만으론 부족하고 Origin 검사가 실제 방어선(포트 분리는 Origin을 구분 가능하게 만드는 전제). GET은 SOP/CORS가 응답 읽기를 막아 데이터 유출 차단, 변이는 이 가드가 차단. 완전한 cross-site 격리(별도 등록가능도메인)는 아직 아님 — 같은 호스트면 same-site.
- **업로드 zip 상한**(`archive.service.ts`) — 멀터 압축 상한(`maxUploadMb`, 기본 256MB)에 더해 비압축 누적 2 GiB·엔트리 10,000개 초과 시 추출 전 거부(압축폭탄 디스크 고갈 방어). zip-slip(추출 루트 이탈)·심링크 엔트리도 거부.
- **TypeScript 6.0 마이그레이션 함정 3개**: ① side-effect import도 해석 검사함(TS2882, 5.x는 안 했음) — Next 16은 전역 `*.css` 모듈 선언을 제공하지 않으므로 web의 모든 css import는 `src/types/css.d.ts`의 `declare module '*.css'`가 받쳐줌. CSS-only 패키지(fontsource 등)는 bare import 금지, 명시 경로 `import '@fontsource-variable/geist/index.css'`로(`*.css` 패턴에 걸리게). ② `baseUrl`은 deprecated(TS5101) — 제거하고 `paths`를 `./src/*`처럼 tsconfig 기준 상대 경로로. ③ TS5101 같은 설정 에러가 있으면 tsc가 본검사 없이 종료해 **파일 에러들이 가려짐** — 설정 에러부터 치우고 다시 봐야 전체가 보임.
- **게이트웨이는 malformed URI에 방어적** — `decodeURIComponent`는 `safeDecode`로 감싸 400 반환, `use()` 전체도 try/catch. async 미들웨어에서 throw하면 전체 게이트웨이가 죽으므로 새 경로 파싱 추가 시 주의.
- **Next 16.0.0은 baseline-browser-mapping 경고를 무조건 출력** — `next/dist/compiled/browserslist`에 데이터(2025-11-28자)가 통째로 번들돼 있어 2개월 경과 후 모든 빌드에서 워커당 1회 console.warn. 우리 쪽 baseline-browser-mapping 갱신이나 browserslist 설정으로는 안 꺼짐(실측 — vendored 모듈이 쿼리와 무관하게 평가됨). `patches/next@16.0.0.patch`(bun patch, package.json `patchedDependencies`)가 해당 비교식 한 줄을 무력화. **같은 패치에 두 번째 hunk**: dev 전용 `ForceCompleteRuntimePlugin`이 rspack에 없는 `compilation.hooks.afterChunks`를 tap해 `next dev`가 전 페이지 500 — 훅 없으면 skip하는 가드 추가. Next 업그레이드 시 두 hunk 모두 상류 해결 여부 확인 후 패치 삭제.
- **`next dev` + Linaria 함정: withRspack은 withLinaria보다 먼저(안쪽에서) 호출해야 함** — Next 16 CLI는 dev에서 config 로드 전에 `TURBOPACK=auto`를 설정한다. `withRspack(withLinaria(c))`처럼 withLinaria가 먼저 평가되면 그 시점 TURBOPACK이 truthy라 Linaria가 Turbopack 브랜치를 타고 rspack 로더를 안 달아서 모든 styled``가 런타임 500("Using the styled tag in runtime"). withRspack은 env 토글일 뿐이므로(`TURBOPACK` 삭제 + `NEXT_RSPACK` 설정) `withLinaria(withRspack(c))` 순서가 정답 — 빌드는 TURBOPACK이 없어 어느 순서든 동작했기 때문에 dev에서만 터졌음.
- **비밀번호 변경/재설정 시 전 세션 폐기** — `changePassword`(본인)와 `PasswordResetService.consume`(어드민 링크) 모두 성공 후 해당 계정의 `sessions` 행을 `deleteByUser`로 전부 삭제. 본인 변경은 컨트롤러가 즉시 새 쿠키를 재발급(현재 기기 유지), 재설정은 재로그인 유도. **`password_resets` 테이블**: 토큰은 SHA-256 해시로만 저장(평문 1회 노출), `usedAt` 비어있고 `expiresAt` 미경과인 것만 유효. 링크 TTL은 1시간, 1회 사용 후 폐기.
- **계정 삭제 = DB cascade + 실물 리소스 정리** — `apps.userId`의 `onDelete: 'cascade'`(schema)는 apps/deployments/app_shares/sessions/api_tokens **행만** 지우고, 실행 중 컨테이너·이미지·정적 파일은 **고아로 남는다**. 그래서 `UsersService.delete`가 `users.delete(id)` **전에** `AppsService.purgeResourcesForUser(userId, username)`를 호출해 그 계정 모든 앱의 컨테이너(`removeContainer`)·이미지(`removeImage`)·정적 디렉터리(`staticSites.remove`)를 정리하고, 마지막에 `staticSites.removeUser(username)`로 유저의 정적 트리 전체(`data/sites/{user}/`, 빈 부모·레거시 평면 사이트 포함)를 비운다(앱 개별 삭제 `AppsService.delete`와 같은 `cleanupAppResources` 헬퍼 공유). purge는 **best-effort**(앱별·removeUser try/catch+WARN) — docker 일시 오류가 계정 삭제를 막지 않게. 순서 주의: username·앱 행이 살아있는 동안 purge 먼저(이미지 정리가 deployments 행을 읽어야 함), 그 다음 user 삭제로 cascade. `UsersModule`이 이 때문에 `AppsModule`을 import(순환 없음 — AppsModule은 UsersModule 비의존).
  - **FK가 user 삭제를 막던 잠재 버그(같이 수정)**: `invites.createdBy`/`invites.usedBy`/`password_resets.createdBy`가 `onDelete` 규칙 없이 `users.id`를 참조해, invite를 **만들거나 소비한** 유저(=사실상 모든 실유저)를 삭제하면 `FOREIGN KEY constraint failed`로 500이 났다(실측, e2e로 발견). `createdBy`는 `cascade`(생성자 삭제 시 invite/reset 레코드도 삭제), `usedBy`는 `set null`(소비자만 삭제, invite 이력 보존)로 변경 → 마이그레이션 `0007_round_machine_man.sql`(SQLite는 FK 변경에 테이블 재생성, boot 자동 적용). `users.id`를 참조하는 새 테이블 추가 시 `onDelete`를 반드시 명시(누락=계정 삭제 회귀).
- **`GET shareable-users` 라우트 순서**: `apps.controller.ts`의 `@Get('shareable-users')`는 반드시 `@Get(':id')` **앞에** 선언해야 함 — NestJS/Express는 등록 순서대로 매칭하므로 `:id` 뒤에 두면 `shareable-users`가 `:id`로 잡혀 404 대신 appId 에러가 남.
- **공유 사용자에게 env·로그 숨기기**: `view` 권한 사용자의 `getFor` 응답은 서버에서 `env: {}`로 덮어씀 — 클라이언트 게이팅만으론 부족, DB 암호화 env가 API 응답으로 나가지 않게 서비스 레이어에서 차단. 로그 SSE(`GET /api/apps/:id/logs`)와 빌드 로그도 `manage` 이상만 — `findRowFor`와 `requireVisibleApp`이 `assertManageRow`로 위임.

## 검증 루틴

기능 변경 후: ① 3개 워크스페이스 tsc + biome + `bun test apps/api` ② 대시보드는 `build && start` 후 agent-browser로 실제 플로우(로그인 alice/password123) 스크린샷 확인 ③ 배포/롤백/env는 echo 샘플 앱(`/tmp/arc-docker-app`)으로 e2e. dev 계정: admin / alice (비번은 `data/` 시드 시 콘솔 출력).

프로덕션(pm2)이 살아있는 채로 검증할 때는 **격리 스택**으로: API는 `ARCTURUS_PORT=17777 ARCTURUS_APPS_PORT=17778 ARCTURUS_DATA_DIR=/tmp/...` 로 따로 띄우고, web은 `ARCTURUS_DIST_DIR=.next-verify`(next.config가 distDir로 사용, gitignore됨)로 빌드해 `next start --port 3100`. 함정 2개: ① rewrites의 `ARCTURUS_API_ORIGIN`은 **빌드 시점에 .next에 박힘** — start가 아니라 build에 줘야 함(안 주면 :7777 프로덕션 API로 감); dev는 config를 라이브로 읽어 해당 없음 ② 빌드가 `next-env.d.ts`를 distDir 참조로 덮어쓰므로 커밋 전 `git checkout`.
