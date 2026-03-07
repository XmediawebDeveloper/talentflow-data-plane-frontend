import type { AvatarState } from "@/hooks/useAvatarState";

/** 15 Oculus Viseme morph target weights for lip-sync */
export interface VisemeWeights {
  viseme_sil: number;
  viseme_PP: number;
  viseme_FF: number;
  viseme_TH: number;
  viseme_DD: number;
  viseme_kk: number;
  viseme_CH: number;
  viseme_SS: number;
  viseme_nn: number;
  viseme_RR: number;
  viseme_aa: number;
  viseme_E: number;
  viseme_I: number;
  viseme_O: number;
  viseme_U: number;
}

export const VISEME_NAMES: (keyof VisemeWeights)[] = [
  "viseme_sil",
  "viseme_PP",
  "viseme_FF",
  "viseme_TH",
  "viseme_DD",
  "viseme_kk",
  "viseme_CH",
  "viseme_SS",
  "viseme_nn",
  "viseme_RR",
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
];

export const DEFAULT_VISEME_WEIGHTS: VisemeWeights = {
  viseme_sil: 1,
  viseme_PP: 0,
  viseme_FF: 0,
  viseme_TH: 0,
  viseme_DD: 0,
  viseme_kk: 0,
  viseme_CH: 0,
  viseme_SS: 0,
  viseme_nn: 0,
  viseme_RR: 0,
  viseme_aa: 0,
  viseme_E: 0,
  viseme_I: 0,
  viseme_O: 0,
  viseme_U: 0,
};

/** State sent from main thread to the 3D scene (via BroadcastChannel) */
export interface Avatar3DState {
  avatarState: AvatarState;
  mouthOpenness: number;
  visemeWeights: VisemeWeights;
  timestamp: number;
}

export const AVATAR3D_CHANNEL_NAME = "avatar3d-state";

// ---------------------------------------------------------------------------
// Logical bone names → candidate strings across rigs (RPM, Mixamo, Avaturn)
// ---------------------------------------------------------------------------

export type LogicalBone =
  | "Hips" | "Spine" | "Spine1" | "Spine2"
  | "Neck" | "Head"
  | "LeftShoulder" | "LeftUpperArm" | "LeftLowerArm" | "LeftHand"
  | "RightShoulder" | "RightUpperArm" | "RightLowerArm" | "RightHand"
  | "LeftUpperLeg" | "LeftLowerLeg"
  | "RightUpperLeg" | "RightLowerLeg";

export const BONE_NAME_CANDIDATES: Record<LogicalBone, string[]> = {
  Hips:          ["Hips", "hips", "mixamorigHips", "Armature_Hips"],
  Spine:         ["Spine", "spine", "mixamorigSpine", "Armature_Spine"],
  Spine1:        ["Spine1", "spine1", "mixamorigSpine1", "Armature_Spine1"],
  Spine2:        ["Spine2", "spine2", "mixamorigSpine2", "Armature_Spine2"],
  Neck:          ["Neck", "neck", "mixamorigNeck", "Armature_Neck"],
  Head:          ["Head", "head", "mixamorigHead", "Armature_Head"],
  LeftShoulder:  ["LeftShoulder", "leftShoulder", "mixamorigLeftShoulder", "Armature_LeftShoulder"],
  LeftUpperArm:  ["LeftUpperArm", "LeftArm", "leftArm", "mixamorigLeftArm", "Armature_LeftArm"],
  LeftLowerArm:  ["LeftLowerArm", "LeftForeArm", "leftForeArm", "mixamorigLeftForeArm", "Armature_LeftForeArm"],
  LeftHand:      ["LeftHand", "leftHand", "mixamorigLeftHand", "Armature_LeftHand"],
  RightShoulder: ["RightShoulder", "rightShoulder", "mixamorigRightShoulder", "Armature_RightShoulder"],
  RightUpperArm: ["RightUpperArm", "RightArm", "rightArm", "mixamorigRightArm", "Armature_RightArm"],
  RightLowerArm: ["RightLowerArm", "RightForeArm", "rightForeArm", "mixamorigRightForeArm", "Armature_RightForeArm"],
  RightHand:     ["RightHand", "rightHand", "mixamorigRightHand", "Armature_RightHand"],
  LeftUpperLeg:  ["LeftUpperLeg", "LeftUpLeg", "leftUpLeg", "mixamorigLeftUpLeg", "Armature_LeftUpLeg"],
  LeftLowerLeg:  ["LeftLowerLeg", "LeftLeg", "leftLeg", "mixamorigLeftLeg", "Armature_LeftLeg"],
  RightUpperLeg: ["RightUpperLeg", "RightUpLeg", "rightUpLeg", "mixamorigRightUpLeg", "Armature_RightUpLeg"],
  RightLowerLeg: ["RightLowerLeg", "RightLeg", "rightLeg", "mixamorigRightLeg", "Armature_RightLeg"],
};

