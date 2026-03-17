/**
 * WebGL2 Post-Processing Pipeline for Jump Jump Game
 * Processes Canvas 2D output through multiple shader effects
 */

// Zone-based visual parameters for different difficulty levels
const ZONE_PARAMS = {
    0: { bloomIntensity: 0.3, bloomThreshold: 0.7, contrast: 1.0, saturation: 1.1, tintR: 0.9, tintG: 1.1, tintB: 1.2, chromatic: 0.0, vignetteStrength: 0.2, grainStrength: 0.02 },
    1: { bloomIntensity: 0.35, bloomThreshold: 0.65, contrast: 1.0, saturation: 1.0, tintR: 0.9, tintG: 1.05, tintB: 1.15, chromatic: 0.001, vignetteStrength: 0.25, grainStrength: 0.03 },
    2: { bloomIntensity: 0.25, bloomThreshold: 0.6, contrast: 1.1, saturation: 0.9, tintR: 1.1, tintG: 0.9, tintB: 1.1, chromatic: 0.002, vignetteStrength: 0.35, grainStrength: 0.04 },
    3: { bloomIntensity: 0.2, bloomThreshold: 0.55, contrast: 1.15, saturation: 0.85, tintR: 1.2, tintG: 0.85, tintB: 0.9, chromatic: 0.003, vignetteStrength: 0.4, grainStrength: 0.05 },
    4: { bloomIntensity: 0.15, bloomThreshold: 0.5, contrast: 1.2, saturation: 0.8, tintR: 1.15, tintG: 0.8, tintB: 0.85, chromatic: 0.004, vignetteStrength: 0.5, grainStrength: 0.06 },
    5: { bloomIntensity: 0.1, bloomThreshold: 0.45, contrast: 1.3, saturation: 0.7, tintR: 1.3, tintG: 0.7, tintB: 0.7, chromatic: 0.006, vignetteStrength: 0.55, grainStrength: 0.08 },
    6: { bloomIntensity: 0.2, bloomThreshold: 0.4, contrast: 1.35, saturation: 0.6, tintR: 1.4, tintG: 0.6, tintB: 0.6, chromatic: 0.008, vignetteStrength: 0.6, grainStrength: 0.1 },
    7: { bloomIntensity: 0.15, bloomThreshold: 0.35, contrast: 1.4, saturation: 0.5, tintR: 1.3, tintG: 0.5, tintB: 0.5, chromatic: 0.01, vignetteStrength: 0.7, grainStrength: 0.12 },
    8: { bloomIntensity: 0.4, bloomThreshold: 0.5, contrast: 1.1, saturation: 1.2, tintR: 1.1, tintG: 1.1, tintB: 0.8, chromatic: 0.005, vignetteStrength: 0.4, grainStrength: 0.05 },
    9: { bloomIntensity: 0.5, bloomThreshold: 0.6, contrast: 1.0, saturation: 1.3, tintR: 0.85, tintG: 1.2, tintB: 0.9, chromatic: 0.001, vignetteStrength: 0.15, grainStrength: 0.02 }
};

class PostProcessPipeline {
    constructor() {
        this.gl = null;
        this.canvas = null;
        this.width = 500;
        this.height = 700;
        this.quality = 'high';
        this.enabledEffects = {
            bloom: true,
            colorGrade: true,
            motionBlur: true,
            chromaticAberration: true,
            vignetteGrain: true
        };

        // Shader programs
        this.programs = {};

        // Framebuffer objects for multi-pass rendering
        this.fbos = {};

        // Textures
        this.textures = {};

        // Vertex array object
        this.vao = null;

        // Uniform location caches
        this.uniformCache = {};

        this.initialized = false;
        this.lastError = null;
    }

