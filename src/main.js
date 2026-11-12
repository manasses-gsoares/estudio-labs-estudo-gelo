import * as THREE from 'three';

/* Estúdio Labs — estudo de gelo (2026-11-11)
   Efeitos procedurais escritos do zero: nenhuma malha, textura ou shader copiado.
   Torrente de gelo = frente de fratura que corre pelo chão e ergue cristais atrás dela.
   Coroa de gelo   = anel de lâminas que irrompe em sequência e congela um disco no chão. */

window.__erros = [];
addEventListener('error', (e) => window.__erros.push(String(e.message || e.error)));
addEventListener('unhandledrejection', (e) => window.__erros.push('promise: ' + String(e.reason)));
const canvas = document.querySelector('#cena');
const dica = document.querySelector('#dica');

const aleatorio = (() => { let s = 0x9e3779b9; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const entre = (a, b) => a + aleatorio() * (b - a);
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const cena = new THREE.Scene();
cena.background = new THREE.Color(0x070d18);
cena.fog = new THREE.Fog(0x070d18, 18, 46);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 200);

// ---------------------------------------------------------------- chão
const chaoMat = new THREE.ShaderMaterial({
  uniforms: { uTempo: { value: 0 } },
  vertexShader: `
    varying vec3 vW; varying vec2 vUv;
    void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform float uTempo; varying vec3 vW; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    float ruido(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
    void main(){
      float r = length(vW.xz);
      float perto = 1.0 - smoothstep(6.0, 30.0, r);
      float pedra = ruido(vW.xz * 1.4) * 0.5 + ruido(vW.xz * 4.1) * 0.3 + ruido(vW.xz * 11.0) * 0.2;
      vec3 base = mix(vec3(0.018,0.030,0.052), vec3(0.030,0.048,0.075), pedra);
      base *= 0.7 + 0.85 * perto;
      float poco = exp(-pow(r / 7.5, 2.0));
      base += vec3(0.035, 0.075, 0.115) * poco;
      gl_FragColor = vec4(base, 1.0);
    }`
});
const chao = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), chaoMat);
chao.rotation.x = -Math.PI / 2;
cena.add(chao);

// brilho frio vindo de cima
const luz = new THREE.DirectionalLight(0x9fd8ff, 1.15);
luz.position.set(-6, 12, 5);
cena.add(luz, new THREE.AmbientLight(0x22405e, 1.4));

// ---------------------------------------------------------------- conjurador (marcador)
const conjurador = new THREE.Group();
const orbeMat = new THREE.ShaderMaterial({
  uniforms: { uTempo: { value: 0 }, uCor: { value: new THREE.Color(0x9fe8ff) } },
  vertexShader: `varying vec3 vN; varying vec3 vW;
    void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0);
      vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTempo; uniform vec3 uCor; varying vec3 vN; varying vec3 vW;
    void main(){ vec3 V = normalize(cameraPosition - vW);
      float f = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.0);
      float pulso = 0.75 + 0.25 * sin(uTempo * 2.4);
      gl_FragColor = vec4(uCor * (0.35 + f * 1.9) * pulso, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const orbe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 2), orbeMat);
orbe.position.y = 1.0;
conjurador.add(orbe);

const anelMat = new THREE.ShaderMaterial({
  uniforms: { uTempo: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTempo; varying vec2 vUv;
    void main(){ float a = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.0);
      float pulso = 0.5 + 0.5 * sin(uTempo * 2.0);
      gl_FragColor = vec4(vec3(0.62,0.9,1.0) * (0.35 + 0.5*pulso), a * 0.5); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});
const anel = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 48), anelMat);
anel.rotation.x = -Math.PI / 2;
anel.position.y = 0.012;
conjurador.add(anel);
conjurador.position.set(0, 0, 2.4);
cena.add(conjurador);

// ---------------------------------------------------------------- flocos no ar
const flocos = (() => {
  const n = 420, pos = new Float32Array(n * 3), vel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = entre(-16, 16); pos[i * 3 + 1] = entre(0.2, 9); pos[i * 3 + 2] = entre(-16, 16);
    vel[i] = entre(0.25, 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: 0 } },
    vertexShader: `attribute float aVel; uniform float uTempo; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y - uTempo * (0.25 + aVel * 0.4), 9.0) + 0.2;
        p.x += sin(uTempo * 0.4 + p.z) * 0.35; vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = min((1.0 + aVel * 2.0) * (110.0 / -mv.z), 7.0);
        vA = (1.0 - smoothstep(14.0, 30.0, -mv.z)) * smoothstep(2.0, 5.5, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.05, r) * 0.55 * vA;
        gl_FragColor = vec4(vec3(0.82,0.95,1.0), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const velAttr = new Float32Array(n);
  for (let i = 0; i < n; i++) velAttr[i] = vel[i];
  g.setAttribute('aVel', new THREE.BufferAttribute(velAttr, 1));
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  cena.add(pts);
  return m;
})();

