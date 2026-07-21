#![allow(static_mut_refs)]

use std::f32::consts::TAU;

const FLOATS_PER_RENDER_PARTICLE: usize = 5;
const MAX_TOUCHES: usize = 8;
const TOUCH_STRIDE: usize = 6;
const EPSILON: f32 = 0.0001;

#[derive(Clone, Copy)]
struct PhysicsConfig {
    radius: f32,
    interaction_radius: f32,
    attraction_strength: f32,
    repulsion_strength: f32,
    force_softening: f32,
    collision_strength: f32,
    damping: f32,
    max_speed: f32,
    wall_restitution: f32,
    center_pull: f32,
    wheel_bias: f32,
    swirl_strength: f32,
    breathing_amplitude: f32,
    attraction_hue_threshold: f32,
    repulsion_hue_threshold: f32,
    continuous_hue_mode: bool,
    boundary_mode: u32,
    opacity: f32,
    touch_enabled: bool,
    touch_radius: f32,
    touch_falloff: f32,
}

impl Default for PhysicsConfig {
    fn default() -> Self {
        Self {
            radius: 3.2,
            interaction_radius: 58.0,
            attraction_strength: 0.006,
            repulsion_strength: 0.009,
            force_softening: 24.0,
            collision_strength: 1.1,
            damping: 0.93,
            max_speed: 5.5,
            wall_restitution: 0.46,
            center_pull: 0.0008,
            wheel_bias: 0.0015,
            swirl_strength: 0.0014,
            breathing_amplitude: 0.12,
            attraction_hue_threshold: 62.0,
            repulsion_hue_threshold: 118.0,
            continuous_hue_mode: true,
            boundary_mode: 0,
            opacity: 0.92,
            touch_enabled: false,
            touch_radius: 140.0,
            touch_falloff: 2.0,
        }
    }
}

#[derive(Clone, Copy)]
struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / 4_294_967_296.0
    }

    fn next_f32(&mut self) -> f32 {
        self.next_f64() as f32
    }
}

struct Simulation {
    count: usize,
    width: f32,
    height: f32,
    config: PhysicsConfig,
    positions: Vec<f32>,
    velocities: Vec<f32>,
    forces: Vec<f32>,
    hues: Vec<f32>,
    hue_cos: Vec<f32>,
    hue_sin: Vec<f32>,
    render_data: Vec<f32>,
    touch_data: [f32; MAX_TOUCHES * TOUCH_STRIDE],
    touch_count: usize,
    grid_counts: Vec<u32>,
    grid_starts: Vec<u32>,
    grid_cursor: Vec<u32>,
    grid_indices: Vec<u32>,
    grid_width: usize,
    grid_height: usize,
    grid_margin: f32,
    grid_cell_size: f32,
    rng: Mulberry32,
    time: f32,
    pair_checks: u32,
    neighbor_candidates: u32,
    touch_applications: u32,
}

impl Simulation {
    fn new(count: usize, width: f32, height: f32, seed: u32, distribution: u32) -> Self {
        let count = count.clamp(1, 20_000);
        let mut simulation = Self {
            count,
            width: width.max(1.0),
            height: height.max(1.0),
            config: PhysicsConfig::default(),
            positions: vec![0.0; count * 2],
            velocities: vec![0.0; count * 2],
            forces: vec![0.0; count * 2],
            hues: vec![0.0; count],
            hue_cos: vec![0.0; count],
            hue_sin: vec![0.0; count],
            render_data: vec![0.0; count * FLOATS_PER_RENDER_PARTICLE],
            touch_data: [0.0; MAX_TOUCHES * TOUCH_STRIDE],
            touch_count: 0,
            grid_counts: Vec::new(),
            grid_starts: Vec::new(),
            grid_cursor: Vec::new(),
            grid_indices: vec![0; count],
            grid_width: 0,
            grid_height: 0,
            grid_margin: 0.0,
            grid_cell_size: 1.0,
            rng: Mulberry32::new(seed),
            time: 0.0,
            pair_checks: 0,
            neighbor_candidates: 0,
            touch_applications: 0,
        };
        simulation.reset(seed, distribution);
        simulation
    }

    fn configure(&mut self, config: PhysicsConfig) {
        self.config = config;
        if !self.config.touch_enabled {
            self.touch_count = 0;
        }
        self.sync_render_data();
    }

