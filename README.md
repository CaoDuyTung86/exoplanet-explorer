# 🌌 Exoplanet Explorer 3D

An immersive, highly optimized 3D web application that visualizes over 5,700 confirmed exoplanets using real data from the NASA Exoplanet Archive. Built with React, Three.js, and WebGL, this project pushes the boundaries of browser-based 3D rendering and procedural generation.

![Exoplanet Explorer Banner](/public/textures/sun_color.jpg) *(Replace with actual screenshot)*

## 🚀 Key Features

*   **Interactive 3D Universe:** Explore 5,700+ planets rendered in real-time at 60-165 FPS. Seamlessly fly between star systems with smooth camera interpolation.
*   **Procedural AAA Shaders:** Custom WebGL GLSL shaders for Gas Giants (swirling bands), Lava planets (glowing cracks), and Rocky planets (Simplex noise bumps) - all calculated dynamically based on NASA planet data.
*   **Ambient Audio Synthesizer:** Zero-dependency procedural audio using the Web Audio API. Generates deep-space drone sounds where the pitch scales with the planet's radius and the filter cutoff scales with its temperature.
*   **Real NASA Data & Web Worker:** Fetches and processes massive datasets from the NASA TAP API using an off-main-thread Web Worker to prevent UI freezing.
*   **Habitability Analysis:** Calculates a Habitability Score (0-100) based on equilibrium temperature and planet radius, complete with a glowing Habitable Zone ring visualization.
*   **Multi-language Support (i18n):** Supports English and Vietnamese, featuring a specialized translation algorithm for complex astronomical terms (e.g., *Radial Velocity* -> *Vận tốc xuyên tâm*).

## 🛠️ Technology Stack

*   **Frontend Framework:** React 18, TypeScript, Vite
*   **3D Engine:** Three.js, React Three Fiber (R3F), React Three Drei
*   **Styling:** Tailwind CSS, Lucide React (Icons)
*   **State Management:** Zustand
*   **Audio:** Howler.js & Native Web Audio API (BiquadFilters, Oscillators)
*   **Data Source:** NASA Exoplanet Archive (TAP API)

## 💻 Running Locally

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/exoplanet-explorer.git
    cd exoplanet-explorer
    ```
2.  Install dependencies:
    ```bash
    pnpm install
    ```
3.  Start the development server:
    ```bash
    pnpm run dev
    ```

## 🧠 Technical Highlights

### InstancedMesh Optimization
To render 5,700 spheres without melting the GPU, the project utilizes `THREE.InstancedMesh`. This allows a single draw call for all planets. The hit-boxes (for raycasting) dynamically scale down when spectating a planet to prevent accidental clicks while maintaining easy selection from a distance.

### Procedural Shaders (`onBeforeCompile`)
Instead of loading thousands of heavy texture images, the application injects procedural noise algorithms (Simplex 3D) directly into the `MeshStandardMaterial` shaders. This means lighting, shadows, and stunning visual effects are generated on the GPU mathematically, keeping the bundle size tiny and performance ultra-high.

### React StrictMode Race-Condition Fix
Implemented a global Promise caching mechanism to prevent double-fetching from the NASA API during React 18's Strict Mode mount cycle, saving bandwidth and preventing rate-limiting aborts.

---
*Created as a passion project to combine astronomy, data visualization, and advanced web graphics.*