// ---------------------------------------------------------------------------
// Logical morph target names → candidate strings across rigs
// ---------------------------------------------------------------------------

export type LogicalMorph =
  | "eyeBlinkLeft" | "eyeBlinkRight"
  | "eyeLookInLeft" | "eyeLookOutLeft" | "eyeLookUpLeft" | "eyeLookDownLeft"
  | "eyeLookInRight" | "eyeLookOutRight" | "eyeLookUpRight" | "eyeLookDownRight"
  | "mouthSmileLeft" | "mouthSmileRight"
  | "browInnerUp" | "browUpLeft" | "browUpRight"
  | "jawOpen"
  | "mouthOpen"
  | "mouthFunnel"
  | "mouthPucker";

export const MORPH_NAME_CANDIDATES: Record<LogicalMorph, string[]> = {
  eyeBlinkLeft:    ["eyeBlinkLeft", "eyeBlink_L", "EyeBlinkLeft", "eye_blink_l"],
  eyeBlinkRight:   ["eyeBlinkRight", "eyeBlink_R", "EyeBlinkRight", "eye_blink_r"],
  eyeLookInLeft:   ["eyeLookInLeft", "eyeLookIn_L", "EyeLookInLeft", "eye_lookIn_l"],
  eyeLookOutLeft:  ["eyeLookOutLeft", "eyeLookOut_L", "EyeLookOutLeft", "eye_lookOut_l"],
  eyeLookUpLeft:   ["eyeLookUpLeft", "eyeLookUp_L", "EyeLookUpLeft", "eye_lookUp_l"],
  eyeLookDownLeft: ["eyeLookDownLeft", "eyeLookDown_L", "EyeLookDownLeft", "eye_lookDown_l"],
  eyeLookInRight:  ["eyeLookInRight", "eyeLookIn_R", "EyeLookInRight", "eye_lookIn_r"],
  eyeLookOutRight: ["eyeLookOutRight", "eyeLookOut_R", "EyeLookOutRight", "eye_lookOut_r"],
  eyeLookUpRight:  ["eyeLookUpRight", "eyeLookUp_R", "EyeLookUpRight", "eye_lookUp_r"],
  eyeLookDownRight:["eyeLookDownRight", "eyeLookDown_R", "EyeLookDownRight", "eye_lookDown_r"],
  mouthSmileLeft:  ["mouthSmileLeft", "mouthSmile_L", "MouthSmileLeft", "mouth_smile_l", "mouthSmile"],
  mouthSmileRight: ["mouthSmileRight", "mouthSmile_R", "MouthSmileRight", "mouth_smile_r"],
  browInnerUp:     ["browInnerUp", "browInnerUp_L", "BrowInnerUp", "brow_inner_up"],
  browUpLeft:      ["browUpLeft", "browOuterUp_L", "BrowUpLeft", "brow_up_l", "browOuterUpLeft"],
  browUpRight:     ["browUpRight", "browOuterUp_R", "BrowUpRight", "brow_up_r", "browOuterUpRight"],
  jawOpen:         ["jawOpen", "JawOpen", "jaw_open"],
  mouthOpen:       ["mouthOpen", "MouthOpen", "mouth_open"],
  mouthFunnel:     ["mouthFunnel", "MouthFunnel", "mouth_funnel"],
  mouthPucker:     ["mouthPucker", "MouthPucker", "mouth_pucker"],
};

// ---------------------------------------------------------------------------
// Oculus viseme → ARKit blendshape weights (fallback for ARKit-only models)
// Each viseme maps to a sparse set of ARKit blendshapes with weights [0–1].
// ---------------------------------------------------------------------------

export const OCULUS_TO_ARKIT_VISEME_MAP: Record<
  keyof VisemeWeights,
  Partial<Record<LogicalMorph, number>>
> = {
  viseme_sil: {},
  viseme_PP:  { mouthPucker: 0.7 },
  viseme_FF:  { mouthFunnel: 0.5, jawOpen: 0.1 },
  viseme_TH:  { jawOpen: 0.2, mouthFunnel: 0.3 },
  viseme_DD:  { jawOpen: 0.3 },
  viseme_kk:  { jawOpen: 0.25 },
  viseme_CH:  { jawOpen: 0.3, mouthFunnel: 0.4 },
  viseme_SS:  { jawOpen: 0.15, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },
  viseme_nn:  { jawOpen: 0.1 },
  viseme_RR:  { jawOpen: 0.2, mouthPucker: 0.3 },
  viseme_aa:  { jawOpen: 0.7, mouthOpen: 0.5 },
  viseme_E:   { jawOpen: 0.4, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  viseme_I:   { jawOpen: 0.2, mouthSmileLeft: 0.5, mouthSmileRight: 0.5 },
  viseme_O:   { jawOpen: 0.5, mouthFunnel: 0.6 },
  viseme_U:   { jawOpen: 0.3, mouthPucker: 0.6 },
};