    fn reset(&mut self, seed: u32, distribution: u32) {
        self.rng = Mulberry32::new(seed);
        self.time = 0.0;
        for i in 0..self.count {
            let hue = i as f32 / self.count as f32 * 360.0;
            self.hues[i] = hue;
            let mut x = self.rng.next_f32() * self.width;
            let mut y = self.rng.next_f32() * self.height;
            let speed = 0.4 + self.rng.next_f32() * 1.2;
            let angle = self.rng.next_f32() * TAU;
            if distribution == 1 {
                let radius = self.width.min(self.height) * (0.22 + self.rng.next_f32() * 0.18);
                let theta = hue / 360.0 * TAU + (self.rng.next_f32() - 0.5) * 0.5;
                x = self.width * 0.5 + theta.cos() * radius;
                y = self.height * 0.5 + theta.sin() * radius;
            } else if distribution == 2 {
                let radius = self.width.min(self.height) * self.rng.next_f32() * 0.16;
                let theta = self.rng.next_f32() * TAU;
                x = self.width * 0.5 + theta.cos() * radius;
                y = self.height * 0.5 + theta.sin() * radius;
            }
            let offset = i * 2;
            self.positions[offset] = x;
            self.positions[offset + 1] = y;
            self.velocities[offset] = angle.cos() * speed;
            self.velocities[offset + 1] = angle.sin() * speed;
        }
        for i in (1..self.count).rev() {
            let j = (self.rng.next_f64() * (i + 1) as f64).floor() as usize;
            self.hues.swap(i, j);
        }
        for i in 0..self.count {
            let radians = self.hues[i] / 360.0 * TAU;
            self.hue_cos[i] = radians.cos();
            self.hue_sin[i] = radians.sin();
        }
        self.forces.fill(0.0);
        self.ensure_grid();
        self.sync_render_data();
    }

    fn resize(&mut self, width: f32, height: f32) {
        let width = width.max(1.0);
        let height = height.max(1.0);
        let sx = width / self.width.max(1.0);
        let sy = height / self.height.max(1.0);
        self.width = width;
        self.height = height;
        for i in 0..self.count {
            self.positions[i * 2] *= sx;
            self.positions[i * 2 + 1] *= sy;
        }
        self.ensure_grid();
        self.sync_render_data();
    }

    fn step(&mut self, dt: f32) {
        let dt = dt.clamp(0.0, 2.5);
        self.time += dt * 16.6667;
        self.pair_checks = 0;
        self.neighbor_candidates = 0;
        self.touch_applications = 0;
        self.clear_forces();
        self.rebuild_grid();
        self.apply_pair_forces();
        self.apply_global_and_touch_forces();
        self.update_velocities(dt);
        self.integrate_and_resolve(dt);
        self.sync_render_data();
    }

    fn clear_forces(&mut self) {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            use core::arch::wasm32::{f32x4_splat, v128_store};
            let zero = f32x4_splat(0.0);
            let mut i = 0;
            while i + 4 <= self.forces.len() {
                v128_store(self.forces.as_mut_ptr().add(i) as *mut _, zero);
                i += 4;
            }
            while i < self.forces.len() {
                self.forces[i] = 0.0;
                i += 1;
            }
            return;
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        self.forces.fill(0.0);
    }

    fn update_velocities(&mut self, dt: f32) {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            use core::arch::wasm32::{f32x4_add, f32x4_mul, f32x4_splat, v128_load, v128_store};
            let dt_vector = f32x4_splat(dt);
            let damping_vector = f32x4_splat(self.config.damping);
            let mut i = 0;
            while i + 4 <= self.velocities.len() {
                let velocity = v128_load(self.velocities.as_ptr().add(i) as *const _);
                let force = v128_load(self.forces.as_ptr().add(i) as *const _);
                let next = f32x4_mul(f32x4_add(velocity, f32x4_mul(force, dt_vector)), damping_vector);
                v128_store(self.velocities.as_mut_ptr().add(i) as *mut _, next);
                i += 4;
            }
            while i < self.velocities.len() {
                self.velocities[i] = (self.velocities[i] + self.forces[i] * dt) * self.config.damping;
                i += 1;
            }
            return;
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        for i in 0..self.velocities.len() {
            self.velocities[i] = (self.velocities[i] + self.forces[i] * dt) * self.config.damping;
        }
    }