// ---------------------------------------------------------------- geometria do cristal
function geometriaCristal() {
  const lados = 5, base = [], meio = [], topo = new THREE.Vector3(0.035, 1.0, -0.02);
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    const r1 = 0.5 * entre(0.85, 1.1), r2 = 0.34 * entre(0.8, 1.15);
    base.push(new THREE.Vector3(Math.cos(a) * r1, entre(-0.04, 0.04), Math.sin(a) * r1));
    meio.push(new THREE.Vector3(Math.cos(a) * r2, entre(0.5, 0.66), Math.sin(a) * r2));
  }
  const tri = [];
  const empurra = (a, b, c) => tri.push(a, b, c);
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    // lateral de baixo
    empurra(base[i], meio[i], meio[j]);
    empurra(base[i], meio[j], base[j]);
    // ponta
    empurra(meio[i], topo, meio[j]);
    // tampa de baixo
    empurra(new THREE.Vector3(0, 0, 0), base[j], base[i]);
  }
  const pos = new Float32Array(tri.length * 3);
  tri.forEach((v, i) => { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const GEO_CRISTAL = geometriaCristal();

const matCristal = new THREE.ShaderMaterial({
  uniforms: {
    uTempo: { value: 0 }, uAlpha: { value: 1 },
    uGelo: { value: new THREE.Color(0xe8fbff) }, uFundo: { value: new THREE.Color(0x2a6b93) },
    uBrilho: { value: new THREE.Color(0x9fe8ff) }
  },
  vertexShader: `
    attribute vec3 aPos;
    attribute vec3 aEscala;
    attribute vec3 aGiro;
    attribute float aSemente;
    varying vec3 vN; varying vec3 vW; varying float vH; varying float vSemente;
    vec3 gira(vec3 p, vec3 g){
      float cx = cos(g.x), sx = sin(g.x);
      p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
      float cz = cos(g.z), sz = sin(g.z);
      p = vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z);
      float cy = cos(g.y), sy = sin(g.y);
      return vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
    }
    void main(){
      vec3 p = position * aEscala;
      p = gira(p, aGiro);
      vec3 n = normalize(gira(normal / max(aEscala, vec3(0.0001)), aGiro));
      vec4 wp = modelMatrix * vec4(p + aPos, 1.0);
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix) * n);
      vH = clamp(position.y, 0.0, 1.0);
      vSemente = aSemente;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform float uTempo; uniform float uAlpha;
    uniform vec3 uGelo; uniform vec3 uFundo; uniform vec3 uBrilho;
    varying vec3 vN; varying vec3 vW; varying float vH; varying float vSemente;
    void main(){
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      vec3 L = normalize(vec3(-0.45, 0.8, 0.35));
      float ndl = dot(N, L) * 0.5 + 0.5;
      float banda = floor(ndl * 3.0) / 3.0 + 0.18;          // 3 faixas: cara toon
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
      float interno = smoothstep(0.0, 0.9, vH);
      vec3 cor = mix(uFundo, uGelo, interno * 0.9 + fres * 0.45) * (0.42 + 0.85 * banda);
      cor += uBrilho * fres * (0.9 + 0.25 * sin(uTempo * 1.7 + vH * 6.0));
      float espec = pow(max(dot(reflect(-L, N), V), 0.0), 30.0);
      cor += vec3(1.0, 1.0, 1.0) * espec * 0.7;
      cor = mix(cor, vec3(0.97, 0.995, 1.0), smoothstep(0.72, 1.0, vH) * 0.55);
      cor += vec3(0.42, 0.78, 1.0) * pow(1.0 - vH, 3.0) * 0.35;
      cor *= 0.90 + 0.16 * vSemente;
      gl_FragColor = vec4(cor, uAlpha);
    }`,
  transparent: true, side: THREE.DoubleSide
});

// ---------------------------------------------------------------- névoa
const matNevea = new THREE.ShaderMaterial({
  uniforms: { uAlpha: { value: 1 }, uTempo: { value: 0 }, uCor: { value: new THREE.Color(0xcfeeff) } },
  vertexShader: `varying vec2 vUv; varying float vSemente;
    void main(){ vUv = uv; vSemente = position.x * 7.0 + position.y * 3.0;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `
    uniform float uAlpha; uniform float uTempo; uniform vec3 uCor;
    varying vec2 vUv; varying float vSemente;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ruido(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 p = vUv * 3.2 + vec2(uTempo * 0.12 + vSemente, uTempo * 0.05);
      float n = ruido(p) * 0.6 + ruido(p * 2.3) * 0.4;
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(1.0, 1.25)) * 2.0;
      float borda = 1.0 - smoothstep(0.12, 1.0, r);
      float a = pow(borda, 2.2) * (0.25 + n * 0.6) * uAlpha * 0.3;
      gl_FragColor = vec4(uCor, a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});

// ---------------------------------------------------------------- efeitos
const efeitos = [];
const geoPlano = new THREE.PlaneGeometry(1, 1);
const geoFaixa = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, 0, 0,  0.5, 0, 0,  0.5, 0, 1,   -0.5, 0, 0,  0.5, 0, 1,  -0.5, 0, 1
  ]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0,0, 1,0, 1,1, 0,0, 1,1, 0,1]), 2));
  g.computeVertexNormals();
  return g;
})();

