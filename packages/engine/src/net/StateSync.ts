interface TimestampedState {
  x: number;
  y: number;
  timestamp: number;
  customData: Record<string, unknown>;
}

export class StateSync {
  private buffers: Map<string, TimestampedState[]> = new Map();
  private interpolationDelay = 100; // ms
  private maxBufferSize = 20;

  pushState(sessionId: string, x: number, y: number, customData: Record<string, unknown> = {}): void {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, []);
    }

    const buffer = this.buffers.get(sessionId)!;
    buffer.push({ x, y, timestamp: Date.now(), customData });

    // Keep buffer from growing unbounded
    while (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  getInterpolatedPosition(sessionId: string): { x: number; y: number } | null {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.length === 0) return null;

    const renderTime = Date.now() - this.interpolationDelay;

    // Find two states to interpolate between
    let older: TimestampedState | null = null;
    let newer: TimestampedState | null = null;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
        older = buffer[i];
        newer = buffer[i + 1];
        break;
      }
    }

    // If we can interpolate, do linear interpolation
    if (older && newer) {
      const range = newer.timestamp - older.timestamp;
      const t = range > 0 ? (renderTime - older.timestamp) / range : 0;
      return {
        x: older.x + (newer.x - older.x) * t,
        y: older.y + (newer.y - older.y) * t,
      };
    }

    // Fallback: use the latest state
    const latest = buffer[buffer.length - 1];
    return { x: latest.x, y: latest.y };
  }

  getLatestCustomData(sessionId: string): Record<string, unknown> {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.length === 0) return {};
    return buffer[buffer.length - 1].customData;
  }

  setInterpolationDelay(ms: number): void {
    this.interpolationDelay = ms;
  }

  removePlayer(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  clear(): void {
    this.buffers.clear();
  }
}