    fn integrate_and_resolve(&mut self, dt: f32) {
        let max_speed = self.config.max_speed;
        let max_speed_sq = max_speed * max_speed;
        for i in 0..self.count {
            let offset = i * 2;
            let mut vx = self.velocities[offset];
            let mut vy = self.velocities[offset + 1];
            let speed_sq = vx * vx + vy * vy;
            if speed_sq > max_speed_sq {
                let scale = max_speed / speed_sq.sqrt();
                vx *= scale;
                vy *= scale;
            }
            let mut x = self.positions[offset] + vx * dt;
            let mut y = self.positions[offset + 1] + vy * dt;
            let radius = self.config.radius;
            if self.config.boundary_mode == 1 {
                if x < -radius { x = self.width + radius; }
                if x > self.width + radius { x = -radius; }
                if y < -radius { y = self.height + radius; }
                if y > self.height + radius { y = -radius; }
            } else if self.config.boundary_mode == 2 {
                let margin = self.width.max(self.height) * 0.2;
                x = x.clamp(-margin, self.width + margin);
                y = y.clamp(-margin, self.height + margin);
            } else {
                if x < radius {
                    x = radius;
                    vx = vx.abs() * self.config.wall_restitution;
                } else if x > self.width - radius {
                    x = self.width - radius;
                    vx = -vx.abs() * self.config.wall_restitution;
                }
                if y < radius {
                    y = radius;
                    vy = vy.abs() * self.config.wall_restitution;
                } else if y > self.height - radius {
                    y = self.height - radius;
                    vy = -vy.abs() * self.config.wall_restitution;
                }
            }
            self.positions[offset] = x;
            self.positions[offset + 1] = y;
            self.velocities[offset] = vx;
            self.velocities[offset + 1] = vy;
        }
    }

    fn ensure_grid(&mut self) {
        let cell_size = self.config.interaction_radius.max(1.0);
        let soft_margin = if self.config.boundary_mode == 2 {
            self.width.max(self.height) * 0.2
        } else {
            self.config.radius + cell_size
        };
        let margin = soft_margin + cell_size;
        let grid_width = ((self.width + margin * 2.0) / cell_size).ceil().max(1.0) as usize;
        let grid_height = ((self.height + margin * 2.0) / cell_size).ceil().max(1.0) as usize;
        let cells = grid_width.saturating_mul(grid_height).max(1);
        if grid_width != self.grid_width || grid_height != self.grid_height || (cell_size - self.grid_cell_size).abs() > f32::EPSILON {
            self.grid_width = grid_width;
            self.grid_height = grid_height;
            self.grid_cell_size = cell_size;
            self.grid_margin = margin;
            self.grid_counts.resize(cells, 0);
            self.grid_starts.resize(cells + 1, 0);
            self.grid_cursor.resize(cells, 0);
        } else {
            self.grid_margin = margin;
        }
        self.grid_indices.resize(self.count, 0);
    }

    fn cell_index(&self, x: f32, y: f32) -> usize {
        let cx = ((x + self.grid_margin) / self.grid_cell_size).floor() as isize;
        let cy = ((y + self.grid_margin) / self.grid_cell_size).floor() as isize;
        let cx = cx.clamp(0, self.grid_width.saturating_sub(1) as isize) as usize;
        let cy = cy.clamp(0, self.grid_height.saturating_sub(1) as isize) as usize;
        cy * self.grid_width + cx
    }

    fn rebuild_grid(&mut self) {
        self.ensure_grid();
        self.grid_counts.fill(0);
        for i in 0..self.count {
            let cell = self.cell_index(self.positions[i * 2], self.positions[i * 2 + 1]);
            self.grid_counts[cell] += 1;
        }
        self.grid_starts[0] = 0;
        for cell in 0..self.grid_counts.len() {
            self.grid_starts[cell + 1] = self.grid_starts[cell] + self.grid_counts[cell];
            self.grid_cursor[cell] = self.grid_starts[cell];
        }
        for i in 0..self.count {
            let cell = self.cell_index(self.positions[i * 2], self.positions[i * 2 + 1]);
            let destination = self.grid_cursor[cell] as usize;
            self.grid_indices[destination] = i as u32;
            self.grid_cursor[cell] += 1;
        }
    }

