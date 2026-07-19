export class SpatialHash {
    buckets = new Map();
    cellSize = 64;
    rebuild(particles, cellSize) {
        this.cellSize = Math.max(1, cellSize);
        this.buckets.clear();
        for (const particle of particles) {
            const key = this.keyFor(particle.x, particle.y);
            let bucket = this.buckets.get(key);
            if (!bucket) {
                bucket = [];
                this.buckets.set(key, bucket);
            }
            bucket.push(particle);
        }
    }
    forNearby(particle, visit) {
        const cx = Math.floor(particle.x / this.cellSize);
        const cy = Math.floor(particle.y / this.cellSize);
        let candidates = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
                const bucket = this.buckets.get(`${cx + ox},${cy + oy}`);
                if (!bucket)
                    continue;
                for (const other of bucket) {
                    candidates += 1;
                    if (other.id > particle.id)
                        visit(other);
                }
            }
        }
        return candidates;
    }
    keyFor(x, y) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }
}
