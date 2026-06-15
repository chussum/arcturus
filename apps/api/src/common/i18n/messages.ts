/**
 * API error message catalog — en/ko.
 * Technical terms (Dockerfile, zip, CLI, port numbers) stay in English in both.
 * Each leaf is either a plain string or a function that accepts a params object.
 */

type MsgFn = (params: Record<string, unknown>) => string;
type MsgVal = string | MsgFn;

const en = {
  auth: {
    invalidCredentials: 'Invalid username or password',
    passwordTooShort: 'Password must be at least 8 characters',
    currentPasswordWrong: 'Current password is incorrect',
    resetTokenInvalid: 'Reset link is invalid or has expired',
    inviteInvalid: 'Invalid or already-used invite',
    inviteExpired: 'Invite has expired',
    usernameTaken: ({ username }: Record<string, unknown>) =>
      `Username "${username as string}" is taken`,
    usernameReserved: ({ username }: Record<string, unknown>) =>
      `Username "${username as string}" is reserved`,
    usernamePattern:
      'Username must be 2-31 chars: lowercase letters, digits, hyphens; starting with a letter',
    authRequired: 'Authentication required',
    originMalformed: 'Malformed Origin header',
    crossOriginWrite: 'Cross-origin write rejected',
    crossSiteWrite: 'Cross-site write rejected',
    adminRequired: 'Admin access required',
  },
  tokens: {
    nameRequired: 'Token name is required',
    expiresInDaysInvalid: ({ allowed }: Record<string, unknown>) =>
      `expiresInDays must be one of ${allowed as string}, or omitted for no expiry`,
  },
  users: {
    cannotDeleteSelf: 'You cannot delete your own account',
    notFound: 'User not found',
    cannotDeleteLastAdmin: 'Cannot delete the last admin',
  },
  invites: {
    notFound: 'Invite not found',
  },
  apps: {
    deploymentIdRequired: 'deploymentId is required',
    unknownRouteMode: ({ mode }: Record<string, unknown>) =>
      `Unknown route mode "${mode as string}"`,
    envMustBeObject: 'env must be an object of string values',
    descriptionMustBeString: 'description must be a string',
    memoryLimitMbInteger: 'memoryLimitMb must be an integer (MB)',
    deploymentNotFound: 'Deployment not found for this app',
    onlySuccessfulRollback: 'Only successful deployments can be rolled back to',
    releasePruned: 'This release has been pruned and can no longer be restored',
    envContainerOnly: 'Env vars only apply to container apps',
    memoryContainerOnly: 'Memory limits only apply to container apps',
    memoryPositive: 'Memory limit must be a positive integer (MB)',
    memoryExceedsMax: ({ max }: Record<string, unknown>) =>
      `Memory limit may not exceed ${max as number} MB`,
    portContainerOnly: 'Manual port only applies to container apps',
    portInteger: 'Port must be an integer',
    portOutOfRange: 'Port must be between 1024 and 65535',
    portReserved: 'That port is reserved by Arcturus',
    portTaken: 'That port is already in use',
    noAssignedPort: 'App has no assigned port yet',
    ownerGone: 'App owner no longer exists',
    onlyContainerStopRestart: 'Only deployed container apps can be stopped or restarted',
    notFound: 'App not found',
    notOwner: 'You can only manage your own apps',
    unknownShareRole: 'Unknown share role',
    shareUserNotFound: 'Shared user not found',
    cannotShareWithSelf: 'Cannot share an app with its owner',
    tooManyShares: 'Cannot share with more than 50 users',
  },
  env: {
    invalidKey: ({ key }: Record<string, unknown>) =>
      `Invalid env key "${key as string}" (letters, digits, _; not starting with a digit)`,
    valueMustBeString: ({ key }: Record<string, unknown>) =>
      `Env value for "${key as string}" must be a string`,
  },
  deployments: {
    appNamePattern:
      'App name must be 2-31 chars: lowercase letters, digits, hyphens; starting with a letter',
    singleHtmlStaticOnly: 'A single HTML file can only be deployed as a static site',
    deploymentNotFound: 'Deployment not found',
    appTypeConflict: ({ name, existing, type }: Record<string, unknown>) =>
      `App "${name as string}" is a ${existing as string} app; delete it first to redeploy as ${type as string}`,
    appNotFound: 'App not found',
    ownerNotFound: ({ owner }: Record<string, unknown>) => `No account named "${owner as string}"`,
    crossAccountAppNotFound: ({ owner, name }: Record<string, unknown>) =>
      `No app "${name as string}" under "${owner as string}" — a new app can only be created under your own account`,
    unknownAppType: ({ raw }: Record<string, unknown>) => `Unknown app type "${raw as string}"`,
    archiveFieldRequired: 'Archive file field "archive" is required',
    envInvalidJson: 'The env field must be a JSON object of string values',
  },
  logs: {
    containerOnly: 'Runtime logs exist only for deployed container apps',
  },
  cliDist: {
    unknownBinary: 'Unknown CLI binary',
    binaryNotBuilt:
      'CLI binary not built for this platform. On the server, run: cd apps/cli && bun run build:all',
  },
  archive: {
    tooManyEntries: ({ limit }: Record<string, unknown>) =>
      `Archive has too many entries (limit ${limit as number})`,
    entryEscapes: ({ name }: Record<string, unknown>) =>
      `Archive entry escapes extraction root: ${name as string}`,
    symlinkEntry: ({ name }: Record<string, unknown>) =>
      `Archive contains a symlink entry: ${name as string}`,
    uncompressedLimit: ({ gib }: Record<string, unknown>) =>
      `Archive expands beyond the ${gib as number} GiB uncompressed limit`,
  },
  common: {
    internalError: 'Internal server error',
  },
} satisfies Record<string, Record<string, MsgVal>>;

