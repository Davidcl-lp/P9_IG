import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";


const sunMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = normalize(position); // posición normalizada para el ruido
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec3 vPosition;
    vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
    vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(i.z + vec4(0.0,i1.z,i2.z,1.0)) + i.y + vec4(0.0,i1.y,i2.y,1.0)) + i.x + vec4(0.0,i1.x,i2.x,1.0));
      vec4 j = p * (1.0 / 7.0);
      vec4 x_ = fract(j) - 0.5;
      vec4 y_ = abs(x_) - 0.25;
      vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
      m = m*m*m*m;
      return 42.0 * dot(m, vec4(dot(x0, vec3(x_.x, y_.x, 0.0)), dot(x1, vec3(x_.y, y_.y, 0.0)), dot(x2, vec3(x_.z, y_.z, 0.0)), dot(x3, vec3(x_.w, y_.w, 0.0))));
    }

    void main() {
      float t = time * 0.5;

      // FBM de 4 octavas para el plasma
      float n = snoise(vPosition * 8.0 + t);
      n += 0.5 * snoise(vPosition * 16.0 + t * 2.0);
      n += 0.25 * snoise(vPosition * 32.0 + t * 4.0);
      n += 0.125 * snoise(vPosition * 64.0 + t * 8.0);
      n = clamp(n * 0.5 + 0.5, 0.0, 1.0);

      vec3 color_core = vec3(1.0, 0.4, 0.0);
      vec3 color_edge = vec3(0.8, 0.1, 0.0);
      vec3 finalColor = mix(color_edge, color_core, n);

      float emission = n * 2.0 + 0.5;
      gl_FragColor = vec4(finalColor * emission, 1.0);
    }
  `,
  uniforms: { time: { value: 0 } },
  lights: false,
  side: THREE.FrontSide
});

const saturnRingsMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vPosition;
    varying vec3 vWorldPosition; 
    void main() {
      vPosition = position;
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vPosition;
    varying vec3 vWorldPosition;

    uniform float innerRadius;
    uniform float outerRadius;
    uniform vec3 shadowColor;
    uniform vec3 lightDirection;
    uniform float opacityFactor;
    uniform vec3 saturnPosition;

    // Paleta arena
    const vec3 sandDark  = vec3(0.58, 0.50, 0.38);
    const vec3 sandLight = vec3(0.88, 0.78, 0.60);
    const vec3 sandBright = vec3(1.00, 0.92, 0.78);
    const vec3 cassiniDark = vec3(0.32, 0.30, 0.26);

    void main() {
      float dist = length(vPosition.xy);
      float dist_norm = (dist - innerRadius) / (outerRadius - innerRadius);
      if (dist < innerRadius || dist > outerRadius) discard;

      vec3 finalColor;
      float alpha;

      // Gradiente según anillo
      if (dist_norm < 0.33) {
        float t = dist_norm / 0.33;
        finalColor = mix(sandDark, sandLight, smoothstep(0.0, 1.0, t));
        alpha = mix(0.6, 0.9, t);
      } else if (dist_norm < 0.65) {
        finalColor = mix(sandLight, sandBright, 0.4);
        alpha = 1.0;
        if (dist_norm > 0.52 && dist_norm < 0.57) {
          float d = abs(dist_norm - 0.545) / 0.025;
          float factor = clamp(1.0 - d, 0.0, 1.0);
          finalColor = mix(finalColor, cassiniDark, factor);
          alpha = mix(alpha, 1.0, factor);
        }
      } else {
        float t = (dist_norm - 0.65) / (1.0 - 0.65);
        finalColor = mix(sandLight, sandBright, smoothstep(0.0, 1.0, t));
        alpha = mix(0.6, 0.9, t);
      }

      // Brillo
      float ringAngle = abs(dot(normalize(vPosition), normalize(lightDirection)));
      finalColor += pow(ringAngle, 4.0) * 0.25;

      // Borde
      float edge = smoothstep(0.92, 1.0, dist_norm);
      alpha *= (1.0 - edge);

      // Iluminación y sombra
      vec3 normal = vec3(0.0, 0.0, 1.0);
      float intensity = max(0.55, dot(normal, lightDirection));
      vec3 saturnDir = normalize(saturnPosition - vWorldPosition);
      float shadowMask = smoothstep(0.82, 1.0, dot(lightDirection, saturnDir));
      intensity = mix(intensity, intensity * 0.25, shadowMask);
      finalColor = mix(shadowColor, finalColor, intensity);

      gl_FragColor = vec4(finalColor, alpha * opacityFactor);
    }
  `,
  uniforms: {
    innerRadius: { value: 20 },
    outerRadius: { value: 45 },
    shadowColor: { value: new THREE.Color(0x7a6a5d) },
    lightDirection: { value: new THREE.Vector3(0, 1, 0).normalize() },
    opacityFactor: { value: 1.0 },
    saturnPosition: { value: new THREE.Vector3() }
  },
  transparent: true,
  side: THREE.DoubleSide
});




