/**
 * Worker entry point for the 3D avatar offscreen rendering.
 * Minimal: imports render from @react-three/offscreen and renders the scene.
 */
import { render } from "@react-three/offscreen";
import Avatar3DScene from "./Avatar3DScene";

render(<Avatar3DScene />);