    /**
     * Initialize WebGL2 context and compile all shaders
     */
    init(gameCanvas, postProcessCanvas) {
        try {
            this.canvas = postProcessCanvas;
            this.width = gameCanvas.width || 500;
            this.height = gameCanvas.height || 700;

            // Set up canvas size
            this.canvas.width = this.width;
            this.canvas.height = this.height;

            // Initialize WebGL2 context
            this.gl = this.canvas.getContext('webgl2', {
                antialias: false,
                depth: false,
                stencil: false,
                alpha: true,
                preserveDrawingBuffer: false
            });

            if (!this.gl) {
                throw new Error('WebGL2 not supported');
            }

            // Set viewport
            this.gl.viewport(0, 0, this.width, this.height);

            // Compile all shader programs
            this._compileShaders();

            // Set up fullscreen quad
            this._setupFullscreenQuad();

            // Set up framebuffer objects (FBO ping-pong)
            this._setupFramebuffers();

            // Create source texture (will be updated each frame)
            this.textures.source = this._createTexture(this.width, this.height, null);

            this.initialized = true;
            console.log('PostProcessPipeline initialized successfully');

            return true;
        } catch (error) {
            this.lastError = error.message;
            console.error('PostProcessPipeline initialization failed:', error);
            this._gracefulFallback();
            return false;
        }
    }

    /**
     * Compile all shader programs
     */
    _compileShaders() {
        const gl = this.gl;

        // Vertex shader (fullscreen quad - used for all passes)
        const vertexShaderSource = `#version 300 es
precision highp float;

in vec2 position;
out vec2 texCoord;

void main() {
    gl_Position = vec4(position, 0.0, 1.0);
    texCoord = position * 0.5 + 0.5;
}`;

        // Compile vertex shader once
        const vertexShader = this._compileShader(vertexShaderSource, gl.VERTEX_SHADER);

        // Bloom Pass 1: Brightness Extract
        const bloomExtractFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform float bloomThreshold;

void main() {
    vec4 color = texture(sourceTexture, texCoord);
    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    if (brightness > bloomThreshold) {
        fragColor = color;
    } else {
        fragColor = vec4(0.0);
    }
}`;
        this.programs.bloomExtract = this._linkProgram(vertexShader,
            this._compileShader(bloomExtractFS, gl.FRAGMENT_SHADER));

        // Bloom Pass 2: Gaussian Blur Horizontal
        const bloomBlurHorizontalFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform vec2 pixelSize;

void main() {
    vec4 result = vec4(0.0);
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

    result += texture(sourceTexture, texCoord) * weights[0];
    for (int i = 1; i < 5; i++) {
        float offset = float(i) * 2.0;
        result += texture(sourceTexture, texCoord + vec2(pixelSize.x * offset, 0.0)) * weights[i];
        result += texture(sourceTexture, texCoord - vec2(pixelSize.x * offset, 0.0)) * weights[i];
    }

    fragColor = result;
}`;
        this.programs.bloomBlurHorizontal = this._linkProgram(vertexShader,
            this._compileShader(bloomBlurHorizontalFS, gl.FRAGMENT_SHADER));

        // Bloom Pass 2: Gaussian Blur Vertical
        const bloomBlurVerticalFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform vec2 pixelSize;

void main() {
    vec4 result = vec4(0.0);
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

    result += texture(sourceTexture, texCoord) * weights[0];
    for (int i = 1; i < 5; i++) {
        float offset = float(i) * 2.0;
        result += texture(sourceTexture, texCoord + vec2(0.0, pixelSize.y * offset)) * weights[i];
        result += texture(sourceTexture, texCoord - vec2(0.0, pixelSize.y * offset)) * weights[i];
    }

    fragColor = result;
}`;
        this.programs.bloomBlurVertical = this._linkProgram(vertexShader,
            this._compileShader(bloomBlurVerticalFS, gl.FRAGMENT_SHADER));

        // Bloom Pass 3: Composite
        const bloomCompositeFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform sampler2D bloomTexture;
uniform float bloomIntensity;

void main() {
    vec4 source = texture(sourceTexture, texCoord);
    vec4 bloom = texture(bloomTexture, texCoord);

    fragColor = mix(source, source + bloom, bloomIntensity);
}`;
        this.programs.bloomComposite = this._linkProgram(vertexShader,
            this._compileShader(bloomCompositeFS, gl.FRAGMENT_SHADER));

        // Color Grading
        const colorGradeFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform float contrast;
uniform float saturation;
uniform vec3 tint;
uniform float brightness;

void main() {
    vec4 color = texture(sourceTexture, texCoord);

    // Apply contrast around midpoint
    color.rgb = mix(vec3(0.5), color.rgb, contrast);

    // Apply saturation
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(lum), color.rgb, saturation);

    // Apply tint
    color.rgb *= tint;

    // Apply brightness
    color.rgb += (brightness - 1.0) * 0.2;

    fragColor = color;
}`;
        this.programs.colorGrade = this._linkProgram(vertexShader,
            this._compileShader(colorGradeFS, gl.FRAGMENT_SHADER));

        // Motion Blur
        const motionBlurFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform vec2 velocity;
uniform float motionIntensity;

void main() {
    vec4 result = vec4(0.0);
    float samples = 5.0;

    for (float i = -2.0; i <= 2.0; i += 1.0) {
        vec2 offset = velocity * (i / samples) * motionIntensity;
        result += texture(sourceTexture, texCoord + offset);
    }

    fragColor = result / samples;
}`;
        this.programs.motionBlur = this._linkProgram(vertexShader,
            this._compileShader(motionBlurFS, gl.FRAGMENT_SHADER));

