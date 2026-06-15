<p align="center">
  <img src="./docs/assets/mascot.svg" width="200" alt="Arcturus 마스코트 아키 — 별을 품은 아기곰">
</p>
<p align="center"><em>아키(Arky) — 내 앱을 빛나게 지켜주는 아기곰</em></p>

# ✦ Arcturus

[English](./README.md) | **한국어**

소규모 팀을 위한 셀프호스팅 PaaS. CLI로 프로젝트를 올리거나(zip도 OK) 몇 초면 내 서버에서 바로 돌아갑니다. 정적 사이트와 Dockerfile 앱 모두요.

## 기능

- 🚀 **명령 한 번이면 라이브.** 폴더를 zip으로 올리거나 `arcturus deploy`만 치면 됩니다. 정적 사이트는 디스크에서 바로 서빙하고, `Dockerfile`이 있으면 이미지를 빌드해 컨테이너로 띄웁니다. 어느 쪽이든 `http://<host>:7778/<사용자명>/<앱이름>` 깔끔한 URL이 나옵니다. (`.html` 파일 하나만 올려도 자동으로 index가 됩니다.)
- ⏮️ **롤백은 한 번이면 끝.** 앱마다 최근 5개 릴리스를 들고 있어서, 잘 돌던 버전으로 되돌리는 건 대시보드 버튼 하나나 `arcturus rollback` 한 줄입니다.
- 🔐 **env는 저장 시 암호화.** 앱별 환경 변수를 SQLite에 AES-256-GCM으로 암호화해 보관합니다. 저장하면 재빌드 없이 컨테이너만 다시 만들어 바로 반영됩니다.
- 🛡️ **기본부터 안전하게.** 배포된 앱은 별도 오리진에서 돌아서, 앱이 로그인된 대시보드 세션을 가로챌 수 없습니다. 컨테이너는 단단히 잠가두고(권한 제거, no-new-privileges, 메모리 상한, 격리 네트워크), 로그인은 횟수를 제한하며, 로그아웃하면 세션이 서버에서 바로 사라집니다.
- 👥 **팀을 위해 만들었습니다.** 관리자가 초대 링크를 나눠주면 각자 자기 앱을 관리합니다. 앱은 `view`(읽기 전용)나 `manage`(전체 운영)로 공유할 수 있고, `manage` 권한이면 그 앱에 배포까지 할 수 있습니다.
- ♻️ **재배포해도 안 끊깁니다.** 대시보드와 API가 ingress 뒤에서 블루-그린으로 교체되어, 배포하는 동안에도 `:7777`과 `:7778`이 계속 응답합니다.
- 🌐 **한국어와 영어.** 대시보드, API 메시지, CLI가 모두 두 언어를 지원하며 브라우저 설정이나 `ARCTURUS_LANG` 값을 따릅니다.

## 시작하기

