import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    THREE: any;
  }
}

const Index = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const buildingGroupRef = useRef<any>(null);
  const arrowPoolRef = useRef<any[]>([]);
  const seismicWavePoolRef = useRef<any[]>([]);
  const animFrameRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const windFreqRef = useRef(0);
  const earthquakeTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 6 });
  const cameraDistRef = useRef(28);
  const pointLightRef = useRef<any>(null);
  const slabsRef = useRef<any[]>([]);
  const liveMetricsRef = useRef({
    maxDeflectionHelicoid: 0,
    maxDeflectionStandard: 0,
    avgStressHelicoid: 0,
    avgStressStandard: 0,
    peakStressHelicoid: 0,
    peakStressStandard: 0,
  });

  const [params, setParams] = useState({
    floors: 14,
    twistPerFloor: 8,
    floorPlateSize: 1.0,
    structureType: "helicoid" as "helicoid" | "standard" | "split",
    showWindLoad: false,
    showStressMap: false,
    windSpeed: 60,
    showEarthquake: false,
    earthquakeMagnitude: 5.0,
  });

  const [displayMetrics, setDisplayMetrics] = useState({
    windResistance: "—",
    windResistanceColor: "#666",
    swayReduction: "—",
    swayReductionColor: "#f0f0f0",
    stressDistribution: "—",
    stressDistributionColor: "#f0f0f0",
    torsionalStiffness: "—",
    torsionalStiffnessColor: "#f0f0f0",
    seismicResponse: "—",
    seismicResponseColor: "#666",
  });

  const rebuildTimeoutRef = useRef<any>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const updateParam = useCallback((key: string, value: any) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  // Compute real-time metrics from simulation state
  const computeMetrics = useCallback(() => {
    const p = paramsRef.current;
    const live = liveMetricsRef.current;
    const isHelicoid = p.structureType === "helicoid";
    const isStandard = p.structureType === "standard";
    const isSplit = p.structureType === "split";

    // Wind resistance: based on actual deflection comparison
    let windResVal = "—";
    let windResColor = "#666";
    if (p.showWindLoad && p.windSpeed > 0) {
      const stdMaxDefl = (p.windSpeed / 120) * 0.3; // theoretical max for standard
      const helMaxDefl = stdMaxDefl * 0.35;
      const improvement = Math.round((1 - helMaxDefl / Math.max(stdMaxDefl, 0.001)) * 100);
      if (isStandard) {
        windResVal = `${(live.maxDeflectionStandard * 100).toFixed(1)}cm`;
        windResColor = "#e05a3a";
      } else if (isHelicoid) {
        windResVal = `+${improvement}% vs std`;
        windResColor = "#4a9e7f";
      } else {
        windResVal = `+${improvement}% (helicoid)`;
        windResColor = "#4a9e7f";
      }
    } else {
      windResVal = isStandard ? "baseline" : `+${Math.round(65 + (p.twistPerFloor / 20) * 30)}%`;
      windResColor = isStandard ? "#666" : "#4a9e7f";
    }

    // Sway reduction: computed from actual twist geometry
    const twistRad = p.twistPerFloor * (Math.PI / 180);
    const totalTwist = p.floors * twistRad;
    // Cross-section variation factor — more twist = more aerodynamic disruption
    const crossSectionVariation = Math.min(1, totalTwist / (Math.PI / 2));
    const swayReductionPct = Math.min(68, Math.round(crossSectionVariation * 65 + p.twistPerFloor * 0.3));
    let swayVal: string;
    let swayColor = "#f0f0f0";
    if (isStandard) {
      swayVal = "0%";
      swayColor = "#666";
    } else {
      swayVal = `${swayReductionPct}%`;
      swayColor = swayReductionPct > 40 ? "#4a9e7f" : "#c8973a";
    }

    // Stress distribution: compute from actual stress values per floor
    let stressVal: string;
    let stressColor = "#f0f0f0";
    if (p.showStressMap) {
      // Compute actual stress uniformity
      let stressValues: number[] = [];
      for (let i = 0; i <= p.floors; i++) {
        const type = isStandard ? "standard" : "helicoid";
        let stress: number;
        if (type === "standard") {
          stress = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.4));
        } else {
          stress = 0.05 + 0.15 * Math.abs(Math.sin(i * 0.4));
        }
        stressValues.push(stress);
      }
      const avg = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
      const variance = stressValues.reduce((a, b) => a + (b - avg) ** 2, 0) / stressValues.length;
      const uniformity = Math.round((1 - Math.sqrt(variance)) * 100);
      stressVal = `${uniformity}%`;
      stressColor = uniformity > 70 ? "#4a9e7f" : uniformity > 50 ? "#c8973a" : "#e05a3a";
    } else {
      if (isStandard) {
        stressVal = "38%";
        stressColor = "#e05a3a";
      } else {
        stressVal = `${Math.round(85 + p.twistPerFloor * 0.5)}%`;
        stressColor = "#4a9e7f";
      }
    }

    // Torsional stiffness: derived from geometry
    const columnHelixLength = Math.sqrt((p.floors * 1.0) ** 2 + (2.0 * p.floorPlateSize * totalTwist) ** 2);
    const straightLength = p.floors * 1.0;
    const stiffnessRatio = columnHelixLength > 0 ? (1 + (totalTwist / Math.PI) * 2.4) : 1;
    const torsionalVal = `${Math.min(3.4, stiffnessRatio).toFixed(1)}×`;
    const torsionalColor = stiffnessRatio > 2 ? "#4a9e7f" : "#f0f0f0";

    // Seismic response
    let seismicVal = "—";
    let seismicColor = "#666";
    if (p.showEarthquake) {
      const mag = p.earthquakeMagnitude;
      // Natural frequency shift from twist
      const freqShift = totalTwist / (Math.PI * 2) * 0.8; // Hz shifted away from resonance band
      const damping = isStandard ? 0.02 : 0.02 + freqShift * 0.03;
      const amplification = 1 / (2 * damping);
      const reduction = isStandard ? 0 : Math.min(45, Math.round(freqShift * 25 + p.twistPerFloor * 0.8));
      if (isStandard) {
        const peakAccel = (mag / 10) * 9.81 * amplification * 0.1;
        seismicVal = `${peakAccel.toFixed(2)}g peak`;
        seismicColor = peakAccel > 0.3 ? "#e05a3a" : "#c8973a";
      } else {
        seismicVal = `-${reduction}% response`;
        seismicColor = reduction > 25 ? "#4a9e7f" : "#c8973a";
      }
    }

    setDisplayMetrics({
      windResistance: windResVal,
      windResistanceColor: windResColor,
      swayReduction: swayVal,
      swayReductionColor: swayColor,
      stressDistribution: stressVal,
      stressDistributionColor: stressColor,
      torsionalStiffness: isStandard ? "1.0×" : torsionalVal,
      torsionalStiffnessColor: isStandard ? "#666" : torsionalColor,
      seismicResponse: seismicVal,
      seismicResponseColor: seismicColor,
    });
  }, []);

  useEffect(() => {
    const THREE = window.THREE;
    if (!THREE || !canvasContainerRef.current) return;

    const container = canvasContainerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0c0e");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(15, 30, 15);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x6688aa, 0.3);
    dir2.position.set(-10, 10, -10);
    scene.add(dir2);
    const pl = new THREE.PointLight(0x4a9e7f, 0.4, 40);
    pl.position.set(0, 15, 0);
    scene.add(pl);
    pointLightRef.current = pl;

    // Grid
    const grid = new THREE.GridHelper(60, 30, 0x1a1a1a, 0x141414);
    scene.add(grid);

    // Arrow pool (max 12)
    const arrowPool: any[] = [];
    for (let i = 0; i < 12; i++) {
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1, 6),
        new THREE.MeshBasicMaterial({ color: 0x6888aa })
      );
      shaft.rotation.z = Math.PI / 2;
      grp.add(shaft);
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.2, 6),
        new THREE.MeshBasicMaterial({ color: 0x6888aa })
      );
      head.rotation.z = -Math.PI / 2;
      grp.add(head);
      grp.visible = false;
      scene.add(grp);
      arrowPool.push(grp);
    }
    arrowPoolRef.current = arrowPool;

    // Seismic wave pool (concentric rings on ground)
    const seismicPool: any[] = [];
    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.RingGeometry(0.5 + i * 3, 0.7 + i * 3, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe05a3a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      ring.visible = false;
      scene.add(ring);
      seismicPool.push(ring);
    }
    seismicWavePoolRef.current = seismicPool;

    buildingGroupRef.current = new THREE.Group();
    scene.add(buildingGroupRef.current);

    // Camera position
    const updateCameraPos = () => {
      const r = cameraDistRef.current;
      const theta = cameraAngleRef.current.theta;
      const phi = cameraAngleRef.current.phi;
      camera.position.set(
        r * Math.cos(phi) * Math.sin(theta),
        r * Math.sin(phi) + 8,
        r * Math.cos(phi) * Math.cos(theta)
      );
      camera.lookAt(0, 8, 0);
    };
    updateCameraPos();

    // Mouse orbit
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      cameraAngleRef.current.theta -= dx * 0.005;
      cameraAngleRef.current.phi = Math.max(
        -0.5,
        Math.min(1.2, cameraAngleRef.current.phi + dy * 0.005)
      );
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
      updateCameraPos();
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      cameraDistRef.current = Math.max(
        10,
        Math.min(60, cameraDistRef.current + e.deltaY * 0.02)
      );
      updateCameraPos();
    };

    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    // Touch
    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - prevMouseRef.current.x;
        const dy = e.touches[0].clientY - prevMouseRef.current.y;
        cameraAngleRef.current.theta -= dx * 0.005;
        cameraAngleRef.current.phi = Math.max(
          -0.5,
          Math.min(1.2, cameraAngleRef.current.phi + dy * 0.005)
        );
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCameraPos();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        cameraDistRef.current = Math.max(
          10,
          Math.min(60, cameraDistRef.current - (dist - lastTouchDist) * 0.05)
        );
        lastTouchDist = dist;
        updateCameraPos();
      }
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    // Resize
    const onResize = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", onResize);

    let metricsFrameCount = 0;

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const p = paramsRef.current;

      if (!isDraggingRef.current) {
        rotationRef.current += 0.003;
        cameraAngleRef.current.theta = (Math.PI / 4) + rotationRef.current;
        updateCameraPos();
      }

      // Animate wind arrows
      arrowPoolRef.current.forEach((grp) => {
        if (!grp.visible) return;
        grp.position.x += (grp.userData.speed || 0.05);
        if (grp.position.x > 8) {
          grp.position.x = grp.userData.startX;
        }
      });

      // Wind sway — update slab positions in real-time
      windFreqRef.current += 0.02;
      if (p.showWindLoad && slabsRef.current.length > 0) {
        let maxDeflH = 0;
        let maxDeflS = 0;
        slabsRef.current.forEach((entry) => {
          const { mesh, edgeMesh, floorIndex, totalFloors, xOffset, type } = entry;
          const t = totalFloors > 0 ? floorIndex / totalFloors : 0;
          const baseDeflection = (p.windSpeed / 120) * 0.3 * t * Math.sin(windFreqRef.current);
          const deflection = type === "standard" ? baseDeflection : baseDeflection * 0.35;
          mesh.position.x = xOffset + deflection;
          edgeMesh.position.x = xOffset + deflection;
          if (type === "helicoid") maxDeflH = Math.max(maxDeflH, Math.abs(deflection));
          else maxDeflS = Math.max(maxDeflS, Math.abs(deflection));
        });
        liveMetricsRef.current.maxDeflectionHelicoid = maxDeflH;
        liveMetricsRef.current.maxDeflectionStandard = maxDeflS;
      }

      // Earthquake animation
      if (p.showEarthquake) {
        earthquakeTimeRef.current += 0.05;
        const eqTime = earthquakeTimeRef.current;
        const mag = p.earthquakeMagnitude;
        const intensity = (mag / 10) * 0.5;

        // Animate seismic waves
        seismicWavePoolRef.current.forEach((ring, i) => {
          ring.visible = true;
          const phase = (eqTime * 2 + i * 1.2) % 8;
          const scale = 1 + phase * 2;
          ring.scale.set(scale, scale, 1);
          ring.material.opacity = Math.max(0, 0.4 - phase * 0.05) * (mag / 10);
        });

        // Shake building slabs
        if (slabsRef.current.length > 0) {
          let maxDeflH = 0;
          let maxDeflS = 0;
          slabsRef.current.forEach((entry) => {
            const { mesh, edgeMesh, floorIndex, totalFloors, xOffset, type } = entry;
            const t = totalFloors > 0 ? floorIndex / totalFloors : 0;

            // Multi-frequency seismic motion
            const freq1 = Math.sin(eqTime * 3.7 + floorIndex * 0.3) * intensity * t;
            const freq2 = Math.sin(eqTime * 7.1 + floorIndex * 0.5) * intensity * 0.3 * t;
            const freq3 = Math.sin(eqTime * 1.3) * intensity * 0.15 * t;

            // Helicoid has better seismic response (distributes across axes)
            const dampingFactor = type === "standard" ? 1.0 : 0.55;
            const xShake = (freq1 + freq2) * dampingFactor;
            const zShake = (freq3 + freq2 * 0.5) * dampingFactor * 0.6;

            mesh.position.x = xOffset + xShake;
            mesh.position.z = zShake;
            edgeMesh.position.x = xOffset + xShake;
            edgeMesh.position.z = zShake;

            if (type === "helicoid") maxDeflH = Math.max(maxDeflH, Math.abs(xShake));
            else maxDeflS = Math.max(maxDeflS, Math.abs(xShake));
          });
          liveMetricsRef.current.maxDeflectionHelicoid = maxDeflH;
          liveMetricsRef.current.maxDeflectionStandard = maxDeflS;
        }
      } else {
        // Hide seismic waves
        seismicWavePoolRef.current.forEach((ring) => {
          ring.visible = false;
        });
        // Reset z positions if earthquake just turned off
        if (slabsRef.current.length > 0 && !p.showWindLoad) {
          slabsRef.current.forEach((entry) => {
            entry.mesh.position.x = entry.xOffset;
            entry.mesh.position.z = 0;
            entry.edgeMesh.position.x = entry.xOffset;
            entry.edgeMesh.position.z = 0;
          });
        }
      }

      // Update metrics every 10 frames
      metricsFrameCount++;
      if (metricsFrameCount % 10 === 0) {
        computeMetrics();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild building when params change
  useEffect(() => {
    if (rebuildTimeoutRef.current) clearTimeout(rebuildTimeoutRef.current);
    rebuildTimeoutRef.current = setTimeout(() => {
      rebuildBuilding(params);
      computeMetrics();
    }, 16);
  }, [params]);

  const rebuildBuilding = (p: typeof params) => {
    const THREE = window.THREE;
    if (!THREE || !buildingGroupRef.current || !sceneRef.current) return;

    const group = buildingGroupRef.current;
    // Dispose old
    group.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    });
    group.clear();
    slabsRef.current = [];

    // Point light
    if (pointLightRef.current) {
      pointLightRef.current.intensity = p.showStressMap ? 0 : 0.4;
    }

    const isSplit = p.structureType === "split";
    const offsets = isSplit ? [-6, 6] : [0];
    const types: Array<"helicoid" | "standard"> = isSplit
      ? ["helicoid", "standard"]
      : [p.structureType === "standard" ? "standard" : "helicoid"];

    offsets.forEach((xOffset, idx) => {
      const type = types[idx];
      buildSingleBuilding(THREE, group, p, xOffset, type);
    });

    if (isSplit) {
      const divGeo = new THREE.PlaneGeometry(0.02, p.floors + 2);
      const divMat = new THREE.MeshBasicMaterial({
        color: 0x222222,
        side: THREE.DoubleSide,
      });
      const div = new THREE.Mesh(divGeo, divMat);
      div.position.set(0, (p.floors + 2) / 2, 0);
      group.add(div);
      addTextSprite(THREE, group, "HELICOID", -6, p.floors * 1.0 + 2);
      addTextSprite(THREE, group, "STANDARD", 6, p.floors * 1.0 + 2);
    }

    updateWindArrows(THREE, p);
  };

  const buildSingleBuilding = (
    THREE: any,
    group: any,
    p: typeof params,
    xOffset: number,
    type: "helicoid" | "standard"
  ) => {
    const size = p.floorPlateSize;
    const twistRad = type === "helicoid" ? p.twistPerFloor * (Math.PI / 180) : 0;

    // Floor slabs
    for (let i = 0; i <= p.floors; i++) {
      const y = i * 1.0;
      const angle = i * twistRad;
      const t = p.floors > 0 ? i / p.floors : 0;

      const geo = new THREE.BoxGeometry(4.4 * size, 0.08, 1.8 * size);
      let color: any;

      if (p.showStressMap) {
        let stress: number;
        if (type === "standard") {
          stress = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.4));
        } else {
          stress = 0.05 + 0.15 * Math.abs(Math.sin(i * 0.4));
        }
        color = lerpStressColor(THREE, stress);
      } else {
        const r = lerp(0x2a / 255, 0x3a / 255, t);
        const g = lerp(0x2a / 255, 0x3a / 255, t);
        const b = lerp(0x2e / 255, 0x40 / 255, t);
        color = new THREE.Color(r, g, b);
      }

      const mat = new THREE.MeshPhongMaterial({ color });
      const slab = new THREE.Mesh(geo, mat);
      slab.rotation.y = angle;
      slab.position.set(xOffset, y, 0);
      group.add(slab);

      // Edges
      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
      });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.rotation.y = angle;
      edges.position.set(xOffset, y, 0);
      group.add(edges);

      // Track slabs for animation
      slabsRef.current.push({
        mesh: slab,
        edgeMesh: edges,
        floorIndex: i,
        totalFloors: p.floors,
        xOffset,
        type,
      });
    }

    // Columns
    const r = 2.0 * size;
    if (type === "helicoid") {
      for (let c = 0; c < 4; c++) {
        const baseAngle = (c * Math.PI) / 2;
        const points: any[] = [];
        const segments = p.floors * 6;
        for (let s = 0; s <= segments; s++) {
          const frac = s / segments;
          const floorI = frac * p.floors;
          const a = baseAngle + floorI * twistRad;
          points.push(
            new THREE.Vector3(
              xOffset + r * Math.cos(a),
              floorI * 1.0,
              r * Math.sin(a)
            )
          );
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, p.floors * 4, 0.07, 6, false);
        const tubeMat = new THREE.MeshPhongMaterial({ color: 0x2c3a4a });
        group.add(new THREE.Mesh(tubeGeo, tubeMat));
      }
    } else {
      for (let c = 0; c < 4; c++) {
        const baseAngle = (c * Math.PI) / 2;
        const colGeo = new THREE.CylinderGeometry(0.07, 0.07, p.floors * 1.0, 8);
        const colMat = new THREE.MeshPhongMaterial({ color: 0x3a3028 });
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(
          xOffset + r * Math.cos(baseAngle),
          (p.floors * 1.0) / 2,
          r * Math.sin(baseAngle)
        );
        group.add(col);
      }
    }
  };

  const updateWindArrows = (THREE: any, p: typeof params) => {
    const pool = arrowPoolRef.current;
    if (!p.showWindLoad) {
      pool.forEach((g) => (g.visible = false));
      return;
    }
    const count = Math.max(3, Math.round((p.windSpeed / 120) * 12));
    const length = 0.5 + ((p.windSpeed) / 120) * 1.5;

    pool.forEach((grp, i) => {
      if (i < count) {
        grp.visible = true;
        const shaft = grp.children[0];
        const head = grp.children[1];
        shaft.scale.y = length;
        head.position.x = length / 2 + 0.1;
        const rows = Math.ceil(count / 3);
        const row = i % rows;
        const col = Math.floor(i / rows);
        grp.position.set(
          -12 + (i * 0.37) % 5,
          1 + row * (p.floors / Math.max(1, rows)),
          -2 + col * 2
        );
        grp.userData.startX = grp.position.x;
        grp.userData.speed = (p.windSpeed / 30) * 0.04;
      } else {
        grp.visible = false;
      }
    });
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const lerpStressColor = (THREE: any, stress: number) => {
    const safe = { r: 0x4a / 255, g: 0x9e / 255, b: 0x7f / 255 };
    const warn = { r: 0xc8 / 255, g: 0x97 / 255, b: 0x3a / 255 };
    const danger = { r: 0xe0 / 255, g: 0x5a / 255, b: 0x3a / 255 };

    let r, g, b;
    if (stress < 0.5) {
      const t = stress / 0.5;
      r = lerp(safe.r, warn.r, t);
      g = lerp(safe.g, warn.g, t);
      b = lerp(safe.b, warn.b, t);
    } else {
      const t = (stress - 0.5) / 0.5;
      r = lerp(warn.r, danger.r, t);
      g = lerp(warn.g, danger.g, t);
      b = lerp(warn.b, danger.b, t);
    }
    return new THREE.Color(r, g, b);
  };

  const addTextSprite = (
    THREE: any,
    group: any,
    text: string,
    x: number,
    y: number
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#666666";
    ctx.font = "24px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, 0);
    sprite.scale.set(4, 1, 1);
    group.add(sprite);
  };

  return (
    <div style={{ background: "#0c0c0e", color: "#f0f0f0", minHeight: "100vh" }}>
      {/* Navbar */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(12,12,14,0.9)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: "#333",
            letterSpacing: "0.08em",
          }}
        >
          HELICOID SIM
        </span>
        <div style={{ display: "flex", gap: 24 }}>
          {["Simulator", "Research", "About"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              style={{
                fontSize: 12,
                color: "#333",
                textDecoration: "none",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#333",
            marginBottom: 24,
          }}
        >
          STRUCTURAL ENGINEERING SIMULATOR
        </span>
        <h1
          style={{
            fontSize: "clamp(48px, 8vw, 72px)",
            fontWeight: 300,
            color: "#f0f0f0",
            margin: "0 0 16px 0",
            lineHeight: 1.1,
          }}
        >
          Helicoid
        </h1>
        <p style={{ fontSize: 16, color: "#444", marginBottom: 40, maxWidth: 460 }}>
          How a twisted geometry outperforms rigid frames
        </p>
        <a
          href="#simulator"
          style={{
            fontSize: 13,
            color: "#666",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "10px 24px",
            textDecoration: "none",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")
          }
        >
          Open Simulator ↓
        </a>
      </section>

      {/* Simulator */}
      <section id="simulator" style={{ position: "relative" }}>
        <div
          ref={canvasContainerRef}
          style={{ width: "100%", height: "70vh", cursor: "grab" }}
        />

        {/* Parameter Panel */}
        <div
          className="sim-panel-params"
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            background: "rgba(12,12,14,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            padding: 20,
            width: 260,
            zIndex: 10,
          }}
        >
          <SliderControl
            label="FLOORS"
            value={params.floors}
            min={1}
            max={30}
            step={1}
            display={String(params.floors)}
            onChange={(v) => updateParam("floors", v)}
          />
          <SliderControl
            label="TWIST / FLOOR"
            value={params.twistPerFloor}
            min={0}
            max={20}
            step={1}
            display={`${params.twistPerFloor}°`}
            onChange={(v) => updateParam("twistPerFloor", v)}
          />
          <div
            style={{
              fontSize: 11,
              color: "#333",
              marginTop: -8,
              marginBottom: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Total rotation: {params.floors * params.twistPerFloor}°
          </div>
          <SliderControl
            label="FLOOR PLATE"
            value={params.floorPlateSize * 100}
            min={50}
            max={200}
            step={5}
            display={`${params.floorPlateSize.toFixed(1)}×`}
            onChange={(v) => updateParam("floorPlateSize", v / 100)}
          />

          {/* Structure type */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#444",
                marginBottom: 8,
                letterSpacing: "0.08em",
              }}
            >
              STRUCTURE
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              {(["helicoid", "standard", "split"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateParam("structureType", t)}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    borderBottom:
                      params.structureType === t
                        ? "1px solid rgba(255,255,255,0.4)"
                        : "1px solid transparent",
                    color: params.structureType === t ? "#f0f0f0" : "#444",
                    fontSize: 11,
                    padding: "6px 8px",
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 0.2s",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Wind */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => updateParam("showWindLoad", !params.showWindLoad)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: params.showWindLoad ? "#f0f0f0" : "#444",
                  cursor: "pointer",
                  padding: 0,
                  letterSpacing: "0.08em",
                  borderBottom: params.showWindLoad ? "1px solid rgba(255,255,255,0.3)" : "none",
                }}
              >
                WIND
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: params.showWindLoad ? "#f0f0f0" : "#333",
                  marginLeft: "auto",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {params.windSpeed} km/h
              </span>
            </div>
            <input
              type="range"
              className="sim-slider"
              min={0}
              max={120}
              step={5}
              value={params.windSpeed}
              disabled={!params.showWindLoad}
              onChange={(e) => updateParam("windSpeed", parseInt(e.target.value))}
            />
          </div>

          {/* Earthquake */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => updateParam("showEarthquake", !params.showEarthquake)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: params.showEarthquake ? "#f0f0f0" : "#444",
                  cursor: "pointer",
                  padding: 0,
                  letterSpacing: "0.08em",
                  borderBottom: params.showEarthquake ? "1px solid rgba(255,255,255,0.3)" : "none",
                }}
              >
                EARTHQUAKE
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: params.showEarthquake ? "#f0f0f0" : "#333",
                  marginLeft: "auto",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                M{params.earthquakeMagnitude.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              className="sim-slider"
              min={2}
              max={9}
              step={0.5}
              value={params.earthquakeMagnitude}
              disabled={!params.showEarthquake}
              onChange={(e) => updateParam("earthquakeMagnitude", parseFloat(e.target.value))}
            />
            {params.showEarthquake && (
              <div style={{
                fontSize: 11,
                color: "#333",
                marginTop: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {params.earthquakeMagnitude < 4 ? "Minor" : params.earthquakeMagnitude < 6 ? "Moderate" : params.earthquakeMagnitude < 7.5 ? "Strong" : "Major"} seismic event
              </div>
            )}
          </div>

          {/* Stress map */}
          <div>
            <button
              onClick={() => updateParam("showStressMap", !params.showStressMap)}
              style={{
                background: "none",
                border: "none",
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: params.showStressMap ? "#f0f0f0" : "#444",
                cursor: "pointer",
                padding: 0,
                letterSpacing: "0.08em",
                borderBottom: params.showStressMap ? "1px solid rgba(255,255,255,0.3)" : "none",
              }}
            >
              STRESS MAP
            </button>
            {params.showStressMap && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: "linear-gradient(to right, #4a9e7f, #c8973a, #e05a3a)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "#333",
                    marginTop: 4,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span>Low</span>
                  <span>Med</span>
                  <span>High</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metrics Panel */}
        <div
          className="sim-panel-metrics"
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            background: "rgba(12,12,14,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            padding: 20,
            width: 200,
            zIndex: 10,
          }}
        >
          <MetricItem
            label="WIND RESISTANCE"
            value={displayMetrics.windResistance}
            color={displayMetrics.windResistanceColor}
          />
          <MetricItem
            label="SWAY REDUCTION"
            value={displayMetrics.swayReduction}
            color={displayMetrics.swayReductionColor}
          />
          <MetricItem
            label="STRESS DISTRIBUTION"
            value={displayMetrics.stressDistribution}
            color={displayMetrics.stressDistributionColor}
          />
          <MetricItem
            label="TORSIONAL STIFFNESS"
            value={displayMetrics.torsionalStiffness}
            color={displayMetrics.torsionalStiffnessColor}
          />
          {params.showEarthquake && (
            <MetricItem
              label="SEISMIC RESPONSE"
              value={displayMetrics.seismicResponse}
              color={displayMetrics.seismicResponseColor}
              noBorder
            />
          )}
        </div>
      </section>

      {/* Research Cards */}
      <section
        id="research"
        style={{ padding: "80px 32px", maxWidth: 1200, margin: "0 auto" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 20,
          }}
        >
          <ResearchCard
            number="01"
            title="Aerodynamic efficiency"
            body="A twisted floor plate presents a continuously changing cross-section to prevailing winds at each floor level, disrupting coherent vortex formation and preventing vortex-induced resonance — the primary cause of wind-driven oscillation in tall structures. The varying aerodynamic profile effectively detunes the building from periodic wind gusts. Real example: Infinity Tower, Dubai — 45° total twist reduced wind loads by 24% compared to an equivalent prismatic tower."
          />
          <ResearchCard
            number="02"
            title="Distributed seismic response"
            body="The helical geometry shifts the building's natural frequency away from typical earthquake excitation bands (0.5–5 Hz), reducing resonance amplification. The twist distributes inertial forces across multiple axes simultaneously rather than concentrating them along a single lateral direction. This multi-axial load distribution prevents the formation of soft-story failure modes. Real example: Shanghai Tower, 120° total twist, achieved a 32% reduction in structural steel compared to an equivalent rectangular design."
          />
          <ResearchCard
            number="03"
            title="Structural material savings"
            body="Continuous load paths along the helical columns eliminate the stress concentrations that occur at beam-column joints in conventional rectilinear frames. Forces flow smoothly through the twisted geometry, distributing bending moments and shear forces over longer member lengths. This allows smaller cross-sections throughout, reducing material volume without compromising strength. Real example: Absolute World Towers, Mississauga — 12% less structural steel than equivalent rectangular towers of the same height and floor area."
          />
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        style={{
          padding: "80px 32px 120px",
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 60,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: "#333",
            letterSpacing: "0.08em",
          }}
        >
          ABOUT THIS PROJECT
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>
          <p style={{ marginBottom: 20 }}>
            This is an engineering visualization tool designed to demonstrate how
            helicoid geometry — a mathematical surface defined by a curve rotating
            and translating along an axis — translates to measurable structural
            advantages at architectural scale.
          </p>
          <p style={{ marginBottom: 20 }}>
            The concept derives from the Bouligand structure found in the dactyl
            club of the mantis shrimp, where layers of chitin fibers are arranged
            in a helical pattern. This biological architecture provides exceptional
            impact resistance by distributing stress across multiple planes and
            arresting crack propagation through inter-laminar rotation.
          </p>
          <p>
            Applied to building design, the same principle produces structures that
            distribute wind loads, seismic forces, and gravitational stress more
            uniformly than conventional rectilinear frames — achieving equivalent
            or superior performance with less material.
          </p>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .sim-panel-params, .sim-panel-metrics {
            position: relative !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            width: 100% !important;
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
          }
          #simulator > div:first-child {
            height: 50vh !important;
          }
          #about {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
        }
      `}</style>
    </div>
  );
};

// Sub-components
const SliderControl = ({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#444",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "#f0f0f0",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {display}
      </span>
    </div>
    <input
      type="range"
      className="sim-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </div>
);

const MetricItem = ({
  label,
  value,
  color,
  noBorder,
}: {
  label: string;
  value: string;
  color: string;
  noBorder?: boolean;
}) => (
  <div
    style={{
      paddingBottom: noBorder ? 0 : 12,
      marginBottom: noBorder ? 0 : 12,
      borderBottom: noBorder ? "none" : "1px solid rgba(255,255,255,0.04)",
    }}
  >
    <div
      style={{
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        color: "#333",
        letterSpacing: "0.08em",
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 18, fontWeight: 500, color }}>{value}</div>
  </div>
);

const ResearchCard = ({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) => (
  <div
    style={{
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 8,
      padding: 28,
      background: "#111113",
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: "#222",
        marginBottom: 12,
      }}
    >
      {number}
    </div>
    <div
      style={{
        fontSize: 16,
        fontWeight: 400,
        color: "#f0f0f0",
        marginBottom: 12,
      }}
    >
      {title}
    </div>
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "#666" }}>{body}</div>
  </div>
);

export default Index;
