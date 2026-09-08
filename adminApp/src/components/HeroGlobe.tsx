import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Meril HQ (Vapi, Gujarat) plus a spread of subsidiary hubs the real
// merillife.com "global presence" copy calls out — used purely as
// illustrative network nodes, not a literal office directory.
const HQ = { lat: 20.37, lng: 72.9, label: 'India — HQ' };
const HUBS = [
  { lat: 40.71, lng: -74.01, label: 'USA' },
  { lat: 51.51, lng: -0.13, label: 'UK' },
  { lat: 52.52, lng: 13.4, label: 'Germany' },
  { lat: -15.79, lng: -47.88, label: 'Brazil' },
  { lat: -26.2, lng: 28.05, label: 'South Africa' },
  { lat: 41.01, lng: 28.98, label: 'Turkey' },
  { lat: 39.9, lng: 116.41, label: 'China' },
  { lat: -33.87, lng: 151.21, label: 'Australia' },
  { lat: 37.57, lng: 126.98, label: 'South Korea' },
  { lat: 55.75, lng: 37.62, label: 'Russia' },
];

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Builds one glowing arc + a pulse dot that travels along it from the HQ
// node out to a hub node, arcing outward through a raised midpoint so the
// paths read as flight-path style connections over the globe's surface.
function buildArc(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color) {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const liftFactor = 1 + from.distanceTo(to) * 0.35;
  mid.normalize().multiplyScalar(liftFactor);

  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const points = curve.getPoints(48);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  const line = new THREE.Line(geometry, material);

  const pulseGeo = new THREE.SphereGeometry(0.012, 8, 8);
  const pulseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);

  return { line, pulse, curve };
}

export function HeroGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.3, 2.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const accent = new THREE.Color('#F59E0B'); // amber-500, matches brand accent
    const accentTeal = new THREE.Color('#14B8A6');

    // Globe group — everything rotates together.
    const globe = new THREE.Group();
    scene.add(globe);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ color: 0x102343, shininess: 12, transparent: true, opacity: 0.96 })
    );
    globe.add(core);

    const wireframe = new THREE.Mesh(
      new THREE.SphereGeometry(1.002, 28, 20),
      new THREE.MeshBasicMaterial({ color: 0x5b80ac, wireframe: true, transparent: true, opacity: 0.18 })
    );
    globe.add(wireframe);

    // Fresnel-style rim glow — brighter at grazing angles, giving the
    // sphere an atmospheric edge without needing a texture asset.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.09, 48, 48),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color('#375D8A') } },
        vertexShader: `
          varying float intensity;
          void main() {
            vec3 vNormal = normalize(normalMatrix * normal);
            vec3 vNormel = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
            intensity = pow(0.65 - dot(vNormal, -vNormel), 2.5);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float intensity;
          uniform vec3 glowColor;
          void main() {
            gl_FragColor = vec4(glowColor, intensity * 0.9);
          }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    globe.add(glow);

    // Hub + HQ markers.
    const hqPos = latLngToVector3(HQ.lat, HQ.lng, 1);
    const hqMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 12, 12),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    hqMarker.position.copy(hqPos);
    globe.add(hqMarker);

    const hqRing = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.042, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    hqRing.position.copy(hqPos.clone().multiplyScalar(1.001));
    hqRing.lookAt(hqPos.clone().multiplyScalar(2));
    globe.add(hqRing);

    // Country name labels — plain DOM elements layered over the canvas
    // (a minimal hand-rolled CSS2DRenderer) so text stays crisp regardless
    // of render resolution. Position is recomputed every frame by
    // projecting each marker's rotated world position to screen space;
    // only front-facing markers are shown so labels never read backwards.
    const labelLayer = document.createElement('div');
    labelLayer.className = 'absolute inset-0 pointer-events-none overflow-hidden';
    container.appendChild(labelLayer);

    const makeLabel = (text: string, isHq: boolean) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.className = isHq
        ? 'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-amber-500 text-primary-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg transition-opacity duration-300'
        : 'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white/90 text-primary-800 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow transition-opacity duration-300';
      el.style.opacity = '0';
      labelLayer.appendChild(el);
      return el;
    };

    const hqLabelEl = makeLabel(HQ.label, true);
    const labelPoints: { pos: THREE.Vector3; el: HTMLDivElement }[] = [{ pos: hqPos, el: hqLabelEl }];

    const arcs = HUBS.map((hub) => {
      const hubPos = latLngToVector3(hub.lat, hub.lng, 1);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 10, 10),
        new THREE.MeshBasicMaterial({ color: accentTeal })
      );
      marker.position.copy(hubPos);
      globe.add(marker);

      const { line, pulse, curve } = buildArc(hqPos, hubPos, accentTeal);
      globe.add(line);
      globe.add(pulse);

      labelPoints.push({ pos: hubPos, el: makeLabel(hub.label, false) });

      return { curve, pulse, offset: Math.random() };
    });

    // Faint starfield behind the globe for depth.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 4 + Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x8ca9cb, size: 0.02, transparent: true, opacity: 0.5 })
    );
    scene.add(stars);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(2, 2, 3);
    scene.add(dirLight);

    globe.rotation.x = -0.25;
    globe.rotation.y = 2.4;

    let viewW = 0;
    let viewH = 0;
    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      viewW = clientWidth;
      viewH = clientHeight;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let frameId: number;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        globe.rotation.y += 0.0018;
      }

      arcs.forEach(({ curve, pulse, offset }) => {
        const progress = (t * 0.18 + offset) % 1;
        pulse.position.copy(curve.getPointAt(progress));
        pulse.material.opacity = Math.sin(progress * Math.PI);
      });

      hqRing.scale.setScalar(1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2)));

      // Project each marker to screen space and only show the label when
      // its surface normal (after the globe's current rotation) faces the
      // camera — otherwise labels on the far side would read through the globe.
      labelPoints.forEach(({ pos, el }) => {
        const worldPos = pos.clone().applyMatrix4(globe.matrixWorld);
        const normal = worldPos.clone().normalize();
        const toCamera = camera.position.clone().sub(worldPos).normalize();
        const facing = normal.dot(toCamera);
        if (facing < 0.12) {
          el.style.opacity = '0';
          return;
        }
        const screen = worldPos.clone().project(camera);
        el.style.opacity = String(Math.min(1, (facing - 0.12) * 3));
        el.style.left = `${(screen.x * 0.5 + 0.5) * viewW}px`;
        el.style.top = `${(-screen.y * 0.5 + 0.5) * viewH}px`;
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      wireframe.geometry.dispose();
      (wireframe.material as THREE.Material).dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
      starGeo.dispose();
      container.removeChild(renderer.domElement);
      container.removeChild(labelLayer);
    };
  }, []);

  return <div ref={containerRef} className="relative w-full h-full" />;
}
