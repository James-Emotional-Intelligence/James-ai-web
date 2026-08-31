import { VoiceState } from '../../context/VoiceJamiContext';

export type JamiState =
  | VoiceState
  | 'idle'
  | 'guiding'
  | 'focus'
  | 'reminding'
  | 'celebrating'
  | 'encouraging'
  | 'sleeping';

export type RobotVisualState =
  | 'poweredDown'
  | 'attentiveWarning'
  | 'attentiveIdle'
  | 'acknowledge'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'presenting'
  | 'working'
  | 'suspended'
  | 'idle'
  | 'guiding'
  | 'focused'
  | 'reminding'
  | 'celebrating'
  | 'encouraging'
  | 'sleeping'
  | 'error';

export type MouthShape =
  | 'rest'
  | 'closed'
  | 'small'
  | 'wide'
  | 'narrow'
  | 'round'
  | 'smile';

export type RobotDisplayMode = 'full' | 'head';

export type DetailLevel = 'compact' | 'standard' | 'detailed';

export type SpeakingGesture =
  | 'explainLeft'
  | 'explainRight'
  | 'openPalm'
  | 'gentleNod'
  | 'neutralTalk';

export interface RobotJointPose {
  rootY?: number;
  rootRotate?: number;
  torsoRotate?: number;
  torsoY?: number;
  pelvisRotate?: number;
  headRotate?: number;
  headX?: number;
  headY?: number;
  leftShoulder?: number;
  leftElbow?: number;
  leftWrist?: number;
  rightShoulder?: number;
  rightElbow?: number;
  rightWrist?: number;
  leftHip?: number;
  leftKnee?: number;
  leftAnkle?: number;
  rightHip?: number;
  rightKnee?: number;
  rightAnkle?: number;
}

/**
 * Deterministic mapping from system JamiState/VoiceState to visual robot posture state
 */
export function mapJamiStateToVisual(state?: JamiState | string): RobotVisualState {
  switch (state) {
    case 'disabled':
      return 'poweredDown';
    case 'requesting_permission':
      return 'attentiveWarning';
    case 'armed':
      return 'attentiveIdle';
    case 'wake_detected':
      return 'acknowledge';
    case 'listening_command':
      return 'listening';
    case 'connecting':
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'confirmation_pending':
      return 'presenting';
    case 'executing':
      return 'working';
    case 'suspended':
      return 'suspended';
    case 'guiding':
      return 'guiding';
    case 'focus':
      return 'focused';
    case 'reminding':
      return 'reminding';
    case 'celebrating':
      return 'celebrating';
    case 'encouraging':
      return 'encouraging';
    case 'sleeping':
      return 'sleeping';
    case 'error':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
}
