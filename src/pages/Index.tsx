import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    THREE: any;
  }
}

type SimMode = "structural" | "crack";

const Index = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const buildingGroupRef = useRef<any>(null);
  const arrowPoolRef = useRef<any[]>([]);
  const seismicWavePoolRef = useRef<any[]>([]);
  const debrisPoolRef = useRef<any[]>([]);
  const crackLinesRef = useRef<any[]>([]);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const energyHistoryRef = useRef<{ time: number; helDiss: number; stdDiss: number; helAbs: number; stdAbs: number }[]>([]);
  const simTimeRef = useRef(0);
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
  const columnsRef = useRef<any[]>([]);
  const collapseStateRef = useRef({
    helicoidCollapsed: false,
    standardCollapsed: false,
    helicoidCollapseTime: 0,
    standardCollapseTime: 0,
    helicoidCollapseFloor: -1,
    standardCollapseFloor: -1,
  });
  const energyRef = useRef({
    helicoidDissipated: 0,
    helicoidAbsorbed: 0,
    standardDissipated: 0,
    standardAbsorbed: 0,
    inputEnergy: 0,
  });

  const [simMode, setSimMode] = useState<SimMode>("structural");
  const [params, setParams] = useState({
    floors: 14,
    twistPerFloor: 8,
    floorPlateSize: 1.0,
    structureType: "split" as "helicoid" | "standard" | "split",
    showWindLoad: false,
    showStressMap: false,
    windSpeed: 60,
    showEarthquake: false,
    earthquakeMagnitude: 5.0,
  });

  const [displayMetrics, setDisplayMetrics] = useState({
    windResistance: "—",
    windResistanceColor: "#4a6b5c",
    swayReduction: "—",
    swayReductionColor: "#d4e8df",
    stressDistribution: "—",
    stressDistributionColor: "#d4e8df",
    seismicResponse: "—",
    seismicResponseColor: "#4a6b5c",
    helicoidEnergy: "0 kJ",
    helicoidEnergyColor: "#4a9e7f",
    standardEnergy: "0 kJ",
    standardEnergyColor: "#e05a3a",
    energyDissipatedH: "0 kJ",
    energyDissipatedS: "0 kJ",
    energyAbsorbedH: "0 kJ",
    energyAbsorbedS: "0 kJ",
    structuralIntegrityH: "100%",
    structuralIntegrityS: "100%",
    integrityColorH: "#4a9e7f",
    integrityColorS: "#4a9e7f",
    collapseStatus: "",
  });

  const rebuildTimeoutRef = useRef<any>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const simModeRef = useRef(simMode);
  simModeRef.current = simMode;

  const updateParam = useCallback((key: string, value: any) => {
    // Reset collapse when changing params
    collapseStateRef.current = {
      helicoidCollapsed: false,
      standardCollapsed: false,
      helicoidCollapseTime: 0,
      standardCollapseTime: 0,
      helicoidCollapseFloor: -1,
      standardCollapseFloor: -1,
    };
    energyRef.current = {
      helicoidDissipated: 0,
      helicoidAbsorbed: 0,
      standardDissipated: 0,
      standardAbsorbed: 0,
      inputEnergy: 0,
    };
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const computeMetrics = useCallback(() => {
    const p = paramsRef.current;
    const cs = collapseStateRef.current;
    const en = energyRef.current;
    const isHelicoid = p.structureType === "helicoid";
    const isStandard = p.structureType === "standard";

    // Wind resistance
    let windResVal = "—", windResColor = "#4a6b5c";
    if (p.showWindLoad && p.windSpeed > 0) {
      const stdDefl = (p.windSpeed / 120) * 0.3;
      const helDefl = stdDefl * 0.35;
      const improvement = Math.round((1 - helDefl / Math.max(stdDefl, 0.001)) * 100);
      if (isStandard) {
        windResVal = `${(stdDefl * 100).toFixed(1)}cm deflection`;
        windResColor = "#e05a3a";
      } else {
        windResVal = `+${improvement}% vs standard`;
        windResColor = "#4a9e7f";
      }
    }

    // Sway reduction
    const twistRad = p.twistPerFloor * (Math.PI / 180);
    const totalTwist = p.floors * twistRad;
    const crossVar = Math.min(1, totalTwist / (Math.PI / 2));
    const swayPct = Math.min(68, Math.round(crossVar * 65 + p.twistPerFloor * 0.3));
    const swayVal = isStandard ? "0%" : `${swayPct}%`;
    const swayColor = isStandard ? "#4a6b5c" : swayPct > 40 ? "#4a9e7f" : "#c8973a";

    // Stress
    let stressVal = "—", stressColor = "#d4e8df";
    if (p.showStressMap) {
      const stressValues: number[] = [];
      for (let i = 0; i <= p.floors; i++) {
        const type = isStandard ? "standard" : "helicoid";
        stressValues.push(type === "standard" ? 0.3 + 0.7 * Math.abs(Math.sin(i * 0.4)) : 0.05 + 0.15 * Math.abs(Math.sin(i * 0.4)));
      }
      const avg = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
      const variance = stressValues.reduce((a, b) => a + (b - avg) ** 2, 0) / stressValues.length;
      const uniformity = Math.round((1 - Math.sqrt(variance)) * 100);
      stressVal = `${uniformity}% uniform`;
      stressColor = uniformity > 70 ? "#4a9e7f" : uniformity > 50 ? "#c8973a" : "#e05a3a";
    }

    // Seismic
    let seismicVal = "—", seismicColor = "#4a6b5c";
    if (p.showEarthquake) {
      const mag = p.earthquakeMagnitude;
      const freqShift = totalTwist / (Math.PI * 2) * 0.8;
      const reduction = isStandard ? 0 : Math.min(45, Math.round(freqShift * 25 + p.twistPerFloor * 0.8));
      if (isStandard) {
        const damping = 0.02;
        const peakAccel = (mag / 10) * 9.81 * (1 / (2 * damping)) * 0.1;
        seismicVal = `${peakAccel.toFixed(2)}g peak`;
        seismicColor = peakAccel > 0.3 ? "#e05a3a" : "#c8973a";
      } else {
        seismicVal = `-${reduction}% response`;
        seismicColor = reduction > 25 ? "#4a9e7f" : "#c8973a";
      }
    }

    // Structural integrity
    const windForce = p.showWindLoad ? (p.windSpeed / 120) : 0;
    const eqForce = p.showEarthquake ? (p.earthquakeMagnitude / 10) : 0;
    const totalForce = windForce + eqForce;
    const stdIntegrity = Math.max(0, Math.round((1 - totalForce * 0.8) * 100));
    const helIntegrity = Math.max(0, Math.round((1 - totalForce * 0.35) * 100));

    let collapseStatus = "";
    if (cs.standardCollapsed && !cs.helicoidCollapsed) collapseStatus = "STANDARD COLLAPSED";
    else if (cs.helicoidCollapsed && cs.standardCollapsed) collapseStatus = "BOTH COLLAPSED";
    else if (cs.helicoidCollapsed) collapseStatus = "HELICOID COLLAPSED";

    setDisplayMetrics({
      windResistance: windResVal,
      windResistanceColor: windResColor,
      swayReduction: swayVal,
      swayReductionColor: swayColor,
      stressDistribution: stressVal,
      stressDistributionColor: stressColor,
      seismicResponse: seismicVal,
      seismicResponseColor: seismicColor,
      helicoidEnergy: `${en.helicoidAbsorbed.toFixed(0)} kJ`,
      helicoidEnergyColor: "#4a9e7f",
      standardEnergy: `${en.standardAbsorbed.toFixed(0)} kJ`,
      standardEnergyColor: "#e05a3a",
      energyDissipatedH: `${en.helicoidDissipated.toFixed(0)} kJ`,
      energyDissipatedS: `${en.standardDissipated.toFixed(0)} kJ`,
      energyAbsorbedH: `${en.helicoidAbsorbed.toFixed(0)} kJ`,
      energyAbsorbedS: `${en.standardAbsorbed.toFixed(0)} kJ`,
      structuralIntegrityH: cs.helicoidCollapsed ? "FAILED" : `${helIntegrity}%`,
      structuralIntegrityS: cs.standardCollapsed ? "FAILED" : `${stdIntegrity}%`,
      integrityColorH: cs.helicoidCollapsed ? "#e05a3a" : helIntegrity > 50 ? "#4a9e7f" : "#c8973a",
      integrityColorS: cs.standardCollapsed ? "#e05a3a" : stdIntegrity > 50 ? "#4a9e7f" : "#c8973a",
      collapseStatus,
    });
  }, []);

  useEffect(() => {
    const THREE = window.THREE;
    if (!THREE || !canvasContainerRef.current) return;

    const container = canvasContainerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080c0a");
    scene.fog = new THREE.Fog("#080c0a", 40, 80);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights - green tinted
    scene.add(new THREE.AmbientLight(0x1a3a2a, 0.4));
    const dir1 = new THREE.DirectionalLight(0xccddcc, 0.7);
    dir1.position.set(15, 30, 15);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x2a5a4a, 0.3);
    dir2.position.set(-10, 10, -10);
    scene.add(dir2);
    const pl = new THREE.PointLight(0x4a9e7f, 0.6, 40);
    pl.position.set(0, 15, 0);
    scene.add(pl);
    pointLightRef.current = pl;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x0a0f0c, transparent: true, opacity: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // Grid - green tinted
    const grid = new THREE.GridHelper(60, 30, 0x122a1e, 0x0e1f15);
    scene.add(grid);

    // Arrow pool
    const arrowPool: any[] = [];
    for (let i = 0; i < 12; i++) {
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1, 6),
        new THREE.MeshBasicMaterial({ color: 0x4a9e7f, transparent: true, opacity: 0.6 })
      );
      shaft.rotation.z = Math.PI / 2;
      grp.add(shaft);
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.25, 6),
        new THREE.MeshBasicMaterial({ color: 0x4a9e7f, transparent: true, opacity: 0.6 })
      );
      head.rotation.z = -Math.PI / 2;
      grp.add(head);
      grp.visible = false;
      scene.add(grp);
      arrowPool.push(grp);
    }
    arrowPoolRef.current = arrowPool;

    // Seismic wave pool
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

    // Debris pool for collapse
    const debrisPool: any[] = [];
    for (let i = 0; i < 60; i++) {
      const size = 0.1 + Math.random() * 0.3;
      const geo = new THREE.BoxGeometry(size, size * 0.5, size * 0.8);
      const mat = new THREE.MeshPhongMaterial({ color: 0x2a3a30, transparent: true, opacity: 0 });
      const debris = new THREE.Mesh(geo, mat);
      debris.visible = false;
      debris.userData = { vx: 0, vy: 0, vz: 0, active: false, rotSpeed: { x: 0, y: 0, z: 0 } };
      scene.add(debris);
      debrisPool.push(debris);
    }
    debrisPoolRef.current = debrisPool;

    buildingGroupRef.current = new THREE.Group();
    scene.add(buildingGroupRef.current);

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

    // Mouse/touch handlers
    const onMouseDown = (e: MouseEvent) => { isDraggingRef.current = true; prevMouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      cameraAngleRef.current.theta -= (e.clientX - prevMouseRef.current.x) * 0.005;
      cameraAngleRef.current.phi = Math.max(-0.5, Math.min(1.2, cameraAngleRef.current.phi + (e.clientY - prevMouseRef.current.y) * 0.005));
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
      updateCameraPos();
    };
    const onMouseUp = () => { isDraggingRef.current = false; };
    const onWheel = (e: WheelEvent) => {
      cameraDistRef.current = Math.max(10, Math.min(60, cameraDistRef.current + e.deltaY * 0.02));
      updateCameraPos();
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { isDraggingRef.current = true; prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
      else if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDraggingRef.current) {
        cameraAngleRef.current.theta -= (e.touches[0].clientX - prevMouseRef.current.x) * 0.005;
        cameraAngleRef.current.phi = Math.max(-0.5, Math.min(1.2, cameraAngleRef.current.phi + (e.touches[0].clientY - prevMouseRef.current.y) * 0.005));
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCameraPos();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        cameraDistRef.current = Math.max(10, Math.min(60, cameraDistRef.current - (dist - lastTouchDist) * 0.05));
        lastTouchDist = dist;
        updateCameraPos();
      }
    };
    const onTouchEnd = () => { isDraggingRef.current = false; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

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
      const cs = collapseStateRef.current;
      const en = energyRef.current;

      if (!isDraggingRef.current) {
        rotationRef.current += 0.002;
        cameraAngleRef.current.theta = (Math.PI / 4) + rotationRef.current;
        updateCameraPos();
      }

      // Compute forces
      const windForce = p.showWindLoad ? (p.windSpeed / 120) : 0;
      const eqForce = p.showEarthquake ? (p.earthquakeMagnitude / 10) : 0;
      const totalForce = windForce + eqForce;

      // Energy accumulation
      if (p.showWindLoad || p.showEarthquake) {
        const dt = 0.016;
        const inputPower = totalForce * totalForce * 500;
        en.inputEnergy += inputPower * dt;

        // Helicoid dissipates energy more efficiently
        en.helicoidDissipated += inputPower * 0.65 * dt;
        en.helicoidAbsorbed += inputPower * 0.35 * dt;

        // Standard absorbs more (less dissipation)
        en.standardDissipated += inputPower * 0.3 * dt;
        en.standardAbsorbed += inputPower * 0.7 * dt;
      }

      // Check collapse thresholds
      // Standard collapses at lower force
      const stdCollapseThreshold = 1.1;
      const helCollapseThreshold = 1.7;

      if (totalForce > stdCollapseThreshold && !cs.standardCollapsed) {
        cs.standardCollapsed = true;
        cs.standardCollapseTime = 0;
        cs.standardCollapseFloor = Math.floor(p.floors * 0.6);
        spawnDebris(THREE, 6, p.floors, "standard"); // x=6 for standard in split
      }
      if (totalForce > helCollapseThreshold && !cs.helicoidCollapsed) {
        cs.helicoidCollapsed = true;
        cs.helicoidCollapseTime = 0;
        cs.helicoidCollapseFloor = Math.floor(p.floors * 0.8);
        spawnDebris(THREE, -6, p.floors, "helicoid");
      }

      // Animate wind arrows
      arrowPoolRef.current.forEach((grp) => {
        if (!grp.visible) return;
        grp.position.x += (grp.userData.speed || 0.05);
        if (grp.position.x > 8) grp.position.x = grp.userData.startX;
      });

      // Wind sway
      windFreqRef.current += 0.02;
      if (p.showWindLoad && slabsRef.current.length > 0) {
        slabsRef.current.forEach((entry) => {
          const { mesh, edgeMesh, floorIndex, totalFloors, xOffset, type } = entry;
          if ((type === "standard" && cs.standardCollapsed) || (type === "helicoid" && cs.helicoidCollapsed)) return;
          const t = totalFloors > 0 ? floorIndex / totalFloors : 0;
          const baseDefl = (p.windSpeed / 120) * 0.3 * t * Math.sin(windFreqRef.current);
          const deflection = type === "standard" ? baseDefl : baseDefl * 0.35;
          mesh.position.x = xOffset + deflection;
          edgeMesh.position.x = xOffset + deflection;
        });
      }

      // Earthquake animation
      if (p.showEarthquake) {
        earthquakeTimeRef.current += 0.05;
        const eqTime = earthquakeTimeRef.current;
        const mag = p.earthquakeMagnitude;
        const intensity = (mag / 10) * 0.5;

        seismicWavePoolRef.current.forEach((ring, i) => {
          ring.visible = true;
          const phase = (eqTime * 2 + i * 1.2) % 8;
          const scale = 1 + phase * 2;
          ring.scale.set(scale, scale, 1);
          ring.material.opacity = Math.max(0, 0.4 - phase * 0.05) * (mag / 10);
        });

        if (slabsRef.current.length > 0) {
          slabsRef.current.forEach((entry) => {
            const { mesh, edgeMesh, floorIndex, totalFloors, xOffset, type } = entry;
            if ((type === "standard" && cs.standardCollapsed) || (type === "helicoid" && cs.helicoidCollapsed)) return;
            const t = totalFloors > 0 ? floorIndex / totalFloors : 0;
            const freq1 = Math.sin(eqTime * 3.7 + floorIndex * 0.3) * intensity * t;
            const freq2 = Math.sin(eqTime * 7.1 + floorIndex * 0.5) * intensity * 0.3 * t;
            const freq3 = Math.sin(eqTime * 1.3) * intensity * 0.15 * t;
            const dampingFactor = type === "standard" ? 1.0 : 0.55;
            const xShake = (freq1 + freq2) * dampingFactor;
            const zShake = (freq3 + freq2 * 0.5) * dampingFactor * 0.6;
            mesh.position.x = xOffset + xShake;
            mesh.position.z = zShake;
            edgeMesh.position.x = xOffset + xShake;
            edgeMesh.position.z = zShake;
          });
        }
      } else {
        seismicWavePoolRef.current.forEach((ring) => { ring.visible = false; });
        if (slabsRef.current.length > 0 && !p.showWindLoad) {
          slabsRef.current.forEach((entry) => {
            if ((entry.type === "standard" && cs.standardCollapsed) || (entry.type === "helicoid" && cs.helicoidCollapsed)) return;
            entry.mesh.position.x = entry.xOffset;
            entry.mesh.position.z = 0;
            entry.edgeMesh.position.x = entry.xOffset;
            entry.edgeMesh.position.z = 0;
          });
        }
      }

      // Collapse animation
      if (cs.standardCollapsed) {
        cs.standardCollapseTime += 0.016;
        animateCollapse("standard", cs.standardCollapseTime, cs.standardCollapseFloor);
      }
      if (cs.helicoidCollapsed) {
        cs.helicoidCollapseTime += 0.016;
        animateCollapse("helicoid", cs.helicoidCollapseTime, cs.helicoidCollapseFloor);
      }

      // Animate debris
      debrisPoolRef.current.forEach((d) => {
        if (!d.userData.active) return;
        d.userData.vy -= 0.015; // gravity
        d.position.x += d.userData.vx;
        d.position.y += d.userData.vy;
        d.position.z += d.userData.vz;
        d.rotation.x += d.userData.rotSpeed.x;
        d.rotation.y += d.userData.rotSpeed.y;
        d.rotation.z += d.userData.rotSpeed.z;
        if (d.position.y < 0) {
          d.position.y = 0;
          d.userData.vy *= -0.2;
          d.userData.vx *= 0.8;
          d.userData.vz *= 0.8;
          if (Math.abs(d.userData.vy) < 0.01) {
            d.userData.active = false;
            d.material.opacity = Math.max(0, d.material.opacity - 0.01);
          }
        }
      });

      // Crack deflection mode animation
      if (simModeRef.current === "crack") {
        animateCrackDeflection(eqTime || windFreqRef.current);
      }

      metricsFrameCount++;
      if (metricsFrameCount % 10 === 0) {
        computeMetrics();

        // Record energy history
        simTimeRef.current += 0.16;
        const hist = energyHistoryRef.current;
        hist.push({
          time: simTimeRef.current,
          helDiss: en.helicoidDissipated,
          stdDiss: en.standardDissipated,
          helAbs: en.helicoidAbsorbed,
          stdAbs: en.standardAbsorbed,
        });
        // Keep last 200 points
        if (hist.length > 200) hist.shift();

        // Draw chart
        drawEnergyChart();
      }

      renderer.render(scene, camera);
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let eqTime = 0;
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
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  const spawnDebris = (THREE: any, xCenter: number, floors: number, _type: string) => {
    const pool = debrisPoolRef.current;
    let count = 0;
    const startIdx = _type === "standard" ? 30 : 0;
    for (let i = startIdx; i < startIdx + 30 && i < pool.length; i++) {
      const d = pool[i];
      d.visible = true;
      d.userData.active = true;
      d.material.opacity = 0.8;
      d.position.set(
        xCenter + (Math.random() - 0.5) * 4,
        floors * 0.5 + Math.random() * floors * 0.5,
        (Math.random() - 0.5) * 4
      );
      d.userData.vx = (Math.random() - 0.5) * 0.15;
      d.userData.vy = Math.random() * 0.1;
      d.userData.vz = (Math.random() - 0.5) * 0.15;
      d.userData.rotSpeed = {
        x: (Math.random() - 0.5) * 0.1,
        y: (Math.random() - 0.5) * 0.1,
        z: (Math.random() - 0.5) * 0.1,
      };
      count++;
    }
  };

  const animateCollapse = (type: string, time: number, collapseFloor: number) => {
    slabsRef.current.forEach((entry) => {
      if (entry.type !== type) return;
      if (entry.floorIndex < collapseFloor) return;
      const progress = Math.min(1, time * 1.5);
      const fallDist = progress * progress * entry.floorIndex * 0.8;
      const targetY = Math.max(0, entry.floorIndex * 1.0 - fallDist);
      entry.mesh.position.y = targetY;
      entry.edgeMesh.position.y = targetY;
      // Tilt
      const tilt = progress * 0.3 * (entry.floorIndex - collapseFloor) * 0.05;
      entry.mesh.rotation.z = tilt;
      entry.edgeMesh.rotation.z = tilt;
      // Fade
      if (entry.mesh.material) {
        entry.mesh.material.transparent = true;
        entry.mesh.material.opacity = Math.max(0.2, 1 - progress * 0.5);
      }
    });
    // Collapse columns too
    columnsRef.current.forEach((col) => {
      if (col.userData.type !== type) return;
      const progress = Math.min(1, time * 1.2);
      col.material.transparent = true;
      col.material.opacity = Math.max(0.1, 1 - progress * 0.7);
      col.rotation.z = progress * 0.2 * (Math.random() > 0.5 ? 1 : -1);
    });
  };

  const animateCrackDeflection = (_time: number) => {
    // Crack lines animate in crack mode
    crackLinesRef.current.forEach((crack) => {
      if (!crack.visible) return;
      const p = paramsRef.current;
      const force = (p.showWindLoad ? p.windSpeed / 120 : 0) + (p.showEarthquake ? p.earthquakeMagnitude / 10 : 0);
      const scale = 1 + force * 2;
      crack.scale.set(scale, scale, scale);
      crack.material.opacity = Math.min(0.8, force * 0.6);
    });
  };

  // Rebuild building
  useEffect(() => {
    if (rebuildTimeoutRef.current) clearTimeout(rebuildTimeoutRef.current);
    rebuildTimeoutRef.current = setTimeout(() => {
      rebuildBuilding(params);
      computeMetrics();
    }, 16);
  }, [params, simMode]);

  const rebuildBuilding = (p: typeof params) => {
    const THREE = window.THREE;
    if (!THREE || !buildingGroupRef.current) return;

    const group = buildingGroupRef.current;
    group.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    });
    group.clear();
    slabsRef.current = [];
    columnsRef.current = [];
    crackLinesRef.current = [];

    if (pointLightRef.current) pointLightRef.current.intensity = p.showStressMap ? 0.2 : 0.6;

    if (simModeRef.current === "crack") {
      buildCrackDeflectionScene(THREE, group, p);
      return;
    }

    const isSplit = p.structureType === "split";
    const offsets = isSplit ? [-6, 6] : [0];
    const types: Array<"helicoid" | "standard"> = isSplit
      ? ["helicoid", "standard"]
      : [p.structureType === "standard" ? "standard" : "helicoid"];

    offsets.forEach((xOffset, idx) => {
      buildSingleBuilding(THREE, group, p, xOffset, types[idx]);
    });

    if (isSplit) {
      const divGeo = new THREE.PlaneGeometry(0.02, p.floors + 2);
      const divMat = new THREE.MeshBasicMaterial({ color: 0x1a2e22, side: THREE.DoubleSide });
      const div = new THREE.Mesh(divGeo, divMat);
      div.position.set(0, (p.floors + 2) / 2, 0);
      group.add(div);
      addTextSprite(THREE, group, "HELICOID", -6, p.floors * 1.0 + 2);
      addTextSprite(THREE, group, "STANDARD", 6, p.floors * 1.0 + 2);
    }

    updateWindArrows(THREE, p);
  };

  const buildCrackDeflectionScene = (THREE: any, group: any, p: typeof params) => {
    // Build two block specimens side by side for crack comparison
    const buildSpecimen = (xOffset: number, type: "helicoid" | "standard") => {
      const width = 4;
      const height = 8;
      const depth = 2;

      // Main block
      const geo = new THREE.BoxGeometry(width, height, depth);
      const color = type === "helicoid" ? 0x1a3a2a : 0x2a2520;
      const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.85 });
      const block = new THREE.Mesh(geo, mat);
      block.position.set(xOffset, height / 2, 0);
      group.add(block);

      // Layer lines to show internal structure
      const layerCount = 12;
      for (let i = 0; i < layerCount; i++) {
        const y = (i / layerCount) * height;
        const angle = type === "helicoid" ? (i / layerCount) * Math.PI * 0.8 : 0;
        const lineGeo = new THREE.PlaneGeometry(width * 0.9, 0.02);
        const lineMat = new THREE.MeshBasicMaterial({
          color: type === "helicoid" ? 0x4a9e7f : 0x666666,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(xOffset, y, 0);
        line.rotation.y = angle;
        group.add(line);
      }

      // Crack lines (more cracks for standard)
      const crackCount = type === "standard" ? 6 : 2;
      const force = (p.showWindLoad ? p.windSpeed / 120 : 0) + (p.showEarthquake ? p.earthquakeMagnitude / 10 : 0);
      for (let i = 0; i < crackCount; i++) {
        const points = [];
        const startY = height * 0.2 + Math.random() * height * 0.6;
        const segments = 8;
        for (let s = 0; s <= segments; s++) {
          const frac = s / segments;
          const x = (frac - 0.5) * width * 0.8;
          const y = startY + (Math.random() - 0.5) * 1.5;
          const z = depth * 0.5 + 0.01;
          points.push(new THREE.Vector3(xOffset + x, y, z));
        }
        const crackCurve = new THREE.CatmullRomCurve3(points);
        const crackGeo = new THREE.TubeGeometry(crackCurve, 16, 0.02 + force * 0.03, 4, false);
        const crackMat = new THREE.MeshBasicMaterial({
          color: type === "standard" ? 0xe05a3a : 0xc8973a,
          transparent: true,
          opacity: Math.min(0.8, force * 0.5 + 0.1),
        });
        const crackMesh = new THREE.Mesh(crackGeo, crackMat);
        crackMesh.visible = force > 0.1;
        group.add(crackMesh);
        crackLinesRef.current.push(crackMesh);
      }

      // Labels
      addTextSprite(THREE, group, type === "helicoid" ? "HELICOID" : "STANDARD", xOffset, height + 1.5);
      addTextSprite(THREE, group, type === "helicoid" ? "Crack Deflection" : "Straight Crack", xOffset, -1);
    };

    buildSpecimen(-5, "helicoid");
    buildSpecimen(5, "standard");

    // Force arrow
    const arrowGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xe05a3a });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, 10, 0);
    arrow.rotation.z = Math.PI;
    group.add(arrow);
    addTextSprite(THREE, group, "FORCE", 0, 11);
  };

  const buildSingleBuilding = (THREE: any, group: any, p: typeof params, xOffset: number, type: "helicoid" | "standard") => {
    const size = p.floorPlateSize;
    const twistRad = type === "helicoid" ? p.twistPerFloor * (Math.PI / 180) : 0;

    for (let i = 0; i <= p.floors; i++) {
      const y = i * 1.0;
      const angle = i * twistRad;
      const t = p.floors > 0 ? i / p.floors : 0;

      const geo = new THREE.BoxGeometry(4.4 * size, 0.08, 1.8 * size);
      let color: any;

      if (p.showStressMap) {
        let stress: number;
        if (type === "standard") stress = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.4));
        else stress = 0.05 + 0.15 * Math.abs(Math.sin(i * 0.4));
        color = lerpStressColor(THREE, stress);
      } else {
        const r = lerp(0x12 / 255, 0x2a / 255, t);
        const g = lerp(0x2a / 255, 0x4a / 255, t);
        const b = lerp(0x1e / 255, 0x3a / 255, t);
        color = new THREE.Color(r, g, b);
      }

      const mat = new THREE.MeshPhongMaterial({ color });
      const slab = new THREE.Mesh(geo, mat);
      slab.rotation.y = angle;
      slab.position.set(xOffset, y, 0);
      group.add(slab);

      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x4a9e7f, transparent: true, opacity: 0.15 });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.rotation.y = angle;
      edges.position.set(xOffset, y, 0);
      group.add(edges);

      slabsRef.current.push({ mesh: slab, edgeMesh: edges, floorIndex: i, totalFloors: p.floors, xOffset, type });
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
          points.push(new THREE.Vector3(xOffset + r * Math.cos(a), floorI * 1.0, r * Math.sin(a)));
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, p.floors * 4, 0.07, 6, false);
        const tubeMat = new THREE.MeshPhongMaterial({ color: 0x2a4a3a });
        const col = new THREE.Mesh(tubeGeo, tubeMat);
        col.userData = { type };
        group.add(col);
        columnsRef.current.push(col);
      }
    } else {
      for (let c = 0; c < 4; c++) {
        const baseAngle = (c * Math.PI) / 2;
        const colGeo = new THREE.CylinderGeometry(0.07, 0.07, p.floors * 1.0, 8);
        const colMat = new THREE.MeshPhongMaterial({ color: 0x3a2a20 });
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(xOffset + r * Math.cos(baseAngle), (p.floors * 1.0) / 2, r * Math.sin(baseAngle));
        col.userData = { type };
        group.add(col);
        columnsRef.current.push(col);
      }
    }
  };

  const updateWindArrows = (THREE: any, p: typeof params) => {
    const pool = arrowPoolRef.current;
    if (!p.showWindLoad) { pool.forEach((g) => (g.visible = false)); return; }
    const count = Math.max(3, Math.round((p.windSpeed / 120) * 12));
    const length = 0.5 + (p.windSpeed / 120) * 1.5;
    pool.forEach((grp, i) => {
      if (i < count) {
        grp.visible = true;
        const shaft = grp.children[0];
        const head = grp.children[1];
        shaft.scale.y = length;
        head.position.x = length / 2 + 0.1;
        const rows = Math.ceil(count / 3);
        const row = i % rows;
        grp.position.set(-12 + (i * 0.37) % 5, 1 + row * (p.floors / Math.max(1, rows)), -2 + Math.floor(i / rows) * 2);
        grp.userData.startX = grp.position.x;
        grp.userData.speed = (p.windSpeed / 30) * 0.04;
      } else { grp.visible = false; }
    });
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const lerpStressColor = (THREE: any, stress: number) => {
    const safe = { r: 0x4a / 255, g: 0x9e / 255, b: 0x7f / 255 };
    const warn = { r: 0xc8 / 255, g: 0x97 / 255, b: 0x3a / 255 };
    const danger = { r: 0xe0 / 255, g: 0x5a / 255, b: 0x3a / 255 };
    let r2, g, b;
    if (stress < 0.5) {
      const t = stress / 0.5;
      r2 = lerp(safe.r, warn.r, t); g = lerp(safe.g, warn.g, t); b = lerp(safe.b, warn.b, t);
    } else {
      const t = (stress - 0.5) / 0.5;
      r2 = lerp(warn.r, danger.r, t); g = lerp(warn.g, danger.g, t); b = lerp(warn.b, danger.b, t);
    }
    return new THREE.Color(r2, g, b);
  };

  const addTextSprite = (THREE: any, group: any, text: string, x: number, y: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#4a9e7f";
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
    <div style={{ background: "#080c0a", color: "#d4e8df", minHeight: "100vh" }}>
      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 32px",
        borderBottom: "1px solid rgba(74,158,127,0.1)",
        background: "rgba(8,12,10,0.92)", backdropFilter: "blur(8px)",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          color: "#4a9e7f", letterSpacing: "0.08em", opacity: 0.6,
        }}>
          BIO-STRUCT SIM
        </span>
        <div style={{ display: "flex", gap: 24 }}>
          {["Simulator"].map((label) => (
            <a key={label} href={`#${label.toLowerCase()}`}
              style={{ fontSize: 12, color: "#4a6b5c", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#4a9e7f")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#4a6b5c")}
            >{label}</a>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        height: "100vh", display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 24px",
      }}>
        <span style={{
          fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#4a9e7f", marginBottom: 24, opacity: 0.5,
        }}>
          BIO-INSPIRED STRUCTURAL ENGINEERING
        </span>
        <h1 className="title-glow title-glow-edge" style={{
          fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 300,
          color: "#d4e8df", margin: "0 0 8px 0", lineHeight: 1.1,
        }}>
          SPIDER SILK &
        </h1>
        <h1 className="title-glow title-glow-edge" style={{
          fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 300,
          color: "#d4e8df", margin: "0 0 8px 0", lineHeight: 1.1,
        }}>
          MANTIS SHRIMP
        </h1>
        <h1 className="title-glow title-glow-edge" style={{
          fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 200,
          color: "#4a9e7f", margin: "0 0 24px 0", lineHeight: 1.1, opacity: 0.8,
        }}>
          INSPIRED STRUCTURES
        </h1>
        <p style={{ fontSize: 15, color: "#4a6b5c", marginBottom: 40, maxWidth: 460 }}>
          How biological helicoid geometry outperforms rigid frames under extreme forces
        </p>
        <a href="#simulator" style={{
          fontSize: 13, color: "#4a9e7f",
          border: "1px solid rgba(74,158,127,0.25)", borderRadius: 6,
          padding: "10px 24px", textDecoration: "none",
          boxShadow: "0 0 15px rgba(74,158,127,0.1)",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(74,158,127,0.5)"; e.currentTarget.style.boxShadow = "0 0 25px rgba(74,158,127,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(74,158,127,0.25)"; e.currentTarget.style.boxShadow = "0 0 15px rgba(74,158,127,0.1)"; }}
        >
          Open Simulator ↓
        </a>
      </section>

      {/* Simulator */}
      <section id="simulator" style={{ position: "relative" }}>
        {/* Sim mode toggle */}
        <div style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, display: "flex", gap: 0,
          background: "rgba(8,12,10,0.9)", border: "1px solid rgba(74,158,127,0.15)",
          borderRadius: 6, overflow: "hidden",
        }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {([{ key: "structural", label: "Structural Response" }, { key: "crack", label: "Crack Deflection" }] as const).map((m) => (
            <button key={m.key}
              onClick={() => setSimMode(m.key as SimMode)}
              style={{
                background: simMode === m.key ? "rgba(74,158,127,0.15)" : "none",
                border: "none", color: simMode === m.key ? "#4a9e7f" : "#4a6b5c",
                fontSize: 11, padding: "8px 16px", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
                borderBottom: simMode === m.key ? "1px solid #4a9e7f" : "1px solid transparent",
              }}
            >{m.label}</button>
          ))}
        </div>

        <div ref={canvasContainerRef} style={{ width: "100%", height: "70vh", cursor: "grab" }} />

        {/* Collapse alert */}
        {displayMetrics.collapseStatus && (
          <div style={{
            position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
            zIndex: 20, background: "rgba(224,90,58,0.15)", border: "1px solid rgba(224,90,58,0.4)",
            borderRadius: 6, padding: "8px 20px", color: "#e05a3a",
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em",
            animation: "pulse 1s ease-in-out infinite",
          }}>
            ⚠ {displayMetrics.collapseStatus}
          </div>
        )}

        {/* Parameter Panel */}
        <div className="sim-panel-params"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: 24, left: 24,
            background: "rgba(8,12,10,0.9)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(74,158,127,0.12)", borderRadius: 8,
            padding: 20, width: 260, zIndex: 10,
          }}
        >
          <SliderControl label="FLOORS" value={params.floors} min={1} max={30} step={1} display={String(params.floors)} onChange={(v) => updateParam("floors", v)} />
          <SliderControl label="TWIST / FLOOR" value={params.twistPerFloor} min={0} max={20} step={1} display={`${params.twistPerFloor}°`} onChange={(v) => updateParam("twistPerFloor", v)} />
          <div style={{ fontSize: 11, color: "#1e2e26", marginTop: -8, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            Total rotation: {params.floors * params.twistPerFloor}°
          </div>
          <SliderControl label="FLOOR PLATE" value={params.floorPlateSize * 100} min={50} max={200} step={5} display={`${params.floorPlateSize.toFixed(1)}×`} onChange={(v) => updateParam("floorPlateSize", v / 100)} />

          {/* Structure type */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#4a6b5c", marginBottom: 8, letterSpacing: "0.08em" }}>STRUCTURE</div>
            <div style={{ display: "flex", gap: 0 }}>
              {(["helicoid", "standard", "split"] as const).map((t) => (
                <button key={t} onClick={() => updateParam("structureType", t)}
                  style={{
                    flex: 1, background: "none", border: "none",
                    borderBottom: params.structureType === t ? "1px solid #4a9e7f" : "1px solid transparent",
                    color: params.structureType === t ? "#4a9e7f" : "#4a6b5c",
                    fontSize: 11, padding: "6px 8px", cursor: "pointer",
                    textTransform: "capitalize", fontFamily: "'Inter', sans-serif",
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Wind */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={() => updateParam("showWindLoad", !params.showWindLoad)}
                style={{
                  background: "none", border: "none", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: params.showWindLoad ? "#4a9e7f" : "#4a6b5c",
                  cursor: "pointer", padding: 0, letterSpacing: "0.08em",
                  borderBottom: params.showWindLoad ? "1px solid #4a9e7f" : "none",
                }}>WIND</button>
              <span style={{ fontSize: 12, color: params.showWindLoad ? "#d4e8df" : "#1e2e26", marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace" }}>
                {params.windSpeed} km/h
              </span>
            </div>
            <input type="range" className="sim-slider" min={0} max={200} step={5}
              value={params.windSpeed} disabled={!params.showWindLoad}
              onChange={(e) => updateParam("windSpeed", parseInt(e.target.value))} />
          </div>

          {/* Earthquake */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={() => updateParam("showEarthquake", !params.showEarthquake)}
                style={{
                  background: "none", border: "none", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: params.showEarthquake ? "#e05a3a" : "#4a6b5c",
                  cursor: "pointer", padding: 0, letterSpacing: "0.08em",
                  borderBottom: params.showEarthquake ? "1px solid #e05a3a" : "none",
                }}>EARTHQUAKE</button>
              <span style={{ fontSize: 12, color: params.showEarthquake ? "#d4e8df" : "#1e2e26", marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace" }}>
                M{params.earthquakeMagnitude.toFixed(1)}
              </span>
            </div>
            <input type="range" className="sim-slider" min={2} max={9} step={0.5}
              value={params.earthquakeMagnitude} disabled={!params.showEarthquake}
              onChange={(e) => updateParam("earthquakeMagnitude", parseFloat(e.target.value))} />
            {params.showEarthquake && (
              <div style={{ fontSize: 11, color: "#1e2e26", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {params.earthquakeMagnitude < 4 ? "Minor" : params.earthquakeMagnitude < 6 ? "Moderate" : params.earthquakeMagnitude < 7.5 ? "Strong" : "Major"} seismic event
              </div>
            )}
          </div>

          {/* Stress map */}
          <div>
            <button onClick={() => updateParam("showStressMap", !params.showStressMap)}
              style={{
                background: "none", border: "none", fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: params.showStressMap ? "#4a9e7f" : "#4a6b5c",
                cursor: "pointer", padding: 0, letterSpacing: "0.08em",
                borderBottom: params.showStressMap ? "1px solid #4a9e7f" : "none",
              }}>STRESS MAP</button>
            {params.showStressMap && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, borderRadius: 2, background: "linear-gradient(to right, #4a9e7f, #c8973a, #e05a3a)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#1e2e26", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  <span>Low</span><span>Med</span><span>High</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metrics Panel */}
        <div className="sim-panel-metrics"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: 24, right: 24,
            background: "rgba(8,12,10,0.9)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(74,158,127,0.12)", borderRadius: 8,
            padding: 20, width: 240, zIndex: 10, maxHeight: "60vh", overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#4a9e7f", letterSpacing: "0.1em", marginBottom: 14, opacity: 0.6 }}>LIVE METRICS</div>

          {/* Structural Integrity */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#1e2e26", letterSpacing: "0.08em", marginBottom: 6 }}>STRUCTURAL INTEGRITY</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Helicoid</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: displayMetrics.integrityColorH }}>{displayMetrics.structuralIntegrityH}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Standard</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: displayMetrics.integrityColorS }}>{displayMetrics.structuralIntegrityS}</div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(74,158,127,0.08)", marginBottom: 14 }} />

          {/* Energy */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#1e2e26", letterSpacing: "0.08em", marginBottom: 6 }}>ENERGY DISSIPATED</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Helicoid</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#4a9e7f", fontFamily: "'JetBrains Mono', monospace" }}>{displayMetrics.energyDissipatedH}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Standard</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#c8973a", fontFamily: "'JetBrains Mono', monospace" }}>{displayMetrics.energyDissipatedS}</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#1e2e26", letterSpacing: "0.08em", marginBottom: 6 }}>ENERGY ABSORBED</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Helicoid</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#4a9e7f", fontFamily: "'JetBrains Mono', monospace" }}>{displayMetrics.energyAbsorbedH}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#4a6b5c", marginBottom: 2 }}>Standard</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#e05a3a", fontFamily: "'JetBrains Mono', monospace" }}>{displayMetrics.energyAbsorbedS}</div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(74,158,127,0.08)", marginBottom: 14 }} />

          <MetricItem label="WIND RESISTANCE" value={displayMetrics.windResistance} color={displayMetrics.windResistanceColor} />
          <MetricItem label="SWAY REDUCTION" value={displayMetrics.swayReduction} color={displayMetrics.swayReductionColor} />
          {params.showStressMap && <MetricItem label="STRESS UNIFORMITY" value={displayMetrics.stressDistribution} color={displayMetrics.stressDistributionColor} />}
          {params.showEarthquake && <MetricItem label="SEISMIC RESPONSE" value={displayMetrics.seismicResponse} color={displayMetrics.seismicResponseColor} noBorder />}
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @media (max-width: 768px) {
          .sim-panel-params, .sim-panel-metrics {
            position: relative !important;
            bottom: auto !important; left: auto !important; right: auto !important;
            width: 100% !important; border-radius: 0 !important;
            border-left: none !important; border-right: none !important;
          }
          #simulator > div:nth-child(2) { height: 50vh !important; }
        }
      `}</style>
    </div>
  );
};

// Sub-components
const SliderControl = ({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
}) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#4a6b5c", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#d4e8df", fontFamily: "'JetBrains Mono', monospace" }}>{display}</span>
    </div>
    <input type="range" className="sim-slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
  </div>
);

const MetricItem = ({ label, value, color, noBorder }: {
  label: string; value: string; color: string; noBorder?: boolean;
}) => (
  <div style={{ paddingBottom: noBorder ? 0 : 10, marginBottom: noBorder ? 0 : 10, borderBottom: noBorder ? "none" : "1px solid rgba(74,158,127,0.06)" }}>
    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#1e2e26", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 500, color }}>{value}</div>
  </div>
);

export default Index;