let scene, camera, renderer, camcontrols, ship;
let flycontrol = true;
let distance = 3;
let Planets = [];
let Moons = [];
let t0 = Date.now();
let accglobal = 0.001;
const clock = new THREE.Clock();

let SolarSystem = [
  {
    name: "sun",
    rad: 695,
    orbitSpeed: 0,
  },
  {
    name: "mercury",
    rad: 2.4397 * 2,
    orbitSpeed: 4.787,
    perihelio: 46 * 3,
    afelio: 69.8 * 3,
  },
  {
    name: "venus",
    rad: 6.0518 * 2,
    orbitSpeed: 3.502,
    perihelio: 107 * 1.2,
    afelio: 109 * 1.2,
  },
  {
    name: "earth",
    rad: 6.37814 * 2,
    orbitSpeed: 2.978,
    perihelio: 147 / 1.3,
    afelio: 152 / 1.3,
  },
  {
    name: "mars",
    rad: 3.3972 * 2,
    orbitSpeed: 2.4077,
    perihelio: 206 / 1.9,
    afelio: 249 / 1.9,
  },
  {
    name: "jupiter",
    rad: 71.492,
    orbitSpeed: 1.307,
    perihelio: 741 / 6,
    afelio: 817 / 6,
  },
  {
    name: "saturn",
    rad: 60.268,
    orbitSpeed: 0.969,
    perihelio: 1350 / 10,
    afelio: 1510 / 10,
  },
  {
    name: "uranus",
    rad: 25.559,
    orbitSpeed: 0.681,
    perihelio: 2750 / 18,
    afelio: 3000 / 18,
  },
  {
    name: "neptune",
    rad: 24.746,
    orbitSpeed: 0.543,
    perihelio: 4450 / 25,
    afelio: 4550 / 25,
  },
];

function loadShip() {
  const loader = new GLTFLoader();
  loader.load(
    "./shipModels/star_wars_tie_fighter.glb",
    (gltf) => {
      ship = gltf.scene;
      ship.scale.set(0.5, 0.5, 0.5);
      ship.position.set(0, -1, -10);
      ship.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
        }
      });
      camera.add(ship);
      scene.add(camera);
    },
    (error) => {
      console.error("Error al cargar la nave:", error);
    }
  );
}

function createSun(distance, rad) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load("./planetsTextures/sun.jpg");
  const geometry = new THREE.SphereGeometry(rad, 1024, 1024);
  const star = new THREE.Mesh(geometry, sunMaterial);
  star.userData = { dist: distance, speed: 0 };
  star.position.set(distance, 0, 0);
  star.rotation.x = Math.PI / 2;
  scene.add(star);
  const sunLight = new THREE.PointLight(0xffffff, 5, 0, 0);
  sunLight.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  return star;
}

function createPlanets(
  distance,
  col,
  rad,
  speed = 0.01,
  f1 = 1,
  f2 = 1,
  texturePath
) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(texturePath);
  const geometry = new THREE.SphereGeometry(rad, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.0,
    roughness: 1.0,
  });
  const planet = new THREE.Mesh(geometry, material);
  planet.castShadow = true;
  planet.receiveShadow = true;
  planet.rotation.x = Math.PI / 2;
  planet.userData = { dist: distance, speed: speed, f1: f1, f2: f2 };
  Planets.push(planet);
  scene.add(planet);
  const curve = new THREE.EllipseCurve(0, 0, distance * f1, distance * f2);
  const points = curve.getPoints(100);
  const geome = new THREE.BufferGeometry().setFromPoints(points);
  const mate = new THREE.LineBasicMaterial({ color: 0xffffff });
  const orbit = new THREE.Line(geome, mate);
  scene.add(orbit);
  return planet;
}
function createSaturnRings(planet) {
  const outerRadius = saturnRingsMaterial.uniforms.outerRadius.value;
  const geo = new THREE.CircleGeometry(outerRadius, 256); 
  const mesh = new THREE.Mesh(geo, saturnRingsMaterial);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true; 
  mesh.receiveShadow = true; 

  planet.add(mesh);
}


function createMoon(
  planet,
  rad,
  dist,
  speed = 0.01,
  col = 0xaaaaaa,
  angle = 0
) {
  const pivot = new THREE.Object3D();
  pivot.rotation.x = angle;
  planet.add(pivot);
  const geometry = new THREE.SphereGeometry(rad, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: col });
  const moon = new THREE.Mesh(geometry, material);
  moon.castShadow = true;
  moon.receiveShadow = true;
  moon.userData = { dist: dist, speed: speed };
  moon.position.x = dist;
  Moons.push({ moon: moon, pivot: pivot });
  pivot.add(moon);
}