class TorrenteDeGelo {
  constructor(alvo) {
    const origem = conjurador.position.clone();
    const dir = new THREE.Vector3().subVectors(alvo, origem); dir.y = 0;
    const dist = dir.length(); dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    this.origem = origem; this.dir = dir; this.perp = perp; this.dist = dist;
    this.tempo = 0; this.vida = 30;
    this.velocidade = 16;
    this.duracao = Math.max(dist / this.velocidade, 0.15);

    const qtd = Math.round(limitar(dist * 5.6, 16, 74));
    const geo = GEO_CRISTAL.clone();
    const pos = new Float32Array(qtd * 3), escala = new Float32Array(qtd * 3),
          giro = new Float32Array(qtd * 3), sem = new Float32Array(qtd);
    for (let i = 0; i < qtd; i++) { pos[i * 3 + 1] = -5; escala[i * 3 + 1] = 0.0001; sem[i] = aleatorio(); }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aEscala', new THREE.InstancedBufferAttribute(escala, 3));
    geo.setAttribute('aGiro', new THREE.InstancedBufferAttribute(giro, 3));
    geo.setAttribute('aSemente', new THREE.InstancedBufferAttribute(sem, 1));

    this.mat = matCristal.clone();
    this.malha = new THREE.InstancedMesh(geo, this.mat, qtd);
    this.malha.frustumCulled = false;
    this.buf = { geo, pos, escala, giro };
    this.itens = [];
    for (let i = 0; i < qtd; i++) {
      const u = (i + entre(0.15, 0.85)) / qtd;
      const lateral = (aleatorio() * 2 - 1) * (0.22 + u * 0.55);
      const px = origem.x + dir.x * dist * u + perp.x * lateral;
      const pz = origem.z + dir.z * dist * u + perp.z * lateral;
      pos[i * 3] = px; pos[i * 3 + 1] = -0.3; pos[i * 3 + 2] = pz;
      const largura = entre(0.17, 0.36) * (0.75 + u * 0.55);
      escala[i * 3] = largura; escala[i * 3 + 1] = 0.0001; escala[i * 3 + 2] = largura;
      giro[i * 3] = entre(0.05, 0.30) * (aleatorio() < 0.5 ? -1 : 1);
      giro[i * 3 + 1] = entre(-Math.PI, Math.PI);
      giro[i * 3 + 2] = entre(0.05, 0.30) * (aleatorio() < 0.5 ? -1 : 1);
      this.itens.push({ i, u, atraso: u * this.duracao * 0.92,
        altura: (0.75 + Math.pow(u, 0.7) * 2.25) * entre(0.8, 1.25), largura });
    }
    cena.add(this.malha);

    this.faixaMat = new THREE.ShaderMaterial({
      uniforms: { uProgresso: { value: 0 }, uAlpha: { value: 1 }, uTempo: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uProgresso; uniform float uAlpha; uniform float uTempo;
        varying vec2 vUv;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(21.7, 71.3))) * 43758.5453); }
        float ruido(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float y = vUv.y;
          float lateral = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));
          float n = ruido(vec2(vUv.x * 7.0, y * 30.0)) * 0.55 + ruido(vec2(vUv.x * 19.0, y * 74.0)) * 0.45;
          float veias = pow(1.0 - abs(n * 2.0 - 1.0), 7.0);
          float alcance = uProgresso + (n - 0.5) * 0.16;
          float revelado = 1.0 - smoothstep(alcance - 0.12, alcance, y);
          revelado *= 1.0 - smoothstep(0.55, 1.0, y) * 0.95;
          float nucleo = pow(lateral, 3.0) * (0.45 + n * 0.55);
          float a = revelado * nucleo * (veias * 0.42 + n * 0.05) * uAlpha * 0.75;
          float frente = exp(-pow((y - uProgresso) * 30.0, 2.0)) * (1.0 - smoothstep(0.90, 1.0, uProgresso));
          vec3 cor = mix(vec3(0.22,0.45,0.66), vec3(0.80,0.95,1.0), veias * 0.9 + nucleo * 0.2);
          a += frente * nucleo * 0.30 * uAlpha;
          cor += vec3(0.6,0.88,1.0) * frente * 1.6;
          gl_FragColor = vec4(cor, clamp(a, 0.0, 0.8));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    this.faixa = new THREE.Mesh(geoFaixa.clone(), this.faixaMat);
    this.faixa.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.faixa.scale.set(1.15, 1, dist);
    this.faixa.position.copy(origem).setY(0.015);
    cena.add(this.faixa);

    this.nevoas = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geoPlano.clone(), matNevea.clone());
      const u = entre(0.05, 0.98);
      m.position.copy(origem).addScaledVector(this.dir, dist * u).addScaledVector(this.perp, entre(-0.8, 0.8));
      m.position.y = entre(0.12, 0.45);
      const tam = entre(1.0, 2.0);
      m.scale.set(tam, tam * 0.7, 1);
      m.userData = { u, fase: entre(0, 6.28), subida: entre(0.12, 0.32), tam };
      cena.add(m); this.nevoas.push(m);
    }
  }

  atualizar(dt, t) {
    this.tempo += dt;
    const p = limitar(this.tempo / this.duracao, 0, 1);
    this.faixaMat.uniforms.uProgresso.value = p;
    this.faixaMat.uniforms.uTempo.value = t;
    this.mat.uniforms.uTempo.value = t;

    const { geo, pos, escala } = this.buf;
    for (const it of this.itens) {
      const cresce = limitar((this.tempo - it.atraso) / 0.34, 0, 1);
      const suave = 1 - Math.pow(1 - cresce, 3);
      escala[it.i * 3 + 1] = Math.max(it.altura * suave, 0.0001);
      pos[it.i * 3 + 1] = -0.32 * (1 - suave);
    }
    geo.attributes.aPos.needsUpdate = true;
    geo.attributes.aEscala.needsUpdate = true;

    const apagar = this.tempo > this.vida ? limitar(1 - (this.tempo - this.vida) / 1.2, 0, 1) : 1;
    this.mat.uniforms.uAlpha.value = apagar;
    this.faixaMat.uniforms.uAlpha.value = apagar;

    for (const m of this.nevoas) {
      const u = m.userData;
      const aparece = limitar((p - u.u) * 6, 0, 1);
      m.position.y = 0.12 + u.subida * Math.min(this.tempo, 4) + Math.sin(t * 0.6 + u.fase) * 0.05;
      m.scale.setScalar(u.tam * (0.85 + aparece * 0.3));
      m.quaternion.copy(camera.quaternion);
      m.material.uniforms.uAlpha.value = aparece * 0.5 * apagar;
      m.material.uniforms.uTempo.value = t;
      m.visible = m.material.uniforms.uAlpha.value > 0.01;
    }
    return apagar > 0;
  }

  remover() {
    cena.remove(this.malha, this.faixa);
    this.malha.geometry.dispose(); this.malha.material.dispose();
    this.faixa.geometry.dispose(); this.faixa.material.dispose();
    for (const m of this.nevoas) { cena.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
}

class CoroaDeGelo {
  constructor(centro) {
    this.tempo = 0; this.vida = 30; this.centro = centro.clone().setY(0);
    const qtd = 16, raio = 3.1;
    const geo = GEO_CRISTAL.clone();
    const pos = new Float32Array(qtd * 3), escala = new Float32Array(qtd * 3),
          giro = new Float32Array(qtd * 3), sem = new Float32Array(qtd).fill(0.5);
    this.itens = [];
    for (let i = 0; i < qtd; i++) {
      const a = (i / qtd) * Math.PI * 2 + entre(-0.06, 0.06);
      const px = this.centro.x + Math.cos(a) * raio, pz = this.centro.z + Math.sin(a) * raio;
      pos[i * 3] = px; pos[i * 3 + 1] = -0.35; pos[i * 3 + 2] = pz;
      const largura = entre(0.20, 0.34);
      escala[i * 3] = largura; escala[i * 3 + 1] = 0.0001; escala[i * 3 + 2] = largura;
      giro[i * 3] = Math.sin(a) * 0.22; giro[i * 3 + 1] = -a; giro[i * 3 + 2] = Math.cos(a) * 0.22;
      this.itens.push({ i, atraso: i * 0.045 + entre(0, 0.05), altura: entre(1.5, 2.4) });
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aEscala', new THREE.InstancedBufferAttribute(escala, 3));
    geo.setAttribute('aGiro', new THREE.InstancedBufferAttribute(giro, 3));
    geo.setAttribute('aSemente', new THREE.InstancedBufferAttribute(sem, 1));
    this.mat = matCristal.clone();
    this.malha = new THREE.InstancedMesh(geo, this.mat, qtd);
    this.malha.frustumCulled = false;
    this.buf = { geo, pos, escala };
    cena.add(this.malha);

    this.discoMat = new THREE.ShaderMaterial({
      uniforms: { uProgresso: { value: 0 }, uAlpha: { value: 1 }, uTempo: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uProgresso; uniform float uAlpha; uniform float uTempo; varying vec2 vUv;
        void main(){
          vec2 d = vUv - 0.5; float r = length(d) * 2.0;
          float borda = 1.0 - smoothstep(0.55, 1.0, r);
          float aneis = 0.5 + 0.5 * sin(r * 26.0 - uTempo * 1.1);
          float h = fract(sin(dot(floor(vUv * 60.0), vec2(12.9, 78.2))) * 43758.5);
          float veios = pow(1.0 - abs(h * 2.0 - 1.0), 9.0);
          float a = borda * (0.025 + aneis * 0.035 + veios * 0.30) * uProgresso * uAlpha;
          float pulso = exp(-pow((r - uProgresso) * 5.0, 2.0)) * 0.18 * uAlpha;
          gl_FragColor = vec4(vec3(0.78,0.94,1.0), clamp(a + pulso, 0.0, 0.85));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    // sem disco chapado no chão: a leitura do anel vem das próprias lâminas e da névoa

    this.nevoas = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geoPlano.clone(), matNevea.clone());
      const a = (i / 10) * Math.PI * 2 + entre(-0.2, 0.2), r = entre(1.6, 3.4);
      m.position.copy(this.centro).add(new THREE.Vector3(Math.cos(a) * r, entre(0.15, 0.55), Math.sin(a) * r));
      const tam = entre(1.3, 2.7); m.scale.set(tam, tam * 0.75, 1);
      m.userData = { fase: entre(0, 6.28), tam, atraso: entre(0, 0.5) };
      cena.add(m); this.nevoas.push(m);
    }
  }

  atualizar(dt, t) {
    this.tempo += dt;
    const { geo, pos, escala } = this.buf;
    for (const it of this.itens) {
      const suave = 1 - Math.pow(1 - limitar((this.tempo - it.atraso) / 0.36, 0, 1), 3);
      escala[it.i * 3 + 1] = Math.max(it.altura * suave, 0.0001);
      pos[it.i * 3 + 1] = -0.35 * (1 - suave);
    }
    geo.attributes.aPos.needsUpdate = true;
    geo.attributes.aEscala.needsUpdate = true;
    const p = limitar(this.tempo / 0.9, 0, 1);
    const apagar = this.tempo > this.vida ? limitar(1 - (this.tempo - this.vida) / 1.2, 0, 1) : 1;
    this.mat.uniforms.uTempo.value = t;
    this.mat.uniforms.uAlpha.value = apagar;
    for (const m of this.nevoas) {
      const u = m.userData;
      const aparece = limitar((this.tempo - u.atraso) * 2, 0, 1);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(u.tam * (0.9 + aparece * 0.3));
      m.material.uniforms.uAlpha.value = aparece * 0.7 * apagar;
      m.material.uniforms.uTempo.value = t;
      m.visible = m.material.uniforms.uAlpha.value > 0.01;
    }
    return apagar > 0;
  }

  remover() {
    cena.remove(this.malha);
    this.malha.geometry.dispose(); this.malha.material.dispose();
    for (const m of this.nevoas) { cena.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
}

// ---------------------------------------------------------------- câmera (órbita própria)
const orbita = { theta: 0.34, phi: 0.92, raio: 9.2, alvo: new THREE.Vector3(0.9, 0.35, -0.5) };
const enquadramento = { alvo: orbita.alvo.clone(), raio: 9.2, ativo: true };
let usuarioMexeu = false;
function ajustaEnquadramento(centro, raioAltura) {
  // enquadra pela ALTURA do efeito (a profundidade da torrente lê como perspectiva,
  // não como tamanho), então o mesmo efeito tem o mesmo peso no celular e no desktop
  const fovV = THREE.MathUtils.degToRad(camera.fov);
  enquadramento.alvo.copy(centro);
  enquadramento.raio = limitar(raioAltura / Math.sin(fovV / 2) * 1.02, 5.0, 15.0);
  enquadramento.ativo = true; usuarioMexeu = false;
}
function enquadra() {
  const a = innerWidth / Math.max(innerHeight, 1);
  ajustaEnquadramento(new THREE.Vector3(1.2, 0.65, -0.6), 3.1);
  orbita.alvo.copy(enquadramento.alvo);
  orbita.raio = enquadramento.raio;
  posicionaCamera();
}
function posicionaCamera() {
  const { theta, phi, raio, alvo } = orbita;
  camera.position.set(
    alvo.x + raio * Math.sin(phi) * Math.sin(theta),
    alvo.y + raio * Math.cos(phi),
    alvo.z + raio * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(alvo);
}
enquadra();

// ---------------------------------------------------------------- interação
const ponteiros = new Map();
let arrastou = false, inicioX = 0, inicioY = 0, ultimaPinch = 0;
const raycaster = new THREE.Raycaster();
const planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const modo = { tipo: 'lanca' };

function pontoNoChao(ev) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(planoChao, p)) return p;
  const d = raycaster.ray.direction.clone();
  if (Math.abs(d.y) < 0.05) d.y = -0.2;
  const k = camera.position.y / Math.max(-d.y, 0.05);
  return camera.position.clone().addScaledVector(d, Math.min(Math.max(k, 6), 16)).setY(0);
}

canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture?.(ev.pointerId);
  ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ponteiros.size === 1) { arrastou = false; inicioX = ev.clientX; inicioY = ev.clientY; }
});
canvas.addEventListener('pointermove', (ev) => {
  const antes = ponteiros.get(ev.pointerId);
  if (!antes) return;
  ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ponteiros.size === 1) {
    const dx = ev.clientX - antes.x, dy = ev.clientY - antes.y;
    if (Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) > 7) arrastou = true;
    if (arrastou) {
      usuarioMexeu = true;
      orbita.theta -= dx * 0.006;
      orbita.phi = limitar(orbita.phi - dy * 0.005, 0.28, 1.45);
      posicionaCamera();
    }
  } else if (ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (ultimaPinch) { usuarioMexeu = true; orbita.raio = limitar(orbita.raio * (ultimaPinch / d), 4.5, 26); posicionaCamera(); }
    ultimaPinch = d; arrastou = true;
  }
});
function solta(ev) {
  const eraUm = ponteiros.size === 1;
  ponteiros.delete(ev.pointerId);
  if (ponteiros.size < 2) ultimaPinch = 0;
  if (eraUm && !arrastou) lancar(ev);
}
canvas.addEventListener('pointerup', solta);
canvas.addEventListener('pointercancel', (ev) => { ponteiros.delete(ev.pointerId); ultimaPinch = 0; });
canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); usuarioMexeu = true; orbita.raio = limitar(orbita.raio + ev.deltaY * 0.006, 4.5, 26); posicionaCamera(); }, { passive: false });

