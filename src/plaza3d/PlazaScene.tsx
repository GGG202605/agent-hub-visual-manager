import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getAgentPersona } from '../lib/agentPersonas';
import { resolvePlazaViewportLayout } from '../lib/plazaViewport';
import type { AgentRoleCardView } from '../types';

export interface PlazaActive {
  agentId: string;
  phase: 'enter' | 'speak' | 'exit';
}

interface PlazaSceneProps {
  agents: readonly AgentRoleCardView[];
  coordinatorId?: string;
  active: PlazaActive | null;
  onCharacterClick: (agentId: string) => void;
}

interface CharacterRig {
  agentId: string;
  root: THREE.Group;
  model: THREE.Object3D;
  seat: THREE.Vector3;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  phase: number;
}

type LoadStatus = 'loading' | 'staged' | 'ready' | 'partial' | 'error';

interface LoadState {
  status: LoadStatus;
  completed: number;
  failed: number;
}

const SEAT_RX = 4.65;
const SEAT_RZ = 2.9;
const MODEL_HEIGHT = 1.92;
const MODEL_FRONT_YAW = -Math.PI / 2;
const ACTIVE_CENTER = new THREE.Vector3(0, 0.56, 0.2);
const AUTO_PAUSE_MS = 15_000;

const STATUS_COLOR: Record<string, number> = {
  completed: 0x3f9d6a,
  standby: 0x4d82c4,
  awaiting_approval: 0xd9963a,
  blocked: 0xa05252,
};

/**
 * 主界面的 8 Agent 代码生成轻量舞台。
 * 业务状态仍由 PlazaStage 驱动；本组件只负责模型加载、轻动态、拾取和 WebGL 生命周期。
 */
