export interface RobotPosition {
  x: number;
  y: number;
}

export const STORAGE_KEY_ROBOT_POSITION = 'jami.robot.position.v1';

export function getViewportSafeBounds(
  viewportWidth: number,
  viewportHeight: number,
  robotWidth: number,
  robotHeight: number
) {
  const isMobile = viewportWidth < 768;
  const safeMargin = isMobile ? 12 : 24;

  const minX = safeMargin;
  const maxX = Math.max(safeMargin, viewportWidth - robotWidth - safeMargin);
  const minY = safeMargin;
  const maxY = Math.max(minY, viewportHeight - robotHeight - safeMargin);

  return { minX, maxX, minY, maxY };
}

export function clampPositionToViewport(
  pos: RobotPosition,
  viewportWidth: number,
  viewportHeight: number,
  robotWidth: number,
  robotHeight: number
): RobotPosition {
  const { minX, maxX, minY, maxY } = getViewportSafeBounds(
    viewportWidth,
    viewportHeight,
    robotWidth,
    robotHeight
  );

  return {
    x: Math.max(minX, Math.min(maxX, pos.x)),
    y: Math.max(minY, Math.min(maxY, pos.y)),
  };
}

export function getDefaultBottomRightPosition(
  viewportWidth: number,
  viewportHeight: number,
  robotWidth: number,
  robotHeight: number
): RobotPosition {
  const isMobile = viewportWidth < 768;
  const margin = isMobile ? 16 : 32;

  return {
    x: Math.max(12, viewportWidth - robotWidth - margin),
    y: Math.max(12, viewportHeight - robotHeight - margin),
  };
}

export function loadSavedRobotPosition(
  viewportWidth: number,
  viewportHeight: number,
  robotWidth: number,
  robotHeight: number
): RobotPosition {
  if (typeof window === 'undefined') {
    return getDefaultBottomRightPosition(viewportWidth, viewportHeight, robotWidth, robotHeight);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_ROBOT_POSITION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.x === 'number' &&
        !isNaN(parsed.x) &&
        typeof parsed?.y === 'number' &&
        !isNaN(parsed.y)
      ) {
        return clampPositionToViewport(
          { x: parsed.x, y: parsed.y },
          viewportWidth,
          viewportHeight,
          robotWidth,
          robotHeight
        );
      }
    }
  } catch (_e) {
    // Ignore parse errors and use default
  }

  return getDefaultBottomRightPosition(viewportWidth, viewportHeight, robotWidth, robotHeight);
}

export function saveRobotPosition(pos: RobotPosition) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ROBOT_POSITION, JSON.stringify(pos));
  } catch (_e) {
    // Ignore storage quota errors
  }
}
