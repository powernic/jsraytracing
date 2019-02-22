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

function Model(content, material) {
    this.verts = []; // вершины
    this.faces = []; // грани
    this.material = material || new Material();

    const rows = content.split('\n');

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const type = row.substring(0, 2);
        const values = row.substring(2).split(' ');

        switch (type) {
            //Обрабатываем вершину
            case 'v ':
                const vert = new Vector(values[0]-0.0, values[1]-0.0, values[2]-0.0);
                this.verts.push(vert);
                break;
            //Обрабатываем грань
            case 'f ':
                const face = new Vector(--values[0], --values[1], --values[2]);
                this.faces.push(face);
                break;
        }
    }

    console.log("# v# " + this.getCountVerts() + " f# " + this.getCountFaces());

    let min = new Vector(), max = new Vector();
    this.getBouncedBox(min, max);
}

Model.prototype = {
    getCountVerts: function () {
        return this.verts.length;
    },
    getCountFaces: function () {
        return this.faces.length;
    },
    getBouncedBox: function (min, max) { //Ограничительная рамка фигуры
        min = max = this.getPoint(0);

        for (let i = 1; i < this.getCountVerts(); ++i) {
            min.x = Math.min(min.x, this.getPoint(i).x);
            max.x = Math.max(max.x, this.getPoint(i).x);
            min.y = Math.min(min.y, this.getPoint(i).y);
            max.y = Math.max(max.y, this.getPoint(i).y);
            min.z = Math.min(min.z, this.getPoint(i).z);
            max.z = Math.max(max.z, this.getPoint(i).z);
        }

        console.log("bbox: [" + [min.x, min.y, min.z].join(',') + " : " + [max.x, max.y, max.z].join(',') + "]");
    },
    getPoint(ind) { //Координаты вершины
        //TODO:Добавить обработку, в случае отсутствия элемента
        return this.verts[ind];
    },
    getVert(faceInd, localInd) {
        //TODO:Добавить обработку, в случае отсутствия элемента
        return this.faces[faceInd][localInd];
    },
    getPoints(faceInd) {
        const point0 = this.verts[this.faces[faceInd].x];
        const point1 = this.verts[this.faces[faceInd].y];
        const point2 = this.verts[this.faces[faceInd].z];
        return [point0, point1, point2]
    },
    rayTriangleIntersect: function (faceInd, origin, dir, tnear, N) {
        const point0 = this.verts[this.faces[faceInd].x];
        const point1 = this.verts[this.faces[faceInd].y];
        const point2 = this.verts[this.faces[faceInd].z];
        const edge1 = point1.subtract(point0);
        const edge2 = point2.subtract(point0);
        const pvec = dir.cross(edge2);
        const det = edge1.multiplyScal(pvec);
        if (det < 1e-5) return false;
        const tvec = origin.subtract(point0);
        const u = tvec.multiplyScal(pvec);
        if (u < 0 || u > det) return false;
        const qvec = tvec.cross(edge1);
        const v = dir.multiplyScal(qvec);
        if (v < 0 || u + v > det) return false;
        tnear.value = edge2.multiplyScal(qvec) * (1.0 / det);
        N.value = (edge1.cross(edge2)).unit();
        return tnear.value > 1e-5;
    }
};

