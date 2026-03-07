export function Avatar3DLighting() {
  return (
    <>
      {/* Ambient fill */}
      <ambientLight intensity={0.5} />

      {/* Key light — warm, upper right (no shadows to avoid PCFSoftShadowMap spam) */}
      <directionalLight
        position={[3, 4, 5]}
        intensity={1.2}
        color="#fff5e6"
      />

      {/* Fill light — cool, left */}
      <directionalLight
        position={[-3, 2, 3]}
        intensity={0.5}
        color="#cce0ff"
      />

      {/* Rim / back light */}
      <directionalLight
        position={[0, 3, -4]}
        intensity={0.6}
        color="#e6e0ff"
      />
    </>
  );
}