function lancar(ev, doUsuario = true) {
  const p = pontoNoChao(ev);
  if (!p) return;
  p.x = limitar(p.x, -14, 14); p.z = limitar(p.z, -14, 14);
  const dist = Math.hypot(p.x - conjurador.position.x, p.z - conjurador.position.z);
  if (dist < 1.6) return;
  const efeito = modo.tipo === 'lanca' ? new TorrenteDeGelo(p) : new CoroaDeGelo(p);
  efeitos.push(efeito);
  if (doUsuario) { paraDemo(); if (dica) dica.classList.add('some'); }
  const meio = conjurador.position.clone().lerp(p, 0.55).setY(0.7);
  const raioEfeito = modo.tipo === 'lanca' ? 3.1 : 4.0;
  ajustaEnquadramento(meio, raioEfeito);
  dica.classList.add('some');
  setTimeout(() => dica.remove(), 900);
}

// ---------------------------------------------------------------- controles de UI
const botoes = { lanca: document.querySelector('#bt-lanca'), coroa: document.querySelector('#bt-coroa') };
function escolhe(tipo) {
  modo.tipo = tipo;
  botoes.lanca.classList.toggle('ativo', tipo === 'lanca');
  botoes.coroa.classList.toggle('ativo', tipo === 'coroa');
}
botoes.lanca.addEventListener('click', () => escolhe('lanca'));
botoes.coroa.addEventListener('click', () => escolhe('coroa'));
document.querySelector('#bt-limpar').addEventListener('click', () => {
  for (const e of efeitos) e.remover();
  efeitos.length = 0;
  iniciaDemo();
});