export function PlazaScene({ agents, coordinatorId, active, onCharacterClick }: PlazaSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const activeRef = useRef<PlazaActive | null>(active);
  const clickRef = useRef(onCharacterClick);
  const wakeRef = useRef<() => void>(() => undefined);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', completed: 0, failed: 0 });

  activeRef.current = active;
  clickRef.current = onCharacterClick;

  // 状态文案变化不应重建 WebGL 场景；只有阵容身份变化才重新加载模型。
  const rosterKey = useMemo(() => agents.map((agent) => `${agent.id}:${agent.code}`).join('|'), [agents]);

  useEffect(() => {
    wakeRef.current();
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const host = mount;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setLoadState({ status: 'loading', completed: 0, failed: 0 });

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'plaza3d-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 5.9, 11.6);
    camera.lookAt(0, 0.8, 0);

    scene.add(new THREE.HemisphereLight(0xfff3dd, 0x8c755a, 2.1));
    const sun = new THREE.DirectionalLight(0xfff7e8, 2.6);
    sun.position.set(5, 8, 7);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd7d0, 1.1);
    fill.position.set(-5, 4, -5);
    scene.add(fill);
    const rigs: CharacterRig[] = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const projectedLabel = new THREE.Vector3();
    const pauseReasons = new Set<string>();
    let disposed = false;
    let parallaxX = 0;
    let timeoutId: number | null = null;
    let animationFrameId: number | null = null;
    let autoPauseId: number | null = null;
    let lastFrameAt = performance.now();
    let layoutScaleX = 1;
    let baseModelScale = 1;
    let labelInset = 76;

    function stopLoop() {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
      timeoutId = null;
      animationFrameId = null;
    }

    function scheduleFrame() {
      if (disposed || pauseReasons.size > 0 || timeoutId !== null || animationFrameId !== null) return;
      const activeFps = reducedMotion ? 10 : 20;
      const idleFps = reducedMotion ? 4 : 8;
      const targetFps = activeRef.current ? activeFps : idleFps;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        animationFrameId = window.requestAnimationFrame((now) => {
          animationFrameId = null;
          frame(now);
        });
      }, 1000 / targetFps);
    }

    function startLoop() {
      if (disposed || pauseReasons.size > 0) return;
      lastFrameAt = performance.now();
      scheduleFrame();
    }

    function setPaused(reason: string, paused: boolean) {
      if (paused) pauseReasons.add(reason);
      else pauseReasons.delete(reason);
      if (pauseReasons.size > 0) stopLoop();
      else startLoop();
    }

    function armAutoPause() {
      if (autoPauseId !== null) window.clearTimeout(autoPauseId);
      autoPauseId = null;
      if (disposed || activeRef.current) return;
      autoPauseId = window.setTimeout(() => setPaused('auto-idle', true), AUTO_PAUSE_MS);
    }

    function wake() {
      setPaused('auto-idle', false);
      armAutoPause();
      startLoop();
    }
    wakeRef.current = wake;

    function frame(now: number) {
      if (disposed || pauseReasons.size > 0) return;
      const delta = Math.min(Math.max((now - lastFrameAt) / 1000, 0.001), 0.08);
      lastFrameAt = now;
      const time = now / 1000;
      const current = activeRef.current;
      const approach = 1 - Math.pow(0.01, delta);

      camera.position.x += (parallaxX * 0.45 - camera.position.x) * approach;
      camera.lookAt(0, 0.8, 0);

      rigs.forEach((rig, index) => {
        const isActive = current?.agentId === rig.agentId;
        const wantsCenter = isActive && current.phase !== 'exit';
        const target = wantsCenter ? ACTIVE_CENTER : rig.seat;
        const distance = Math.hypot(target.x - rig.root.position.x, target.z - rig.root.position.z);
        const walking = distance > 0.06;
        const speaking = isActive && current.phase === 'speak';
        const bob = walking
          ? Math.abs(Math.sin(time * 8 + rig.phase)) * 0.045
          : Math.sin(time * (speaking ? 2.6 : 1.55) + rig.phase) * (speaking ? 0.026 : 0.012);

        rig.root.position.x += (target.x - rig.root.position.x) * approach;
        rig.root.position.z += (target.z - rig.root.position.z) * approach;
        rig.root.position.y += (target.y + bob - rig.root.position.y) * approach;
        rig.root.rotation.z += ((speaking ? Math.sin(time * 2.8) * 0.035 : 0) - rig.root.rotation.z) * approach;

        const targetScale = baseModelScale * (wantsCenter ? 1.16 : 1);
        const nextScale = rig.root.scale.x + (targetScale - rig.root.scale.x) * approach;
        rig.root.scale.setScalar(nextScale);

        rig.ring.rotation.z += delta * (isActive ? 1.35 : 0.35);
        rig.ring.material.opacity += ((isActive ? 0.72 : 0.2) - rig.ring.material.opacity) * approach;
        rig.ring.scale.setScalar(isActive ? 1 + Math.sin(time * 3) * 0.06 : 1);

        const label = labelRefs.current.get(rig.agentId);
        if (label) {
          projectedLabel.set(rig.root.position.x, rig.root.position.y + MODEL_HEIGHT * nextScale + 0.2, rig.root.position.z);
          projectedLabel.project(camera);
          const rawX = (projectedLabel.x * 0.5 + 0.5) * host.clientWidth;
          const rawY = (-projectedLabel.y * 0.5 + 0.5) * host.clientHeight;
          const x = Math.min(host.clientWidth - labelInset, Math.max(labelInset, rawX));
          const y = Math.min(host.clientHeight - 8, Math.max(46, rawY));
          label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          label.style.zIndex = String(100 + Math.round((1 - projectedLabel.z) * 50) + (isActive ? 40 : index));
          label.style.visibility = projectedLabel.z >= -1 && projectedLabel.z <= 1 ? 'visible' : 'hidden';
        }
      });

      renderer.render(scene, camera);
      scheduleFrame();
    }

    function resize() {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const layout = resolvePlazaViewportLayout(width, height);
      layoutScaleX = layout.layoutScaleX;
      baseModelScale = layout.modelScale;
      labelInset = layout.labelInset;
      camera.fov = layout.cameraFov;
      camera.position.y = layout.cameraY;
      camera.position.z = layout.cameraZ;
      camera.lookAt(0, 0.8, 0);
      rigs.forEach((rig, index) => {
        rig.seat.copy(seatPosition(index, rigs.length, layoutScaleX));
        if (activeRef.current?.agentId !== rig.agentId) {
          rig.root.position.x = rig.seat.x;
          rig.root.position.z = rig.seat.z;
          rig.root.scale.setScalar(baseModelScale);
        }
      });
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      wake();
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      parallaxX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
    }

    function handlePointerDown(event: PointerEvent) {
      wake();
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
        -((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rigs.map((rig) => rig.root), true)[0]?.object;
      let node: THREE.Object3D | null = hit ?? null;
      while (node) {
        const agentId = node.userData.agentId as string | undefined;
        if (agentId) {
          clickRef.current(agentId);
          return;
        }
        node = node.parent;
      }
    }

    function handleVisibilityChange() {
      setPaused('document-hidden', document.hidden);
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => setPaused('offscreen', !entry?.isIntersecting),
      { threshold: 0.05 },
    );
    intersectionObserver.observe(host);
    if (document.hidden) pauseReasons.add('document-hidden');

    resize();

    function prepareModel(model: THREE.Object3D, agentId: string) {
      model.rotation.y = MODEL_FRONT_YAW;
      normalizeModel(model);
      model.traverse((node) => {
        node.userData.agentId = agentId;
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = true;
        }
      });
      return model;
    }

    agents.forEach((agent, index) => {
      const root = new THREE.Group();
      root.name = `agent-role-${index + 1}`;
      root.userData.agentId = agent.id;
      const seat = seatPosition(index, agents.length, layoutScaleX);
      root.position.copy(seat);
      root.scale.setScalar(baseModelScale);
      const model = prepareModel(makeFallbackAgent(index), agent.id);
      root.add(model);
      const color = STATUS_COLOR[agent.status] ?? 0x8a7658;
      const ring = makeRoleRing(color);
      root.add(ring);
      scene.add(root);
      rigs.push({ agentId: agent.id, root, model, seat, ring, phase: index * 0.72 });
    });
    setLoadState({ status: agents.length > 0 ? 'ready' : 'error', completed: agents.length, failed: 0 });
    frame(performance.now());
    startLoop();
    armAutoPause();


    return () => {
      disposed = true;
      wakeRef.current = () => undefined;
      stopLoop();
      if (autoPauseId !== null) window.clearTimeout(autoPauseId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      labelRefs.current.forEach((label) => {
        label.style.visibility = 'hidden';
      });
      disposeObjectResources(scene);
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [rosterKey]);

  const loadMessage =
    loadState.status === 'loading'
      ? '正在准备 Agent 舞台'
      : loadState.status === 'staged'
        ? `${agents.length} 个 Agent 轻量席位已可用 · 正在载入孔子`
      : loadState.status === 'partial'
        ? loadState.completed < agents.length
          ? `舞台已可用 · 真实角色 ${loadState.completed - loadState.failed}/${agents.length} · 其余后台载入`
          : `${agents.length - loadState.failed}/${agents.length} 个真实角色已载入 · ${loadState.failed} 个使用轻量席位`
        : loadState.status === 'error'
          ? `真实角色载入失败，${agents.length} 个轻量席位仍可用`
          : `${agents.length} 个 Agent 已就位`;

  return (
    <div
      ref={mountRef}
      className={`plaza3d-root is-${loadState.status}`}
      aria-label="3D Agent 协同广场"
      onPointerDown={() => wakeRef.current()}
    >
      <div className="plaza3d-status" role="status" aria-live="polite">
        {loadMessage}
      </div>
      {agents.map((agent) => {
        const persona = getAgentPersona(agent.code, agent.layer);
        const isActive = active?.agentId === agent.id;
        return (
          <button
            key={agent.id}
            type="button"
            ref={(node) => {
              if (node) labelRefs.current.set(agent.id, node);
              else labelRefs.current.delete(agent.id);
            }}
            className={`plaza3d-label${coordinatorId === agent.id ? ' is-coordinator' : ''}${isActive ? ' is-active' : ''}`}
            onClick={() => {
              wakeRef.current();
              onCharacterClick(agent.id);
            }}
            aria-label={`${agent.nameZh} · ${persona.figure}（${agent.statusLabel}）`}
            aria-pressed={isActive}
          >
            <span
              className="plaza3d-dot"
              style={{ background: `#${(STATUS_COLOR[agent.status] ?? 0x8a7658).toString(16).padStart(6, '0')}` }}
            />
            <strong className="plaza3d-label-full">{agent.nameZh}</strong>
            <strong className="plaza3d-label-compact" aria-hidden="true">{compactAgentLabel(agent)}</strong>
            <small>{persona.figure} · {agent.statusLabel}</small>
          </button>
        );
      })}
    </div>
  );
}

