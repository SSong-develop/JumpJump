// ═══════════════════════════════════════════════════════════════════════════════
// PixiJS Effects Layer - GPU-accelerated particles, filters, and compositing
// Integrates with existing Canvas 2D renderer as an enhancement layer
// Depends on: pixi.js (CDN), config.js
// ═══════════════════════════════════════════════════════════════════════════════

const PixiEffects = (() => {
    // PixiJS Application
    let app = null;
    let initialized = false;

    // Layers
    let baseSprite = null;     // Canvas 2D content as texture
    let particleLayer = null;  // Particle container
    let effectsLayer = null;   // Additional effects
    let filterContainer = null; // Container for filter application

    // Particle pools
    const envParticleSprites = [];
    const impactParticleSprites = [];
    const MAX_ENV_PARTICLES = 200;
    const MAX_IMPACT_PARTICLES = 150;

    // Filters
    let bloomFilter = null;
    let colorMatrixFilter = null;
    let displacementFilter = null;
    let displacementSprite = null;

    // State
    let currentZone = 0;
    let enabled = true;

    // ═══════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    function init(targetCanvas) {
        if (initialized || !window.PIXI) {
            console.warn('[PixiEffects] PIXI not available or already initialized');
            return false;
        }

        try {
            // Create PixiJS Application targeting existing canvas
            app = new PIXI.Application({
                view: targetCanvas,
                width: CANVAS_LOGICAL_W,
                height: CANVAS_LOGICAL_H,
                backgroundAlpha: 0,
                antialias: false,
                resolution: 1,
                autoDensity: false,
                clearBeforeRender: true,
                preserveDrawingBuffer: false
            });

            // Create main container with filter support
            filterContainer = new PIXI.Container();
            app.stage.addChild(filterContainer);

            // Base sprite (will hold Canvas 2D rendered content)
            baseSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
            filterContainer.addChild(baseSprite);

            // Particle layer
            particleLayer = new PIXI.Container();
            filterContainer.addChild(particleLayer);

            // Effects layer
            effectsLayer = new PIXI.Container();
            filterContainer.addChild(effectsLayer);

            // Initialize particle pools
            initParticlePools();

            // Initialize filters
            initFilters();

            initialized = true;
            console.log('[PixiEffects] Initialized successfully');
            return true;
        } catch (e) {
            console.error('[PixiEffects] Init failed:', e);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PARTICLE POOL
    // ═══════════════════════════════════════════════════════════════════

    function createParticleTexture(size, color) {
        const g = new PIXI.Graphics();
        g.beginFill(color || 0xffffff);
        g.drawRect(0, 0, size || 4, size || 4);
        g.endFill();
        return app.renderer.generateTexture(g);
    }

    let particleTexture4 = null;
    let particleTexture2 = null;
    let particleTextureCircle = null;

    function initParticlePools() {
        // Create reusable particle textures
        particleTexture4 = createParticleTexture(4);
        particleTexture2 = createParticleTexture(2);

        // Circle texture for fog
        const gCircle = new PIXI.Graphics();
        gCircle.beginFill(0xffffff);
        gCircle.drawCircle(30, 30, 30);
        gCircle.endFill();
        particleTextureCircle = app.renderer.generateTexture(gCircle);

        // Pre-create env particle sprites
        for (let i = 0; i < MAX_ENV_PARTICLES; i++) {
            const sprite = new PIXI.Sprite(particleTexture4);
            sprite.visible = false;
            sprite.anchor.set(0.5);
            particleLayer.addChild(sprite);
            envParticleSprites.push(sprite);
        }

        // Pre-create impact particle sprites
        for (let i = 0; i < MAX_IMPACT_PARTICLES; i++) {
            const sprite = new PIXI.Sprite(particleTexture2);
            sprite.visible = false;
            sprite.anchor.set(0.5);
            particleLayer.addChild(sprite);
            impactParticleSprites.push(sprite);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FILTERS
    // ═══════════════════════════════════════════════════════════════════

    function initFilters() {
        // Color Matrix for zone-based color grading
        colorMatrixFilter = new PIXI.ColorMatrixFilter();

        // Create displacement map for heat/water effects
        const dispCanvas = document.createElement('canvas');
        dispCanvas.width = 256;
        dispCanvas.height = 256;
        const dispCtx = dispCanvas.getContext('2d');

        // Generate Perlin-like noise for displacement
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const val = Math.floor(128 + Math.sin(x * 0.05) * 40 + Math.cos(y * 0.05) * 40 + Math.random() * 20);
                dispCtx.fillStyle = `rgb(${val},${val},128)`;
                dispCtx.fillRect(x, y, 1, 1);
            }
        }

        displacementSprite = PIXI.Sprite.from(dispCanvas);
        displacementSprite.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
        displacementFilter = new PIXI.DisplacementFilter(displacementSprite, 0);
        app.stage.addChild(displacementSprite);
        displacementSprite.visible = false;

        // Apply filters (initially off)
        updateFiltersForZone(0);
    }

    // Zone-based filter parameters
    const ZONE_FILTER_PARAMS = {
        0: { saturation: 0.1, displacement: 0, brightness: 1.0 },
        1: { saturation: 0.05, displacement: 0, brightness: 1.0 },
        2: { saturation: -0.1, displacement: 2, brightness: 0.95 },
        3: { saturation: -0.15, displacement: 3, brightness: 0.9 },
        4: { saturation: -0.2, displacement: 4, brightness: 0.85 },
        5: { saturation: -0.3, displacement: 5, brightness: 0.8 },
        6: { saturation: -0.4, displacement: 6, brightness: 0.75 },
        7: { saturation: -0.4, displacement: 8, brightness: 0.7 },
        8: { saturation: 0.2, displacement: 10, brightness: 0.9 },
        9: { saturation: 0.3, displacement: 2, brightness: 1.05 }
    };

    function updateFiltersForZone(zone) {
        if (!initialized) return;

        const params = ZONE_FILTER_PARAMS[zone] || ZONE_FILTER_PARAMS[0];
        const filters = [];

        // Color grading
        colorMatrixFilter.reset();
        if (params.saturation !== 0) {
            colorMatrixFilter.saturate(params.saturation, false);
        }
        if (params.brightness !== 1.0) {
            colorMatrixFilter.brightness(params.brightness, false);
        }
        filters.push(colorMatrixFilter);

        // Displacement (heat haze/distortion)
        if (params.displacement > 0) {
            displacementFilter.scale.x = params.displacement;
            displacementFilter.scale.y = params.displacement;
            displacementSprite.visible = true;
            filters.push(displacementFilter);
        } else {
            displacementSprite.visible = false;
        }

        filterContainer.filters = filters.length > 0 ? filters : null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDERING API
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Update the base canvas texture from Canvas 2D render
     * Call this after the Canvas 2D pipeline finishes
     */
    function updateBaseTexture(sourceCanvas) {
        if (!initialized || !enabled) return;

        // Update the base sprite with current Canvas 2D content
        if (baseSprite.texture !== PIXI.Texture.EMPTY) {
            baseSprite.texture.destroy(true);
        }
        baseSprite.texture = PIXI.Texture.from(sourceCanvas, {
            scaleMode: PIXI.SCALE_MODES.NEAREST
        });
    }

    /**
     * Sync environment particles from the game's envParticles array
     * Replaces Canvas 2D drawEnvParticles()
     */
    function renderEnvParticles(particles, foreground, camY) {
        if (!initialized || !enabled) return;

        let spriteIdx = 0;
        for (let i = 0; i < particles.length && spriteIdx < MAX_ENV_PARTICLES; i++) {
            const p = particles[i];
            const isBackgroundType = ['dust', 'glow', 'leaf'].includes(p.type);

            if (foreground && isBackgroundType) continue;
            if (!foreground && !isBackgroundType) continue;

            const sprite = envParticleSprites[spriteIdx];
            sprite.visible = true;
            sprite.x = p.x;
            sprite.y = p.y;
            sprite.width = p.size;
            sprite.height = p.size;
            sprite.alpha = p.opacity * 0.7;
            sprite.tint = colorToHex(p.color);
            spriteIdx++;
        }

        // Hide unused sprites
        for (let i = spriteIdx; i < MAX_ENV_PARTICLES; i++) {
            envParticleSprites[i].visible = false;
        }
    }

    /**
     * Sync impact particles from the game's impactParticles array
     * Replaces Canvas 2D drawImpactParticles()
     */
    function renderImpactParticles(particles, camY) {
        if (!initialized || !enabled) return;

        let spriteIdx = 0;
        for (let i = 0; i < particles.length && spriteIdx < MAX_IMPACT_PARTICLES; i++) {
            const p = particles[i];
            const sprite = impactParticleSprites[spriteIdx];
            sprite.visible = true;
            sprite.x = p.x;
            sprite.y = p.y + camY;
            sprite.width = p.size;
            sprite.height = p.size;
            sprite.alpha = Math.max(0, p.life);
            sprite.tint = colorToHex(p.color);
            spriteIdx++;
        }

        // Hide unused
        for (let i = spriteIdx; i < MAX_IMPACT_PARTICLES; i++) {
            impactParticleSprites[i].visible = false;
        }
    }

    /**
     * Animate displacement filter (call each frame)
     */
    function updateDisplacement() {
        if (!initialized || !displacementSprite || !displacementSprite.visible) return;
        displacementSprite.x += 0.5;
        displacementSprite.y += 0.3;
    }

    /**
     * Set the current zone for filter adjustments
     */
    function setZone(zone) {
        if (zone !== currentZone) {
            currentZone = zone;
            updateFiltersForZone(zone);
        }
    }

    /**
     * Render one frame — call after all layers are updated
     */
    function render() {
        if (!initialized || !enabled) return;
        updateDisplacement();
        app.render();
    }

    /**
     * Get the PixiJS canvas for compositing
     */
    function getCanvas() {
        return app ? app.view : null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADVANCED EFFECTS
    // ═══════════════════════════════════════════════════════════════════

    // Glow lights using PixiJS graphics
    const lightGraphics = [];

    function renderLights(lights) {
        if (!initialized || !enabled) return;

        // Clear old lights
        for (const g of lightGraphics) {
            effectsLayer.removeChild(g);
            g.destroy();
        }
        lightGraphics.length = 0;

        for (const light of lights) {
            const g = new PIXI.Graphics();
            const rgb = hexToRGB(light.color);
            const pixiColor = (rgb.r << 16) | (rgb.g << 8) | rgb.b;

            g.beginFill(pixiColor, light.intensity * 0.5);
            g.drawCircle(0, 0, light.radius);
            g.endFill();

            // Softer outer glow
            g.beginFill(pixiColor, light.intensity * 0.15);
            g.drawCircle(0, 0, light.radius * 1.5);
            g.endFill();

            g.x = light.x;
            g.y = light.y;
            g.blendMode = PIXI.BLEND_MODES.ADD;

            effectsLayer.addChild(g);
            lightGraphics.push(g);
        }
    }

    // Screen flash effect
    let flashGraphic = null;

    function screenFlash(color, duration) {
        if (!initialized || !enabled) return;

        if (!flashGraphic) {
            flashGraphic = new PIXI.Graphics();
            app.stage.addChild(flashGraphic);
        }

        const rgb = hexToRGB(color || '#ffffff');
        const pixiColor = (rgb.r << 16) | (rgb.g << 8) | rgb.b;

        flashGraphic.clear();
        flashGraphic.beginFill(pixiColor, 0.6);
        flashGraphic.drawRect(0, 0, CANVAS_LOGICAL_W, CANVAS_LOGICAL_H);
        flashGraphic.endFill();
        flashGraphic.alpha = 1;

        const startTime = Date.now();
        const dur = duration || 300;

        function fadeFlash() {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / dur);
            flashGraphic.alpha = 1 - t;
            if (t < 1) requestAnimationFrame(fadeFlash);
            else flashGraphic.alpha = 0;
        }
        fadeFlash();
    }

    // Shockwave effect using displacement
    let shockwaveActive = false;
    function shockwave(x, y, strength) {
        if (!initialized || !enabled || shockwaveActive) return;
        shockwaveActive = true;

        const origScale = displacementFilter.scale.x;
        displacementFilter.scale.x = strength || 20;
        displacementFilter.scale.y = strength || 20;
        displacementSprite.visible = true;
        displacementSprite.x = x - 128;
        displacementSprite.y = y - 128;

        if (!filterContainer.filters) filterContainer.filters = [];
        if (!filterContainer.filters.includes(displacementFilter)) {
            filterContainer.filters.push(displacementFilter);
        }

        const startTime = Date.now();
        function animateShockwave() {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / 400);
            displacementFilter.scale.x = (strength || 20) * (1 - t);
            displacementFilter.scale.y = (strength || 20) * (1 - t);
            if (t < 1) {
                requestAnimationFrame(animateShockwave);
            } else {
                shockwaveActive = false;
                updateFiltersForZone(currentZone);
            }
        }
        animateShockwave();
    }

    // ═══════════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════════

    function colorToHex(cssColor) {
        if (!cssColor) return 0xffffff;
        if (typeof cssColor === 'number') return cssColor;

        // Handle hex
        if (cssColor.startsWith('#')) {
            return parseInt(cssColor.slice(1), 16);
        }

        // Handle rgba/rgb
        const match = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return (parseInt(match[1]) << 16) | (parseInt(match[2]) << 8) | parseInt(match[3]);
        }

        return 0xffffff;
    }

    function hexToRGB(hex) {
        if (hex.startsWith('#')) hex = hex.slice(1);
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════════

    function cleanup() {
        if (app) {
            app.destroy(false, { children: true, texture: true });
            app = null;
        }
        envParticleSprites.length = 0;
        impactParticleSprites.length = 0;
        lightGraphics.length = 0;
        initialized = false;
    }

    function setEnabled(val) {
        enabled = !!val;
        if (app && app.stage) {
            app.stage.visible = enabled;
        }
    }

    function isInitialized() {
        return initialized;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════

    return {
        init,
        cleanup,
        isInitialized,
        setEnabled,

        // Rendering
        updateBaseTexture,
        renderEnvParticles,
        renderImpactParticles,
        renderLights,
        render,
        getCanvas,

        // Zone
        setZone,

        // Effects
        screenFlash,
        shockwave,

        // Filters
        updateFiltersForZone
    };
})();
