function Material(refractiveIndex, albedo, diffuseColor, specularExponent) {
    this.refractiveIndex = refractiveIndex || 1;
    this.albedo = albedo || [1, 0, 0, 0];
    this.diffuseColor = diffuseColor || new Vector(0, 0, 0);
    this.specularExponent = specularExponent || 0;

}

function Light(position, intensity) {
    this.position = position || new Vector(0, 0, 0);
    this.intensity = intensity || 0;
}

function Sphere(center, radius, material) {
    this.center = center || new Vector(0, 0, 0);
    this.radius = radius || 0;
    this.material = material || new Material();
}

Sphere.prototype = {
    rayIntersect: function (origin, dir, t0) {
        const L = this.center.subtract(origin);
        const tca = L.multiplyScal(dir);
        const d2 = L.multiplyScal(L) - tca * tca;
        if (d2 > this.radius * this.radius) return false;
        const thc = Math.sqrt(this.radius * this.radius - d2);
        t0.value = tca - thc;
        const t1 = tca + thc;
        if (t0.value < 0) t0.value = t1;
        if (t0.value < 0) return false;
        return true;
    }
};

const raycastAPI = {
    canvas: '',
    context: '',
    config: {
        width: 0,
        height: 0
    },
    canvasInit: function (canvasId) {
        const canvas = document.getElementById(canvasId);
        this.context = canvas.getContext('2d');
        this.canvas = this.context.getImageData(0, 0, canvas.width, canvas.height);
        this.config = {width: canvas.width, height: canvas.height}
    },
    drawPixel: function (x, y, vector, a = 255) {
        const index = (x + y * this.config.width) * 4;
        const r = 255 * vector.x;
        const g = 255 * vector.y;
        const b = 255 * vector.z;
        this.canvas.data[index] = r;
        this.canvas.data[index + 1] = g;
        this.canvas.data[index + 2] = b;
        this.canvas.data[index + 3] = a;
    },
    reflect: function (dir, N) {
        return dir.subtract(N.multiply(2).multiply((dir.multiplyScal(N))));
    },
    refract: function (dir, N, refractiveIndex) {
        let cosi = -Math.max(-1, Math.min(1, dir.multiplyScal(N)));
        let etai = 1;
        let etat = refractiveIndex;
        let n = new Vector(N.x, N.y, N.z);
        if (cosi < 0) {
            cosi = -cosi;
            etat = [etai, etai = etat][0]; // swap
            n = N.negative();
        }
        const eta = etai/etat;
        const k = 1 - eta*eta*(1 - cosi*cosi);
        return k < 0 ? new Vector(0,0,0) : dir.multiply(eta).add(n.multiply(eta*cosi - Math.sqrt(k)));
    },
    sceneIntersect: function (orig, dir, spheres, hit, N, material, debug = false) {
        let spheresDist = Number.MAX_VALUE;
        for (let i = 0; i < spheres.length; i++) {
            let dist_i = {value: spheresDist};
            if (spheres[i].rayIntersect(orig, dir, dist_i) && dist_i.value < spheresDist) {
                spheresDist = dist_i.value;
                hit.value = orig.add(dir.multiply(dist_i.value));
                N.value = (hit.value.subtract(spheres[i].center)).unit();
                material.material = spheres[i].material;
            }
        }
        return spheresDist < 1000;
    },
    castRay: function (orig, dir, spheres, lights, depth = 0) {
        let point = {value: 0}, N = {value: 0}, material = {material: new Material()};
        if (depth > 4 || !this.sceneIntersect(orig, dir, spheres, point, N, material)) {
            return new Vector(0.2, 0.7, 0.8); // background color
        }
        material = material.material;

        const reflectDir = this.reflect(dir, N.value).unit();
        const refractDir = this.refract(dir, N.value,material.refractiveIndex).unit();
        const reflectOrig = reflectDir.multiplyScal(N.value) < 0 ? point.value.subtract(N.value.multiply(1e-3)) : point.value.add(N.value.multiply(1e-3));
        const refractOrig = refractDir.multiplyScal(N.value) < 0 ? point.value.subtract(N.value.multiply(1e-3)) : point.value.add(N.value.multiply(1e-3));
        const reflectColor = this.castRay(reflectOrig, reflectDir, spheres, lights, depth + 1);
        const refractColor = this.castRay(refractOrig, refractDir, spheres, lights, depth + 1);

        let diffuseLightIntensity = 0,
            specularLightIntensity = 0;
        for (let i = 0; i < lights.length; i++) {
            const lightDir = lights[i].position.subtract(point.value).unit();
            const lightDistance = lights[i].position.subtract(point.value).length();
            const shadowOrig = lightDir.multiplyScal(N.value) < 0 ? point.value.subtract(N.value.multiply(1e-3)) : point.value.add(N.value.multiply(1e-3));

            let shadowPt = {value: new Vector()}, shadowN = {};
            let tmpMaterial = {};
            if (this.sceneIntersect(shadowOrig, lightDir, spheres, shadowPt, shadowN, tmpMaterial, true) &&
                (shadowPt.value.subtract(shadowOrig).length() < lightDistance)) {
                continue
            }
            diffuseLightIntensity += lights[i].intensity * Math.max(0, lightDir.multiplyScal(N.value));
            specularLightIntensity += Math.pow(Math.max(0, -this.reflect(lightDir.negative(), N.value)
                .multiplyScal(dir)), material.specularExponent) * lights[i].intensity;
        }
        return material.diffuseColor.multiply(diffuseLightIntensity).multiply(material.albedo[0])
            .add((new Vector(1, 1, 1).multiply(specularLightIntensity).multiply(material.albedo[1])))
            .add(reflectColor.multiply(material.albedo[2]))
            .add(refractColor.multiply(material.albedo[3]));
    },
    render: function (spheres, lights) {
        let framebuffer = {};
        const {width, height} = this.config;
        const fov = Math.floor(Math.PI / 2.);
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const x = (2 * (i + 0.5) / width - 1) * Math.tan(fov / 2.) * width / height;
                const y = -(2 * (j + 0.5) / height - 1) * Math.tan(fov / 2.);
                let dir = new Vector(x, y, -1).unit();
                framebuffer[i + j * width] = this.castRay(new Vector(0, 0, 0), dir, spheres, lights);
            }
        }
        for (let j = 0; j < height; ++j) {
            for (let i = 0; i < width; ++i) {
                this.drawPixel(i, j, framebuffer[i + j * width]);
            }
        }
        this.context.putImageData(this.canvas, 0, 0);
    },
    init: function () {
        this.canvasInit("render");
        const ivory =       new Material(1.0,[0.6, 0.3, 0.1, 0.0], new Vector(0.4, 0.4, 0.3), 50);
        const glass =       new Material(1.5,[0.0, 0.5, 0.1, 0.8], new Vector(0.6, 0.7, 0.8), 125.);
        const red_rubber =  new Material(1.0,[0.9, 0.1, 0.0, 0.0], new Vector(0.3, 0.1, 0.1), 10);
        const mirror =      new Material(1.0,[0.0, 10., 0.8, 0.0], new Vector(1.0, 1.0, 1.0), 1425.);
        let spheres = [];
        spheres.push(new Sphere(new Vector(-3, 0, -16), 2, ivory));
        spheres.push(new Sphere(new Vector(-1, -1.5, -12), 2, glass));
        spheres.push(new Sphere(new Vector(1.5, -0.5, -18), 3, red_rubber));
        spheres.push(new Sphere(new Vector(7, 5, -18), 4, mirror));
        let lights = [];
        lights.push(new Light(new Vector(-20, 20, 20), 1.5));
        lights.push(new Light(new Vector(30, 50, -25), 1.8));
        lights.push(new Light(new Vector(30, 20, 30), 1.7));
        this.render(spheres, lights);
    }
};

raycastAPI.init();