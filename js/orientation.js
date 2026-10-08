// 휴대폰은 가로로만 플레이한다.
// - 전체 화면 + 가로 고정을 지원하는 기기(안드로이드 크롬·삼성 인터넷 등)는 게임을 시작할 때 자동으로 가로로 돌린다.
// - 지원하지 않는 기기(아이폰 등)는 세로일 때 "가로로 돌려 주세요" 안내가 게임을 가린다 (css: #rotate-overlay).

// 손가락으로 쓰는 작은 화면만 (태블릿·PC는 그대로)
export function isPhone() {
  return window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600;
}

export function canLockLandscape() {
  return !!(document.documentElement.requestFullscreen && window.screen.orientation?.lock);
}

// 버튼을 누른 순간(사용자 동작)에 불러야 브라우저가 허락한다
export async function goLandscape() {
  if (!isPhone() || !canLockLandscape()) return false;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await window.screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function leaveLandscape() {
  try {
    window.screen.orientation?.unlock?.();
  } catch {
    // 고정하지 않았으면 무시
  }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