    fn apply_pair_forces(&mut self) {
        const NEIGHBORS: [(isize, isize); 4] = [(1, 0), (-1, 1), (0, 1), (1, 1)];
        for cy in 0..self.grid_height {
            for cx in 0..self.grid_width {
                let cell = cy * self.grid_width + cx;
                let start = self.grid_starts[cell] as usize;
                let end = self.grid_starts[cell + 1] as usize;
                for a_pos in start..end {
                    for b_pos in (a_pos + 1)..end {
                        self.neighbor_candidates = self.neighbor_candidates.saturating_add(1);
                        let a = self.grid_indices[a_pos] as usize;
                        let b = self.grid_indices[b_pos] as usize;
                        self.apply_pair(a, b);
                    }
                }
                for (ox, oy) in NEIGHBORS {
                    let nx = cx as isize + ox;
                    let ny = cy as isize + oy;
                    if nx < 0 || ny < 0 || nx >= self.grid_width as isize || ny >= self.grid_height as isize {
                        continue;
                    }
                    let other_cell = ny as usize * self.grid_width + nx as usize;
                    let other_start = self.grid_starts[other_cell] as usize;
                    let other_end = self.grid_starts[other_cell + 1] as usize;
                    for a_pos in start..end {
                        for b_pos in other_start..other_end {
                            self.neighbor_candidates = self.neighbor_candidates.saturating_add(1);
                            let a = self.grid_indices[a_pos] as usize;
                            let b = self.grid_indices[b_pos] as usize;
                            self.apply_pair(a, b);
                        }
                    }
                }
            }
        }
    }

    fn apply_pair(&mut self, a: usize, b: usize) {
        let a_offset = a * 2;
        let b_offset = b * 2;
        let dx = self.positions[b_offset] - self.positions[a_offset];
        let dy = self.positions[b_offset + 1] - self.positions[a_offset + 1];
        let distance_sq = dx * dx + dy * dy;
        let max_distance = self.config.interaction_radius;
        if distance_sq > max_distance * max_distance {
            return;
        }
        self.pair_checks = self.pair_checks.saturating_add(1);
        let distance = distance_sq.sqrt().max(EPSILON);
        let nx = dx / distance;
        let ny = dy / distance;
        let collision_distance = ((self.config.radius * 2.0) * 1.05).max(EPSILON);
        let mut force = 0.0;
        if distance < collision_distance {
            force -= self.config.collision_strength * (1.0 - distance / collision_distance);
        }
        let softening_sq = self.config.force_softening * self.config.force_softening;
        let inverse_square = (max_distance * max_distance) / (distance_sq + softening_sq);
        if self.config.continuous_hue_mode {
            let affinity = self.hue_cos[a] * self.hue_cos[b] + self.hue_sin[a] * self.hue_sin[b];
            force += if affinity >= 0.0 {
                affinity * self.config.attraction_strength * inverse_square
            } else {
                affinity * self.config.repulsion_strength * inverse_square
            };
        } else {
            let raw = (self.hues[a] - self.hues[b]).abs() % 360.0;
            let delta_hue = raw.min(360.0 - raw);
            if delta_hue <= self.config.attraction_hue_threshold {
                let hue_t = 1.0 - delta_hue / self.config.attraction_hue_threshold.max(1.0);
                force += hue_t * self.config.attraction_strength * inverse_square;
            } else if delta_hue >= self.config.repulsion_hue_threshold {
                let hue_t = (delta_hue - self.config.repulsion_hue_threshold)
                    / (180.0 - self.config.repulsion_hue_threshold).max(1.0);
                force -= hue_t * self.config.repulsion_strength * inverse_square;
            }
        }
        self.forces[a_offset] += nx * force;
        self.forces[a_offset + 1] += ny * force;
        self.forces[b_offset] -= nx * force;
        self.forces[b_offset + 1] -= ny * force;
    }