[Bun](https://bun.sh) 1.3+가 필요하고, 컨테이너 앱을 돌리려면 Docker도 필요합니다.

<details>
<summary><strong>Docker Desktop 없이 Docker 설치하기</strong> (라이선스 걱정 없음)</summary>

Arcturus는 Docker API 소켓에 직접 통신하므로 Docker Desktop이 전혀 필요 없습니다. Desktop은 직원 250명 이상 또는 연매출 $10M 이상 기업에서 유료 구독이 필요하지만, 아래 방법은 상업적 사용에도 무료인 오픈소스입니다.

**Linux 서버** — Docker Engine (Apache 2.0):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 이후 재로그인
```

**macOS** — Colima (MIT) + Homebrew의 docker CLI:

```bash
brew install colima docker
colima start
```

Colima는 작은 리눅스 VM 안에서 Docker를 돌리고, 이를 *소켓*(프로그램들이 Docker와 대화하는 통로가 되는 로컬 파일)으로 노출합니다. `docker` 명령은 이 소켓을 알아서 찾지만, Arcturus는 `DOCKER_HOST` 환경 변수만 확인하므로 한 번만 지정해 주면 됩니다.

Arcturus는 셸에서(pm2를 통해) 실행되므로, 이 변수는 `apps/api/.env`가 **아니라** 셸 시작 파일에 넣으세요. 최신 macOS는 `~/.zshrc`입니다(bash라면 `~/.bashrc`):

```bash
echo 'export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock' >> ~/.zshrc
source ~/.zshrc   # 현재 터미널에 즉시 적용 (새 터미널은 자동 반영)
```

`$HOME`은 홈 폴더로 치환되므로(예: `/Users/사용자명`), 이는 Colima가 만든 `~/.colima/default/docker.sock` 소켓을 가리킵니다. Arcturus가 이미 실행 중이라면 이 터미널에서 다시 시작하세요: `bun run server:up`.

</details>

```bash
git clone <repo-url> && cd arcturus
bun run server:up
```

설치는 이게 전부입니다. 의존성을 설치하고, 첫 실행이면 대시보드를 빌드하고, pm2로 전부 띄워줍니다. 브라우저에서 `http://<host>:7777`을 열면 끝입니다. 첫 실행이면서 암호화된 `.env.secrets`가 아직 없으면 `server:up`이 프로덕션 시크릿 설정 방법을 세 가지로 물어봅니다 — **1) 자동 생성**, **2) `ARCTURUS_ENV_KEY`·`ARCTURUS_JWT_SECRET` 직접 입력**, **3) 환경 변수로 주입하는 방법 안내만 보기** — 그 다음 터미널에서 어드민 비밀번호를 입력받습니다. 키(또는 `ARCTURUS_ADMIN_PASSWORD`)를 미리 정해두면 프롬프트를 건너뜁니다. 터미널이 없으면(CI/pm2) 반쯤 설정된 채 기동하지 않고 안내만 출력한 뒤 종료합니다.

| 명령 | 동작 |
|---|---|
| `bun run server:up` | 설치 후 기동. 언제 다시 실행해도 안전합니다(빌드 캐시가 없으면 첫 실행 때 빌드) |
| `bun run server:up -- --build` | **무중단** 전체 재배포 — 대시보드 블루-그린 재빌드 + API 블루-그린 교체, 게이트웨이는 내내 살아 있음 |
| `bun run server:up -- --api` | **무중단** API 교체 — ingress 뒤에서 블루-그린으로 재시작. 설정을 바꾼 뒤 사용 |
| `bun run server:up -- --ingress` | ingress 프런트 프록시 재시작 (`:7777`/`:7778`이 순간 끊김. `ingress.ts` 자체를 바꿀 때만 필요) |
| `bun run server:restart` | `server:up -- --api` 단축키 |
| `bun run server:down` | 전체 중지 |
| `bun run server:status` | 프로세스 상태 |
| `bun run server:logs` | 로그 보기 |

## CLI

설치는 한 줄이면 됩니다. 인스톨러와 플랫폼별 바이너리를 내 서버가 직접 서빙합니다:

```bash
curl -fsSL http://<host>:7777/install.sh | sh
```

> 서버에서 바이너리를 먼저 빌드해 두세요: `cd apps/cli && bun run build:all`

```bash
arcturus login --server http://<host>:7777 --token <arc_...>   # 토큰은 대시보드 → API 토큰
arcturus deploy                  # 현재 디렉터리를 zip으로 묶어 배포 (Dockerfile 있으면 컨테이너)
arcturus apps                    # 내 앱 목록
arcturus deployments <app>       # 배포 히스토리 (live / rollback 가능 표시)
arcturus rollback <app> <id>     # 이전 릴리스로 롤백
arcturus env <app> --set K=V     # 환경 변수 (컨테이너 재생성)
arcturus logs <app>              # 컨테이너 로그 팔로우
arcturus destroy <app>           # 앱 삭제
```

`arcturus deploy` 옵션:

| 옵션 | 설명 |
| --- | --- |
| `--name <appName>` | 앱 이름 (기본값: `arcturus.json`의 `"name"`, 없으면 디렉터리 이름) |
| `--name <owner>/<appName>` | **`manage`** 권한이 있는 다른 계정의 앱에 배포 (해당 앱이 이미 있어야 함) |
| `--dir <path>` | 배포할 프로젝트 디렉터리 (기본값: `.`) |
| `--env-file <path>` | **새 컨테이너 앱**에 넣을 env 파일 (기본값: 디렉터리의 `.env`) |
| `--no-env-file` | `.env` 파일을 읽지 않음 |

**공유받은 앱에 배포.** `manage` 권한이 있으면 `--name <owner>/<app>`으로 팀원의 앱에 배포할 수 있습니다. 이름만(예: `--name blog`, 또는 `--name` 생략) 지정했는데 다른 계정에 같은 이름으로 `manage` 권한을 가진 앱이 있으면, 대화형 터미널에서 어디에 배포할지 물어봅니다(기본값은 내 계정). CI 같은 비대화형 환경에서는 항상 내 계정에 배포합니다.

**컨테이너 앱 `.env` 자동 등록.** `Dockerfile`이 있는 디렉터리를 배포하면 Arcturus가 그 `.env`(또는 `--env-file`)를 읽어 값들을 앱 env로 **암호화해 저장**하고(직접 입력한 것과 똑같이) 컨테이너에 넣어줍니다. 이 동작은 앱을 **처음 만들 때만** 일어나며, 이후 재배포에서는 기존 env를 건드리지 않습니다(이후 변경은 `arcturus env`나 대시보드에서). 모든 `.env*` 파일(`.env`, `.env.local`, `.env.production` …)은 **빌드 이미지에서 항상 빠지므로** 시크릿이 이미지 레이어에 남지 않습니다. 값은 읽으면서 정리됩니다: 앞뒤 공백을 잘라내고, 뒤에 붙은 인라인 주석(`TOKEN=abc # 메모`처럼 공백 뒤의 `#`)은 떼어냅니다 — 공백 없이 붙은 `#`(`#fff`, `ab#cd`, URL fragment)는 그대로 두고, 값을 따옴표로 감싸면 리터럴 ` #`나 양끝 공백을 유지합니다. `arcturus env --set`도 동일하게 정리됩니다.

프로젝트별 앱 이름은 `arcturus.json`으로 고정합니다: `{ "name": "my-app" }`

## 라우팅 동작 방식

경로 프리픽스 프록시(`/alice/blog`)는 절대경로로 에셋을 참조하는 앱에서 깨질 수 있습니다. Arcturus는 세 가지 방법으로 대응합니다:

1. **프리픽스 제거 + `X-Forwarded-Prefix`** — base path를 설정할 수 있는 앱은 그대로 동작합니다.
2. **Referer 폴백** — `/static/app.js`처럼 매칭되지 않는 요청은 브라우저가 지금 보고 있는 앱으로 다시 라우팅합니다.
3. **전용 포트** — 컨테이너 앱마다 고정 포트(`30000+`)를 받아 base path 문제가 아예 없습니다. 새 컨테이너 앱은 "redirect" 모드가 기본이라(게이트웨이 URL이 전용 포트로 302 리다이렉트), 경로 기반 서빙을 원하면 앱 상세에서 "proxy"로 바꾸면 됩니다. 포트는 자동 할당되지만, 앱 상세의 **포트 설정**에서 원하는 포트(예: `8080`)를 직접 지정할 수도 있습니다 — 저장 전에 포트가 비어 있는지 확인하고 컨테이너를 새 포트로 다시 만들며, 자동 할당으로 되돌릴 수도 있습니다.

## 설정

예시 파일을 복사해 필요한 만큼 고치세요. 모든 값은 선택이고 기본값만으로도 잘 동작합니다:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

시크릿은 이 표에 일부러 넣지 않았습니다. `ARCTURUS_JWT_SECRET`·`ARCTURUS_ENV_KEY`는 레포 루트의 dotenvx 암호화 `.env.secrets`에서 `bun run secrets:init`으로 관리하고(`.env.secrets` 값이 `apps/api/.env`보다 우선), `ARCTURUS_ADMIN_PASSWORD`는 env로 지정하거나 첫 실행 때 터미널에서 입력받습니다. 셋 다 로컬 dev에선 자동 생성되고 **프로덕션에선 필수**입니다 — 자세한 건 보안 참고를 보세요.

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `ARCTURUS_PORT` | `7777` | 제어 평면 공개 포트(API + 대시보드) |
| `ARCTURUS_APPS_PORT` | `7778` | 배포된 앱 전용 오리진(앱 코드를 제어 평면 쿠키에서 떼어 놓음) |
| `ARCTURUS_DATA_DIR` | `./data` | SQLite·정적 릴리스·빌드 작업 공간 |
| `ARCTURUS_PORT_POOL_START/END` | `30000`/`30999` | 컨테이너 앱 전용 포트 풀 |
| `ARCTURUS_MAX_UPLOAD_MB` | `256` | 업로드 크기 제한 |
| `ARCTURUS_KEEP_RELEASES` | `5` | 앱별 롤백용 릴리스 보관 개수 |
| `ARCTURUS_DEFAULT_MEMORY_MB` | `1024` | 컨테이너 기본 메모리 상한(대시보드에서 앱별 재설정) |
| `ARCTURUS_MAX_MEMORY_MB` | `4096` | 앱별 메모리 제한이 넘을 수 없는 상한 |
| `ARCTURUS_CONTAINER_USER` | — | 배포 컨테이너를 이 사용자로 강제 실행(예 `1000:1000`); 비우면 이미지의 `USER`를 따름 |
| `ARCTURUS_CLI_DIST` | `apps/cli/dist/cli` | 서빙할 CLI 크로스컴파일 바이너리 위치 |
| `ARCTURUS_DEV_ORIGINS` | — | `next dev` 추가 허용 origin |
| `ARCTURUS_TRUST_PROXY` | — | TLS를 종단하는 리버스 프록시 뒤에서 운용할 때 설정(Express `trust proxy` 값, 예 `1`). 없으면 Secure 쿠키가 안 붙고 IP별 rate limit이 프록시 IP를 기준으로 잡힘 |

### 한 머신에서 여러 인스턴스 운용

여러 Arcturus 인스턴스가 호스트 하나를 같이 쓸 수 있습니다. 예를 들어 공용 맥에서 OS 계정마다 하나씩요:

- 인스턴스마다 `ARCTURUS_PORT`와 **`ARCTURUS_APPS_PORT`**를 다르게 주세요. 둘 중 하나라도 이미 쓰이고 있으면 ingress가 기동을 거부합니다. 블루-그린 교체용 내부 포트는 bind 프로브로 자동 할당되는데, 다른 OS 계정이 잡고 있는 포트까지 잡아내므로 따로 맞출 필요가 없습니다.
- 컨테이너 포트 풀은 겹쳐도 됩니다. 포트를 할당하기 전에 (자기 DB뿐 아니라) 호스트에서 실제로 바인딩 가능한지 확인하고, 스캔 시작점이 랜덤이라 동시에 배포해도 거의 충돌하지 않습니다. 그래도 인스턴스별로 `ARCTURUS_PORT_POOL_START/END` 범위를 나눠두면 깔끔합니다.
- 앱이 내려가 있는 동안 (다른 인스턴스 등이) 전용 포트를 가져가 버린 경우, 다음 배포에서 충돌을 알아채고 새 포트를 할당한 뒤 다시 시도합니다. 변경 내역은 배포 로그에 남습니다. 이때 전용 URL이 바뀐다는 점만 기억하세요.

### 보안 참고

기본값만으로도 안전하고, 더 알고 싶으면 아래에 자세히 적어뒀습니다.

**시크릿과 키**

- **env 변수는 저장 시 암호화됩니다.** 앱 env 변수는 SQLite에 AES-256-GCM으로 암호화해 저장됩니다. 키는 `ARCTURUS_ENV_KEY`를 쓰거나, 없으면 한 번 생성되어 `data/env-key`(권한 `0600`)에 저장됩니다. `data/`는 `0700`, DB 파일은 `0600`입니다. 키를 잃거나 바꾸면 기존 값을 복호화할 수 없습니다. 기존 평문 행은 다음 부팅 때 다시 암호화됩니다. 평문 키 파일은 설정 없이 바로 쓰기 위한 편의 장치일 뿐, 오래 운영하는 서버에는 권장하지 않습니다.
- **`bun run secrets:init`(macOS)을 실행하면 디스크에서 평문 키가 사라집니다.** `ARCTURUS_ENV_KEY`와 `ARCTURUS_JWT_SECRET`을 dotenvx로 암호화한 `.env.secrets`로 옮기고, 복호화 키는 macOS Keychain(서비스명 `arcturus-dotenvx`)에만 둡니다. 서버 래퍼가 재기동 때마다 Keychain에서 다시 가져오므로 디스크에도 pm2 dump에도 시크릿이 남지 않습니다. 기존 키 파일 값은 그대로 옮겨져 암호화된 env 행과 로그인 세션이 유지되며, 키도 파일도 없으면 새로 생성합니다. 첫 프로덕션 기동 때 `server:up`이 대신 실행해 줍니다(메뉴 1번). 생성 대신 값을 직접 입력하려면 `--input`을 붙이세요.
  - 이후 시크릿 추가·수정: `.env.secrets`에 `KEY=값`을 적고 `bun run secrets:update`(또는 `bunx dotenvx set KEY 값 -f .env.secrets`) 후 `bun run server:restart`.
  - 다른 머신으로 옮기기 전 키 백업: `security find-generic-password -s arcturus-dotenvx -w`.
  - Linux에는 Keychain이 없으니 두 환경 변수를 직접 주입하거나 파일 fallback을 그대로 쓰세요(평문 키 파일로 돌고 있으면 API가 경고 로그를 남깁니다).
- **프로덕션에서는 세 시크릿이 필수입니다.** `NODE_ENV=production`이면 `ARCTURUS_JWT_SECRET`, `ARCTURUS_ENV_KEY`, `ARCTURUS_ADMIN_PASSWORD`를 명시적으로 설정해야 하며, 안 하면 서버가 기동을 거부합니다. 평문 키 파일로 조용히 폴백하거나(파일이 새면 세션 위조·저장된 모든 env 복호화가 가능) 생성된 admin 비밀번호를 누구나 읽는 로그에 출력하지 않습니다. 자동 생성 폴백은 로컬·개발 전용입니다. pm2 `logs/` 디렉터리는 `0700`으로 생성됩니다.

**세션·비밀번호·토큰**

- **로그아웃은 세션을 서버에서도 폐기합니다.** 세션 JWT는 SQLite의 `sessions` 행에 연결된 `jti`를 담고 있고, 로그아웃 시 그 행을 삭제합니다. 그래서 유출된 쿠키가 7일 만료까지 살아 있지 않고 곧바로 무효가 됩니다.
- **비밀번호 변경은 전 세션을 폐기합니다.** 멤버는 **대시보드 → Account**에서 현재 비밀번호를 확인한 뒤 직접 바꿀 수 있고, 성공하면 다른 세션은 모두 무효화되고 현재 기기에는 새 세션이 발급됩니다. 어드민은 **Team** 페이지에서 1시간짜리 1회용 재설정 링크를 발급할 수 있습니다. 팀원이 링크를 열면 현재 비밀번호 없이 새 비밀번호를 정할 수 있고, 그 계정의 모든 세션이 폐기됩니다.
- **API 토큰에 만료를 둘 수 있습니다.** 30·90·365일 또는 무기한을 고릅니다. 만료된 토큰은 인증 단계에서 거부되며, 수동 폐기와 별개로 동작합니다.
- **로그인과 배포는 횟수를 제한합니다.** 로그인·가입·토큰 생성은 IP당 분당 10회, 배포는 빌드마다 CPU·디스크 부담이 크므로 분당 20회로 제한합니다.

**컨테이너와 빌드**

- **배포 컨테이너는 권한을 최소화해 실행됩니다.** 모든 Linux capability 제거(`CapDrop: ALL`), `no-new-privileges`, CPU/PID 제한, 앱별 메모리 상한(대시보드에서 설정, 기본 `ARCTURUS_DEFAULT_MEMORY_MB`, 상한 `ARCTURUS_MAX_MEMORY_MB`)이 걸립니다. 또 inter-container 통신을 끈 전용 브리지 네트워크(`arcturus-apps`)에 두어 한 테넌트의 앱이 다른 테넌트 앱에 닿지 못하게 합니다. 기본적으로 이미지의 `USER`를 따르고, `ARCTURUS_CONTAINER_USER`(예 `1000:1000`)를 설정하면 비root 사용자로 강제합니다.
- **이미지 빌드도 샌드박싱됩니다.** 신뢰할 수 없는 `Dockerfile`도 같은 메모리 상한으로 같은 격리 네트워크에서 빌드되어, 빌드 중 `RUN` 스텝이 다른 테넌트 컨테이너에 닿지 못합니다(의존성 설치용 아웃바운드 egress는 유지).
- **알려진 한계: 컨테이너는 여전히 호스트에 닿을 수 있습니다.** `arcturus-apps` 브리지는 컨테이너↔컨테이너 트래픽만 막고 컨테이너→호스트는 막지 않습니다. 악성 앱(또는 빌드 중 `RUN` 스텝)이 호스트에 바인딩된 서비스, 즉 제어 평면(모든 API 호출에 인증 필요)과 다른 앱의 공개 포트에 닿을 수 있습니다. 완전 차단은 Linux의 `DOCKER-USER` iptables 영역이며 macOS Docker Desktop에서는 불가능하니, 배포되는 코드는 준신뢰(semi-trusted)로 취급하세요.

**오리진과 네트워크**

- **앱은 별도 오리진에서 돌아갑니다.** 배포된 앱은 제어 평면(`:7777`)과 떨어진 `ARCTURUS_APPS_PORT`(기본 `:7778`)에서 서빙됩니다. 앱 리스너는 앱만 서빙하고, API는 쿠키 인증된 cross-origin 변이 요청을 거부합니다(Origin / `Sec-Fetch-Site` 검사). 덕분에 악성 앱이 로그인한 방문자의 세션으로 API를 구동할 수 없습니다. 기존 `:7777/<user>/<app>` 링크는 앱 오리진으로 302 리다이렉트되고, CLI 베어러 토큰 요청은 영향이 없습니다. (쿠키는 포트로 스코프되지 않아 포트 분리만으로는 부족합니다. 같은 호스트의 앱은 여전히 same-*site*이라, Origin 검사가 실제 방어선입니다.)
- **전달 헤더는 정리됩니다.** 게이트웨이가 클라이언트가 보낸 `X-Forwarded-*`를 제거하고 실제로 관측한 값으로 다시 채워서, 앱이 스푸핑 가능한 값 대신 진짜 클라이언트 IP를 신뢰할 수 있습니다.
- **전용 포트는 공개됩니다.** 컨테이너 앱은 전용 호스트 포트(`0.0.0.0` 바인딩)로도 직접 접근할 수 있고, "전용 포트로 이동" 모드가 이에 의존합니다. 포트 풀은 팀 네트워크로 방화벽 제한하세요.

**업로드와 의존성**

- **업로드에는 상한이 있습니다.** 압축 업로드 상한에 더해, 비압축 2 GiB나 엔트리 10,000개를 넘으면 거부하고, 추출 루트를 벗어나거나 심링크인 zip 엔트리도 거부합니다. 압축폭탄이 디스크를 채우는 걸 막기 위해서입니다.
- **새 npm 릴리스는 7일을 기다립니다.** 의존성 설치는 올라온 지 7일이 안 된 npm 버전을 건너뜁니다(`bunfig.toml`의 `minimumReleaseAge`). 오염된 릴리스가 이 레포에 닿기 전에 발견·회수될 시간을 법니다. 급한 패치는 `minimumReleaseAgeExcludes`로 패키지별 예외 처리하세요.

## 아키텍처

```
apps/api/        NestJS — REST API, 리버스 프록시 게이트웨이, 배포 파이프라인 (Bun 런타임)
apps/web/        Next.js 대시보드 — Rspack 번들러 + Linaria zero-runtime CSS, FSD 아키텍처
apps/cli/        arcturus CLI — `bun build --compile` 단일 바이너리
packages/shared/ api/web/cli가 공유하는 API 계약 타입
```

SQLite는 Drizzle로 다루고, 리포지토리가 port 뒤에 있어 PostgreSQL로 옮기는 건 모듈 교체로 충분합니다. Docker는 `ContainerRuntime` port 뒤의 dockerode. 정적 릴리스는 버전별 디렉터리, 컨테이너 릴리스는 배포별 이미지 태그로 보관됩니다.

## 개발

```bash
bun run lint            # biome check
bun test apps/api       # 단위 테스트
cd apps/web && bun run dev   # 대시보드 dev 서버 (:3000, HMR)
```

아키텍처 규칙·디자인 토큰·알려진 함정은 [CLAUDE.md](./CLAUDE.md)를 참고하세요.

프로젝트 사이트(GitHub Pages)는 [`docs/`](./docs/)에 있습니다 — 한/영 순수 정적 HTML/CSS이며, `.github/workflows/pages.yml`로 배포됩니다(레포 공개 후 `ENABLE_PAGES` repository variable로 활성화).

## 라이선스

[MIT](./LICENSE). 배포되는 CLI 바이너리에는 서드파티 소프트웨어가 번들됩니다 — [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고하세요.