const ko: typeof en = {
  auth: {
    invalidCredentials: '사용자명 또는 비밀번호가 올바르지 않습니다',
    passwordTooShort: '비밀번호는 8자 이상이어야 합니다',
    currentPasswordWrong: '현재 비밀번호가 올바르지 않습니다',
    resetTokenInvalid: '재설정 링크가 유효하지 않거나 만료되었습니다',
    inviteInvalid: '유효하지 않거나 이미 사용된 초대 코드입니다',
    inviteExpired: '초대 코드가 만료되었습니다',
    usernameTaken: ({ username }: Record<string, unknown>) =>
      `"${username as string}" 사용자명은 이미 사용 중입니다`,
    usernameReserved: ({ username }: Record<string, unknown>) =>
      `"${username as string}" 사용자명은 예약되어 있습니다`,
    usernamePattern:
      '사용자명은 2~31자이며 소문자, 숫자, 하이픈만 사용할 수 있고 문자로 시작해야 합니다',
    authRequired: '인증이 필요합니다',
    originMalformed: '잘못된 Origin 헤더입니다',
    crossOriginWrite: '다른 출처에서의 쓰기 요청은 허용되지 않습니다',
    crossSiteWrite: '다른 사이트에서의 쓰기 요청은 허용되지 않습니다',
    adminRequired: '관리자 권한이 필요합니다',
  },
  tokens: {
    nameRequired: '토큰 이름을 입력해주세요',
    expiresInDaysInvalid: ({ allowed }: Record<string, unknown>) =>
      `만료일은 ${allowed as string} 중 하나이거나 생략하면 만료 없음으로 설정됩니다`,
  },
  users: {
    cannotDeleteSelf: '자신의 계정은 삭제할 수 없습니다',
    notFound: '사용자를 찾을 수 없습니다',
    cannotDeleteLastAdmin: '마지막 관리자는 삭제할 수 없습니다',
  },
  invites: {
    notFound: '초대 코드를 찾을 수 없습니다',
  },
  apps: {
    deploymentIdRequired: 'deploymentId가 필요합니다',
    unknownRouteMode: ({ mode }: Record<string, unknown>) =>
      `알 수 없는 라우팅 방식입니다: "${mode as string}"`,
    envMustBeObject: 'env는 문자열 값의 객체여야 합니다',
    descriptionMustBeString: 'description은 문자열이어야 합니다',
    memoryLimitMbInteger: 'memoryLimitMb는 정수(MB)여야 합니다',
    deploymentNotFound: '이 앱의 배포를 찾을 수 없습니다',
    onlySuccessfulRollback: '성공한 배포만 롤백 대상이 될 수 있습니다',
    releasePruned: '이 릴리스는 이미 삭제되어 복원할 수 없습니다',
    envContainerOnly: '환경 변수는 컨테이너 앱에만 적용됩니다',
    memoryContainerOnly: '메모리 한도는 컨테이너 앱에만 적용됩니다',
    memoryPositive: '메모리 한도는 양의 정수(MB)여야 합니다',
    memoryExceedsMax: ({ max }: Record<string, unknown>) =>
      `메모리 한도는 ${max as number} MB를 초과할 수 없습니다`,
    portContainerOnly: '수동 포트는 컨테이너 앱에만 적용됩니다',
    portInteger: '포트는 정수여야 합니다',
    portOutOfRange: '포트는 1024에서 65535 사이여야 합니다',
    portReserved: 'Arcturus가 예약한 포트입니다',
    portTaken: '이미 사용 중인 포트입니다',
    noAssignedPort: '앱에 아직 포트가 할당되지 않았습니다',
    ownerGone: '앱 소유자가 더 이상 존재하지 않습니다',
    onlyContainerStopRestart: '실행 중인 컨테이너 앱만 중지하거나 재시작할 수 있습니다',
    notFound: '앱을 찾을 수 없습니다',
    notOwner: '자신의 앱만 관리할 수 있습니다',
    unknownShareRole: '알 수 없는 공유 권한입니다',
    shareUserNotFound: '공유할 사용자를 찾을 수 없습니다',
    cannotShareWithSelf: '앱을 소유자와 공유할 수 없습니다',
    tooManyShares: '최대 50명의 사용자와 공유할 수 있습니다',
  },
  env: {
    invalidKey: ({ key }: Record<string, unknown>) =>
      `잘못된 환경 변수 키입니다: "${key as string}" (문자, 숫자, _만 사용 가능하며 숫자로 시작할 수 없습니다)`,
    valueMustBeString: ({ key }: Record<string, unknown>) =>
      `"${key as string}"의 환경 변수 값은 문자열이어야 합니다`,
  },
  deployments: {
    appNamePattern:
      '앱 이름은 2~31자이며 소문자, 숫자, 하이픈만 사용할 수 있고 문자로 시작해야 합니다',
    singleHtmlStaticOnly: '단일 HTML 파일은 정적 사이트로만 배포할 수 있습니다',
    deploymentNotFound: '배포를 찾을 수 없습니다',
    appTypeConflict: ({ name, existing, type }: Record<string, unknown>) =>
      `"${name as string}" 앱은 ${existing as string} 유형입니다. ${type as string}으로 재배포하려면 먼저 삭제하세요`,
    appNotFound: '앱을 찾을 수 없습니다',
    ownerNotFound: ({ owner }: Record<string, unknown>) =>
      `"${owner as string}" 계정을 찾을 수 없습니다`,
    crossAccountAppNotFound: ({ owner, name }: Record<string, unknown>) =>
      `"${owner as string}" 계정에 "${name as string}" 앱이 없습니다 — 새 앱은 본인 계정에만 만들 수 있습니다`,
    unknownAppType: ({ raw }: Record<string, unknown>) =>
      `알 수 없는 앱 유형입니다: "${raw as string}"`,
    archiveFieldRequired: '"archive" 파일 필드가 필요합니다',
    envInvalidJson: 'env 필드는 문자열 값을 가진 JSON 객체여야 합니다',
  },
  logs: {
    containerOnly: '런타임 로그는 배포된 컨테이너 앱에서만 확인할 수 있습니다',
  },
  cliDist: {
    unknownBinary: '알 수 없는 CLI 바이너리입니다',
    binaryNotBuilt:
      '이 플랫폼의 CLI 바이너리가 빌드되지 않았습니다. 서버에서 다음을 실행하세요: cd apps/cli && bun run build:all',
  },
  archive: {
    tooManyEntries: ({ limit }: Record<string, unknown>) =>
      `아카이브에 파일이 너무 많습니다 (한도: ${limit as number}개)`,
    entryEscapes: ({ name }: Record<string, unknown>) =>
      `아카이브 항목이 추출 경로를 벗어납니다: ${name as string}`,
    symlinkEntry: ({ name }: Record<string, unknown>) =>
      `아카이브에 심볼릭 링크가 포함되어 있습니다: ${name as string}`,
    uncompressedLimit: ({ gib }: Record<string, unknown>) =>
      `아카이브의 압축 해제 크기가 ${gib as number} GiB 한도를 초과합니다`,
  },
  common: {
    internalError: '서버 내부 오류가 발생했습니다',
  },
};

export const apiMessages = { en, ko } as const;

export type ApiLocale = keyof typeof apiMessages;

/**
 * Resolves a dot-separated key against the catalog for the given locale,
 * calling the function with params if the entry is a function.
 * Falls back to the key string if the path is not found.
 */
export function resolveMessage(
  locale: ApiLocale,
  key: string,
  params: Record<string, unknown> = {},
): string {
  const catalog = apiMessages[locale] as Record<string, unknown>;
  const parts = key.split('.');
  let node: unknown = catalog;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (typeof node === 'function') return (node as (p: Record<string, unknown>) => string)(params);
  return key; // key is the fallback — never silently returns empty
}