        // Chromatic Aberration
        const chromaticAberrationFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform float chromaticStrength;

void main() {
    vec2 center = vec2(0.5);
    vec2 fromCenter = texCoord - center;
    float distFromCenter = length(fromCenter) * 2.0;

    float strength = chromaticStrength * distFromCenter;
    vec2 direction = normalize(fromCenter + vec2(0.0001));

    float r = texture(sourceTexture, texCoord + direction * strength * 0.01).r;
    float g = texture(sourceTexture, texCoord).g;
    float b = texture(sourceTexture, texCoord - direction * strength * 0.01).b;
    float a = texture(sourceTexture, texCoord).a;

    fragColor = vec4(r, g, b, a);
}`;
        this.programs.chromaticAberration = this._linkProgram(vertexShader,
            this._compileShader(chromaticAberrationFS, gl.FRAGMENT_SHADER));

        // Vignette + Grain
        const vignetteGrainFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;
uniform float vignetteStrength;
uniform float grainStrength;
uniform float time;

// Hash-based noise
float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 color = texture(sourceTexture, texCoord);

    // Vignette (radial darkening)
    vec2 vignettCoord = texCoord * 2.0 - 1.0;
    float vignette = 1.0 - length(vignettCoord) * 0.5;
    vignette = pow(vignette, 2.0);
    vignette = mix(1.0, vignette, vignetteStrength);

    // Film grain
    vec2 grainCoord = texCoord + vec2(time * 0.5);
    float grain = noise(grainCoord * 100.0);
    grain = mix(1.0, grain, grainStrength);

    fragColor = color * vignette * grain;
}`;
        this.programs.vignetteGrain = this._linkProgram(vertexShader,
            this._compileShader(vignetteGrainFS, gl.FRAGMENT_SHADER));

        // Passthrough (final output)
        const passthroughFS = `#version 300 es
precision highp float;

in vec2 texCoord;
out vec4 fragColor;

uniform sampler2D sourceTexture;

void main() {
    fragColor = texture(sourceTexture, texCoord);
}`;
        this.programs.passthrough = this._linkProgram(vertexShader,
            this._compileShader(passthroughFS, gl.FRAGMENT_SHADER));