const raycastAPI = {
    renderEnded : true,
    frameInd: 0,
    canvas: '',
    context: '',
    zoom: 1,
    safeMemory : true, //На 25% уменьшает выделяемую память, за счет удаления альфаканала ( немного замедляет программу )
    config: {
        width: 0,
        height: 0
    },
    time: 0,
    envmap: {
        width: 0,
        height: 0,
        pixels: []
    },
    canvasInit: function (canvasId) {
        const canvas = document.getElementById(canvasId);
        this.context = canvas.getContext('2d');
        const width = canvas.width/this.zoom;
        const height = canvas.height/this.zoom;
        this.canvas = this.context.getImageData(0, 0, canvas.width, canvas.height);
        this.config = {width: width, height: height}
    },
    drawPixel: function (x, y, vector) {
        for (let iN = 0; iN < this.zoom; iN++) {
            for (let jN = 0; jN < this.zoom; jN++) {
                const index = ((x * this.zoom + iN) + (y * this.zoom + jN) * this.config.width * this.zoom) * 4;
                this.canvas.data[index] = 255 * vector.x;//r
                this.canvas.data[index + 1] = 255 * vector.y;//g
                this.canvas.data[index + 2] = 255 * vector.z;//b
                this.canvas.data[index + 3] = 255;//a
            }
        }
    },
    reflect: function (dir, N) {
        return dir.subtract(N.multiply(2).multiply((dir.multiplyScal(N))));
    },
    refract: function (dir, N, dasd, eta_t, eta_i = 1.) {
        const cosi = -Math.max(-1, Math.min(1, dir.multiplyScal(N)));
        if (cosi < 0) return this.refract(dir, N.negative(), eta_i, eta_t);
        const eta = eta_i / eta_t;
        const k = 1 - eta * eta * (1 - cosi * cosi);
        return k < 0 ? new Vector(1, 0, 0) : dir.multiply(eta).add(N.multiply(eta * cosi - Math.sqrt(k)));
    },
    sceneIntersect: function (orig, dir, spheres, model, hit, N, material, debug = false) {

        let triangleDist = Number.MAX_VALUE;
        let spheresDist = Number.MAX_VALUE;
        let checkerboardDist = Number.MAX_VALUE;


        //Пересечение с треугольником

        let tnear = {value: triangleDist};

        for (let faceInd = 0; faceInd < model.getCountFaces(); faceInd++) {
            if (model.rayTriangleIntersect(faceInd, orig, dir, tnear, N) && (tnear.value < triangleDist)) {
                triangleDist = tnear.value;
                hit.value = orig.add(dir.multiply(triangleDist));
                material.material = model.material;
            }
        }

        //Пересечения со сферами

        for (let i = 0; i < spheres.length; i++) {
            let dist_i = {value: spheresDist};
            if (spheres[i].rayIntersect(orig, dir, dist_i) && (dist_i.value < spheresDist && dist_i.value < triangleDist)) {
                spheresDist = dist_i.value;
                hit.value = orig.add(dir.multiply(spheresDist));
                N.value = (hit.value.subtract(spheres[i].center)).unit();
                material.material = spheres[i].material;
            }
        }

        //Пересечение с плоскостью
        if (Math.abs(dir.y) > 1e-3) {
            let d = -(orig.y + 5) / dir.y;
            const pt = orig.add(dir.multiply(d));
            if (d > 0 && Math.abs(pt.x) < 10 && pt.z < -10 && pt.z > -20 && (d < spheresDist && d < triangleDist)) {
                checkerboardDist = d;
                hit.value = pt;
                N.value = new Vector(0, 1, 0);
                material.material.diffuseColor = (Math.floor(0.5 * hit.value.x + 1000) + Math.floor(0.5 * hit.value.z)) & 1 ? new Vector(1, 1, 1) : new Vector(1, 0.7, 0.3);
                material.material.diffuseColor = material.material.diffuseColor.multiply(0.3);
            }
        }
        return Math.min(spheresDist, checkerboardDist, triangleDist) < 1000;
    },
    castRay: function (orig, dir, spheres, model, lights, depth = 0) {
        let point = {value: 0}, N = {value: 0}, material = {material: new Material()};
        const maxRefractDepth = 4;
        if (depth > maxRefractDepth || !this.sceneIntersect(orig, dir, spheres, model, point, N, material)) {
            const a = Math.max(0, Math.min(raycastAPI.envmap.width - 1, ((Math.atan2(dir.z, dir.x) / (2 * Math.PI) + .5) * raycastAPI.envmap.width))) ^ 0;
            const b = Math.max(0, Math.min(raycastAPI.envmap.height - 1, (Math.acos(dir.y) / Math.PI * raycastAPI.envmap.height))) ^ 0;
            let countPixels = 4;
            if(this.safeMemory) countPixels = 3;

            const ind = (a * countPixels) + (b * countPixels) * raycastAPI.envmap.width;

            return new Vector(raycastAPI.envmap.pixels[ind] / 255, raycastAPI.envmap.pixels[ind + 1] / 255, raycastAPI.envmap.pixels[ind + 2] / 255);
        }
        material = material.material;
        N = N.value;
        point = point.value;
        const reflectDir = this.reflect(dir, N).unit();
        const refractDir = this.refract(dir, N, material.refractiveIndex).unit();
        const Nm = N.multiply(1e-3);
        const pSub = point.subtract(Nm);
        const pAdd = point.add(Nm);
        const reflectOrig = reflectDir.multiplyScal(N) < 0 ? pSub : pAdd;
        const refractOrig = refractDir.multiplyScal(N) < 0 ? pSub : pAdd;
        const reflectColor = this.castRay(reflectOrig, reflectDir, spheres, model, lights, depth + 1);
        const refractColor = this.castRay(refractOrig, refractDir, spheres, model, lights, depth + 1);

        let diffuseLightIntensity = 0,
            specularLightIntensity = 0;
        for (let i = 0; i < lights.length; i++) {
            const lightSub = lights[i].position.subtract(point);
            const lightDir = lightSub.unit();
            const lightDistance = lightSub.length();
            const lightDirScal = lightDir.multiplyScal(N);
            const shadowOrig = lightDirScal < 0 ? point.subtract(Nm) : point.add(Nm);

            let shadowPt = {value: new Vector()}, shadowN = {};
            let tmpMaterial = {material: new Material()};
            if (this.sceneIntersect(shadowOrig, lightDir, spheres, model, shadowPt, shadowN, tmpMaterial, true) &&
                (shadowPt.value.subtract(shadowOrig).length() < lightDistance)) {
                continue
            }
            diffuseLightIntensity += lights[i].intensity * Math.max(0, lightDirScal);
            specularLightIntensity += Math.pow(Math.max(0, -this.reflect(lightDir.negative(), N)
                .multiplyScal(dir)), material.specularExponent) * lights[i].intensity;
        }
        return material.diffuseColor.multiply(diffuseLightIntensity).multiply(material.albedo[0])
            .add((new Vector(1, 1, 1).multiply(specularLightIntensity).multiply(material.albedo[1])))
            .add(reflectColor.multiply(material.albedo[2]))
            .add(refractColor.multiply(material.albedo[3]));
    },
    render: function* (spheres, lights, model) {
        const {width, height} = this.config;
        const fov =Math.PI / 3.;
        const dir_z = -height / (2. * Math.tan(fov / 2.));
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                //TODO:: Пропускать пиксели которые мы уже обработали
                //Таким образом сокращаем время рендеринга на 25% по сравнению с предыдущей отрисовкой
                /*if( !this.first && i % this.zoom === 0 && j % this.zoom === 0  ){
                    this.drawPixel(i, j, new Vector(0.5,0.75,0.5), 1);
                    continue;
                }*/
                const dir_x = (i + 0.5) - width / 2.;
                const dir_y = -(j + 0.5) + height / 2.; // flips the image at the same time
                let dir = new Vector(dir_x, dir_y, dir_z).unit();
                const color = this.castRay(new Vector(0, 0, 0), dir, spheres, model, lights);
                this.drawPixel(i, j, color);
            }
            if (j % 10 === 0) {
                yield;
                this.context.putImageData(this.canvas, 0, 0);
            }
        }
        this.context.putImageData(this.canvas, 0, 0);
        console.log('Время выполнения = ', performance.now() - this.time, ' ms')
        yield true ;
    },
    setEnv: function () {
        if(raycastAPI.envmap.pixels.length > 0) return;
        let img = new Image();
        img.onload = function () {
            let canvas = document.createElement('canvas');
            canvas.id = "env";
            canvas.width = this.width;
            canvas.height = this.height;
            raycastAPI.envmap.width = canvas.width;
            raycastAPI.envmap.height = canvas.height;

            const body = document.getElementsByTagName("body")[0];
            body.appendChild(canvas);
            let context = canvas.getContext('2d');

            context.drawImage(img, 0, 0, canvas.width, canvas.height);
            raycastAPI.envmap.width = canvas.width;
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let ind = 0;
            if(raycastAPI.safeMemory){
                raycastAPI.envmap.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 3);
                for( let i = 0; i < data.length; i++ ){
                    if((i+1) % 4 !== 0) {
                        raycastAPI.envmap.pixels[ind] = data[i];
                        ind++;
                    }
                }
            }else{
                raycastAPI.envmap.pixels = data;
            }

            canvas.remove();
        };

        img.src = 'envmap_2.jpg';
        /*
        if(this.config.width > 1000){
            img.src = 'envmap_2.jpg';
        }else if( this.config.width > 500){
            img.src = 'envmap_3.jpg';
        }else{
            img.src = 'envmap_4.jpg';
        }
        console.log(img.src);*/
    },
    renderFrame: function (zoom) {
        raycastAPI.renderEnded = false;
        this.zoom = Math.pow(2, zoom);
        this.canvasInit("render");
        this.setEnv();

        const ivory = new Material(1.0, [0.6, 0.3, 0.1, 0.0], new Vector(0.4, 0.4, 0.3), 50);
        const glass = new Material(1.5, [0.0, 0.5, 0.1, 0.8], new Vector(0.6, 0.7, 0.8), 125.);
        const red_rubber = new Material(1.0, [0.9, 0.1, 0.0, 0.0], new Vector(0.3, 0.1, 0.1), 10);
        const mirror = new Material(1.0, [0.0, 10., 0.8, 0.0], new Vector(1.0, 1.0, 1.0), 1425.);
        let spheres = [];
        spheres.push(new Sphere(new Vector(-3,    0,   -16), 2, ivory));
        spheres.push(new Sphere(new Vector(-1.0, -1.5, -12), 2, red_rubber));
        spheres.push(new Sphere(new Vector( 1.5, -0.5, -18), 3, glass));
        spheres.push(new Sphere(new Vector( 7,    5,   -18), 4, mirror));
        let lights = [];
        lights.push(new Light(new Vector(-20, 20, 20), 1.5));
        lights.push(new Light(new Vector(30, 50, -25), 1.8));
        lights.push(new Light(new Vector(30, 20, 30), 1.7));

        const model = new Model(duck, glass);

        const renderLine = this.render(spheres, lights, model);
        this.time = performance.now();
        const renderStream = setInterval(function () {
            if (raycastAPI.envmap.pixels.length === 0) return false;
            if (renderLine.next().value) {
                raycastAPI.renderEnded = true;
                raycastAPI.renderFrame(raycastAPI.frameInd);
                raycastAPI.frameInd--;
                clearInterval(renderStream);
            }
        }, 0);
    }
};
raycastAPI.frameInd = 4;
raycastAPI.renderFrame(raycastAPI.frameInd,true);