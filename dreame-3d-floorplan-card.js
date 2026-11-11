class Dreame3DFloorplanCard extends HTMLElement {
  setConfig(config) {
    this.config = config || {};
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._built = false;
    this._threeLoaded = false;
    this._meshBuilt = false;
    this._roomLights3D = {};
    this._roomBulbs3D = {};
    this._raycaster = null;
    this._roomHitBoxes = [];
    this._lastMapSrc = null;
    this._lastStateHash = "";
    this._renderPending = false;
    this._isVisible = true;
    this._cal = { ox: 166, oy: 85, scale: 0.08, W: 752, H: 956 };
    this._cameraEntity = (this.config && this.config.camera_entity) || "camera.roberto_map";
    this._vacuumEntity = (this.config && this.config.vacuum_entity) || "vacuum.roberto";
    this._batteryEntity = (this.config && this.config.battery_entity) || "sensor.roberto_battery_level";
    this._allLightsEntity = (this.config && this.config.all_lights_entity) || "light.all_lights";
  }

  static getStubConfig() {
    return {
      camera_entity: "camera.roberto_map",
      vacuum_entity: "vacuum.roberto",
      battery_entity: "sensor.roberto_battery_level",
      all_lights_entity: "light.all_lights",
      auto_discover: true,
      rooms: []
    };
  }

  _getHouseBounds(rooms) {
    if (this.config && this.config.bounds) return this.config.bounds;
    if (this.config && this.config.auto_discover === true && rooms && rooms.length > 0) {
      return {
        minVx: Math.min(...rooms.map((r) => r.x0)) - 50,
        maxVx: Math.max(...rooms.map((r) => r.x1)) + 50,
        minVy: Math.min(...rooms.map((r) => r.y0)) - 50,
        maxVy: Math.max(...rooms.map((r) => r.y1)) + 50
      };
    }
    return { minVx: -1350, maxVx: 6650, minVy: -9950, maxVy: 400 };
  }

  _autoGenerateWallsFromRooms(rooms) {
    const walls = [];
    (rooms || []).forEach((r) => {
      walls.push(
        [r.x0, r.y0, r.x1, r.y0],
        [r.x0, r.y1, r.x1, r.y1],
        [r.x0, r.y0, r.x0, r.y1],
        [r.x1, r.y0, r.x1, r.y1]
      );
    });
    return walls;
  }

  _autoDiscoverRoomsFromCamera() {
    if (!this._hass) return [];
    const cam = this._hass.states[this._cameraEntity] || this._hass.states["camera.roberto_map_1"];
    const rawRooms = cam && cam.attributes && cam.attributes.rooms;
    if (!rawRooms || typeof rawRooms !== "object") return [];
    const defaultColors = [0xffb300, 0xffa726, 0xffe082, 0xfff176, 0xffb74d, 0xffd54f, 0x80deea];
    return Object.values(rawRooms).map((r, idx) => ({
      id: r.room_id || Number(idx + 1),
      name: r.name || `Room ${idx + 1}`,
      icon: r.icon || "mdi:floor-plan",
      entity: (this.config && this.config.room_entities && this.config.room_entities[r.room_id]) || "",
      x0: r.x0,
      y0: r.y0,
      x1: r.x1,
      y1: r.y1,
      cx: r.x !== undefined ? r.x : Math.round((r.x0 + r.x1) / 2),
      cy: r.y !== undefined ? r.y : Math.round((r.y0 + r.y1) / 2),
      color: defaultColors[idx % defaultColors.length]
    }));
  }

  connectedCallback() {
    if (this._visHandler) {
      document.addEventListener("visibilitychange", this._visHandler);
    }
    this._requestRender();
  }

  disconnectedCallback() {
    if (this._visHandler) {
      document.removeEventListener("visibilitychange", this._visHandler);
    }
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._buildDOM();
      this._built = true;
      this._initThreeScene();
    }
    this._updateStates();
  }

  _getRooms() {
    if (this.config && Array.isArray(this.config.rooms) && this.config.rooms.length > 0) {
      return this.config.rooms.map((r) => ({
        ...r,
        color: typeof r.color === "string" ? parseInt(r.color.replace("#", ""), 16) : (r.color || 0xffb300)
      }));
    }
    if (this.config && this.config.auto_discover === true) {
      const autoRooms = this._autoDiscoverRoomsFromCamera();
      if (autoRooms.length > 0) return autoRooms;
    }
    return [
      {
        id: 2,
        name: "Woonkamer",
        icon: "mdi:sofa",
        entity: "light.livingroom_ceiling_light",
        temp: "sensor.alpstuga_air_quality_monitor_temperatuur_2",
        x0: -1350, y0: -5450, x1: 2700, y1: 400,
        cx: 650, cy: -2400,
        color: 0xffb300
      },
      {
        id: 1,
        name: "Slaapkamer",
        icon: "mdi:bed",
        entity: "light.ikea_bedroom_light",
        temp: "sensor.bedroom_ikea_bedroom_c02_temperatuur",
        x0: 2700, y0: -4350, x1: 5500, y1: -350,
        cx: 4100, cy: -2350,
        color: 0xffa726
      },
      {
        id: 6,
        name: "Gang",
        icon: "mdi:human-greeting",
        entity: "light.ikea_hall_light",
        x0: 2700, y0: -6250, x1: 6650, y1: -4350,
        cx: 4675, cy: -5300,
        color: 0xffd54f
      },
      {
        id: 5,
        name: "Eetkamer",
        icon: "mdi:silverware-fork-knife",
        entity: "light.ikea_diningroom_light",
        x0: -1350, y0: -9250, x1: 1425, y1: -5450,
        cx: 50, cy: -7350,
        color: 0xffb74d
      },
      {
        id: 7,
        name: "Badkamer",
        icon: "mdi:shower-head",
        entity: "light.ikea_bathroom_light",
        x0: 1425, y0: -9250, x1: 2600, y1: -7300,
        cx: 2010, cy: -8275,
        color: 0x80deea
      },
      {
        id: 4,
        name: "Keuken",
        icon: "mdi:fridge-outline",
        entity: "light.ikea_kitchen_light",
        temp: "sensor.0xa4c13842084d2f73_temperature",
        x0: 3250, y0: -9950, x1: 4600, y1: -6250,
        cx: 3925, cy: -8100,
        color: 0xfff176
      },
      {
        id: 3,
        name: "Studeerkamer",
        icon: "mdi:desk",
        entity: "light.ikea_workroom_light",
        temp: "sensor.poep_sensor_temperature",
        x0: 4600, y0: -9950, x1: 6650, y1: -6250,
        cx: 5625, cy: -7850,
        color: 0xffe082
      }
    ];
  }

  _updateCalibrationFromAttrs(attrs) {
    if (!attrs || !attrs.calibration_points || attrs.calibration_points.length < 2) return;
    const p0 = attrs.calibration_points[0];
    const p1 = attrs.calibration_points[1];
    if (p0 && p0.map && p1 && p1.map && p1.vacuum) {
      const scale = (p1.map.x - p0.map.x) / (p1.vacuum.x - p0.vacuum.x);
      this._cal.ox = p0.map.x - p0.vacuum.x * scale;
      this._cal.oy = p0.map.y + p0.vacuum.y * scale;
      this._cal.scale = scale || 0.08;
    }
  }

  _vacToMapPx(vx, vy) {
    return {
      px: this._cal.ox + vx * this._cal.scale,
      py: this._cal.oy - vy * this._cal.scale
    };
  }

  _vacToWorld(vx, vy) {
    return {
      wx: (vx - 2650) / 100,
      wz: -(vy - (-4800)) / 100
    };
  }

  _toggleEntity(entityId) {
    if (!this._hass || !entityId) return;
    const domain = entityId.split(".")[0];
    this._hass.callService(domain, "toggle", { entity_id: entityId });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _requestRender() {
    if (this._renderPending || !this._isVisible || document.hidden) return;
    if (!this._camera || !this._renderer || !this._scene) return;
    this._renderPending = true;
    requestAnimationFrame(() => {
      this._renderPending = false;
      if (!this._camera || !this._renderer || !this._scene) return;
      const { radius, phi, theta } = this._spherical;
      this._camera.position.x = this._target.x + radius * Math.sin(phi) * Math.sin(theta);
      this._camera.position.y = this._target.y + radius * Math.cos(phi);
      this._camera.position.z = this._target.z + radius * Math.sin(phi) * Math.cos(theta);
      this._camera.lookAt(this._target);
      this._renderer.render(this._scene, this._camera);
      this._updatePinProjections();
    });
  }

  _buildDOM() {
    const rooms = this._getRooms();
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        ha-card {
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 0;
          margin: 0;
          color: var(--primary-text-color, #fff);
          overflow: hidden;
          position: relative;
          width: 100%;
          height: calc(100vh - 104px);
          min-height: 640px;
        }
        .floating-hud {
          position: absolute;
          top: 10px;
          left: 16px;
          right: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          z-index: 5;
          pointer-events: none;
        }
        .hud-pill {
          pointer-events: auto;
          background: rgba(18, 21, 26, 0.78);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          padding: 6px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 14px rgba(0,0,0,0.45);
        }
        .battery-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #00e676;
        }
        .cam-bar {
          pointer-events: auto;
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }
        .mini-btn {
          background: rgba(18, 21, 26, 0.78);
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--primary-text-color, #eee);
          border-radius: 999px;
          padding: 6px 13px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .mini-btn:hover { border-color: #ff9800; color: #ffb74d; }

        .view-pane {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: transparent;
          user-select: none;
        }
        #webgl-container {
          width: 100%;
          height: 100%;
          position: relative;
          cursor: grab;
          touch-action: none;
        }
        #webgl-container:active { cursor: grabbing; }
        #labels-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .pin-3d {
          position: absolute;
          left: 0;
          top: 0;
          will-change: transform;
          background: rgba(18, 20, 24, 0.9);
          border: 1.5px solid rgba(255,255,255,0.22);
          border-radius: 999px;
          padding: 5px 11px;
          display: flex;
          align-items: center;
          gap: 6px;
          pointer-events: auto;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.65);
          transition: border-color 0.2s, background 0.2s;
          white-space: nowrap;
        }
        .pin-3d:hover {
          border-color: #ffb74d;
        }
        .pin-3d.light-on {
          border-color: #ffb300;
          background: rgba(42, 31, 10, 0.95);
          box-shadow: 0 4px 14px rgba(255, 179, 0, 0.45);
        }
        .pin-3d ha-icon {
          --mdc-icon-size: 16px;
          color: #90a4ae;
        }
        .pin-3d.light-on ha-icon {
          color: #ffd54f;
        }
        .pin-3d-txt {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
        }
        .pin-3d-sub {
          font-size: 10px;
          opacity: 0.82;
          color: #cfd8dc;
        }
      </style>

      <ha-card>
        <div class="floating-hud">
          <div class="hud-pill">
            <ha-icon icon="mdi:floor-plan" style="color:#ff9800;--mdc-icon-size:18px;"></ha-icon>
            <span id="status-txt">Loading 3D floorplan...</span>
          </div>
          <div class="cam-bar">
            <button class="mini-btn" id="cam-iso">Isometric</button>
            <button class="mini-btn" id="cam-south">South</button>
            <button class="mini-btn" id="cam-top">Top-Down</button>
            <button class="mini-btn" id="cam-low">Low Angle</button>
            <button class="mini-btn" id="all-off-btn">All Lights Off</button>
          </div>
        </div>

        <div class="view-pane" id="view-webgl3d">
          <div id="webgl-container"></div>
          <div id="labels-overlay"></div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.getElementById("all-off-btn").addEventListener("click", () => {
      if (this._hass) this._hass.callService("light", "turn_off", { entity_id: this._allLightsEntity });
    });

    const overlay = this.shadowRoot.getElementById("labels-overlay");

    const vacPin = document.createElement("div");
    vacPin.className = "pin-3d";
    vacPin.id = "pin3d-vac";
    vacPin.style.cssText = "border-color:#00e676; background:rgba(10,32,20,0.92); padding:3px 9px; gap:4px; z-index:4;";
    vacPin.innerHTML = `
      <ha-icon icon="mdi:battery" id="vac-bat-icon" style="--mdc-icon-size:14px; color:#00e676;"></ha-icon>
      <span class="pin-3d-txt" id="vac-bat-txt" style="color:#00e676;">--%</span>
    `;
    vacPin.addEventListener("click", (e) => {
      e.stopPropagation();
      this._moreInfo(this._vacuumEntity);
    });
    overlay.appendChild(vacPin);

    const bindTapHold = (el, entityId) => {
      let timer = null;
      let held = false;
      el.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        held = false;
        timer = setTimeout(() => {
          held = true;
          this._moreInfo(entityId);
        }, 500);
      });
      el.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        clearTimeout(timer);
        if (!held) this._toggleEntity(entityId);
      });
      el.addEventListener("pointerleave", () => clearTimeout(timer));
    };

    rooms.forEach((r) => {
      const pin = document.createElement("div");
      pin.className = "pin-3d";
      pin.id = `pin3d-${r.id}`;
      pin.innerHTML = `
        <ha-icon icon="${r.icon}"></ha-icon>
        <span class="pin-3d-txt">${r.name}</span>
        <span class="pin-3d-sub" id="p3dmeta-${r.id}">--</span>
      `;
      bindTapHold(pin, r.entity);
      overlay.appendChild(pin);
    });
  }

  _createGreyWoodTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#b5b8bc";
    ctx.fillRect(0, 0, 512, 512);

    const numPlanks = 8;
    const plankH = 512 / numPlanks;
    const tones = ["#b8bbbf", "#aeb1b6", "#bcbec2", "#b2b5b9", "#c0c2c6", "#aaadb2"];

    for (let row = 0; row < numPlanks; row++) {
      const y = row * plankH;
      const offset = (row % 2 === 0) ? 0 : 128;

      for (let col = -1; col < 3; col++) {
        const x = col * 256 + offset;
        ctx.fillStyle = tones[(row * 3 + col + 6) % tones.length];
        ctx.fillRect(x, y, 256, plankH);

        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        for (let g = 0; g < 10; g++) {
          const gy = y + ((g * 7 + row * 13) % (plankH - 4));
          ctx.fillRect(x + 8, gy, 240, 1.5);
        }
        ctx.fillStyle = "rgba(60, 64, 70, 0.06)";
        for (let g = 0; g < 8; g++) {
          const gy = y + ((g * 11 + row * 5) % (plankH - 3));
          ctx.fillRect(x + 4, gy, 248, 1);
        }

        ctx.fillStyle = "rgba(50, 54, 60, 0.32)";
        ctx.fillRect(x, y, 2, plankH);
      }

      ctx.fillStyle = "rgba(45, 48, 54, 0.38)";
      ctx.fillRect(0, y, 512, 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.fillRect(0, y + 2, 512, 1);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 9);
    return tex;
  }

  async _loadThreeJS() {
    if (window.THREE) return window.THREE;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-threejs="r128"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.THREE));
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s.dataset.threejs = "r128";
      s.onload = () => resolve(window.THREE);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async _initThreeScene() {
    try {
      const THREE = await this._loadThreeJS();
      this._THREE = THREE;
      const container = this.shadowRoot.getElementById("webgl-container");
      const width = container.clientWidth || 1200;
      const height = container.clientHeight || 820;

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(38, width / height, 1, 1000);
      this._spherical = { radius: 132, phi: 0.76, theta: 0.38 };
      this._target = new THREE.Vector3(0, 0, 2);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
        precision: "mediump"
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.shadowMap.enabled = false;
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      const hemi = new THREE.HemisphereLight(0xdce2e8, 0x383e48, 0.30);
      scene.add(hemi);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.18);
      dirLight.position.set(45, 95, 55);
      scene.add(dirLight);

      const rooms = this._getRooms();
      this._raycaster = new THREE.Raycaster();
      this._roomHitBoxes = [];

      const orbGeo = new THREE.SphereGeometry(0.95, 10, 10);

      rooms.forEach((r) => {
        const c = this._vacToWorld(r.cx, r.cy);
        const p0 = this._vacToWorld(r.x0, r.y1);
        const p1 = this._vacToWorld(r.x1, r.y0);
        const rw = Math.abs(p1.wx - p0.wx);
        const rz = Math.abs(p1.wz - p0.wz);

        const pl = new THREE.PointLight(r.color, 0, 20, 2.0);
        pl.position.set(c.wx, 6.0, c.wz);
        pl.castShadow = false;
        scene.add(pl);
        this._roomLights3D[r.id] = pl;

        const orbMat = new THREE.MeshBasicMaterial({ color: 0x455a64 });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(c.wx, 9.5, c.wz);
        scene.add(orb);
        this._roomBulbs3D[r.id] = orb;

        const hitGeo = new THREE.BoxGeometry(rw * 0.94, 7, rz * 0.94);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.set((p0.wx + p1.wx) / 2, 3.5, (p0.wz + p1.wz) / 2);
        hitMesh.userData = { roomId: r.id, entity: r.entity };
        scene.add(hitMesh);
        this._roomHitBoxes.push(hitMesh);
      });

      const dockGroup = new THREE.Group();
      const dockBody = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 3.8, 2.4),
        new THREE.MeshLambertMaterial({ color: 0x29b6f6 })
      );
      dockBody.position.y = 1.9;
      dockGroup.add(dockBody);
      scene.add(dockGroup);
      this._dock3D = dockGroup;

      const vacGroup = new THREE.Group();
      const vacCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.75, 0.95, 18),
        new THREE.MeshLambertMaterial({ color: 0x00e676, emissive: 0x004d25 })
      );
      vacCyl.position.y = 0.65;
      const vacTurret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.45, 12),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      vacTurret.position.y = 1.3;
      vacGroup.add(vacCyl);
      vacGroup.add(vacTurret);
      scene.add(vacGroup);
      this._vac3D = vacGroup;

      this._scene = scene;
      this._camera = camera;
      this._renderer = renderer;
      this._threeLoaded = true;

      const activePointers = new Map();
      let lastPinchDist = 0;
      let moved = false;
      let startX = 0, startY = 0;

      container.addEventListener("pointerdown", (e) => {
        container.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size === 1) {
          moved = false;
          startX = e.clientX;
          startY = e.clientY;
        } else if (activePointers.size === 2) {
          const pts = Array.from(activePointers.values());
          lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
      });

      container.addEventListener("pointermove", (e) => {
        if (!activePointers.has(e.pointerId)) return;
        const prev = activePointers.get(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 1) {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) moved = true;
          this._spherical.theta -= dx * 0.0075;
          this._spherical.phi = Math.max(0.18, Math.min(1.42, this._spherical.phi - dy * 0.0065));
          this._requestRender();
        } else if (activePointers.size === 2) {
          moved = true;
          const pts = Array.from(activePointers.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (lastPinchDist > 0) {
            const delta = lastPinchDist - dist;
            this._spherical.radius = Math.max(55, Math.min(220, this._spherical.radius + delta * 0.25));
            this._requestRender();
          }
          lastPinchDist = dist;
        }
      });

      const endPointer = (e) => {
        if (activePointers.size === 1 && !moved && e.type === "pointerup") {
          this._handleCanvasClick(e);
        }
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) lastPinchDist = 0;
      };
      container.addEventListener("pointerup", endPointer);
      container.addEventListener("pointercancel", endPointer);

      container.addEventListener("wheel", (e) => {
        e.preventDefault();
        this._spherical.radius = Math.max(55, Math.min(220, this._spherical.radius + e.deltaY * 0.08));
        this._requestRender();
      }, { passive: false });

      this.shadowRoot.getElementById("cam-iso").addEventListener("click", () => {
        this._spherical = { radius: 132, phi: 0.76, theta: 0.38 };
        this._requestRender();
      });
      this.shadowRoot.getElementById("cam-south").addEventListener("click", () => {
        this._spherical = { radius: 128, phi: 0.85, theta: -0.22 };
        this._requestRender();
      });
      this.shadowRoot.getElementById("cam-top").addEventListener("click", () => {
        this._spherical = { radius: 140, phi: 0.18, theta: 0.0 };
        this._requestRender();
      });
      this.shadowRoot.getElementById("cam-low").addEventListener("click", () => {
        this._spherical = { radius: 112, phi: 1.12, theta: 0.55 };
        this._requestRender();
      });

      this._ro = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          this._requestRender();
        }
      });
      this._ro.observe(container);

      this._io = new IntersectionObserver((entries) => {
        this._isVisible = entries[0] && entries[0].isIntersecting;
        if (this._isVisible) this._requestRender();
      });
      this._io.observe(this);

      this._visHandler = () => {
        if (!document.hidden) this._requestRender();
      };
      document.addEventListener("visibilitychange", this._visHandler);

      this._lastStateHash = "";
      this._updateStates();
      this._requestRender();
    } catch (err) {
      console.error("WebGL init error:", err);
    }
  }

  _handleCanvasClick(e) {
    if (!this._raycaster || !this._camera || !this._renderer) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouse = new this._THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(mouse, this._camera);
    const hits = this._raycaster.intersectObjects(this._roomHitBoxes);
    if (hits.length > 0 && hits[0].object.userData.entity) {
      this._toggleEntity(hits[0].object.userData.entity);
    }
  }

  _updatePinProjections() {
    if (!this._camera || !this._renderer) return;
    const THREE = this._THREE;
    const rooms = this._getRooms();
    const w = this._renderer.domElement.clientWidth;
    const h = this._renderer.domElement.clientHeight;
    if (!w || !h) return;

    rooms.forEach((r) => {
      const pin = this.shadowRoot.getElementById(`pin3d-${r.id}`);
      if (!pin) return;
      const c = this._vacToWorld(r.cx, r.cy);
      const vec = new THREE.Vector3(c.wx, 7.2, c.wz);
      vec.project(this._camera);
      const x = Math.round((vec.x * 0.5 + 0.5) * w);
      const y = Math.round((-(vec.y * 0.5) + 0.5) * h);
      pin.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    });

    const vacPin = this.shadowRoot.getElementById("pin3d-vac");
    if (vacPin && this._vac3D) {
      const vVec = new THREE.Vector3(this._vac3D.position.x, 3.2, this._vac3D.position.z);
      vVec.project(this._camera);
      const vx = Math.round((vVec.x * 0.5 + 0.5) * w);
      const vy = Math.round((-(vVec.y * 0.5) + 0.5) * h);
      vacPin.style.transform = `translate3d(${vx}px, ${vy}px, 0) translate(-50%, -100%)`;
    }
  }

  _buildArchitectural3DModel(camAttrs) {
    const THREE = this._THREE;
    if (!THREE || !this._scene) return;

    if (this._mapGroup) {
      this._scene.remove(this._mapGroup);
    }
    const mapGroup = new THREE.Group();

    const rooms = this._getRooms();
    const woodTex = this._createGreyWoodTexture(THREE);
    this._woodPatternCanvas = woodTex.image;

    const lmW = 160, lmH = 210;
    this._lmCanvas = document.createElement("canvas");
    this._lmCanvas.width = lmW;
    this._lmCanvas.height = lmH;
    this._lmCtx = this._lmCanvas.getContext("2d");
    this._lmImgData = this._lmCtx.createImageData(lmW, lmH);

    const hiW = 1024, hiH = 1320;
    this._hiCanvas = document.createElement("canvas");
    this._hiCanvas.width = hiW;
    this._hiCanvas.height = hiH;
    this._hiCtx = this._hiCanvas.getContext("2d");
    this._hiTex = new THREE.CanvasTexture(this._hiCanvas);
    this._hiTex.minFilter = THREE.LinearFilter;
    this._hiTex.magFilter = THREE.LinearFilter;
    const floorMat = new THREE.MeshBasicMaterial({ map: this._hiTex });

    const { minVx, maxVx, minVy, maxVy } = this._getHouseBounds(rooms);
    const extraFloors = (this.config && Array.isArray(this.config.extra_floors))
      ? this.config.extra_floors
      : (this.config && this.config.auto_discover === true ? [] : [{ x0: 1425, y0: -7300, x1: 3250, y1: -5450 }]);
    const floorBoxes = [
      ...rooms.map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })),
      ...extraFloors
    ];

    floorBoxes.forEach((b) => {
      const p0 = this._vacToWorld(b.x0, b.y1);
      const p1 = this._vacToWorld(b.x1, b.y0);
      const fw = Math.abs(p1.wx - p0.wx);
      const fz = Math.abs(p1.wz - p0.wz);
      const cx = (p0.wx + p1.wx) / 2;
      const cz = (p0.wz + p1.wz) / 2;

      const fGeo = new THREE.BoxGeometry(fw, 0.5, fz);
      const pos = fGeo.attributes.position;
      const uvAttr = fGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const wx = cx + pos.getX(i);
        const wz = cz + pos.getZ(i);
        const vx = wx * 100 + 2650;
        const vy = -wz * 100 - 4800;
        const u = (vx - minVx) / (maxVx - minVx);
        const v = (vy - minVy) / (maxVy - minVy);
        uvAttr.setXY(i, u, v);
      }
      const fMesh = new THREE.Mesh(fGeo, floorMat);
      fMesh.position.set(cx, -0.22, cz);
      mapGroup.add(fMesh);
    });

    const wallMatOuter = new THREE.MeshLambertMaterial({ color: 0xe8edf3 });
    const wallMatInner = new THREE.MeshLambertMaterial({ color: 0xdce3eb });

    const addWallSegment = (vx0, vy0, vx1, vy1, thickMm = 200, isOuter = false) => {
      const p0 = this._vacToWorld(vx0, vy0);
      const p1 = this._vacToWorld(vx1, vy1);
      const dx = p1.wx - p0.wx;
      const dz = p1.wz - p0.wz;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) return;

      const thick = thickMm / 100;
      const wallH = 6.6;
      const wGeo = new THREE.BoxGeometry(len + thick, wallH, thick);
      const wMesh = new THREE.Mesh(wGeo, isOuter ? wallMatOuter : wallMatInner);
      wMesh.position.set((p0.wx + p1.wx) / 2, wallH / 2, (p0.wz + p1.wz) / 2);
      wMesh.rotation.y = -Math.atan2(dz, dx);
      mapGroup.add(wMesh);
    };

    const outerWalls = (this.config && Array.isArray(this.config.outer_walls)) ? this.config.outer_walls : (
      this.config && this.config.auto_discover === true ? this._autoGenerateWallsFromRooms(rooms) : [
      [-1350, 400, -1350, -9250],
      [-1350, 400, 2700, 400],
      [2700, 400, 2700, -350],
      [2700, -350, 5500, -350],
      [5500, -350, 5500, -4350],
      [5500, -4350, 6650, -4350],
      [6650, -4350, 6650, -9950],
      [6650, -9950, 3250, -9950],
      [3250, -9950, 3250, -7300],
      [3250, -7300, 2600, -7300],
      [2600, -9250, -1350, -9250],
      [2600, -9250, 2600, -7300]
    ]);
    outerWalls.forEach(([x0, y0, x1, y1, thick]) => addWallSegment(x0, y0, x1, y1, thick || 220, true));

    const innerWalls = (this.config && Array.isArray(this.config.inner_walls)) ? this.config.inner_walls : (
      this.config && this.config.auto_discover === true ? [] : [
      [2700, -350, 2700, -4350],
      [2700, -5350, 2700, -5550],
      [2700, -6150, 2700, -7300],
      [3250, -6250, 3250, -7300],
      [2700, -6250, 2800, -6250],
      [3150, -6250, 3400, -6250],
      [4150, -6250, 4600, -6250],
      [2700, -4350, 3650, -4350],
      [4450, -4350, 5500, -4350],
      [1425, -5450, 2700, -5450],
      [1425, -5450, 1425, -8250],
      [1425, -9050, 1425, -9250],
      [1425, -7300, 2700, -7300],
      [5350, -6250, 6650, -6250],
      [4600, -6250, 4600, -9950]
    ]);
    innerWalls.forEach(([x0, y0, x1, y1, thick]) => addWallSegment(x0, y0, x1, y1, thick || 200, false));

    const customModels = (this.config && Array.isArray(this.config.custom_models)) ? this.config.custom_models : (
      this.config && this.config.auto_discover === true ? [] : [
      { type: "workbench_setup", x0: 4700, y0: -9400, x1: 6550, y1: -9900 },
      { type: "hoekbank" }
    ]);
    const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });

    customModels.forEach((cm) => {
      if (cm.type === "workbench_setup") {
        const wb0 = this._vacToWorld(cm.x0 ?? 4700, cm.y0 ?? -9400);
        const wb1 = this._vacToWorld(cm.x1 ?? 6550, cm.y1 ?? -9900);
        const wbw = Math.abs(wb1.wx - wb0.wx);
        const wbz = Math.abs(wb1.wz - wb0.wz);
        const wbx = (wb0.wx + wb1.wx) / 2;
        const wbzPos = (wb0.wz + wb1.wz) / 2;
        const wbGroup = new THREE.Group();
        wbGroup.position.set(wbx, 0, wbzPos);
        const wbPart = (w, h, d, hex, x, y, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
          m.position.set(x, y, z);
          wbGroup.add(m);
        };
        wbPart(wbw, 0.25, wbz, 0xc8b29b, 0, 2.4, 0);
        wbPart(0.25, 2.4, wbz * 0.9, 0x37474f, -wbw / 2 + 0.2, 1.2, 0);
        wbPart(0.25, 2.4, wbz * 0.9, 0x37474f, wbw / 2 - 0.2, 1.2, 0);
        wbPart(wbw * 0.38, 2.0, wbz * 0.82, 0x1c2228, -wbw * 0.22, 1.0, 0);
        wbPart(wbw * 0.34, 0.08, 0.1, 0x00e676, -wbw * 0.22, 1.6, -wbz * 0.42);
        const a1X = -wbw * 0.24;
        wbPart(2.8, 0.25, 2.8, 0x37474f, a1X, 2.65, 0);
        wbPart(2.0, 0.08, 2.0, 0xff9800, a1X, 2.82, 0);
        wbPart(0.22, 2.6, 0.22, 0xb0bec5, a1X - 1.2, 3.8, -0.2);
        wbPart(0.22, 2.6, 0.22, 0xb0bec5, a1X + 1.2, 3.8, -0.2);
        wbPart(2.6, 0.22, 0.22, 0xb0bec5, a1X, 5.0, -0.2);
        wbPart(2.5, 0.24, 0.35, 0x455a64, a1X, 3.9, 0);
        wbPart(0.55, 0.65, 0.55, 0xeceff1, a1X, 3.95, 0.2);
        const u1X = wbw * 0.22;
        wbPart(3.2, 3.1, 3.2, 0x263238, u1X, 4.05, 0);
        wbPart(2.6, 2.3, 0.1, 0x546e7a, u1X, 4.0, -1.58);
        wbPart(0.45, 0.35, 0.45, 0xff5252, u1X - 0.9, 5.65, -0.8);
        wbPart(0.45, 0.35, 0.45, 0x40c4ff, u1X - 0.3, 5.65, -0.8);
        wbPart(0.45, 0.35, 0.45, 0xffd740, u1X + 0.3, 5.65, -0.8);
        wbPart(0.45, 0.35, 0.45, 0x69f0ae, u1X + 0.9, 5.65, -0.8);
        mapGroup.add(wbGroup);
      } else if (cm.type === "hoekbank") {
        const hbGroup = new THREE.Group();
        const fabM = mat(0x455a64), cushM = mat(0x546e7a), baseM = mat(0x263238), pilM = mat(0x78909c);
        const addHbBox = (vx0, vy0, vx1, vy1, h, yBottom, m) => {
          const p0 = this._vacToWorld(vx0, vy1);
          const p1 = this._vacToWorld(vx1, vy0);
          const w = Math.abs(p1.wx - p0.wx), d = Math.abs(p1.wz - p0.wz);
          const cx = (p0.wx + p1.wx) / 2, cz = (p0.wz + p1.wz) / 2;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
          mesh.position.set(cx, yBottom + h / 2, cz);
          hbGroup.add(mesh);
        };
        addHbBox(-1300, -2475, -400, -250, 0.40, 0.05, baseM);
        addHbBox(-400, -1100, 150, -250, 0.40, 0.05, baseM);
        addHbBox(-1300, -2475, -1080, -250, 1.85, 0.45, fabM);
        addHbBox(-1080, -470, 150, -250, 1.85, 0.45, fabM);
        addHbBox(-1300, -2475, -400, -2290, 1.15, 0.45, fabM);
        addHbBox(-30, -1100, 150, -250, 1.15, 0.45, fabM);
        addHbBox(-1060, -1090, -420, -490, 0.48, 0.45, cushM);
        addHbBox(-1060, -1680, -420, -1120, 0.48, 0.45, cushM);
        addHbBox(-1060, -2270, -420, -1710, 0.48, 0.45, cushM);
        addHbBox(-390, -1090, -50, -490, 0.48, 0.45, cushM);
        addHbBox(-1030, -720, -820, -520, 0.55, 0.93, pilM);
        addHbBox(-1030, -2180, -850, -1920, 0.50, 0.93, pilM);
        mapGroup.add(hbGroup);
      }
    });

    const furnOverrides = (this.config && this.config.furniture_overrides) || (
      this.config && this.config.auto_discover === true ? { bed: { rotate_add: 180 }, eettafel: { rotate_add: 90 }, exclude_types: [] } : {
      boekenplank: { x0: -1350 },
      bed: { rotate_add: 180 },
      eettafel: { rotate_add: 90 },
      exclude_types: ["bank"]
    });

    const buildFurniture3D = (type, fw, fz, angleDeg = 0) => {
      const g = new THREE.Group();
      const t = (type || "").toLowerCase();
      const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        g.add(mesh);
        return mesh;
      };
      let adjAngle = angleDeg;
      Object.keys(furnOverrides).forEach((k) => {
        if (k !== "exclude_types" && t.includes(k) && furnOverrides[k].rotate_add) {
          adjAngle = (angleDeg + furnOverrides[k].rotate_add) % 360;
        }
      });

      const isRot = (Math.round(adjAngle) % 180 !== 0);
      const W = isRot ? fz : fw;
      const D = isRot ? fw : fz;

      if (t.includes("boekenplank")) {
        const H = 4.2, thick = 0.22;
        const frameMat = mat(0xe0dcd5), binMat1 = mat(0x546e7a), binMat2 = mat(0x8d6e63);
        box(W, thick, D, frameMat, 0, H - thick / 2, 0);
        box(W, thick, D, frameMat, 0, thick / 2, 0);
        box(thick, H, D, frameMat, -W / 2 + thick / 2, H / 2, 0);
        box(thick, H, D, frameMat, W / 2 - thick / 2, H / 2, 0);
        box(W - thick * 2, thick * 0.8, D * 0.96, frameMat, 0, H / 3, 0);
        box(W - thick * 2, thick * 0.8, D * 0.96, frameMat, 0, (H * 2) / 3, 0);
        for (let i = 1; i <= 3; i++) {
          box(thick * 0.8, H - thick * 2, D * 0.96, frameMat, -W / 2 + (W * i) / 4, H / 2, 0);
        }
        const colW = W / 4 - thick * 1.2;
        box(colW, H / 3 - thick, D * 0.88, binMat1, -W * 0.375, H / 6, 0);
        box(colW, H / 3 - thick, D * 0.88, binMat2, -W * 0.125, H / 6, 0);
        box(colW, H / 3 - thick, D * 0.88, binMat1, W * 0.375, H / 6, 0);
      } else if (t.includes("bed")) {
        const woodM = mat(0x6d4c41), mattM = mat(0xf5f7fa), duvM = mat(0x455a64), pil2M = mat(0xdfe6ed);
        box(W, 0.7, D, woodM, 0, 0.35, 0);
        box(W, 2.5, 0.35, woodM, 0, 1.25, -D / 2 + 0.18);
        box(W * 0.94, 0.65, D * 0.92, mattM, 0, 1.0, 0.05);
        box(W * 0.95, 0.72, D * 0.58, duvM, 0, 1.05, D * 0.16);
        box(W * 0.36, 0.28, D * 0.18, pil2M, -W * 0.23, 1.42, -D * 0.30);
        box(W * 0.36, 0.28, D * 0.18, pil2M, W * 0.23, 1.42, -D * 0.30);
      } else if (t.includes("bank")) {
        const fabM = mat(0x455a64), cushM = mat(0x546e7a), legM = mat(0x263238);
        box(W, 0.45, D, legM, 0, 0.25, 0);
        box(W, 1.9, D * 0.24, fabM, 0, 1.2, -D / 2 + D * 0.12);
        box(0.38, 1.35, D, fabM, -W / 2 + 0.19, 0.9, 0);
        box(0.38, 1.35, D, fabM, W / 2 - 0.19, 0.9, 0);
        const cw = (W - 0.82) / 2;
        box(cw, 0.55, D * 0.72, cushM, -cw / 2 - 0.02, 0.75, D * 0.1);
        box(cw, 0.55, D * 0.72, cushM, cw / 2 + 0.02, 0.75, D * 0.1);
      } else if (t.includes("eettafel")) {
        const topM = mat(0x795548), legM = mat(0x3e2723), chrM = mat(0x607d8b);
        const tW = W * 0.72, tD = D * 0.86, tH = 1.65;
        box(tW, 0.18, tD, topM, 0, tH, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          box(0.22, tH, 0.22, legM, sx * (tW / 2 - 0.2), tH / 2, sz * (tD / 2 - 0.2));
        });
        [[-tW * 0.58, -tD * 0.24, 1], [-tW * 0.58, tD * 0.24, 1], [tW * 0.58, -tD * 0.24, -1], [tW * 0.58, tD * 0.24, -1]].forEach(([cx, cz, dir]) => {
          box(0.95, 0.14, 0.95, chrM, cx, 0.95, cz);
          box(0.90, 0.95, 0.90, legM, cx, 0.45, cz);
          box(0.14, 1.0, 0.95, chrM, cx - dir * 0.42, 1.45, cz);
        });
      } else if (t.includes("salontafel")) {
        const topM = mat(0x8d6e63), legM = mat(0x37474f);
        box(W * 0.92, 0.15, D * 0.92, topM, 0, 0.95, 0);
        box(W * 0.82, 0.10, D * 0.82, legM, 0, 0.35, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          box(0.16, 0.95, 0.16, legM, sx * (W * 0.4), 0.47, sz * (D * 0.4));
        });
      } else if (t.includes("tv")) {
        const cabM = mat(0x5d4037), tvM = mat(0x1c2026), scrM = mat(0x263238);
        box(W * 0.92, 1.0, D * 0.92, cabM, 0, 0.5, 0);
        box(W * 0.78, 1.9, 0.14, tvM, 0, 2.1, 0);
        box(W * 0.74, 1.75, 0.16, scrM, 0, 2.1, 0);
      } else {
        const cabM = mat(0x6d4c41), topM = mat(0x8d6e63);
        box(W * 0.9, 1.3, D * 0.9, cabM, 0, 0.65, 0);
        box(W * 0.94, 0.14, D * 0.94, topM, 0, 1.35, 0);
      }

      g.rotation.y = (adjAngle * Math.PI) / 180;
      return g;
    };

    const excl = Array.isArray(furnOverrides.exclude_types) ? furnOverrides.exclude_types : ["bank"];
    const furns = ((camAttrs && camAttrs.furnitures) || []).filter((f) => {
      const tl = (f.type || "").toLowerCase();
      return !excl.some((ex) => tl.includes(ex));
    });
    furns.forEach((f) => {
      const tLower = (f.type || "").toLowerCase();
      let fx0 = f.x0;
      Object.keys(furnOverrides).forEach((k) => {
        if (k !== "exclude_types" && tLower.includes(k) && furnOverrides[k].x0 !== undefined) {
          fx0 = furnOverrides[k].x0;
        }
      });
      const p0 = this._vacToWorld(fx0, f.y0 + f.height);
      const p1 = this._vacToWorld(fx0 + f.width, f.y0);
      const fw = Math.max(1.5, Math.abs(p1.wx - p0.wx));
      const fz = Math.max(1.5, Math.abs(p1.wz - p0.wz));
      const cx = (p0.wx + p1.wx) / 2;
      const cz = (p0.wz + p1.wz) / 2;

      const modelGroup = buildFurniture3D(f.type, fw, fz, f.angle || 0);
      modelGroup.position.set(cx, 0.05, cz);
      mapGroup.add(modelGroup);
    });

    this._scene.add(mapGroup);
    this._mapGroup = mapGroup;
    this._meshBuilt = true;
    this._requestRender();
  }

  _updateStates() {
    if (!this._hass) return;
    const rooms = this._getRooms();
    const liveCam = this._hass.states[this._cameraEntity] || this._hass.states["camera.roberto_map_1"];
    const vacStateObj = this._hass.states[this._vacuumEntity];

    const batTxt = this.shadowRoot.getElementById("vac-bat-txt");
    const batIcon = this.shadowRoot.getElementById("vac-bat-icon");
    const batStateObj = this._hass.states[this._batteryEntity];
    if (batTxt) {
      const bat = (batStateObj && !["unknown", "unavailable"].includes(batStateObj.state))
        ? parseInt(batStateObj.state, 10)
        : (vacStateObj ? (vacStateObj.attributes.battery ?? null) : null);
      if (bat !== null && !isNaN(bat)) {
        batTxt.textContent = `${bat}%`;
        if (batIcon) {
          const level = Math.max(10, Math.min(100, Math.round(bat / 10) * 10));
          const charging = vacStateObj && (vacStateObj.attributes.charging || vacStateObj.state === "docked");
          batIcon.setAttribute("icon", charging ? "mdi:battery-charging" : (level === 100 ? "mdi:battery" : `mdi:battery-${level}`));
        }
      }
    }

    let hashParts = [];
    rooms.forEach((r) => {
      const s = this._hass.states[r.entity];
      const t = r.temp ? this._hass.states[r.temp] : null;
      hashParts.push(
        s ? `${s.state}:${s.attributes.brightness || ""}:${s.attributes.color_temp_kelvin || ""}:${(s.attributes.rgb_color || []).join(",")}` : "u",
        t ? t.state : ""
      );
    });
    if (liveCam && liveCam.attributes) {
      const vp = liveCam.attributes.vacuum_position;
      const dp = liveCam.attributes.charger_position;
      hashParts.push(
        vp ? `${vp.x},${vp.y}` : "",
        dp ? `${dp.x},${dp.y}` : "",
        batStateObj ? batStateObj.state : (vacStateObj ? `${vacStateObj.attributes.battery}` : "")
      );
    }
    hashParts.push(vacStateObj ? vacStateObj.state : "");
    const nextHash = hashParts.join("|");
    if (nextHash === this._lastStateHash && this._meshBuilt) return;
    this._lastStateHash = nextHash;

    let onCount = 0;
    const activeLights = [];

    const softKelvinRGB = (k) => {
      const t = Math.max(0, Math.min(1, (k - 2200) / (6500 - 2200)));
      if (t < 0.42) {
        const u = t / 0.42;
        return { r: 1.0 - u * 0.02, g: 0.76 + u * 0.17, b: 0.46 + u * 0.38 };
      } else {
        const u = (t - 0.42) / 0.58;
        return { r: 0.98 - u * 0.16, g: 0.93 - u * 0.03, b: 0.84 + u * 0.16 };
      }
    };

    rooms.forEach((r) => {
      const stObj = this._hass.states[r.entity];
      const isOn = stObj && stObj.state === "on";
      if (isOn) onCount++;

      const bri = (isOn && stObj.attributes && stObj.attributes.brightness)
        ? stObj.attributes.brightness / 255
        : (isOn ? 1.0 : 0.0);

      let col = { r: 0.98, g: 0.86, b: 0.65 };
      if (isOn && stObj.attributes) {
        if (stObj.attributes.color_temp_kelvin) {
          col = softKelvinRGB(stObj.attributes.color_temp_kelvin);
        } else if (stObj.attributes.rgb_color) {
          col = {
            r: stObj.attributes.rgb_color[0] / 255,
            g: stObj.attributes.rgb_color[1] / 255,
            b: stObj.attributes.rgb_color[2] / 255
          };
        }
      }

      const pl = this._roomLights3D[r.id];
      const orb = this._roomBulbs3D[r.id];
      if (pl) {
        pl.intensity = isOn ? 0.20 + bri * 0.30 : 0;
        pl.color.setRGB(col.r, col.g, col.b);
      }
      if (orb) {
        orb.material.color.setRGB(isOn ? col.r : 0.22, isOn ? col.g : 0.28, isOn ? col.b : 0.31);
      }
      if (isOn) {
        activeLights.push({
          vx: r.cx,
          vy: r.cy,
          bri: 0.35 + bri * 0.75,
          color: col,
          maxDist: 5200
        });
      }

      const pin3d = this.shadowRoot.getElementById(`pin3d-${r.id}`);
      if (pin3d) pin3d.classList.toggle("light-on", isOn);

      let parts = [];
      if (isOn && stObj.attributes && stObj.attributes.brightness) {
        parts.push(`${Math.round(bri * 100)}%`);
      } else {
        parts.push(isOn ? "On" : "Off");
      }
      if (r.temp && this._hass.states[r.temp] && !["unknown", "unavailable"].includes(this._hass.states[r.temp].state)) {
        parts.push(`${parseFloat(this._hass.states[r.temp].state).toFixed(1)}°C`);
      }
      const str = parts.join(" · ");
      const p3m = this.shadowRoot.getElementById(`p3dmeta-${r.id}`);
      if (p3m) p3m.textContent = str;
    });

    const camObj = this._hass.states["camera.roberto_map_1"] || liveCam;
    if (camObj && camObj.attributes) {
      this._updateCalibrationFromAttrs(camObj.attributes);
      if (this._threeLoaded && !this._meshBuilt) {
        this._buildArchitectural3DModel(camObj.attributes);
      }
    }

    if (this._meshBuilt && this._lmImgData && this._hiCtx && this._woodPatternCanvas) {
      const lmW = 160, lmH = 210, hiW = 1024, hiH = 1320;
      const { minVx, maxVx, minVy, maxVy } = this._getHouseBounds(rooms);
      const solidWalls = (this.config && Array.isArray(this.config.solid_walls)) ? this.config.solid_walls : (
        this.config && this.config.auto_discover === true ? this._autoGenerateWallsFromRooms(rooms) : [
        [2700, -350, 2700, -4350],
        [2700, -5350, 2700, -5550],
        [2700, -6150, 2700, -7300],
        [3250, -6250, 3250, -9950],
        [2700, -6250, 2800, -6250],
        [3150, -6250, 3400, -6250],
        [4150, -6250, 4600, -6250],
        [2700, -4350, 3650, -4350],
        [4450, -4350, 5500, -4350],
        [1425, -5450, 2700, -5450],
        [1425, -5450, 1425, -8250],
        [1425, -9050, 1425, -9250],
        [1425, -7300, 3250, -7300],
        [2600, -9250, 2600, -7300],
        [5350, -6250, 6650, -6250],
        [4600, -6250, 4600, -9950]
      ]);
      const partialWalls = (this.config && Array.isArray(this.config.partial_walls))
        ? this.config.partial_walls
        : [{ seg: [-1350, -4775, 250, -4775], transmission: 0.75 }];
      const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
      const segHits = (ax, ay, bx, by, wx0, wy0, wx1, wy1) =>
        ccw(ax, ay, wx0, wy0, wx1, wy1) !== ccw(bx, by, wx0, wy0, wx1, wy1) &&
        ccw(ax, ay, bx, by, wx0, wy0) !== ccw(ax, ay, bx, by, wx1, wy1);

      const rayTransmission = (ax, ay, bx, by) => {
        for (let i = 0; i < solidWalls.length; i++) {
          const [wx0, wy0, wx1, wy1] = solidWalls[i];
          if (segHits(ax, ay, bx, by, wx0, wy0, wx1, wy1)) return 0.0;
        }
        let trans = 1.0;
        for (let i = 0; i < partialWalls.length; i++) {
          const pw = partialWalls[i];
          const s = pw.seg || pw;
          if (segHits(ax, ay, bx, by, s[0], s[1], s[2], s[3])) {
            trans *= (pw.transmission !== undefined ? pw.transmission : 0.75);
          }
        }
        return trans;
      };

      const data = this._lmImgData.data;
      for (let py = 0; py < lmH; py++) {
        const vy = maxVy - (py / (lmH - 1)) * (maxVy - minVy);
        for (let px = 0; px < lmW; px++) {
          const vx = minVx + (px / (lmW - 1)) * (maxVx - minVx);
          let lR = 0, lG = 0, lB = 0;
          for (let i = 0; i < activeLights.length; i++) {
            const L = activeLights[i];
            const dist = Math.hypot(vx - L.vx, vy - L.vy);
            if (dist > L.maxDist) continue;
            const trans = rayTransmission(L.vx, L.vy, vx, vy);
            if (trans <= 0) continue;
            const norm = Math.max(0, (dist - 700) / (L.maxDist - 700));
            const atten = Math.cos(norm * Math.PI * 0.5) * L.bri * trans;
            lR += L.color.r * atten;
            lG += L.color.g * atten;
            lB += L.color.b * atten;
          }
          const maxL = Math.max(1.0, lR, lG, lB);
          lR /= maxL; lG /= maxL; lB /= maxL;
          const lum = Math.min(1.0, Math.max(lR, lG, lB));
          const idx = (py * lmW + px) * 4;
          data[idx]     = Math.min(255, Math.round((0.28 * (1 - lum * 0.72) + lR * 0.90) * 255));
          data[idx + 1] = Math.min(255, Math.round((0.30 * (1 - lum * 0.72) + lG * 0.90) * 255));
          data[idx + 2] = Math.min(255, Math.round((0.34 * (1 - lum * 0.72) + lB * 0.90) * 255));
          data[idx + 3] = 255;
        }
      }
      this._lmCtx.putImageData(this._lmImgData, 0, 0);
      this._hiCtx.globalCompositeOperation = "source-over";
      const pat = this._hiCtx.createPattern(this._woodPatternCanvas, "repeat");
      if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(0.26, 0.26));
      this._hiCtx.fillStyle = pat;
      this._hiCtx.fillRect(0, 0, hiW, hiH);
      this._hiCtx.globalCompositeOperation = "multiply";
      this._hiCtx.filter = "blur(12px)";
      this._hiCtx.drawImage(this._lmCanvas, 0, 0, hiW, hiH);
      this._hiCtx.filter = "none";
      this._hiCtx.globalCompositeOperation = "source-over";
      this._hiTex.needsUpdate = true;
    }

    if (liveCam && liveCam.attributes && this._threeLoaded) {
      const dock = liveCam.attributes.charger_position;
      if (dock && this._dock3D) {
        const dw = this._vacToWorld(dock.x, dock.y);
        this._dock3D.position.set(dw.wx, 0, dw.wz);
      }\n      const vac = liveCam.attributes.vacuum_position;
      if (vac && this._vac3D) {
        const vw = this._vacToWorld(vac.x, vac.y);
        this._vac3D.position.set(vw.wx, 0, vw.wz);
      }
    }

    const statusTxt = this.shadowRoot.getElementById("status-txt");
    if (statusTxt) {
      statusTxt.textContent = `${onCount}/${rooms.length} lights on · Roberto: ${vacStateObj ? vacStateObj.state : "idle"}`;
    }

    this._requestRender();
  }

  getCardSize() { return 12; }
}

if (!customElements.get("dreame-3d-floorplan-card")) {
  customElements.define("dreame-3d-floorplan-card", Dreame3DFloorplanCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "dreame-3d-floorplan-card")) {
  window.customCards.push({
    type: "dreame-3d-floorplan-card",
    name: "Dreame 3D Floorplan Card",
    description: "Interactive 3D WebGL floorplan with raycasted lighting and live Dreame vacuum tracking",
    preview: true
  });
}