function seatPosition(index: number, count: number, scaleX = 1): THREE.Vector3 {
  const angle = Math.PI / 2 + (index * Math.PI * 2) / Math.max(count, 1);
  return new THREE.Vector3(Math.cos(angle) * SEAT_RX * scaleX, 0, Math.sin(angle) * SEAT_RZ);
}

function compactAgentLabel(agent: AgentRoleCardView) {
  const knownLabels: Record<string, string> = {
    'AG-COORD': '协调',
    PRO: '专评',
    'AG-DEV': '开发',
    'UI-PRODUCT': 'UI',
    EXECUTOR: '执行',
    'AG-SEC': '安全',
    'AG-REVIEW': '复核',
    HANDOFF: '交接',
    'AG-ARCH': '架构',
    'AG-CODE': '开发',
    'AG-DOCS': '文档',
    'AG-GIT': '交付',
  };
  return knownLabels[agent.code] ?? agent.nameZh.replace(/\s*Agent\s*/gi, '').slice(0, 4);
}

function normalizeModel(root: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z, 0.0001);
  const scale = MODEL_HEIGHT / maxAxis;
  const bottomCenter = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) / 2,
  );
  root.scale.setScalar(scale);
  root.position.set(-bottomCenter.x * scale, -bottomCenter.y * scale, -bottomCenter.z * scale);
  root.updateMatrixWorld(true);
}

function makeRoleRing(color: number) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.026, 8, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;
  return ring;
}

function makeFallbackAgent(index: number) {
  const colors = [0x4f8c82, 0xc59c52, 0x6d88a6, 0x8a6f9d, 0x537c65, 0xa7655d, 0x678c9b, 0x9b7b50];
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.78 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 5, 10), material);
  body.position.y = 0.68;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0d2ae, roughness: 0.82 }),
  );
  head.position.y = 1.48;
  group.add(body, head);
  return group;
}

function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const materialList = Array.isArray(material) ? material : material ? [material] : [];
    materialList.forEach((item) => {
      materials.add(item);
      Object.values(item).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