// ---------------------------------------------------------------- laço
const relogio = new THREE.Clock();
let t = 0;
function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  t += dt;
  chaoMat.uniforms.uTempo.value = t;
  orbeMat.uniforms.uTempo.value = t;
  anelMat.uniforms.uTempo.value = t;
  flocos.uniforms.uTempo.value = t;
  if (enquadramento.ativo && !usuarioMexeu) {
    const k = 1 - Math.pow(0.001, dt);
    orbita.alvo.lerp(enquadramento.alvo, k);
    orbita.raio += (enquadramento.raio - orbita.raio) * k;
    posicionaCamera();
  }
  orbe.position.y = 1.0 + Math.sin(t * 1.6) * 0.05;
  orbe.rotation.y += dt * 0.6;
  for (let i = efeitos.length - 1; i >= 0; i--) {
    try {
      if (!efeitos[i].atualizar(dt, t)) { efeitos[i].remover(); efeitos.splice(i, 1); }
    } catch (err) { window.__erros.push('atualizar: ' + (err && err.message)); efeitos.splice(i, 1); }
  }
  window.__quadros = (window.__quadros || 0) + 1;
  renderer.render(cena, camera);
  requestAnimationFrame(quadro);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  enquadra();
});
quadro();

// demonstração automática: a página mostra o efeito sozinha até a pessoa clicar
let demoTimer = null, demoI = 0;
const DEMO = [
  { tipo: 'lanca', x: 3.2, z: -3.0 },
  { tipo: 'coroa', x: -2.6, z: -2.2 },
  { tipo: 'lanca', x: -3.4, z: -1.2 },
  { tipo: 'coroa', x: 2.8, z: 0.6 }
];
function passoDemo() {
  if (efeitos.length > 2) return;
  const c = DEMO[demoI % DEMO.length]; demoI++;
  const alvo = new THREE.Vector3(c.x, 0, c.z);
  efeitos.push(c.tipo === 'lanca' ? new TorrenteDeGelo(alvo) : new CoroaDeGelo(alvo));
  ajustaEnquadramento(conjurador.position.clone().lerp(alvo, 0.55).setY(0.7), c.tipo === 'lanca' ? 3.1 : 4.0);
}
function iniciaDemo() { if (!demoTimer) { passoDemo(); demoTimer = setInterval(passoDemo, 3400); } }
function paraDemo() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }
setTimeout(iniciaDemo, 700);

window.__gelo = {
  efeitos,
  lancarTorrenteEm: (x, z) => efeitos.push(new TorrenteDeGelo(new THREE.Vector3(x, 0, z))),
  erros: () => window.__erros, quadros: () => window.__quadros || 0,
  diag: () => ({
    janela: [innerWidth, innerHeight], raio: orbita.raio, alvo: orbita.alvo.toArray(),
    camera: camera.position.toArray().map(v => +v.toFixed(2)), fov: camera.fov,
    efeitos: efeitos.length,
    alturas: efeitos.map(e => (e.itens ? Math.max(...e.itens.map(i => +i.altura.toFixed(2))) : 0))
  })
};