    fn apply_global_and_touch_forces(&mut self) {
        let cx = self.width * 0.5;
        let cy = self.height * 0.5;
        for i in 0..self.count {
            let offset = i * 2;
            let x = self.positions[offset];
            let y = self.positions[offset + 1];
            let dx = cx - x;
            let dy = cy - y;
            self.forces[offset] += dx * self.config.center_pull;
            self.forces[offset + 1] += dy * self.config.center_pull;
            if self.config.wheel_bias > 0.0 {
                let base_radius = self.width.min(self.height) * 0.31;
                let breathing = 1.0
                    + (self.time * 0.0014 + self.hues[i] * 0.03).sin()
                        * self.config.breathing_amplitude
                        * 0.08;
                let angle = self.hues[i] / 360.0 * TAU + self.time * 0.00008;
                let target_x = cx + angle.cos() * base_radius * breathing;
                let target_y = cy + angle.sin() * base_radius * breathing;
                self.forces[offset] += (target_x - x) * self.config.wheel_bias;
                self.forces[offset + 1] += (target_y - y) * self.config.wheel_bias;
            }
            if self.config.swirl_strength != 0.0 {
                let sx = x - cx;
                let sy = y - cy;
                let inv_radius = 1.0 / (sx * sx + sy * sy).sqrt().max(120.0);
                self.forces[offset] += -sy * inv_radius * self.config.swirl_strength;
                self.forces[offset + 1] += sx * inv_radius * self.config.swirl_strength;
            }
            if self.config.touch_enabled {
                for touch_index in 0..self.touch_count {
                    self.apply_touch(i, touch_index);
                }
            }
        }
    }

    fn apply_touch(&mut self, particle: usize, touch_index: usize) {
        let particle_offset = particle * 2;
        let touch_offset = touch_index * TOUCH_STRIDE;
        let dx = self.touch_data[touch_offset] - self.positions[particle_offset];
        let dy = self.touch_data[touch_offset + 1] - self.positions[particle_offset + 1];
        let distance_sq = dx * dx + dy * dy;
        let radius = self.config.touch_radius;
        if distance_sq > radius * radius {
            return;
        }
        self.touch_applications = self.touch_applications.saturating_add(1);
        let distance = distance_sq.sqrt().max(EPSILON);
        let proximity = (1.0 - distance / radius).max(0.0);
        let falloff = proximity.powf(self.config.touch_falloff);
        let strength = self.touch_data[touch_offset + 5] * falloff;
        let nx = dx / distance;
        let ny = dy / distance;
        let mode = self.touch_data[touch_offset + 4] as u32;
        match mode {
            1 => {
                self.forces[particle_offset] += nx * strength;
                self.forces[particle_offset + 1] += ny * strength;
            }
            2 => {
                self.forces[particle_offset] -= nx * strength;
                self.forces[particle_offset + 1] -= ny * strength;
            }
            3 => {
                self.forces[particle_offset] += ny * strength;
                self.forces[particle_offset + 1] -= nx * strength;
            }
            4 => {
                self.forces[particle_offset] -= ny * strength;
                self.forces[particle_offset + 1] += nx * strength;
            }
            5 => {
                let movement_scale = strength * 0.08;
                self.forces[particle_offset] += self.touch_data[touch_offset + 2] * movement_scale;
                self.forces[particle_offset + 1] += self.touch_data[touch_offset + 3] * movement_scale;
            }
            6 => {
                let brake_scale = strength * 0.45;
                self.forces[particle_offset] -= self.velocities[particle_offset] * brake_scale;
                self.forces[particle_offset + 1] -= self.velocities[particle_offset + 1] * brake_scale;
            }
            _ => {}
        }
    }

    fn sync_render_data(&mut self) {
        for i in 0..self.count {
            let state_offset = i * 2;
            let render_offset = i * FLOATS_PER_RENDER_PARTICLE;
            self.render_data[render_offset] = self.positions[state_offset];
            self.render_data[render_offset + 1] = self.positions[state_offset + 1];
            self.render_data[render_offset + 2] = self.hues[i] / 360.0;
            self.render_data[render_offset + 3] = self.config.radius;
            self.render_data[render_offset + 4] = self.config.opacity;
        }
    }
}

static mut SIMULATION: Option<Simulation> = None;

fn with_simulation_mut<T>(f: impl FnOnce(&mut Simulation) -> T) -> Option<T> {
    unsafe { SIMULATION.as_mut().map(f) }
}

fn with_simulation<T>(f: impl FnOnce(&Simulation) -> T) -> Option<T> {
    unsafe { SIMULATION.as_ref().map(f) }
}

#[no_mangle]
pub extern "C" fn sim_create(count: u32, width: f32, height: f32, seed: u32, distribution: u32) -> u32 {
    unsafe {
        SIMULATION = Some(Simulation::new(count as usize, width, height, seed, distribution));
    }
    1
}