        console.log('All shaders compiled successfully');
    }

    /**
     * Compile a single shader
     */
    _compileShader(source, type) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${error}`);
        }

        return shader;
    }

    /**
     * Link a vertex and fragment shader into a program
     */
    _linkProgram(vertexShader, fragmentShader) {
        const gl = this.gl;
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.bindAttribLocation(program, 0, 'position');
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Program linking failed: ${error}`);
        }

        return program;
    }

    /**
     * Set up fullscreen quad (2 triangles)
     */
    _setupFullscreenQuad() {
        const gl = this.gl;

        // Vertex positions for fullscreen quad
        const positions = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
             1.0,  1.0
        ]);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindVertexArray(null);
    }

    /**
     * Set up framebuffer objects for ping-pong rendering
     */
    _setupFramebuffers() {
        const gl = this.gl;

        // Full resolution FBOs
        this.fbos.fullA = this._createFramebuffer(this.width, this.height);
        this.fbos.fullB = this._createFramebuffer(this.width, this.height);

        // Half resolution FBOs (for bloom blur)
        this.fbos.halfA = this._createFramebuffer(this.width / 2, this.height / 2);
        this.fbos.halfB = this._createFramebuffer(this.width / 2, this.height / 2);
    }

    /**
     * Create a framebuffer object with attached texture
     */
    _createFramebuffer(width, height) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        const texture = this._createTexture(width, height, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Framebuffer incomplete: ${status}`);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return { fbo, texture, width, height };
    }

    /**
     * Create a texture
     */
    _createTexture(width, height, data) {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.bindTexture(gl.TEXTURE_2D, null);

        return texture;
    }

    /**
     * Capture frame from Canvas 2D - optimized to avoid expensive getImageData
     */
    captureFrame(canvas2d) {
        if (!this.initialized || !this.gl) return false;

        try {
            const gl = this.gl;

            // Performance optimization: Use direct canvas as texture source
            // instead of calling getImageData which forces GPU-to-CPU readback
            gl.bindTexture(gl.TEXTURE_2D, this.textures.source);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);

            gl.bindTexture(gl.TEXTURE_2D, null);

            return true;
        } catch (error) {
            console.error('Error capturing frame:', error);
            return false;
        }
    }

    /**
     * Render effect using source and target FBOs
     */
    _renderEffect(program, sourceFbo, targetFbo, uniformsSetter) {
        const gl = this.gl;

        gl.useProgram(program);

        // Bind VAO and draw
        gl.bindVertexArray(this.vao);

        // Bind source texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceFbo.texture || sourceFbo);

        // Bind target framebuffer
        if (targetFbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo.fbo);
            gl.viewport(0, 0, targetFbo.width, targetFbo.height);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.width, this.height);
        }

        // Set uniforms
        const sourceLoc = gl.getUniformLocation(program, 'sourceTexture');
        gl.uniform1i(sourceLoc, 0);

        uniformsSetter(program);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);
    }

    /**
     * Get interpolated parameters between zones
     */
    _getInterpolatedParams(zone, progress) {
        const currentZone = Math.min(Math.floor(zone), 9);
        const nextZone = Math.min(currentZone + 1, 9);

        const current = ZONE_PARAMS[currentZone];
        const next = ZONE_PARAMS[nextZone];

        const params = {};
        for (const key in current) {
            params[key] = current[key] + (next[key] - current[key]) * progress;
        }

        return params;
    }

    /**
     * Process a frame through the post-processing pipeline
     */
    processFrame(options) {
        if (!this.initialized || !this.gl) return;

        const {
            zone = 0,
            zoneProgress = 0,
            velocityY = 0,
            time = 0
        } = options;

        try {
            const gl = this.gl;
            const params = this._getInterpolatedParams(zone, zoneProgress);

            // Start with source texture
            let currentSource = this.textures.source;

            // Bloom Pass 1: Extract brightness
            if (this.enabledEffects.bloom && this.quality !== 'off') {
                this._renderEffect(this.programs.bloomExtract, currentSource, this.fbos.fullA,
                    (program) => {
                        const loc = gl.getUniformLocation(program, 'bloomThreshold');
                        gl.uniform1f(loc, params.bloomThreshold);
                    }
                );

                // Bloom Pass 2a: Horizontal blur at half resolution
                this._renderEffect(this.programs.bloomBlurHorizontal, this.fbos.fullA, this.fbos.halfA,
                    (program) => {
                        const loc = gl.getUniformLocation(program, 'pixelSize');
                        gl.uniform2f(loc, 1.0 / (this.width / 2), 0.0);
                    }
                );

                // Bloom Pass 2b: Vertical blur
                this._renderEffect(this.programs.bloomBlurVertical, this.fbos.halfA, this.fbos.fullB,
                    (program) => {
                        const loc = gl.getUniformLocation(program, 'pixelSize');
                        gl.uniform2f(loc, 0.0, 1.0 / this.height);
                    }
                );

                // Bloom Pass 3: Composite
                this._renderEffect(this.programs.bloomComposite, this.textures.source, this.fbos.fullA,
                    (program) => {
                        const bloomLoc = gl.getUniformLocation(program, 'bloomTexture');
                        const intensityLoc = gl.getUniformLocation(program, 'bloomIntensity');

                        gl.activeTexture(gl.TEXTURE1);
                        gl.bindTexture(gl.TEXTURE_2D, this.fbos.fullB.texture);
                        gl.uniform1i(bloomLoc, 1);
                        gl.uniform1f(intensityLoc, params.bloomIntensity);
                    }
                );

                currentSource = this.fbos.fullA;
            }

            // Color Grading
            if (this.enabledEffects.colorGrade && this.quality !== 'off') {
                this._renderEffect(this.programs.colorGrade, currentSource, this.fbos.fullB,
                    (program) => {
                        gl.uniform1f(gl.getUniformLocation(program, 'contrast'), params.contrast);
                        gl.uniform1f(gl.getUniformLocation(program, 'saturation'), params.saturation);
                        gl.uniform3f(gl.getUniformLocation(program, 'tint'), params.tintR, params.tintG, params.tintB);
                        gl.uniform1f(gl.getUniformLocation(program, 'brightness'), 1.0);
                    }
                );

                currentSource = this.fbos.fullB;
            }

            // Motion Blur (skip in medium quality)
            if (this.enabledEffects.motionBlur && this.quality === 'high') {
                const motionIntensity = Math.abs(velocityY) / 20.0;
                this._renderEffect(this.programs.motionBlur, currentSource, this.fbos.fullA,
                    (program) => {
                        gl.uniform2f(gl.getUniformLocation(program, 'velocity'), 0.0, motionIntensity * 0.01);
                        gl.uniform1f(gl.getUniformLocation(program, 'motionIntensity'), Math.min(motionIntensity, 0.5));
                    }
                );

                currentSource = this.fbos.fullA;
            }

            // Chromatic Aberration
            if (this.enabledEffects.chromaticAberration && this.quality !== 'off') {
                this._renderEffect(this.programs.chromaticAberration, currentSource, this.fbos.fullB,
                    (program) => {
                        gl.uniform1f(gl.getUniformLocation(program, 'chromaticStrength'), params.chromatic);
                    }
                );

                currentSource = this.fbos.fullB;
            }

            // Vignette + Grain
            if (this.enabledEffects.vignetteGrain && this.quality !== 'off') {
                this._renderEffect(this.programs.vignetteGrain, currentSource, null,
                    (program) => {
                        gl.uniform1f(gl.getUniformLocation(program, 'vignetteStrength'), params.vignetteStrength);
                        gl.uniform1f(gl.getUniformLocation(program, 'grainStrength'), params.grainStrength);
                        gl.uniform1f(gl.getUniformLocation(program, 'time'), time);
                    }
                );
            } else if (currentSource !== this.textures.source) {
                // Final passthrough if not vignetted
                this._renderEffect(this.programs.passthrough, currentSource, null, () => {});
            }

        } catch (error) {
            console.error('Error processing frame:', error);
        }
    }

    /**
     * Set quality level
     */
    setQuality(level) {
        if (['high', 'medium', 'low', 'off'].includes(level)) {
            this.quality = level;
            if (this.canvas) {
                this.canvas.style.display = level === 'off' ? 'none' : 'block';
            }
        }
    }

    /**
     * Toggle individual effect
     */
    setEffectEnabled(effectName, enabled) {
        if (effectName in this.enabledEffects) {
            this.enabledEffects[effectName] = enabled;
        }
    }

    /**
     * Graceful fallback if WebGL fails
     */
    _gracefulFallback() {
        this.initialized = false;
        if (this.canvas) {
            this.canvas.style.display = 'none';
        }
        console.warn('Post-processing disabled: WebGL2 not available');
    }
}

// Public API - Global post-processor instance
const postProcessor = {
    _pipeline: null,

    init(gameCanvas, postProcessCanvas) {
        this._pipeline = new PostProcessPipeline();
        return this._pipeline.init(gameCanvas, postProcessCanvas);
    },

    captureFrame(canvas2d) {
        if (this._pipeline) {
            return this._pipeline.captureFrame(canvas2d);
        }
        return false;
    },

    processFrame(options) {
        if (this._pipeline) {
            this._pipeline.processFrame(options);
        }
    },

    setQuality(level) {
        if (this._pipeline) {
            this._pipeline.setQuality(level);
        }
    },

    setEffectEnabled(effectName, enabled) {
        if (this._pipeline) {
            this._pipeline.setEffectEnabled(effectName, enabled);
        }
    },

    getStatus() {
        return this._pipeline ? {
            initialized: this._pipeline.initialized,
            quality: this._pipeline.quality,
            lastError: this._pipeline.lastError,
            effects: this._pipeline.enabledEffects
        } : null;
    }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = postProcessor;
}
