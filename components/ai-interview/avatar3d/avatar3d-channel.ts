import {
  Avatar3DState,
  AVATAR3D_CHANNEL_NAME,
  DEFAULT_VISEME_WEIGHTS,
} from "./avatar3d-types";

/**
 * Creates a sender that pushes Avatar3DState updates to the 3D scene
 * (works whether the scene runs in a Worker or on the main thread).
 */
export function createAvatar3DSender() {
  const channel = new BroadcastChannel(AVATAR3D_CHANNEL_NAME);

  function send(state: Avatar3DState) {
    channel.postMessage(state);
  }

  function destroy() {
    channel.close();
  }

  return { send, destroy };
}

/**
 * Creates a receiver that listens for Avatar3DState updates.
 * Runs identically in a Worker or on the main thread.
 */
export function createAvatar3DReceiver(
  onState: (state: Avatar3DState) => void
) {
  const channel = new BroadcastChannel(AVATAR3D_CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<Avatar3DState>) => {
    onState(event.data);
  };

  function destroy() {
    channel.close();
  }

  return { destroy };
}

/** Default state for initialisation */
export const DEFAULT_AVATAR3D_STATE: Avatar3DState = {
  avatarState: "idle",
  mouthOpenness: 0,
  visemeWeights: DEFAULT_VISEME_WEIGHTS,
  timestamp: 0,
};