#[no_mangle]
pub extern "C" fn sim_destroy() {
    unsafe {
        SIMULATION = None;
    }
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "C" fn sim_configure(
    radius: f32,
    interaction_radius: f32,
    attraction_strength: f32,
    repulsion_strength: f32,
    force_softening: f32,
    collision_strength: f32,
    damping: f32,
    max_speed: f32,
    wall_restitution: f32,
    center_pull: f32,
    wheel_bias: f32,
    swirl_strength: f32,
    breathing_amplitude: f32,
    attraction_hue_threshold: f32,
    repulsion_hue_threshold: f32,
    continuous_hue_mode: u32,
    boundary_mode: u32,
    opacity: f32,
    touch_enabled: u32,
    touch_radius: f32,
    touch_falloff: f32,
) {
    let config = PhysicsConfig {
        radius,
        interaction_radius,
        attraction_strength,
        repulsion_strength,
        force_softening,
        collision_strength,
        damping,
        max_speed,
        wall_restitution,
        center_pull,
        wheel_bias,
        swirl_strength,
        breathing_amplitude,
        attraction_hue_threshold,
        repulsion_hue_threshold,
        continuous_hue_mode: continuous_hue_mode != 0,
        boundary_mode,
        opacity,
        touch_enabled: touch_enabled != 0,
        touch_radius,
        touch_falloff,
    };
    with_simulation_mut(|simulation| simulation.configure(config));
}

#[no_mangle]
pub extern "C" fn sim_reset(seed: u32, distribution: u32) {
    with_simulation_mut(|simulation| simulation.reset(seed, distribution));
}

#[no_mangle]
pub extern "C" fn sim_resize(width: f32, height: f32) {
    with_simulation_mut(|simulation| simulation.resize(width, height));
}

#[no_mangle]
pub extern "C" fn sim_step(dt: f32) {
    with_simulation_mut(|simulation| simulation.step(dt));
}

#[no_mangle]
pub extern "C" fn sim_set_touch_count(count: u32) {
    with_simulation_mut(|simulation| {
        simulation.touch_count = if simulation.config.touch_enabled {
            (count as usize).min(MAX_TOUCHES)
        } else {
            0
        };
    });
}

#[no_mangle]
pub extern "C" fn sim_touch_ptr() -> u32 {
    with_simulation_mut(|simulation| simulation.touch_data.as_mut_ptr() as usize as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_render_ptr() -> u32 {
    with_simulation(|simulation| simulation.render_data.as_ptr() as usize as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_render_len() -> u32 {
    with_simulation(|simulation| simulation.render_data.len() as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_positions_ptr() -> u32 {
    with_simulation(|simulation| simulation.positions.as_ptr() as usize as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_velocities_ptr() -> u32 {
    with_simulation(|simulation| simulation.velocities.as_ptr() as usize as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_particle_count() -> u32 {
    with_simulation(|simulation| simulation.count as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_pair_checks() -> u32 {
    with_simulation(|simulation| simulation.pair_checks).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_neighbor_candidates() -> u32 {
    with_simulation(|simulation| simulation.neighbor_candidates).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_touch_applications() -> u32 {
    with_simulation(|simulation| simulation.touch_applications).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn sim_simd_enabled() -> u32 {
    if cfg!(all(target_arch = "wasm32", target_feature = "simd128")) { 1 } else { 0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mulberry32_is_deterministic() {
        let mut first = Mulberry32::new(12345);
        let mut second = Mulberry32::new(12345);
        for _ in 0..100 {
            assert_eq!(first.next_u32(), second.next_u32());
        }
    }

    #[test]
    fn reset_is_deterministic() {
        let first = Simulation::new(80, 640.0, 480.0, 12345, 0);
        let second = Simulation::new(80, 640.0, 480.0, 12345, 0);
        assert_eq!(first.positions, second.positions);
        assert_eq!(first.velocities, second.velocities);
        assert_eq!(first.hues, second.hues);
    }

    #[test]
    fn numeric_grid_finds_close_pairs() {
        let mut simulation = Simulation::new(2, 100.0, 100.0, 1, 0);
        simulation.config.center_pull = 0.0;
        simulation.config.wheel_bias = 0.0;
        simulation.config.swirl_strength = 0.0;
        simulation.positions.copy_from_slice(&[40.0, 50.0, 45.0, 50.0]);
        simulation.velocities.fill(0.0);
        simulation.step(1.0);
        assert_eq!(simulation.pair_checks, 1);
    }
}