function view() {
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 100);
  if (flycontrol == false) {
    camcontrols = new OrbitControls(camera, renderer.domElement);
    camcontrols.enableDamping = true;
  } else {
    camcontrols = new FlyControls(camera, renderer.domElement);
    camcontrols.movementSpeed = 100;
    camcontrols.rollSpeed = Math.PI / 5;
    camcontrols.autoForward = false;
    camcontrols.dragToLook = true;
  }
}

const hud = document.createElement("div");
hud.style.position = "fixed";
hud.style.bottom = "10px";
hud.style.right = "20px";
hud.style.color = "white";
hud.style.fontFamily = "Arial, sans-serif";
hud.style.fontSize = "14px";
hud.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
hud.style.padding = "8px 12px";
hud.style.borderRadius = "10px";
hud.style.zIndex = "10";
hud.style.userSelect = "none";
document.body.appendChild(hud);

function updateHUD() {
  if (flycontrol) {
    hud.innerHTML = `
      <b>Modo Nave</b><br>
      WASD: Moverse<br>
      Q/E: Rotar<br>
      R/F: Subir/Bajar<br>
      Fechas: Dirección<br>
      <br>
      <i>Presiona Enter para cambiar la vista</i>
    `;
  } else {
    hud.innerHTML = `
      <b>Modo Orbital</b><br>
      Arrastra con el ratón para girar<br>
      Rueda del ratón para hacer zoom<br>
      <br>
      <i>Presiona Enter para cambiar la vista</i>
    `;
  }
}

updateHUD();

function changeView() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      flycontrol = !flycontrol;

      if (camcontrols && camcontrols.dispose) camcontrols.dispose();

      if (flycontrol) {
        camcontrols = new FlyControls(camera, renderer.domElement);
        camcontrols.movementSpeed = 100;
        camcontrols.rollSpeed = Math.PI / 5;
        camcontrols.autoForward = false;
        camcontrols.dragToLook = true;
        camera.add(ship);
      } else {
        camera.remove(ship);
        camcontrols = new OrbitControls(camera, renderer.domElement);
        camcontrols.enableDamping = true;
      }
      updateHUD();
    }
  });
}

function init() {
  scene = new THREE.Scene();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  window.addEventListener("resize", onWindowResize, false);
  view();

  for (const celestialBody of SolarSystem) {
    if (celestialBody.name == "sun") createSun(0, celestialBody.rad / 30);
    else {
      createPlanets(
        distance * 10,
        0xff0000,
        celestialBody.rad / 5,
        celestialBody.orbitSpeed / 30,
        celestialBody.afelio / 120,
        celestialBody.perihelio / 120,
        `./planetsTextures/${celestialBody.name}.jpg`
      );
      distance += 3;
    }
  }
  // Saturn está en Planets[5]
  createSaturnRings(Planets[5]);

  // Luna de la tierra
  createMoon(Planets[2], 1, 8, 0.01, 0xaaaaaa); // Luna

  // Lunas de Marte
  createMoon(Planets[3], 0.5, 3, 0.05, 0x888888); // Fobos
  createMoon(Planets[3], 0.3, 5, 0.03, 0xcccccc); // Deimos

  // Lunas de Júpiter (Galileanas)
  createMoon(Planets[4], 1.8, 20, 0.02, 0xffaa00); // Io
  createMoon(Planets[4], 1.5, 25, 0.015, 0xaaddff); // Europa
  createMoon(Planets[4], 2.0, 30, 0.01, 0xddddaa); // Ganimedes
  createMoon(Planets[4], 1.7, 35, 0.008, 0x888888); // Calisto

  // Lunas de Saturno
  createMoon(Planets[5], 2.5, 20, 0.01, 0xffcc88); // Titán
  createMoon(Planets[5], 1.0, 15, 0.015, 0xffffff); // Encelado

  // Lunas de Urano
  createMoon(Planets[6], 0.8, 10, 0.02, 0x9999ff); // Miranda

  // Lunas de Neptuno
  createMoon(Planets[7], 1.2, 12, 0.018, 0x8888ff); // Tritón

  const ambient = new THREE.AmbientLight(0x222222, 10);
  scene.add(ambient);
  loadShip();
  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  const timestamp = (Date.now() - t0) * accglobal;

  for (let planet of Planets) {
    planet.position.x =
      Math.cos(timestamp * planet.userData.speed) *
      planet.userData.f1 *
      planet.userData.dist;
    planet.position.y =
      Math.sin(timestamp * planet.userData.speed) *
      planet.userData.f2 *
      planet.userData.dist;
  }
  
  const lightVector = new THREE.Vector3(0, 0, 0).sub(Planets[5].position).normalize();
  saturnRingsMaterial.uniforms.lightDirection.value = lightVector;

  for (let item of Moons) {
    const moon = item.moon;
    const pivot = item.pivot;
    pivot.rotation.y += moon.userData.speed;
  }
  sunMaterial.uniforms.time.value = clock.getElapsedTime();
  camcontrols.update(delta);
  renderer.render(scene, camera);
}

init();
changeView();
