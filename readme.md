# Sistema Solar mejorado con shaders propios

---

# **1. Introducción**

El presente documento describe de manera detallada el desarrollo de un sistema solar implementado en **Three.js**, al cual se han integrado **shaders personalizados en GLSL** para simular dos fenómenos específicos:  
1. La **superficie dinámica del Sol**, basada en ruido procedural.  
2. Los **anillos de Saturno**, recreados mediante un shader que combina gradientes, sombreado y modelos simplificados de dispersión.
---

# **2. Motivación del shader**

El uso de shaders permite un nivel de control sobre el proceso de renderizado que no es posible mediante materiales estándar. En lugar de depender exclusivamente de texturas bidimensionales, un shader puede generar patrones, deformaciones, desplazamientos o iluminación de forma *procedural*, con costos de memoria reducidos y mayor variabilidad visual.

---

# **3. Shader del Sol**

El shader del sol va a conseguir que este presentente una animación en toda su superfice. Haciendolo más realista imitando las tormetas solares y otros fénomemos que tiene el sol

---

## **3.1 Vertex shader**

```glsl
varying vec3 vPosition;

void main() {
    vPosition = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

- `vPosition` es pasado al fragment shader y contiene la posición normalizada del vértice.  
- Normalizarla sirve para que la superficie del Sol se trate como si fuera una esfera unitaria, facilitando cálculos de ruido homogéneos.  
- La última línea es la transformación estándar del pipeline gráfico.

Este vertex shader es sencillo: su único objetivo es preparar coordenadas coherentes para el cálculo del ruido.

---

## **3.2 Fragment Shader**

En el fragment shaders es donde generamos todas las animaciones

### **Uniform principal:**

```glsl
uniform float time;
```
Se usa para animar el ruido.

---

## **Sistema de ruido usado**

El shader implementa explícitamente una función de **ruido simplex 3D**. Esta función es larga, pero su propósito se resume en:

- Tomar una coordenada 3D (`vPosition`)  
- Devolver un valor entre -1 y 1  
- Generar variación suave y coherente en el espacio  

```glsl
float n = snoise(vPosition * 8.0 + t);
n += 0.5 * snoise(vPosition * 16.0 + t * 2.0);
n += 0.25 * snoise(vPosition * 32.0 + t * 4.0);
n += 0.125 * snoise(vPosition * 64.0 + t * 8.0);
```

- Se llama al ruido 4 veces.  
- Cada llamada aumenta la frecuencia (8 → 16 → 32 → 64).  
- Cada llamada reduce la amplitud (1 → 0.5 → 0.25 → 0.125).  

Esto crea un patrón llamado **FBM (Fractal Brownian Motion)**.

El resultado es un mapa de turbulencias

---

## **Mapeo de color**

```glsl
vec3 color_core = vec3(1.0, 0.4, 0.0);
vec3 color_edge = vec3(0.8, 0.1, 0.0);
vec3 finalColor = mix(color_edge, color_core, n);
```

- `color_core`: tonos más amarillentos.  
- `color_edge`: tonos más rojizos.  
- `mix` interpola los colores según la intensidad del ruido.

Valores altos del ruido → color más brillante.

---

## **Emisión**

```glsl
float emission = n * 2.0 + 0.5;
gl_FragColor = vec4(finalColor * emission, 1.0);
```

Esto amplifica el brillo en zonas de mayor actividad.

El Sol no refleja luz: **emite** luz.  
Por eso `emission` multiplica el color base.

---


# **4. Shader de los Anillos de Saturno**

Con este shader implementaremos el anillo de saturno para darle algo más de realismo a nuestro sistema

---

## **Vertex Shader**

```glsl
varying vec3 vPosition;
varying vec3 vWorldPosition;

void main() {
    vPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

- `vPosition`: posición del vértice en el espacio local del anillo.  
- `vWorldPosition`: posición en coordenadas globales.  
  Esto es necesario para calcular sombras e iluminación.  
- La última línea es transformación estándar.

---

## **Cálculo de distancia radial**

El fragment shader evalúa la distancia del píxel al centro del anillo:

```glsl
float dist = length(vPosition.xy);
float dist_norm = (dist - innerRadius) / (outerRadius - innerRadius);
```
---

## **Descarte de fragmentos**

```glsl
if (dist < innerRadius || dist > outerRadius) discard;
```

Esto evita dibujar la parte interna o externa no deseada.

---

## **Generación de bandas de color**

El shader divide el anillo en tres zonas principales:

1. Zona interior  
2. Zona media  
3. Zona exterior  

Cada zona tiene su propia interpolación de color:

```glsl
if (dist_norm < 0.33) {
    ...
} else if (dist_norm < 0.65) {
    ...
} else {
    ...
}
```

Dentro de la zona media se simula la **División de Cassini** aplicando un oscurecimiento localizado:

```glsl
if (dist_norm > 0.52 && dist_norm < 0.57) {
    float d = abs(dist_norm - 0.545) / 0.025;
    float factor = clamp(1.0 - d, 0.0, 1.0);
    finalColor = mix(finalColor, cassiniDark, factor);
}
```

---

## **Simulación del brillo**

```glsl
float ringAngle = abs(dot(normalize(vPosition), normalize(lightDirection)));
finalColor += pow(ringAngle, 4.0) * 0.25;
```

- Si el anillo enfrenta la luz, aumenta su brillo.  
- `pow(..., 4.0)` provoca brillo fuerte solo cerca de los ángulos más frontales.

---

## **Atenuación del borde**

```glsl
float edge = smoothstep(0.92, 1.0, dist_norm);
alpha *= (1.0 - edge);
```

Esto difumina el borde externo de los anillos.

---

## **Cálculo de sombra de Saturno**

```glsl
vec3 saturnDir = normalize(saturnPosition - vWorldPosition);
float shadowMask = smoothstep(0.82, 1.0, dot(lightDirection, saturnDir));
intensity = mix(intensity, intensity * 0.25, shadowMask);
```
- Se calcula la dirección hacia Saturno desde cada fragmento.  
- Se compara con la dirección de la luz.  
- Si el ángulo coincide, ese punto está “detrás” del planeta → sombra.

---

## **Color final**

```glsl
gl_FragColor = vec4(finalColor, alpha * opacityFactor);
```

Los anillos son semitransparentes, por lo que el alpha tiene un papel importante.

---



# 4. Bibliografía

- [Documentación de khronos de openGL](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)
- [Documentación de three.js](https://threejs.org/docs/)