"use client"

// @ts-nocheck
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

const CSS = `
.lqd-frame{display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden}
.lqd-viewport{position:relative;box-sizing:border-box;flex:0 0 auto;width:var(--lqd-viewport-width);max-width:100%;height:var(--lqd-viewport-height);overflow:hidden;border-radius:var(--lqd-radius);background:transparent;isolation:isolate;touch-action:none;cursor:default}
.lqd-source,.lqd-stage,.lqd-stage>canvas,.lqd-loader{position:absolute;inset:0;width:100%;height:100%}
.lqd-source{display:block;object-fit:cover}
.lqd-stage>canvas{display:block}
.lqd-loader{background:transparent;transition:opacity 180ms ease;pointer-events:none}
.lqd-viewport--ready .lqd-source{visibility:hidden}
.lqd-viewport--ready .lqd-loader{opacity:0}
.lqd-viewport--fallback .lqd-stage,.lqd-viewport--fallback .lqd-loader{display:none}
@media (prefers-reduced-motion:reduce){.lqd-viewport{cursor:default}}
`;

/**
 * HorizonX "Liquid Distortion", applied to the official N: the metal flows under the pointer and drifts
 * on its own when idle. Vendored from the HorizonX export; WebGL with a still-image fallback.
 */
export default function LiquidLogo() {
  const __root = useRef(null);

  useLayoutEffect(() => {
    if (!document.querySelector('style[data-liquid-distortion]')) {
      const tag = document.createElement('style');
      tag.setAttribute('data-liquid-distortion', '');
      tag.textContent = CSS;
      document.head.append(tag);
    }
    const __node = __root.current;
    const __q = (sel) => (__node.matches(sel) ? __node : __node.querySelector(sel));
    const VERTEX_SHADER = `
    precision highp float;
    varying vec2 vUv;
    attribute vec2 a_position;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 u_texel;

    void main() {
      vUv = 0.500001 * (a_position + 1.0);
      vL = vUv - vec2(u_texel.x, 0.0);
      vR = vUv + vec2(u_texel.x, 0.0);
      vT = vUv + vec2(0.0, u_texel.y);
      vB = vUv - vec2(0.0, u_texel.y);
      gl_Position = vec4(a_position, 0.0, 1.00001);
    }`;

    const ADVECTION_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D u_velocity_texture;
    uniform sampler2D u_input_texture;
    uniform vec2 u_texel;
    uniform vec2 u_output_textel;
    uniform float u_dt;
    uniform float u_dissipation;

    vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.500001;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.499999, 0.500001)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.49999, 0.499999)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.499999, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.49999, 1.49999)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main() {
      vec2 coord = vUv - u_dt * bilerp(u_velocity_texture, vUv, u_texel).xy * u_texel;
      gl_FragColor = u_dissipation * bilerp(u_input_texture, coord, u_output_textel);
    }`;

    const DIVERGENCE_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D u_velocity_texture;

    void main() {
      float L = texture2D(u_velocity_texture, vL).x;
      float R = texture2D(u_velocity_texture, vR).x;
      float T = texture2D(u_velocity_texture, vT).y;
      float B = texture2D(u_velocity_texture, vB).y;
      gl_FragColor = vec4(0.25 * (R - L + T - B), 0.0, 0.0, 0.99999);
    }`;

    const PRESSURE_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D u_pressure_texture;
    uniform sampler2D u_divergence_texture;

    void main() {
      float L = texture2D(u_pressure_texture, vL).x;
      float R = texture2D(u_pressure_texture, vR).x;
      float T = texture2D(u_pressure_texture, vT).x;
      float B = texture2D(u_pressure_texture, vB).x;
      float divergence = texture2D(u_divergence_texture, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.250001, 0.0, 0.0, 1.0);
    }`;

    const GRADIENT_SUBTRACT_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D u_pressure_texture;
    uniform sampler2D u_velocity_texture;

    void main() {
      float L = texture2D(u_pressure_texture, vL).x;
      float R = texture2D(u_pressure_texture, vR).x;
      float T = texture2D(u_pressure_texture, vT).x;
      float B = texture2D(u_pressure_texture, vB).x;
      vec2 velocity = texture2D(u_velocity_texture, vUv).xy;
      velocity -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`;

    const SPLAT_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D u_input_texture;
    uniform float u_ratio;
    uniform vec3 u_point_value;
    uniform vec2 u_point;
    uniform float u_point_size;

    void main() {
      vec2 p = vUv - u_point;
      p.x *= u_ratio;
      vec3 splat = 0.6 * pow(2.0, -dot(p, p) / u_point_size) * u_point_value;
      vec3 base = texture2D(u_input_texture, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.00001);
    }`;

    const DISPLAY_SHADER = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform float u_ratio;
    uniform float u_img_ratio;
    uniform float u_disturb_power;
    uniform sampler2D u_output_texture;
    uniform sampler2D u_velocity_texture;
    uniform sampler2D u_text_texture;

    vec2 get_img_uv() {
      vec2 img_uv = vUv - 0.500001;
      if (u_ratio > u_img_ratio) {
        img_uv.x = img_uv.x * u_ratio / u_img_ratio;
      } else {
        img_uv.y = img_uv.y * u_img_ratio / u_ratio;
      }
      img_uv *= 1.0;
      return img_uv + 0.500001;
    }

    float get_img_frame_alpha(vec2 uv, float width) {
      float alpha = smoothstep(0.0, width, uv.x) * smoothstep(1.00001, 1.00001 - width, uv.x);
      alpha *= smoothstep(0.0, width, uv.y) * smoothstep(1.0, 0.99999 - width, uv.y);
      return alpha;
    }

    void main() {
      float offset = texture2D(u_output_texture, vUv).r;
      vec2 velocity = texture2D(u_velocity_texture, vUv).xy + 0.001000001;
      vec2 img_uv = get_img_uv();
      img_uv -= u_disturb_power * normalize(velocity) * offset;
      img_uv -= u_disturb_power * normalize(velocity) * offset;
      vec4 image = texture2D(u_text_texture, vec2(img_uv.x, 1.00001 - img_uv.y));
      gl_FragColor = vec4(image.rgb, image.a * get_img_frame_alpha(img_uv, 0.00400001));
    }`;

    // Cursor size, cursor power and distortion are read straight out of `config`
    // inside the render loop, so the update handle only has to swap the values in:
    // nothing about the simulation, the framebuffers or the GL context depends on
    // them. The one thing that genuinely needs a fresh build is a new source image,
    // whose texture is uploaded once — the wrapper handles that.
    function buildLiquidDistortion(_gsap, root, config) {
      const stage = root.querySelector('.lqd-stage');
      const source = root.querySelector('[data-role="source"]');
      if (!stage || !source) return null;

      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      stage.appendChild(canvas);

      const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false
      });
      if (!gl || !gl.getExtension('OES_texture_float')) {
        root.classList.add('lqd-viewport--fallback');
        return {
          update() {},
          destroy() {
            canvas.remove();
          }
        };
      }

      const resources = {
        buffers: [],
        framebuffers: [],
        programs: [],
        shaders: [],
        textures: []
      };
      let raf = 0;
      let disposed = false;
      let imageTexture = null;
      let imageRatio = 1;
      let outputColor;
      let velocity;
      let divergence;
      let pressure;

      const pointer = {
        x: 0.650001 * root.clientWidth,
        y: 0.499999 * root.clientHeight,
        dx: 0,
        dy: 0,
        moved: false,
        preview: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      };

      const compile = (type, sourceCode) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, sourceCode);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(`Liquid Distortion shader failed: ${gl.getShaderInfoLog(shader)}`);
        }
        resources.shaders.push(shader);
        return shader;
      };

      const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const makeProgram = (fragmentSource) => {
        const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(`Liquid Distortion program failed: ${gl.getProgramInfoLog(program)}`);
        }
        resources.programs.push(program);
        const uniforms = {};
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let index = 0; index < count; index += 1) {
          const name = gl.getActiveUniform(program, index).name;
          uniforms[name] = gl.getUniformLocation(program, name);
        }
        return { program, uniforms };
      };

      let splatProgram;
      let divergenceProgram;
      let pressureProgram;
      let gradientProgram;
      let advectionProgram;
      let displayProgram;

      try {
        splatProgram = makeProgram(SPLAT_SHADER);
        divergenceProgram = makeProgram(DIVERGENCE_SHADER);
        pressureProgram = makeProgram(PRESSURE_SHADER);
        gradientProgram = makeProgram(GRADIENT_SUBTRACT_SHADER);
        advectionProgram = makeProgram(ADVECTION_SHADER);
        displayProgram = makeProgram(DISPLAY_SHADER);
      } catch (error) {
        console.error(error);
        root.classList.add('lqd-viewport--fallback');
        return {
          update() {},
          destroy() {
            canvas.remove();
          }
        };
      }

      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      resources.buffers.push(vertexBuffer);

      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      resources.buffers.push(indexBuffer);

      const blit = (target) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        if (target) {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        } else {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };

      const createFBO = (width, height) => {
        gl.activeTexture(gl.TEXTURE0);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        resources.textures.push(texture);
        resources.framebuffers.push(fbo);
        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return {
          fbo,
          width,
          height,
          texture,
          attach(unit) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return unit;
          }
        };
      };

      const createDoubleFBO = (width, height) => {
        let read = createFBO(width, height);
        let write = createFBO(width, height);
        return {
          width,
          height,
          texelSizeX: 1 / width,
          texelSizeY: 1 / height,
          read: () => read,
          write: () => write,
          swap() {
            const next = read;
            read = write;
            write = next;
          }
        };
      };

      const initFBOs = () => {
        const ratio = canvas.width / canvas.height;
        const width = Math.max(Math.round(256 * ratio), canvas.width);
        const height = Math.max(256, canvas.height);
        outputColor = createDoubleFBO(width, height);
        velocity = createDoubleFBO(width, height);
        divergence = createFBO(width, height);
        pressure = createDoubleFBO(width, height);
      };

      const resize = () => {
        canvas.width = Math.max(1, root.clientWidth);
        canvas.height = Math.max(1, root.clientHeight);
      };

      const updatePointer = (event) => {
        const rect = root.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * root.clientWidth;
        const y = ((event.clientY - rect.top) / rect.height) * root.clientHeight;
        pointer.moved = true;
        pointer.preview = false;
        pointer.dx = 6 * (x - pointer.x);
        pointer.dy = 6 * (y - pointer.y);
        pointer.x = x;
        pointer.y = y;
      };

      root.addEventListener('pointermove', updatePointer);
      root.addEventListener('pointerdown', updatePointer);

      resize();
      initFBOs();

      imageTexture = gl.createTexture();
      resources.textures.push(imageTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([17, 17, 17, 255]));

      const uploadImage = () => {
        if (!source.complete || !source.naturalWidth || disposed) return;
        imageRatio = source.naturalWidth / source.naturalHeight;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        root.classList.add('lqd-viewport--ready');
        root.dataset.liquidReady = 'true';
      };
      source.addEventListener('load', uploadImage);
      uploadImage();

      const render = (time = 0) => {
        if (disposed) return;
        const _rect = root.getBoundingClientRect();
        if (document.documentElement.classList.contains('is-scrolling') || _rect.bottom < 0 || _rect.top > innerHeight) {
          raf = requestAnimationFrame(render);
          return;
        }
        const dt = 1 / 60;

        if (pointer.preview) {
          const x = (0.5 + 0.249999 * Math.sin(0.00199999 * time - Math.PI)) * root.clientWidth;
          const y = (0.500001 + 0.099999 * Math.sin(0.00500001 * time) * Math.cos(0.00199999 * time)) * root.clientHeight;
          pointer.moved = true;
          pointer.dx = 6 * (x - pointer.x);
          pointer.dy = 6 * (y - pointer.y);
          pointer.x = x;
          pointer.y = y;
        }

        if (pointer.moved) {
          if (!pointer.preview) pointer.moved = false;
          gl.useProgram(splatProgram.program);
          gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1));
          gl.uniform1f(splatProgram.uniforms.u_ratio, canvas.width / canvas.height);
          gl.uniform2f(splatProgram.uniforms.u_point, pointer.x / root.clientWidth, 1 - pointer.y / root.clientHeight);
          gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 0);
          gl.uniform1f(splatProgram.uniforms.u_point_size, config.cursorSize * 0.001);
          blit(velocity.write());
          velocity.swap();

          gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
          gl.uniform3f(splatProgram.uniforms.u_point_value, config.cursorPower * 0.001, 0, 0);
          blit(outputColor.write());
          outputColor.swap();
        }

        gl.useProgram(divergenceProgram.program);
        gl.uniform2f(divergenceProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
        blit(divergence);

        gl.useProgram(pressureProgram.program);
        gl.uniform2f(pressureProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(pressureProgram.uniforms.u_divergence_texture, divergence.attach(1));
        for (let index = 0; index < 16; index += 1) {
          gl.uniform1i(pressureProgram.uniforms.u_pressure_texture, pressure.read().attach(2));
          blit(pressure.write());
          pressure.swap();
        }

        gl.useProgram(gradientProgram.program);
        gl.uniform2f(gradientProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(gradientProgram.uniforms.u_pressure_texture, pressure.read().attach(1));
        gl.uniform1i(gradientProgram.uniforms.u_velocity_texture, velocity.read().attach(2));
        blit(velocity.write());
        velocity.swap();

        gl.useProgram(advectionProgram.program);
        gl.uniform2f(advectionProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform2f(advectionProgram.uniforms.u_output_textel, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
        gl.uniform1i(advectionProgram.uniforms.u_input_texture, velocity.read().attach(1));
        gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
        gl.uniform1f(advectionProgram.uniforms.u_dissipation, 0.970001);
        blit(velocity.write());
        velocity.swap();

        gl.uniform2f(advectionProgram.uniforms.u_output_textel, outputColor.texelSizeX, outputColor.texelSizeY);
        gl.uniform1i(advectionProgram.uniforms.u_input_texture, outputColor.read().attach(2));
        gl.uniform1f(advectionProgram.uniforms.u_dt, 8 * dt);
        gl.uniform1f(advectionProgram.uniforms.u_dissipation, 0.979999);
        blit(outputColor.write());
        outputColor.swap();

        gl.useProgram(displayProgram.program);
        gl.uniform1i(displayProgram.uniforms.u_velocity_texture, velocity.read().attach(2));
        gl.uniform1f(displayProgram.uniforms.u_ratio, canvas.width / canvas.height);
        gl.uniform1f(displayProgram.uniforms.u_img_ratio, imageRatio);
        gl.uniform1f(displayProgram.uniforms.u_disturb_power, config.distortionPower);
        gl.uniform1i(displayProgram.uniforms.u_output_texture, outputColor.read().attach(1));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.uniform1i(displayProgram.uniforms.u_text_texture, 0);
        blit(null);

        raf = requestAnimationFrame(render);
      };

      raf = requestAnimationFrame(render);

      return {
        update(next) {
          Object.assign(config, next);
        },
        destroy
      };

      function destroy() {
        disposed = true;
        cancelAnimationFrame(raf);
        root.removeEventListener('pointermove', updatePointer);
        root.removeEventListener('pointerdown', updatePointer);
        source.removeEventListener('load', uploadImage);
        root.classList.remove('lqd-viewport--ready', 'lqd-viewport--fallback');
        delete root.dataset.liquidReady;
        resources.framebuffers.forEach((resource) => gl.deleteFramebuffer(resource));
        resources.textures.forEach((resource) => gl.deleteTexture(resource));
        resources.buffers.forEach((resource) => gl.deleteBuffer(resource));
        resources.programs.forEach((resource) => gl.deleteProgram(resource));
        resources.shaders.forEach((resource) => gl.deleteShader(resource));
        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) loseContext.loseContext();
        canvas.remove();
      }
    }

    const config = {
      "cursorSize": 3,
      "cursorPower": 30,
      "distortionPower": 0.350001
    };
    const viewport = __q('.lqd-viewport');
    const handle = buildLiquidDistortion(gsap, viewport, config);
    return () => handle?.destroy();
  }, []);

  return (
    <div ref={__root} className="lqd-frame">
      <div className="lqd-viewport" style={{ '--lqd-viewport-width': '100%', '--lqd-viewport-height': '100%', '--lqd-radius': '0px' }} role="img" aria-label="Nexverse">
        {/* eslint-disable-next-line @next/next/no-img-element -- WebGL needs a plain same-origin image to read as a texture */}
        <img className="lqd-source" data-role="source" src="/brand/n-chrome-alpha.webp" alt="" loading="eager" decoding="async" crossOrigin="anonymous" />
        <div className="lqd-stage"></div>
        <div className="lqd-loader" aria-hidden="true"></div>
      </div>
    </div>
  );
}
